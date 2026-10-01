import { createMatcher } from './filter.js';
const $ = id => document.getElementById(id);
const node = (tag, text) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; };
const options = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

export function createSearchScope(api, render) {
  let catalogue = [], focused = null, generation = 0, catalogueRequest = 0, active = null;
  const selected = new Set(), cache = new Map(), errors = new Map(), pending = new Set();
  const mode = $('search-scope'), refresh = $('refresh-search');
  const ids = () => mode.value === 'current' ? (focused ? [focused.repository.repository_id] : []) :
    mode.value === 'all' ? catalogue.map(r => r.repository_id) : [...selected];
  const entries = () => ids().map(id => catalogue.find(r => r.repository_id === id) || (focused?.repository.repository_id === id ? focused.repository : null)).filter(Boolean);
  function put(snapshot) {
    const id = snapshot.repository.repository_id;
    cache.delete(id); cache.set(id, { ...snapshot, matcher: createMatcher(snapshot.index) });
    // Eight search snapshots plus the focused inventory, including cached
    // deselections. Never evict a snapshot that contributes to this scope.
    const keep = new Set([...ids(), focused?.repository.repository_id]);
    for (const key of cache.keys()) if (cache.size > 9 && !keep.has(key)) cache.delete(key);
  }
  function controls() {
    const focusedChoice = document.activeElement?.matches('#repository-choices input') ? document.activeElement.value : null;
    $('repository-choices').hidden = mode.value !== 'selected';
    $('index-status').hidden = mode.value !== 'current';
    $('search').setAttribute('aria-describedby', mode.value === 'current' ? 'index-status' : 'scope-status');
    $('repository-choices').replaceChildren(...catalogue.map(repository => {
      const label = node('label'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.value = repository.repository_id;
      checkbox.checked = selected.has(repository.repository_id);
      const text = node('span', repository.name), detail = node('small', repository.path); text.append(detail);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selected.size >= 8) { checkbox.checked = false; $('scope-status').textContent = 'Select at most eight repositories.'; return; }
        if (checkbox.checked) selected.add(repository.repository_id); else selected.delete(repository.repository_id);
        prepare();
      });
      label.append(checkbox, text); return label;
    }));
    if (focusedChoice) [...$('repository-choices').querySelectorAll('input')].find(input => input.value === focusedChoice)?.focus({ preventScroll: true });
    refresh.disabled = !ids().length || ids().length > 8;
  }
  function update() {
    const scope = entries(), valid = scope.length <= 8;
    const loaded = valid ? scope.filter(r => cache.has(r.repository_id)).length : 0;
    const partial = scope.some(r => pending.has(r.repository_id) || errors.has(r.repository_id) || !cache.has(r.repository_id) || cache.get(r.repository_id)?.partial);
    $('scope-status').textContent = !scope.length ? (mode.value === 'current' ? 'Scan a repository to search.' : catalogue.length ? 'Choose at least one repository' : 'No added repositories. Scan a local directory.') :
      !valid ? 'All added repositories exceeds the eight-repository limit. Choose Selected repositories.' :
      mode.value === 'current' ? (errors.get(scope[0].repository_id) || (pending.has(scope[0].repository_id) ? 'Refreshing repository…' : '')) : `${loaded}/${scope.length} repositories loaded${partial ? ' · Partial search' : ''}`;
    $('repository-status').replaceChildren(...((mode.value === 'current' && !errors.size && !pending.size) ? [] : scope.map(repository => {
      const snapshot = cache.get(repository.repository_id), error = errors.get(repository.repository_id);
      const state = pending.has(repository.repository_id) ? 'Preparing…' : error ? `${snapshot ? 'Stale results · ' : ''}${error}` :
        snapshot ? `${snapshot.partial ? 'Partial index · ' : ''}Scanned ${snapshot.scanned_at}` : 'Not loaded';
      const row = node('li', `${repository.name} · ${repository.path} · ${state}`);
      if (snapshot?.partial) {
        const details = node('details'); details.append(node('summary', 'Search coverage issues'));
        for (const warning of snapshot.inventory.warnings) details.append(node('p', warning));
        for (const source of snapshot.index.sources.filter(s => s.error || s.truncated)) details.append(node('p', `${source.path}: ${source.error || 'truncated at size limit'}`));
        row.append(details);
      }
      return row;
    })));
    render();
  }
  async function run(refreshSnapshots, token) {
    const scope = entries();
    if (!scope.length || scope.length > 8) { update(); return; }
    const deadline = Date.now() + 120000;
    for (const repository of scope) {
      if (token !== generation) return;
      if (!refreshSnapshots && cache.has(repository.repository_id)) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0) { errors.set(repository.repository_id, 'Preparation timed out. Refresh to retry.'); continue; }
      pending.add(repository.repository_id); errors.delete(repository.repository_id); update();
      try {
        const snapshot = await api(`/api/repositories/${repository.repository_id}/search-snapshot`, {
          ...options({ refresh: refreshSnapshots, budget_ms: remaining }), signal: AbortSignal.timeout(remaining + 1000),
        });
        if (token !== generation) return;
        put(snapshot);
        if (mode.value === 'current') {
          const issues = snapshot.index.sources.filter(s => s.error || s.truncated);
          $('index-status').textContent = issues.length ? `Partial search index: ${issues.map(s => `${s.path}: ${s.error || 'truncated at size limit'}`).join(' · ')}` : 'Full-manifest search ready.';
        }
      } catch (error) {
        if (token !== generation) return;
        errors.set(repository.repository_id, error.message);
        if (error.status === 404) {
          // IDs are process-local. Reconcile by known paths after a restart.
          await reload(); generation++; controls(); update(); return;
        }
      } finally { pending.delete(repository.repository_id); }
      update();
    }
    update();
  }
  function prepare(refreshSnapshots = false) {
    const token = ++generation;
    // A superseded request still owns the server worker until it finishes.
    // Queue the new scope behind it instead of racing a second native scan.
    const previous = active;
    active = (async () => { if (previous) await previous; if (token === generation) await run(refreshSnapshots, token); })();
    active.catch(error => { $('scope-status').textContent = error.message; });
    controls(); update(); return active;
  }
  async function reload() {
    const request = ++catalogueRequest;
    const next = await api('/api/repositories');
    if (request !== catalogueRequest) return;
    const previous = catalogue;
    const paths = new Set([...selected].map(id => catalogue.find(r => r.repository_id === id)?.path));
    catalogue = next;
    for (const entry of catalogue) {
      const old = previous.find(r => r.path === entry.path);
      if (old && old.repository_id !== entry.repository_id) {
        cache.delete(old.repository_id);
        errors.delete(old.repository_id);
        errors.set(entry.repository_id, 'Server restarted. Refresh this repository to prepare search again.');
      }
    }
    selected.clear(); for (const entry of catalogue) if (paths.has(entry.path)) selected.add(entry.repository_id);
    if (focused) {
      const entry = catalogue.find(r => r.path === focused.repository.path);
      if (entry) focused.repository = entry;
    }
    controls();
  }
  mode.addEventListener('change', () => {
    if (mode.value === 'selected' && !selected.size && focused) selected.add(focused.repository.repository_id);
    prepare();
  });
  refresh.addEventListener('click', () => prepare(true));
  return {
    reload,
    async load(scan, indexPromise) {
      const token = ++generation;
      active = indexPromise;
      focused = { ...scan, index: { sources: [] }, partial: true };
      if (!catalogue.some(r => r.repository_id === scan.repository.repository_id)) catalogue.push(scan.repository);
      put(focused); controls(); update();
      const index = await indexPromise;
      if (focused.scan_id !== scan.scan_id) return;
      focused.index = index; focused.tagging = index.tagging ?? scan.tagging; scan.tagging = focused.tagging; focused.partial = Boolean(index.unavailable || scan.inventory.warnings.length || index.sources.some(s => s.error || s.truncated));
      put(focused); await reload();
      if (token === generation && mode.value !== 'current') await prepare(); else update();
    },
    snapshots: () => entries().length > 8 ? [] : entries().map(r => cache.get(r.repository_id)).filter(Boolean).sort((a, b) => a.repository.path < b.repository.path ? -1 : a.repository.path > b.repository.path ? 1 : 0),
    partial: () => entries().some(r => pending.has(r.repository_id) || errors.has(r.repository_id) || !cache.has(r.repository_id) || cache.get(r.repository_id)?.partial),
    current: () => mode.value === 'current',
    empty: () => !entries().length || entries().length > 8,
    async recover(owner, manifestPath) {
      await prepare(true);
      const fresh = cache.get(owner.repository.repository_id);
      return fresh && fresh.scan_id !== owner.scan_id && fresh.inventory.sections.some(s => s.skills.some(k => k.manifest_path === manifestPath)) ? fresh : null;
    },
  };
}
