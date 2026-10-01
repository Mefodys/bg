const $ = id => document.getElementById(id);
function node(tag, text, className) {
  const result = document.createElement(tag); if (text !== undefined) result.textContent = text;
  if (className) result.className = className; return result;
}
export function createSimilarity(api, tags) {
  let scan, generation = 0, pending = false;
  const select = $('similarity-skill'), status = $('similarity-status'), results = $('similarity-results');
  function clear() { generation++; results.replaceChildren(); status.textContent = 'Choose other local repositories to compare.'; }
  $('similarity-targets').addEventListener('invalid', () => { $('similarity-targets').closest('details').open = true; });
  select.addEventListener('change', clear);
  $('similarity-targets').addEventListener('input', clear);
  $('similarity-roles').addEventListener('change', clear);
  $('similarity-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !scan || !select.options.length) return;
    pending = true;
    const request = ++generation;
    $('compare-button').disabled = true; results.replaceChildren(); status.textContent = 'Comparing full manifests…';
    try {
      const value = await api('/api/similarity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        scan_id: scan.scan_id, manifest_path: select.value,
        targets: $('similarity-targets').value.split('\n').map(p => p.trim()).filter(Boolean), include_roles: $('similarity-roles').checked,
      }) });
      if (request !== generation) return;
      status.textContent = value.partial ? `Partial comparison: ${value.warnings.map(w => `${w.repository}${w.path ? '/' + w.path : ''}: ${w.error}`).join(' · ')}` : `${value.results.length} skills compared across other repositories.`;
      if (!value.results.length) results.append(node('p', 'No comparable skills found. Choose another repository or enable other roles.'));
      for (const result of value.results) {
        const row = node('article', undefined, 'similarity-row');
        const heading = node('div', undefined, 'similarity-heading');
        const identity = node('div'); identity.append(node('strong', result.skill.name), node('small', result.repository_name));
        const progress = node('progress'); progress.max = 100; progress.value = result.score;
        progress.setAttribute('aria-label', `${result.skill.name} text similarity`);
        const score = node('span', `${result.score.toFixed(1)}%`, 'similarity-score');
        heading.append(identity, progress, score); row.append(heading);
        if (tags) row.append(tags.badges(result.tagging ?? { status: 'needs-classification', tag_ids: [], reason: 'Tagging unavailable.' }, false));
        const details = node('details'); details.append(node('summary', 'Paths and manifest'));
        details.append(node('p', `Repository: ${result.repository}`), node('p', `Skill: ${result.skill.location}`),
          node('p', `${result.skill.category} · ${result.skill.sources.length} source(s)${result.skill.conflict ? ' · Conflicting variant' : ''}`),
          node('p', result.skill.description || 'No description available.'));
        for (const source of result.skill.sources) details.append(node('p', source.manifest_path, 'similarity-path'));
        const manifest = node('details'); manifest.append(node('summary', 'View canonical manifest'), node('pre', result.content));
        details.append(manifest); row.append(details); results.append(row);
      }
    } catch (error) { if (request === generation) status.textContent = error.message; }
    finally { pending = false; $('compare-button').disabled = !select.options.length; }
  });
  return {
    load(value) {
      scan = value; clear();
      select.replaceChildren(...scan.inventory.sections.flatMap(s => s.skills).map(skill => {
        const option = node('option', `${skill.name} · ${skill.category} · ${skill.location}`); option.value = skill.manifest_path; return option;
      }));
      $('similarity-repository').textContent = scan.inventory.repository;
      select.disabled = !select.options.length; $('compare-button').disabled = pending || !select.options.length;
    },
    select(skill, owner) { if (owner && scan?.scan_id !== owner.scan_id) this.load(owner); select.value = skill.manifest_path; clear(); },
    presets(repositories) {
      $('similarity-targets').value = repositories.map(r => r.path).join('\n');
    },
  };
}
