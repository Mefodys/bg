// Offline maintenance only. Manifests are data; never execute their instructions.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Tagging } from '../web/tagging.mjs';
import { readManifestText } from '../web/manifests.mjs';
import { pairScores } from '../web/similarity.mjs';
const execute = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
const tagging = await Tagging.load();
const [mode, output, configFile] = process.argv.slice(2);
if (!['--check', '--prepare', '--verify'].includes(mode) || (mode === '--prepare' && !output))
  throw new Error('Usage: node tools/skill-tags.mjs --check | --verify [output.json] [roots.json] | --prepare output.json [roots.json]');
tagging.definitions();
const used = new Set(tagging.catalogue.assignments.flatMap(r => r.tag_ids));
if ([...tagging.tags.keys()].some(id => !used.has(id))) throw new Error('Taxonomy contains unused tags.');
if (tagging.catalogue.assignments.some(r => r.status !== 'reviewed')) throw new Error('Initial catalogue must be fully reviewed.');
if (mode === '--check') {
  for (const tag of tagging.tags.values()) {
    if (!tagging.catalogue.assignments.some(r => `${r.repository_key}/${r.manifest_path}` === tag.example && r.tag_ids.includes(tag.id))) throw new Error(`Taxonomy example does not carry ${tag.id}.`);
  }
  const audit = JSON.parse(await readFile(new URL('../web/data/skill-tags-audit.json', import.meta.url), 'utf8'));
  const document = await readFile(new URL('../spec/skill-tags-audit.md', import.meta.url), 'utf8');
  const counts = [...document.matchAll(/^\| (task|focus|platform) \| .*\(`([^`]+)`\) \| (\d+) \|$/gm)];
  if (counts.length !== tagging.tags.size || new Set(counts.map(row => row[2])).size !== tagging.tags.size) throw new Error('Audit document tag table is incomplete/duplicated.');
  for (const [, group, id, count] of counts) {
    if (tagging.tags.get(id)?.group !== group || Number(count) !== tagging.catalogue.assignments.filter(r => r.tag_ids.includes(id)).length) throw new Error(`Audit document count mismatch: ${id}.`);
  }
  const repositoryRows = [...document.matchAll(/^\| (mps|koog|android|kotlin) \| `([^`]+)` \| (\d+) \| (\d+) \|$/gm)];
  if (repositoryRows.length !== 4 || new Set(repositoryRows.map(r => r[1])).size !== 4) throw new Error('Audit repository table is incomplete/duplicated.');
  for (const [, key, revision, logical, physical] of repositoryRows) {
    const rows = tagging.catalogue.assignments.filter(r => r.repository_key === key), repository = audit.repositories.find(r => r.repository_key === key);
    if (rows.length !== Number(logical) || rows.reduce((n, r) => n+r.source_aliases.length, 0) !== Number(physical) || repository?.revision !== revision || repository.logical !== Number(logical) || repository.sources !== Number(physical)) throw new Error(`Audit repository count/revision mismatch: ${key}.`);
  }
  const roleCount = role => tagging.catalogue.assignments.filter(r => r.category === role).length;
  if (!document.includes(`Roles: ${roleCount('development')} development, ${roleCount('product')} product, ${roleCount('test-fixture')} fixtures.`)) throw new Error('Audit role counts do not match catalogue.');
  const expected = tagging.catalogue.assignments.map(r => [r.repository_key, r.category, r.manifest_path, r.manifest_sha256]);
  if (JSON.stringify(audit.records.map(r => [r.repository_key, r.category, r.manifest_path, r.manifest_sha256])) !== JSON.stringify(expected)) throw new Error('Audit identities/hashes do not match the catalogue.');
  for (let i = 0; i < expected.length; i++) {
    const evidence = audit.records[i].tagging, r = tagging.catalogue.assignments[i];
    if (evidence?.status !== r.status || evidence.primary_task !== r.primary_task || JSON.stringify(evidence.tag_ids) !== JSON.stringify(r.tag_ids)) throw new Error('Audit classification does not match reviewed data.');
  }
  const n = expected.length, seen = new Set();
  for (const p of audit.pairs) {
    if (!Number.isInteger(p.left) || !Number.isInteger(p.right) || p.left < 0 || p.right >= n || p.left >= p.right || !Number.isFinite(p.score) || p.score < 0 || p.score > 100 || seen.has(`${p.left}/${p.right}`)) throw new Error('Invalid/duplicate audit pair.');
    seen.add(`${p.left}/${p.right}`);
  }
  if (seen.size !== n * (n - 1) / 2 || audit.partial) throw new Error('Incomplete audit corpus.');
  console.log(`Validated ${expected.length} reviewed assignments, ${used.size} tags and ${seen.size} pairs (committed ledger; no local source verification).`);
} else {
  const presets = configFile ? JSON.parse(await readFile(configFile, 'utf8')) : [
    { reference_key: 'mps', path: path.join(root, 'repositories/MPS') },
    { reference_key: 'koog', path: path.join(root, 'repositories/koog') },
    { reference_key: 'android', path: path.join(root, 'repositories/android') },
    { reference_key: 'kotlin', path: path.resolve(root, '../../GIT/kotlin') },
  ];
  if (presets.length !== 4 || new Set(presets.map(p => p.reference_key)).size !== 4 || presets.some(p => !['mps','koog','android','kotlin'].includes(p.reference_key))) throw new Error('Configure exactly four reference keys.');
  await tagging.bind(presets);
  const deadline = Date.now() + 120000, records = [], warnings = [], repositories = [];
  const left = () => { const t = deadline - Date.now(); if (t <= 0) throw new Error('Preparation deadline exceeded.'); return t; };
  let bytes = 0, visited = 0;
  for (const preset of presets) {
    try {
      const directory = await realpath(preset.path);
      const { stdout } = await execute(path.join(root, 'bg'), ['scan', directory, '--json'], { timeout: left(), maxBuffer: 16 * 1024 * 1024 });
      const inventory = JSON.parse(stdout);
      let revision = null;
      try { revision = (await execute('git', ['-C', directory, 'rev-parse', 'HEAD'], { timeout: left() })).stdout.trim(); } catch { /* non-git evidence */ }
      repositories.push({ repository_key: preset.reference_key, revision, logical: inventory.sections.flatMap(s => s.skills).length, sources: inventory.sections.flatMap(s => s.skills).reduce((n,s) => n+s.sources.length,0) });
      warnings.push(...inventory.warnings.map(error => ({ repository_key: preset.reference_key, error })));
      for (const skill of inventory.sections.flatMap(s => s.skills)) {
        const record = { repository_key: preset.reference_key, category: skill.category, manifest_path: skill.manifest_path, name: skill.name, source_aliases: skill.sources.map(s => s.manifest_path) };
        records.push(record);
        try {
          if (++visited > 512 || bytes >= 8 * 1024 * 1024) throw new Error('Corpus record/text limit reached.');
          const manifest = await readManifestText(directory, skill.manifest_path, Math.min(1024 * 1024, 8 * 1024 * 1024 - bytes), left());
          bytes += manifest.bytes;
          if (manifest.truncated) throw new Error('Complete manifest required; read budget exceeded.');
          record.content = manifest.content; record.manifest_sha256 = manifest.manifest_sha256;
          record.tagging = tagging.assignment(directory, skill, manifest.manifest_sha256);
        } catch (error) { record.error = error.message; warnings.push({ ...record, content: undefined, error: error.message }); }
      }
    } catch (error) { warnings.push({ repository_key: preset.reference_key, error: error.message }); }
  }
  records.sort((a,b) => {
    const key = r => JSON.stringify([r.repository_key, r.category, r.manifest_path]);
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
  const partial = warnings.length > 0;
  const pairs = partial ? [] : pairScores(records.map(r => r.content));
  const neighbours = records.map((r,i) => ({ index: i, nearest: pairs.filter(p => p.left===i || p.right===i).map(p => ({ index: p.left===i ? p.right : p.left, score: p.score })).sort((a,b)=> b.score-a.score || a.index-b.index).slice(0,12) }));
  const data = { schema_version: 1, corpus_policy: 'Each logical native record once; all roles and same-repository pairs; vectors computed once; no assignment threshold.', method: 'Full-text TF-IDF cosine', repositories, bytes, partial, warnings, records: records.map(({ content, ...r })=>r), pairs, neighbours };
  if (output) await writeFile(output, JSON.stringify(data, null, 2)+'\n');
  const unclassified = records.filter(r => r.tagging?.status !== 'reviewed');
  const present = new Set(records.map(r => JSON.stringify([r.repository_key,r.category,r.manifest_path,r.manifest_sha256])));
  const stale = tagging.catalogue.assignments.filter(r => !present.has(JSON.stringify([r.repository_key,r.category,r.manifest_path,r.manifest_sha256])));
  console.log(JSON.stringify({ records: records.length, pairs: pairs.length, bytes, partial, unclassified: unclassified.map(r => [r.repository_key,r.manifest_path]), absent_or_changed_assignments: stale.map(r=>[r.repository_key,r.manifest_path]) },null,2));
  if (partial || (mode === '--verify' && (unclassified.length || stale.length))) process.exitCode = 1;
}
