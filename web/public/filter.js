// Literal matching with original-text offsets, including case folds that expand.
export function ranges(text, query, firstOnly = false) {
  if (!query) return [];
  const folded = text.toLowerCase(), needle = query.toLowerCase();
  const starts = [], ends = [];
  // Ordinary case folds keep UTF-16 offsets, avoiding per-character index arrays.
  if (folded.length !== text.length) {
    let offset = 0;
    for (const char of text) {
      for (let i = 0; i < char.toLowerCase().length; i++) { starts.push(offset); ends.push(offset + char.length); }
      offset += char.length;
    }
  }
  const matches = []; let from = 0;
  while (from < folded.length) {
    const at = folded.indexOf(needle, from);
    if (at < 0) break;
    const start = starts.length ? starts[at] : at, end = ends.length ? ends[at + needle.length - 1] : at + needle.length;
    if (matches.length && start <= matches.at(-1)[1]) matches.at(-1)[1] = end;
    else matches.push([start, end]);
    if (firstOnly) return matches;
    from = at + needle.length;
  }
  return matches;
}
export function highlight(node, text, query) {
  let from = 0;
  for (const [start, end] of ranges(text, query)) {
    node.append(document.createTextNode(text.slice(from, start)));
    const mark = document.createElement('mark'); mark.textContent = text.slice(start, end); node.append(mark); from = end;
  }
  node.append(document.createTextNode(text.slice(from)));
}
export function snippet(skill, sources, query) {
  const fields = [skill.name, skill.description || '', ...skill.sources.map(s => sources.get(s.manifest_path) || ''), ...skill.sources.flatMap(s => [s.location, s.manifest_path])];
  if (!query) return skill.description || 'No description available.';
  for (const field of fields) {
    const match = ranges(field, query, true)[0];
    if (!match) continue;
    const start = Math.max(0, match[0] - 55), end = Math.min(field.length, Math.max(match[1] + 100, start + 180));
    return (start ? '…' : '') + field.slice(start, end) + (end < field.length ? '…' : '');
  }
  return null;
}
export function createFilter(api, render) {
  const input = document.getElementById('search'), clear = document.getElementById('clear-search'), status = document.getElementById('index-status');
  let sources = new Map(), generation = 0;
  const update = () => { clear.disabled = !input.value; render(); };
  input.addEventListener('input', update);
  clear.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
  input.addEventListener('keydown', event => { if (event.key === 'Escape' && input.value) { event.preventDefault(); input.value = ''; update(); } });
  return {
    query: () => input.value.trim(),
    snippet: skill => snippet(skill, sources, input.value.trim()),
    async load(scan) {
      const current = ++generation; sources = new Map(); status.textContent = 'Loading full-manifest search index…'; update();
      try {
        const result = await api(`/api/scans/${scan.scan_id}/search-index`);
        if (current !== generation) return;
        sources = new Map(result.sources.map(s => [s.path, s.content]));
        const issues = result.sources.filter(s => s.error || s.truncated);
        status.textContent = issues.length ? `Partial search index: ${issues.map(s => `${s.path}: ${s.error || 'truncated at size limit'}`).join(' · ')}` : 'Full-manifest search ready.';
        update();
      } catch (error) { if (current === generation) { status.textContent = `Full-manifest search unavailable: ${error.message} Metadata search remains available.`; update(); } }
    }
  };
}
