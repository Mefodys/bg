import { createSimilarity } from './similarity.js';
import { createFilter, highlight } from './filter.js';
const $ = id => document.getElementById(id);
let scan = null, category = 'all', manifestRequest = 0;
const labels = { development: 'DEVELOPMENT', 'test-fixture': 'TEST FIXTURE', product: 'PRODUCT' };
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
async function api(url, options) { const response = await fetch(url, options); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result; }
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function allSkills() { return scan?.inventory.sections.flatMap(section => section.skills) ?? []; }
const similarity = createSimilarity(api);
const filter = createFilter(api, () => { if (scan) render(); });
function render() {
  const host = $('inventory'); host.replaceChildren();
  const query = filter.query();
  const scoped = allSkills().filter(skill => category === 'all' || skill.category === category).length;
  let shown = 0;
  for (const section of scan.inventory.sections) {
    const skills = section.skills.filter(skill => (category === 'all' || skill.category === category) &&
      filter.snippet(skill) !== null);
    if (!skills.length) continue;
    shown += skills.length;
    const title = element('h3', 'section-title', section.name.toUpperCase()); title.append(element('span', '', `${skills.length} skills`)); host.append(title);
    const cards = element('div', 'cards');
    for (const skill of skills) {
      const card = element('button', 'card'); card.type = 'button'; card.setAttribute('aria-label', `View ${skill.name}`);
      const top = element('div', 'card-top'); top.append(element('span', 'card-symbol', '◈'), element('span', `badge ${skill.category}`, labels[skill.category]));
      const name = element('h3'); highlight(name, skill.name, query);
      const preview = element('p'); highlight(preview, filter.snippet(skill), query);
      card.append(top, name, preview);
      if (skill.sources.length > 1) card.append(element('div', 'mirror', `⧉ ${skill.sources.length} mirrored locations`));
      if (skill.conflict) card.append(element('div', 'conflict', '⚑ Conflicting variant — same name, different content'));
      const footer = element('div', 'card-footer'); const path = element('span', 'path', skill.location); path.title = skill.location; footer.append(path, element('span', 'arrow', '↗')); card.append(footer);
      card.addEventListener('click', () => details(skill)); cards.append(card);
    }
    host.append(cards);
  }
  $('inventory-count').textContent = String(shown);
  $('filter-count').textContent = `${shown} of ${scoped}`;
  if (!shown) {
    const empty = element('div', 'empty'); empty.append(element('span', 'empty-icon', '⌕'), element('h3', '', allSkills().length ? 'No matching skills.' : 'No skills found.'), element('p', '', allSkills().length ? 'Try another search or category.' : 'This repository has no eligible SKILL.md manifests.')); host.append(empty);
  }
}
async function loadManifest() {
  const request = ++manifestRequest; $('manifest-content').textContent = ''; $('manifest-message').textContent = 'Loading manifest…';
  try {
    const result = await api(`/api/scans/${scan.scan_id}/manifest?path=${encodeURIComponent($('source-select').value)}`);
    if (request !== manifestRequest) return;
    $('manifest-content').textContent = result.content; $('manifest-message').textContent = '';
  } catch (error) { if (request === manifestRequest) $('manifest-message').textContent = error.message; }
}
function details(skill) {
  similarity.select(skill);
  $('detail-name').textContent = skill.name; $('detail-description').textContent = skill.description || 'No description available.';
  $('source-select').replaceChildren(...skill.sources.map(source => { const option = element('option', '', source.manifest_path); option.value = source.manifest_path; return option; }));
  $('detail').showModal(); loadManifest();
}
$('close-detail').addEventListener('click', () => { manifestRequest++; $('detail').close(); });
$('source-select').addEventListener('change', loadManifest);
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  category = button.dataset.category;
  document.querySelectorAll('.filter').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  if (scan) render();
}));
$('scan-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('scan-button'); button.disabled = true; button.textContent = 'Scanning…'; message('Mapping your repository. This may take a moment.');
  try {
    const result = await api('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: $('repository-path').value }) });
    scan = result; similarity.load(scan); const skills = allSkills();
    $('count-skills').textContent = skills.length;
    $('count-sources').textContent = skills.reduce((sum, skill) => sum + skill.sources.length, 0);
    $('count-mirrors').textContent = skills.filter(skill => skill.sources.length > 1).length;
    $('count-conflicts').textContent = skills.filter(skill => skill.conflict).length;
    $('inventory-caption').textContent = scan.inventory.repository; $('download').disabled = false;
    message(scan.inventory.warnings.length ? `Scanner warnings: ${scan.inventory.warnings.join(' · ')}` : ''); filter.load(scan);
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Scan repository ↗'; }
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(scan.inventory, null, 2) + '\n'], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = 'skill-atlas.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
api('/api/repositories').then(repositories => {
  similarity.presets(repositories);
  if (!repositories.length) return;
  $('repositories').replaceChildren(...repositories.map(repository => {
    const button = element('button'); button.append(element('span', '', repository.name.slice(0, 1).toUpperCase()), document.createTextNode(repository.name));
    button.addEventListener('click', () => { $('repository-path').value = repository.path; if (!$('scan-button').disabled) $('scan-form').requestSubmit(); }); return button;
  }));
}).catch(error => message(error.message, true));
