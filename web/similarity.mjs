import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { readManifestText } from './manifests.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function scores(texts) {
  const counts = texts.map(text => {
    const terms = new Map();
    for (const token of text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      terms.set(token, (terms.get(token) ?? 0) + 1);
    return terms;
  });
  const frequencies = new Map();
  for (const terms of counts) for (const term of terms.keys()) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const vectors = counts.map(terms => {
    const vector = new Map(); let norm = 0;
    for (const [term, count] of terms) {
      const weight = (1 + Math.log(count)) * (1 + Math.log((texts.length + 1) / (frequencies.get(term) + 1)));
      vector.set(term, weight); norm += weight * weight;
    }
    return { vector, norm: Math.sqrt(norm) };
  });
  const source = vectors[0];
  return vectors.slice(1).map(candidate => {
    if (!source.norm || !candidate.norm) return 0;
    let dot = 0;
    for (const [term, weight] of source.vector) dot += weight * (candidate.vector.get(term) ?? 0);
    const value = Math.min(100, Math.max(0, 100 * dot / (source.norm * candidate.norm)));
    return Math.abs(value - 100) < 1e-10 ? 100 : value;
  });
}

// Discovery and classification come exclusively from bg. Read only canonical
// sources of those logical skills, using the same pinned native reader as Filter.
export async function compare(input, session, scanRepository, root) {
  if (!input || typeof input.manifest_path !== 'string' || !Array.isArray(input.targets) ||
      input.targets.length > 8 || input.targets.length === 0 ||
      input.targets.some(p => typeof p !== 'string' || !p.trim() || p.length > 4096 || p.includes('\0')) ||
      (input.include_roles !== undefined && typeof input.include_roles !== 'boolean'))
    throw fail(400, 'Choose a skill and between one and eight repository paths.');
  const selected = session.inventory.sections.flatMap(s => s.skills).find(s => s.sources.some(p => p.manifest_path === input.manifest_path));
  if (!selected) throw fail(403, 'Selected skill is not part of this scan.');
  const source = await readManifestText(session.repository, selected.manifest_path, 1024 * 1024);
  if (source.truncated) throw fail(413, 'Selected manifest exceeds 1 MB; full text is required.');
  const warnings = [], candidates = [], seen = new Set([session.repository]);
  let remaining = 8 * 1024 * 1024 - source.bytes, visited = 0;
  const deadline = Date.now() + 120000;
  for (const target of input.targets) {
    let repository;
    try {
      repository = await realpath(path.resolve(root, target));
      if (!(await stat(repository)).isDirectory()) throw new Error('Repository is not a directory.');
    } catch { warnings.push({ repository: target, error: 'Repository directory does not exist.' }); continue; }
    if (seen.has(repository)) continue;
    seen.add(repository);
    try {
      if (Date.now() >= deadline) throw new Error('Comparison time limit reached.');
      const inventory = await scanRepository(repository, Math.max(1, deadline - Date.now()));
      warnings.push(...inventory.warnings.map(error => ({ repository, error })));
      for (const skill of inventory.sections.flatMap(s => s.skills)) {
        if (!input.include_roles && skill.category !== selected.category) continue;
        if (visited++ >= 512 || remaining <= 0 || Date.now() >= deadline) {
          warnings.push({ repository, error: 'Comparison resource limit reached; remaining skills omitted.' }); break;
        }
        try {
          const manifest = await readManifestText(repository, skill.manifest_path, Math.min(1024 * 1024, remaining));
          remaining -= manifest.bytes;
          if (manifest.truncated) throw new Error('Manifest exceeds read budget; omitted rather than scored from partial text.');
          candidates.push({ repository, repository_name: path.basename(repository), skill, content: manifest.content });
        } catch (error) { warnings.push({ repository, path: skill.manifest_path, error: error.message }); }
      }
    } catch (error) { warnings.push({ repository, error: error.message }); }
  }
  const values = scores([source.content, ...candidates.map(c => c.content)]);
  const results = candidates.map((candidate, i) => ({ ...candidate, score: values[i] }));
  results.sort((a, b) => b.score - a.score || lexical(a.repository, b.repository) || lexical(a.skill.manifest_path, b.skill.manifest_path));
  return { method: 'Text similarity · TF-IDF cosine', results, warnings, partial: warnings.length > 0 };
}
