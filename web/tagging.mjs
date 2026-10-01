import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const roles = new Set(['development', 'product', 'test-fixture']);
const keys = new Set(['mps', 'koog', 'android', 'kotlin']);
const groups = ['task', 'focus', 'platform'];
const safePath = value => typeof value === 'string' && !value.includes('\\') && !value.includes('\0') && value.split('/').every(p => p && p !== '.' && p !== '..') && value.split('/').at(-1) === 'SKILL.md';
const identity = r => JSON.stringify([r.repository_key, r.category, r.manifest_path]);
export function validateCatalogue(taxonomy, catalogue) {
  const require = (value, message) => { if (!value) throw new Error(`Invalid tag catalogue: ${message}`); };
  require(taxonomy?.schema_version === 1 && taxonomy.taxonomy_version === 1 && Array.isArray(taxonomy.tags), 'taxonomy version');
  require(Array.isArray(taxonomy.groups) && taxonomy.groups.length === 3 && groups.every(g => taxonomy.groups.filter(v => v.id === g && typeof v.label === 'string' && v.label.trim()).length === 1), 'group definitions');
  const tags = new Map();
  for (const tag of taxonomy.tags) {
    require(groups.includes(tag.group) && new RegExp(`^${tag.group}:[a-z0-9]+(?:-[a-z0-9]+)*$`).test(tag.id) && !tags.has(tag.id), 'duplicate/invalid tag ID');
    require(['label', 'description', 'guidance', 'example'].every(k => typeof tag[k] === 'string' && tag[k].trim()), 'tag definition');
    tags.set(tag.id, tag);
  }
  require(catalogue?.schema_version === 1 && catalogue.taxonomy_version === taxonomy.taxonomy_version && Array.isArray(catalogue.assignments), 'assignment version');
  const assignments = new Map();
  for (const r of catalogue.assignments) {
    require(keys.has(r.repository_key) && roles.has(r.category) && safePath(r.manifest_path), 'identity/path');
    require(!assignments.has(identity(r)), 'duplicate assignment');
    require(/^[a-f0-9]{64}$/.test(r.manifest_sha256) && r.taxonomy_version === taxonomy.taxonomy_version, 'hash/version');
    require(['reviewed', 'proposed'].includes(r.status) && ['reviewed', 'exact-content-copy-reviewed', 'manual-override'].includes(r.origin) && typeof r.reason === 'string' && r.reason.trim(), 'review evidence');
    require(Array.isArray(r.tag_ids) && r.tag_ids.length === new Set(r.tag_ids).size && r.tag_ids.every(id => tags.has(id)), 'unknown/duplicate tag');
    require(tags.get(r.primary_task)?.group === 'task' && r.tag_ids.includes(r.primary_task) && r.tag_ids.filter(id => tags.get(id).group === 'task').length <= 3, 'primary task');
    require(Array.isArray(r.source_aliases) && r.source_aliases.includes(r.manifest_path) && r.source_aliases.every(safePath) && new Set(r.source_aliases).size === r.source_aliases.length, 'source aliases');
    assignments.set(identity(r), r);
  }
  return { tags, assignments };
}
export class Tagging {
  constructor(taxonomy, catalogue, warning = null) {
    this.taxonomy = taxonomy; this.catalogue = catalogue; this.bindings = new Map(); this.warning = warning;
    this.digest = createHash('sha256').update(JSON.stringify({ taxonomy, catalogue })).digest('hex');
    if (!warning) try { Object.assign(this, validateCatalogue(taxonomy, catalogue)); } catch (error) { this.warning = error.message; }
  }
  static async load(directory = new URL('./data/', import.meta.url)) {
    try {
      const [taxonomy, catalogue] = await Promise.all(['skill-tag-taxonomy.json', 'skill-tags.json'].map(async file => JSON.parse(await readFile(new URL(file, directory), 'utf8'))));
      return new Tagging(taxonomy, catalogue);
    } catch (error) { return new Tagging(null, null, `Tagging unavailable: ${error.message}`); }
  }
  async bind(presets) {
    for (const preset of presets) {
      if (!keys.has(preset.reference_key)) continue;
      try { const root = await realpath(preset.path); this.bindings.set(root, preset.reference_key); } catch { /* unavailable optional preset */ }
    }
  }
  definitions() {
    if (this.warning) throw Object.assign(new Error(this.warning), { status: 503 });
    return { ...this.taxonomy, catalogue_digest: this.digest };
  }
  assignment(repository, skill, hash) {
    const metadata = { taxonomy_version: this.taxonomy?.taxonomy_version ?? null, catalogue_digest: this.digest };
    const missing = reason => ({ ...metadata, status: 'needs-classification', primary_task: null, tag_ids: [], reason });
    if (this.warning) return missing(this.warning);
    const repository_key = this.bindings.get(repository);
    if (!repository_key) return missing('Repository is not bound to a reference preset.');
    if (!hash) return missing('Complete canonical manifest hash could not be confirmed.');
    const direct = this.assignments.get(identity({ repository_key, category: skill.category, manifest_path: skill.manifest_path }));
    const candidates = direct ? [direct] : [...this.assignments.values()].filter(r => r.repository_key === repository_key && r.category === skill.category && r.source_aliases.includes(skill.manifest_path) && r.manifest_sha256 === hash);
    if (candidates.length !== 1) return missing(candidates.length ? 'Ambiguous mirror alias.' : 'No reviewed assignment for this manifest.');
    const r = candidates[0];
    if (r.manifest_sha256 !== hash) return missing('Manifest changed since classification.');
    if (r.status !== 'reviewed') return missing('Assignment has not been reviewed.');
    return { ...metadata, status: 'reviewed', primary_task: r.primary_task, tag_ids: r.tag_ids, reason: r.reason };
  }
  envelope(repository, inventory, index = { sources: [] }) {
    const hashes = new Map(index.sources.map(s => [s.path, s.manifest_sha256]));
    const assignments = Object.fromEntries(inventory.sections.flatMap(s => s.skills).map(skill => [skill.manifest_path, this.assignment(repository, skill, hashes.get(skill.manifest_path))]));
    const total = Object.keys(assignments).length, reviewed = Object.values(assignments).filter(r => r.status === 'reviewed').length;
    return { schema_version: 1, taxonomy_version: this.taxonomy?.taxonomy_version ?? null, catalogue_digest: this.digest, assignments,
      coverage: { total, reviewed, needs_classification: total - reviewed, warnings: this.warning ? [this.warning] : [] } };
  }
}
