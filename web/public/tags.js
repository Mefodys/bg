const groups = ['task', 'focus', 'platform'];
export const unknown = { status: 'needs-classification', primary_task: null, tag_ids: [], reason: 'Tagging has not been confirmed.' };
export function assignment(owner, skill) { return owner.tagging?.assignments?.[skill.manifest_path] ?? unknown; }
export function matchesFacets(record, selected, unclassified = false, except = null) {
  if (unclassified) return record.status !== 'reviewed';
  return groups.every(group => group === except || !selected[group].size || record.tag_ids.some(id => selected[group].has(id)));
}
export function facetCounts(records, definitions, selected) {
  return new Map(definitions.map(tag => [tag.id, records.filter(r => r.tag_ids.includes(tag.id) && matchesFacets(r, selected, false, tag.group)).length]));
}
const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
export function createTags(api, render) {
  const selected = Object.fromEntries(groups.map(g => [g, new Set()]));
  let definitions = [], digest = null, error = null, unclassified = false, incompatible = false;
  const host = document.getElementById('tag-groups'), panel = document.getElementById('tag-panel');
  const status = document.getElementById('tag-coverage'), chips = document.getElementById('selected-tags');
  const clear = document.getElementById('clear-tags'), mode = document.getElementById('unclassified-only');
  const find = id => definitions.find(t => t.id === id);
  const focusSummary = () => panel.querySelector('summary')?.focus({ preventScroll: true });
  function select(id) { const tag = find(id); if (!tag || unclassified) return; selected[tag.group].add(id); render(); if (panel.open) chips.querySelector(`[data-remove="${id}"]`)?.focus({ preventScroll: true }); else focusSummary(); }
  mode.addEventListener('change', () => { unclassified = mode.checked; render(); });
  clear.addEventListener('click', () => { for (const values of Object.values(selected)) values.clear(); unclassified = false; mode.checked = false; render(); focusSummary(); });
  async function load() {
    try {
      const value = await api('/api/tags');
      if (digest && digest !== value.catalogue_digest) {
        // Owned snapshots must be refreshed before using another catalogue.
        error = 'Tag catalogue changed. Reload the page and scan again.';
        definitions = []; render(); return;
      }
      digest = value.catalogue_digest; definitions = value.tags; error = null;
      for (const group of groups) for (const id of selected[group]) if (!find(id)) selected[group].delete(id);
    } catch (e) { error = `Tagging unavailable: ${e.message}`; }
    render();
  }
  function badges(record, clickable = true) {
    const row = node('div', undefined, 'tag-badges');
    if (record.status !== 'reviewed') { const badge = node('span', 'Needs classification', 'tag-chip tag-unknown'); badge.title = record.reason; row.append(badge); if (!clickable) row.append(node('span', record.reason, 'tag-reason')); return row; }
    const ids = [record.primary_task, ...record.tag_ids.filter(id => id !== record.primary_task)];
    function badge(id) {
      const tag = find(id), n = node(clickable && tag ? 'button' : 'span', tag?.label ?? id, 'tag-chip');
      if (n.tagName === 'BUTTON') { n.type = 'button'; n.disabled = unclassified; n.setAttribute('aria-label', `Filter by ${tag.label}`); n.addEventListener('click', () => select(id)); }
      return n;
    }
    (clickable ? ids.slice(0,3) : ids).forEach(id => row.append(badge(id)));
    if (clickable && ids.length > 3) { const more = node('details', undefined, 'tag-more'); more.append(node('summary', `+${ids.length-3} tags`)); ids.slice(3).forEach(id => more.append(badge(id))); row.append(more); }
    return row;
  }
  function update(records, allRecords, owners) {
    const focus = document.activeElement?.dataset.tag;
    const counts = facetCounts(records, definitions, selected);
    host.replaceChildren(...groups.map(group => {
      const field = node('fieldset'); field.append(node('legend', group[0].toUpperCase()+group.slice(1)));
      const helper = node('small', { task: 'What the skill helps you do', focus: 'Workflow subject or subtype', platform: 'Where it applies' }[group]);
      helper.id = `tag-help-${group}`; field.setAttribute('aria-describedby', helper.id); field.append(helper);
      for (const tag of definitions.filter(t => t.group === group)) {
        const label = node('label'), input = node('input'); input.type = 'checkbox'; input.dataset.tag = tag.id;
        input.checked = selected[group].has(tag.id); input.disabled = unclassified || (!input.checked && !counts.get(tag.id));
        input.setAttribute('aria-label', tag.label); input.title = `${tag.description} ${tag.guidance}`;
        const count = node('small', unclassified ? '—' : String(counts.get(tag.id))); count.id = `count-${tag.id}`; input.setAttribute('aria-describedby', count.id);
        input.addEventListener('change', () => { if (input.checked) selected[group].add(tag.id); else selected[group].delete(tag.id); render(); });
        label.append(input, node('span', tag.label), count); field.append(label);
      }
      return field;
    }));
    if (focus) host.querySelector(`[data-tag="${focus}"]`)?.focus({ preventScroll: true });
    chips.replaceChildren(...Object.values(selected).flatMap(values => [...values].map(id => {
      const b = node('button', `${find(id)?.label ?? id} ×`, 'tag-chip'); b.type = 'button'; b.dataset.remove = id; b.setAttribute('aria-label', `Remove ${find(id)?.label ?? id}`);
      b.addEventListener('click', () => { selected[id.split(':')[0]].delete(id); render(); const next = chips.querySelector('button'); if (next) next.focus({ preventScroll: true }); else focusSummary(); }); return b;
    })));
    const needs = records.filter(r => r.status !== 'reviewed').length;
    document.getElementById('unclassified-label').hidden = !needs && !unclassified;
    document.getElementById('unclassified-count').textContent = String(needs);
    const reviewed = allRecords.filter(r => r.status === 'reviewed').length;
    const mismatch = Boolean(digest) && owners.some(o => o.tagging?.catalogue_digest && o.tagging.catalogue_digest !== digest);
    const warnings = [...new Set(owners.flatMap(o => o.tagging?.coverage?.warnings ?? []))];
    status.textContent = error || (mismatch ? 'Tag catalogue changed. Reload the page and scan again.' :
      `${reviewed} of ${allRecords.length} loaded skills classified${reviewed < allRecords.length ? ' · Needs classification' : ''}${warnings.length ? ' · '+warnings.join(' · ') : ''}${unclassified ? ' · Semantic selections suspended; turn off Unclassified only to restore them.' : ''}`);
    document.getElementById('text-before-tags').textContent = active() ? `${records.length} text matches before tags` : '';
    clear.disabled = !active(); panel.hidden = !owners.length && !error;
    incompatible = mismatch;
  }
  function active() { return unclassified || Object.values(selected).some(s => s.size); }
  return { load, update, badges, active, select, assignment: (owner, skill) => digest && owner.tagging?.catalogue_digest && owner.tagging.catalogue_digest !== digest ? { ...unknown, reason: 'Catalogue changed; reload and scan again.' } : assignment(owner, skill), matches: r => matchesFacets(r, error || incompatible ? Object.fromEntries(groups.map(g => [g, new Set()])) : selected, unclassified) };
}
