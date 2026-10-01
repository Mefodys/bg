import { createTags } from './tags.js';
import { createSimilarity } from './similarity.js';
import { createFilter, highlight } from './filter.js';
import { createSearchScope } from './search-scope.js';
import { createFavorites } from './favorites.js';
const $ = id => document.getElementById(id);
let scan = null, category = 'all', manifestRequest = 0, detailOwner = null, detailSkill = null, page = 0;
const labels = { development: 'DEVELOPMENT', 'test-fixture': 'TEST FIXTURE', product: 'PRODUCT' };
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
async function api(url, options) { const response = await fetch(url, options); const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status }); return result; }
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function allSkills() { return scan?.inventory.sections.flatMap(section => section.skills) ?? []; }
const tags = createTags(api, () => { if (scan) { page = 0; render(); } });
const similarity = createSimilarity(api, tags);
const filter = createFilter(api, () => { page = 0; render(); });
const scope = createSearchScope(api, () => { page = 0; render(); });
const favorites = createFavorites({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, () => { page = 0; render(); updateDetailStar(); }, text => { $('favorites-status').textContent = text; });
window.addEventListener('storage', event => favorites.sync(event));
function setStar(button, owner, skill) {
  const selected = favorites.has(owner, skill);
  button.textContent = selected ? '★' : '☆';
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-label', `${selected ? 'Remove from' : 'Add to'} favorites: ${skill.name}`);
  button.title = selected ? 'Remove from favorites' : 'Add to favorites';
}
function updateDetailStar() { if (detailOwner && detailSkill) setStar($('detail-star'), detailOwner, detailSkill); }
$('detail-star').addEventListener('click', () => favorites.toggle(detailOwner, detailSkill));
function render() {
  const host = $('inventory'); host.replaceChildren();
  const query = filter.query();
  const snapshots = scope.snapshots();
  const scoped = snapshots.reduce((sum, owner) => sum + owner.inventory.sections.flatMap(s => s.skills).filter(k => category === 'all' || k.category === category).length, 0);
  const groups = snapshots.map(owner => ({ owner, sections: owner.inventory.sections.map(section => ({ section, skills: section.skills.map(skill => ({ skill, preview: owner.matcher(skill, query) })).filter(({skill, preview}) => (category === 'all' || skill.category === category) && preview !== null) })) }));
  const allRecords = snapshots.flatMap(owner => owner.inventory.sections.flatMap(s => s.skills).filter(k => category === 'all' || k.category === category).map(skill => tags.assignment(owner, skill)));
  const queryRecords = groups.flatMap(g => g.sections.flatMap(s => s.skills.map(({skill}) => tags.assignment(g.owner, skill))));
  tags.update(queryRecords, allRecords, snapshots);
  for (const group of groups) for (const section of group.sections) section.skills = section.skills.filter(({skill}) => tags.matches(tags.assignment(group.owner, skill))).sort((a, b) => Number(favorites.has(group.owner, b.skill)) - Number(favorites.has(group.owner, a.skill)));
  const shown = groups.reduce((sum, group) => sum + group.sections.reduce((n, section) => n + section.skills.length, 0), 0);
  page = Math.min(page, Math.max(0, Math.ceil(shown / 100) - 1));
  let offset = 0;
  for (const { owner, sections } of groups) {
    let headingAdded = false;
    for (const { section, skills } of sections) {
      const visible = skills.filter(() => { const position = offset++; return position >= page * 100 && position < (page + 1) * 100; });
      if (!visible.length) continue;
      if (!scope.current() && !headingAdded) {
        const heading = element('h3', 'repository-heading', owner.repository.name); heading.append(element('small', '', owner.repository.path)); host.append(heading); headingAdded = true;
      }
      const title = element('h3', 'section-title', section.name.toUpperCase()); title.append(element('span', '', `${skills.length} skills`)); host.append(title);
      const cards = element('div', 'cards');
      for (const { skill, preview: text } of visible) {
        const wrapper = element('div', 'skill-card skill-result');
        const card = element('button', 'card'); card.type = 'button'; card.setAttribute('aria-label', `View ${skill.name}`);
        card.dataset.repository = owner.repository.repository_id; card.dataset.scan = owner.scan_id; card.dataset.manifest = skill.manifest_path;
        const top = element('div', 'card-top'); top.append(element('span', 'card-symbol', '◈'), element('span', `badge ${skill.category}`, labels[skill.category]));
        const name = element('h3'); highlight(name, skill.name, query);
        const preview = element('p'); highlight(preview, text, query);
        card.append(top, name, preview);
        if (!scope.current()) card.append(element('span', 'repository-label', owner.repository.name));
        if (skill.sources.length > 1) card.append(element('div', 'mirror', `⧉ ${skill.sources.length} mirrored locations`));
        if (skill.conflict) card.append(element('div', 'conflict', '⚑ Conflicting variant — same name, different content'));
        const footer = element('div', 'card-footer'); const location = element('span', 'path', skill.location); location.title = skill.location; footer.append(location, element('span', 'arrow', '↗')); card.append(footer);
        if (favorites.has(owner, skill)) footer.prepend(element('span', 'pinned', 'Pinned'));
        const star = element('button', 'star-button'); star.type = 'button'; setStar(star, owner, skill);
        star.addEventListener('click', () => {
          favorites.toggle(owner, skill);
          const replacement = [...host.querySelectorAll('.card')].find(node => node.dataset.repository === owner.repository.repository_id && node.dataset.manifest === skill.manifest_path);
          replacement?.parentElement.querySelector('.star-button').focus();
        });
        card.addEventListener('click', () => details(skill, owner)); wrapper.append(card, star, tags.badges(tags.assignment(owner, skill))); cards.append(wrapper);
      }
      host.append(cards);
    }
  }
  $('inventory-count').textContent = String(shown);
  $('filter-count').textContent = `${shown} of ${scoped}${scope.partial() ? ' · Partial' : ''}`;
  $('search-pages').hidden = shown <= 100;
  $('previous-page').disabled = page === 0; $('next-page').disabled = (page + 1) * 100 >= shown;
  $('page-number').textContent = `Page ${page + 1} of ${Math.max(1, Math.ceil(shown / 100))}`;
  if (!shown) {
    const empty = element('div', 'empty');
    const title = scope.empty() ? 'Choose repositories to search.' : scope.partial() ? 'No matches in loaded data. Search is partial.' : scoped ? 'No matching skills.' : 'No skills found.';
    empty.append(element('span', 'empty-icon', '⌕'), element('h3', '', title), element('p', '', scoped ? (tags.active() ? 'Try another search, tag selection or category. Use Clear tags to remove tag filters.' : 'Try another search or category.') : 'Selected repositories have no loaded skills in this category.')); host.append(empty);
  }
}
$('previous-page').addEventListener('click', () => { page--; render(); });
$('next-page').addEventListener('click', () => { page++; render(); });
async function loadManifest() {
  const request = ++manifestRequest; $('refresh-detail').hidden = true; $('manifest-content').textContent = ''; $('manifest-message').textContent = 'Loading manifest…';
  try {
    const result = await api(`/api/scans/${detailOwner.scan_id}/manifest?path=${encodeURIComponent($('source-select').value)}`);
    if (request !== manifestRequest) return;
    $('manifest-content').textContent = result.content; $('manifest-message').textContent = '';
  } catch (error) { if (request === manifestRequest) { $('manifest-message').textContent = error.status === 404 ? 'Refresh this repository to view the manifest' : error.message; $('refresh-detail').hidden = error.status !== 404; } }
}
function details(skill, owner) {
  detailOwner = owner; detailSkill = skill;
  updateDetailStar();
  $('detail-tags').replaceChildren(tags.badges(tags.assignment(owner, skill), false));
  similarity.select(skill, owner);
  $('detail-repository').textContent = `${owner.repository.name} · ${owner.repository.path}`;
  $('detail-name').textContent = skill.name; $('detail-description').textContent = skill.description || 'No description available.';
  $('source-select').replaceChildren(...skill.sources.map(source => { const option = element('option', '', source.manifest_path); option.value = source.manifest_path; return option; }));
  if (!$('detail').open) $('detail').showModal(); loadManifest();
}
$('close-detail').addEventListener('click', () => { manifestRequest++; $('detail').close(); });
$('source-select').addEventListener('change', loadManifest);
$('detail').addEventListener('close', () => { manifestRequest++; });
$('refresh-detail').addEventListener('click', async () => {
  const owner = detailOwner, skill = detailSkill; $('refresh-detail').disabled = true;
  try {
    const fresh = await scope.recover(owner, skill.manifest_path);
    if (detailOwner !== owner || !$('detail').open) return;
    if (fresh) details(fresh.inventory.sections.flatMap(s => s.skills).find(k => k.manifest_path === skill.manifest_path), fresh);
    else $('manifest-message').textContent = 'The skill is no longer available, or refresh failed. Check repository status.';
  } finally { $('refresh-detail').disabled = false; }
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  category = button.dataset.category;
  document.querySelectorAll('.filter').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  page = 0; render();
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
    $('inventory-caption').textContent = `Focused repository · ${scan.inventory.repository} · Statistics and JSON export`; $('download').disabled = false; $('download-tagged').disabled = false;
    message(scan.inventory.warnings.length ? `Scanner warnings: ${scan.inventory.warnings.join(' · ')}` : ''); scope.load(scan, filter.load(scan)).catch(error => message(error.message, true));
    reloadRepositories().catch(error => message(error.message, true));
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Scan repository ↗'; }
});
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('download-tagged').addEventListener('click', () => download({ inventory: scan.inventory, tagging: scan.tagging }, 'skill-atlas-tagged.json'));
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(scan.inventory, null, 2) + '\n'], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = 'skill-atlas.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function reloadRepositories() {
  const repositories = await api('/api/repositories');
  await scope.reload();
  similarity.presets(repositories.filter(r => r.available));
  if (!repositories.length) return;
  $('repositories').replaceChildren(...repositories.map(repository => {
    const button = element('button'); button.append(element('span', '', repository.name.slice(0, 1).toUpperCase()), document.createTextNode(repository.name));
    button.title = repository.path; button.disabled = !repository.available;
    button.addEventListener('click', () => { $('repository-path').value = repository.path; if (!$('scan-button').disabled) $('scan-form').requestSubmit(); }); return button;
  }));
}
reloadRepositories().catch(error => message(error.message, true));

tags.load();
