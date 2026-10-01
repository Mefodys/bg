import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });
export const limits = { catalogue: 64, sessions: 8, sources: 512, text: 8 * 1024 * 1024, deadline: 120000 };

// Catalogue, scan sessions and indices share one bounded cache and one worker.
export class Repositories {
  constructor(root, scan, read, presets, tagging) {
    this.tagging = tagging; this.root = root; this.scanNative = scan; this.read = read; this.presets = presets;
    this.entries = new Map(); this.sessions = new Map(); this.pending = new Map(); this.busy = false;
  }
  async canonical(directory, status = 400) {
    try {
      const resolved = await realpath(path.resolve(this.root, directory));
      if (!(await stat(resolved)).isDirectory()) throw new Error();
      return resolved;
    } catch { throw fail(status, 'Repository directory does not exist.'); }
  }
  entry(directory) { return [...this.entries.values()].find(entry => entry.path === directory); }
  capacity(directory) {
    if (!this.entry(directory) && this.entries.size >= limits.catalogue)
      throw fail(409, 'Repository catalogue limit reached (64). Restart the server to clear manually added directories.');
  }
  register(directory, name = path.basename(directory)) {
    this.capacity(directory);
    let entry = this.entry(directory);
    if (!entry) {
      entry = { repository_id: randomUUID(), name, path: directory, available: true };
      this.entries.set(entry.repository_id, entry);
    }
    entry.available = true; return entry;
  }
  async list() {
    for (const candidate of this.presets) {
      try {
        await stat(path.join(candidate.path, '.git'));
        const directory = await this.canonical(candidate.path);
        if (this.entry(directory) || this.entries.size < limits.catalogue) this.register(directory, candidate.name);
      } catch { /* optional preset */ }
    }
    for (const entry of this.entries.values()) {
      try { entry.available = await this.canonical(entry.path) === entry.path; }
      catch { entry.available = false; }
    }
    return [...this.entries.values()].map(entry => ({ ...entry })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  }
  async work(task) {
    if (this.busy) throw fail(409, 'A scan, search preparation or comparison is already running. Please wait.');
    this.busy = true;
    try { return await task(); } finally { this.busy = false; }
  }
  remaining(deadline) {
    const left = deadline - Date.now();
    if (left <= 0) throw fail(504, 'Search preparation timed out. Refresh this repository to retry.');
    return left;
  }
  createSession(directory, inventory) {
    const scan_id = randomUUID();
    const manifests = new Set(inventory.sections.flatMap(s => s.skills.flatMap(k => k.sources.map(source => source.manifest_path))));
    const session = { scan_id, repository: directory, manifests, inventory, scanned_at: new Date().toISOString() };
    if (this.sessions.size >= limits.sessions) this.sessions.delete(this.sessions.keys().next().value);
    this.sessions.set(scan_id, session); return session;
  }
  async scan(directory) {
    return this.work(async () => {
      const canonical = await this.canonical(directory); this.capacity(canonical);
      const inventory = await this.scanNative(canonical);
      const entry = this.register(canonical);
      const session = this.createSession(canonical, inventory);
      const index = this.tagging?.bindings.has(canonical) ? await this.index(session, Date.now() + limits.deadline, true) : { sources: [] };
      return { scan_id: session.scan_id, inventory, repository: { ...entry }, scanned_at: session.scanned_at,
        ...(this.tagging ? { tagging: this.tagging.envelope(canonical, inventory, index) } : {}) };
    });
  }
  async buildIndex(session, deadline) {
    const sources = []; let remaining = limits.text, count = 0;
    for (const relative of session.manifests) {
      if (count++ >= limits.sources || remaining <= 0 || Date.now() >= deadline) {
        sources.push({ path: relative, content: '', error: Date.now() >= deadline ? 'Source omitted: search preparation timed out.' : 'Source omitted: search index limit reached.' });
        continue;
      }
      try {
        const result = await this.read(session, relative, Math.min(1024 * 1024, remaining), Math.min(10000, this.remaining(deadline)));
        remaining -= result.bytes;
        sources.push({ path: relative, content: result.content, truncated: result.truncated, manifest_sha256: result.manifest_sha256 });
      } catch (error) { sources.push({ path: relative, content: '', error: error.message }); }
    }
    const index = { sources };
    if (this.tagging) index.tagging = this.tagging.envelope(session.repository, session.inventory, index);
    return index;
  }
  index(session, deadline = Date.now() + limits.deadline, ownsWorker = false) {
    if (session.index) return session.index;
    const build = () => this.buildIndex(session, deadline);
    session.index = (ownsWorker ? build() : this.work(build)).catch(error => { session.index = null; throw error; });
    return session.index;
  }
  snapshot(id, input) {
    const entry = this.entries.get(id);
    if (!entry) throw fail(404, 'Unknown repository. Reload the repository catalogue.');
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !['refresh', 'budget_ms'].includes(key)) ||
        (input.refresh !== undefined && typeof input.refresh !== 'boolean') ||
        (input.budget_ms !== undefined && (!Number.isInteger(input.budget_ms) || input.budget_ms < 1 || input.budget_ms > limits.deadline)))
      throw fail(400, 'Use refresh (boolean) and budget_ms (integer from 1 through 120000).');
    const active = this.pending.get(id);
    if (active) {
      if (active.refresh !== Boolean(input.refresh)) throw fail(409, 'Repository preparation is already running with different refresh settings.');
      return active.promise;
    }
    const deadline = Date.now() + (input.budget_ms ?? limits.deadline);
    const promise = this.work(async () => {
      if (await this.canonical(entry.path, 410) !== entry.path) throw fail(410, 'Repository path changed. Scan the directory again.');
      entry.available = true;
      let session = !input.refresh && [...this.sessions.values()].reverse().find(s => s.repository === entry.path);
      if (!session) {
        let inventory;
        try { inventory = await this.scanNative(entry.path, this.remaining(deadline)); }
        catch (error) { if (error.killed) throw fail(504, 'Search preparation timed out.'); throw error; }
        session = this.createSession(entry.path, inventory);
      }
      const index = await this.index(session, deadline, true);
      const result = { repository: { ...entry }, scan_id: session.scan_id, scanned_at: session.scanned_at,
        inventory: session.inventory, index, ...(this.tagging ? { tagging: index.tagging } : {}), partial: Boolean(session.inventory.warnings.length || index.sources.some(source => source.error || source.truncated)) };
      if (Buffer.byteLength(JSON.stringify(result)) > 64 * 1024 * 1024) throw fail(413, 'Search snapshot exceeds 64 MiB. Use a smaller repository.');
      return result;
    }).catch(error => { if (error.status === 410) entry.available = false; throw error; }).finally(() => this.pending.delete(id));
    this.pending.set(id, { promise, refresh: Boolean(input.refresh) }); return promise;
  }
}
