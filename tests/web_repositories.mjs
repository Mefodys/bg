import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const fixture = await realpath(await mkdtemp('/tmp/bg-search-browser-'));
const a = path.join(fixture, 'a/shared'), b = path.join(fixture, 'b/shared');
async function write(repository, relative, text) {
  const file = path.join(repository, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text);
}
await write(a, 'skills/same/SKILL.md', '# same\n\nSummary.\n\n' + 'padding '.repeat(100) + 'AlphaOnly');
await write(a, 'skills/unicode/SKILL.md', '# İ工具😀\n\n世界 CAFÉ');
await write(a, 'tests/fixture/SKILL.md', '# fixture\n\nFixture text.');
await write(a, 'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/product/SKILL.md', '# product\n\nShipped text.');
const otherBody = '# same\n\nSummary.\n\n' + 'padding '.repeat(100) + 'OtherBodyNeedle <script>window.searchExecuted=true</script>';
await write(b, 'skills/same/SKILL.md', otherBody);
for (const prefix of ['.agents', '.claude']) await write(b, `${prefix}/skills/mirror/SKILL.md`, '# mirror\n\nMirrored text.');
await write(b, 'skills/literal/SKILL.md', '# literal\n\nLiteral .* token.');
await write(b, 'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/product/SKILL.md', '# product\n\nShipped text.');

const server = spawn(process.execPath, ['web/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
const timeout = setTimeout(() => { console.error('Repository browser timeout'); server.kill(); process.exit(1); }, 90000);
try {
  const [chunk] = await once(server.stdout, 'data'), url = chunk.toString().trim().replace('Skill Atlas: ', '');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Keep scope selection independent of optional developer presets. The
  // inventory, search-index/snapshot, manifest and comparison APIs stay real.
  await page.route('**/api/repositories', async route => {
    const response = await route.fetch(); const entries = await response.json();
    await route.fulfill({ json: entries.filter(r => r.path.startsWith(fixture + path.sep)) });
  });
  const registered = await (await page.request.post(url + '/api/scan', { data: { path: b } })).json();
  const bId = registered.repository.repository_id;
  await page.goto(url);
  await page.locator('#repository-path').fill(a); await page.locator('#scan-button').click();
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '4 of 4');
  const aId = await page.locator('.card').first().getAttribute('data-repository');
  const query = page.locator('#search');
  await query.fill('OtherBodyNeedle'); assert.equal(await page.locator('.card').count(), 0);
  await page.locator('#search-scope').selectOption('selected');
  await page.locator(`#repository-choices input[value="${bId}"]`).check();
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '1 of 8');
  assert.equal(await query.inputValue(), 'OtherBodyNeedle');
  assert.equal(await page.locator('.card').getAttribute('data-repository'), bId);
  assert.ok((await page.locator('.card p').textContent()).includes('OtherBodyNeedle'));
  await page.locator('.card').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#manifest-content').textContent.includes('OtherBodyNeedle'));
  assert.equal(await page.locator('#detail-repository').textContent(), `shared · ${b}`);
  assert.equal(await page.locator('#similarity-repository').textContent(), b);
  await page.keyboard.press('Escape');
  // Similar skills must submit the search result's scan, including native API.
  await page.locator('#similarity-form > details > summary').click();
  await page.locator('#similarity-targets').fill(a);
  let submittedScan;
  page.on('request', request => { if (request.url().endsWith('/api/similarity')) submittedScan = request.postDataJSON().scan_id; });
  await page.locator('#compare-button').click();
  await page.waitForFunction(() => !document.querySelector('#compare-button').disabled);
  assert.equal(submittedScan, registered.scan_id);
  assert.ok(await page.locator('.similarity-row').count());
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.repository, a); assert.equal(exported.sections.flatMap(s => s.skills).length, 4);
  assert.equal(await page.locator('#count-skills').textContent(), '4');
  let preparations = 0;
  page.on('request', request => { if (/search-index|search-snapshot/.test(request.url())) preparations++; });
  await query.fill(''); assert.equal(await page.locator('#filter-count').textContent(), '8 of 8');
  assert.equal(await page.locator('.repository-heading').count(), 2);
  for (const id of [aId, bId]) {
    await page.locator(`.card[data-repository="${id}"][data-manifest="skills/same/SKILL.md"]`).click();
    await page.waitForFunction(() => document.querySelector('#manifest-message').textContent === '');
    assert.ok((await page.locator('#manifest-content').textContent()).includes(id === aId ? 'AlphaOnly' : 'OtherBodyNeedle'));
    await page.locator('#close-detail').click();
  }
  // Deliver the first repository's native response after a newer selection.
  let releaseOld;
  await page.route('**/manifest?**', async route => {
    if (route.request().url().includes(registered.scan_id)) return route.continue();
    const response = await route.fetch();
    await new Promise(resolve => { releaseOld = resolve; }); await route.fulfill({ response });
  });
  await page.locator(`.card[data-repository="${aId}"][data-manifest="skills/same/SKILL.md"]`).click();
  await page.waitForFunction(() => document.querySelector('#manifest-message').textContent === 'Loading manifest…');
  // Closing then choosing B is a real user flow while A remains in flight.
  await page.locator('#close-detail').click();
  await page.locator(`.card[data-repository="${bId}"][data-manifest="skills/same/SKILL.md"]`).click();
  await page.waitForFunction(() => document.querySelector('#manifest-content').textContent.includes('OtherBodyNeedle'));
  while (!releaseOld) await page.waitForTimeout(10);
  releaseOld(); await page.waitForTimeout(30);
  assert.ok((await page.locator('#manifest-content').textContent()).includes('OtherBodyNeedle'));
  await page.locator('#close-detail').click(); await page.unroute('**/manifest?**');
  await query.fill('.claude'); assert.equal(await page.locator('.card').count(), 1);
  await page.locator('.card').click(); assert.equal(await page.locator('#source-select option').count(), 2);
  await page.locator('#close-detail').click();
  for (const token of ['世界', 'café', 'i̇工具', '😀', '.*', '<script>']) {
    await query.fill(token); assert.equal(await page.locator('.card').count(), 1, token);
    assert.ok(await page.locator('.card mark').count());
  }
  assert.equal(await page.evaluate(() => window.searchExecuted), undefined);
  await page.locator('[data-category="product"]').click(); await page.locator('#clear-search').click();
  assert.equal(await page.locator('#filter-count').textContent(), '2 of 2');
  await page.locator('#search-scope').selectOption('current');
  assert.equal(await page.locator('#filter-count').textContent(), '1 of 1');
  await page.locator('#search-scope').selectOption('selected');
  await page.locator(`#repository-choices input[value="${aId}"]`).focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator(`#repository-choices input[value="${aId}"]`).isChecked(), false);
  await page.keyboard.press('Space');
  assert.equal(await page.locator(`#repository-choices input[value="${aId}"]`).isChecked(), true);
  assert.equal(await page.locator(`#repository-choices input[value="${aId}"]`).evaluate(n => n === document.activeElement), true);
  assert.equal(await page.locator('#filter-count').textContent(), '2 of 2');
  await page.locator('[data-category="all"]').click();
  await page.locator(`#repository-choices input[value="${aId}"]`).uncheck();
  await page.locator(`#repository-choices input[value="${bId}"]`).uncheck();
  await page.locator('#scope-status').getByText('Choose at least one repository', { exact: true }).waitFor();
  assert.equal(await page.locator('.card').count(), 0);
  await page.locator(`#repository-choices input[value="${bId}"]`).check();
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '4 of 4');
  assert.equal(preparations, 0, 'Typing, categories and cached reselection do not scan or read');
  await page.locator('#search-scope').selectOption('all');
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '8 of 8');
  await query.fill('OtherBodyNeedle');
  await page.screenshot({ path: path.join(root, 'reports/web-repositories-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'reports/web-repositories-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  // Real cache invalidation and partial failure retain the old successful rows.
  await write(b, 'skills/same/SKILL.md', otherBody + '\nFreshBodyToken');
  await query.fill('FreshBodyToken'); assert.equal(await page.locator('.card').count(), 0);
  await page.locator('#refresh-search').click();
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '1 of 8');
  await rm(b, { recursive: true }); await page.locator('#refresh-search').click();
  await page.getByText(/Stale results.*does not exist/).waitFor();
  assert.equal(await page.locator('.card').count(), 1);
  assert.ok((await page.locator('#filter-count').textContent()).includes('Partial'));
  // A failed focused scan leaves scope, category, query and results untouched.
  await page.locator('#repository-path').fill(path.join(fixture, 'missing')); await page.locator('#scan-button').click();
  await page.locator('#message.error').waitFor(); assert.equal(await page.locator('.card').count(), 1);
  assert.equal(await query.inputValue(), 'FreshBodyToken'); assert.equal(await page.locator('#search-scope').inputValue(), 'all');
  // Restore B, refresh, then expire its server scan while retaining client text.
  await write(b, 'skills/same/SKILL.md', otherBody);
  await query.fill('OtherBodyNeedle'); await page.locator('#refresh-search').click();
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '1 of 5');
  for (let i = 0; i < 8; i++) await page.request.post(url + '/api/scan', { data: { path: a } });
  await page.locator('.card').click(); await page.locator('#refresh-detail').waitFor({ state: 'visible' });
  await page.locator('#refresh-detail').click();
  await page.waitForFunction(() => document.querySelector('#manifest-content').textContent.includes('OtherBodyNeedle'));
  await page.locator('#close-detail').click();
  // Real pagination: only 100 DOM rows, with full counts and zero repeat reads.
  for (let i = 0; i < 101; i++) await write(b, `many/${String(i).padStart(3, '0')}/SKILL.md`, '# paged\n\nPageToken');
  await query.fill('PageToken'); await page.locator('#refresh-search').click();
  await page.waitForFunction(() => document.querySelector('#filter-count').textContent === '101 of 106');
  assert.equal(await page.locator('.card').count(), 100);
  const beforePage = preparations;
  await page.locator('#next-page').click(); assert.equal(await page.locator('.card').count(), 1);
  assert.equal(await page.locator('#page-number').textContent(), 'Page 2 of 2');
  assert.equal(preparations, beforePage);
  await query.press('Escape'); assert.equal(await query.inputValue(), '');
  // Enforce the selection bound before preparing any of nine repositories.
  for (let i = 0; i < 7; i++) {
    const directory = path.join(fixture, `extra-${i}`); await mkdir(directory);
    await page.request.post(url + '/api/scan', { data: { path: directory } });
  }
  await page.locator('#search-scope').selectOption('current');
  await page.locator('#repository-path').fill(a); await page.locator('#scan-button').click();
  await page.getByText('Full-manifest search ready.', { exact: true }).waitFor();
  await page.locator('#search-scope').selectOption('all');
  await page.getByText(/All added repositories exceeds/).waitFor();
  assert.equal(await page.locator('.card').count(), 0);
  await page.locator('#search-scope').selectOption('selected');
  const choices = page.locator('#repository-choices input');
  for (let i = 0; i < 8; i++) await choices.nth(i).check();
  await choices.nth(8).click();
  assert.equal(await choices.nth(8).isChecked(), false);
  await page.getByText('Select at most eight repositories.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Multi-repository browser checks passed: native body search, same-path ownership, Similar skills/export, mirrors/Unicode/literal highlights, cache/scope/clear, refresh/stale errors, expired recovery, pagination, selection bounds, mobile and screenshots.');
} finally {
  clearTimeout(timeout); if (browser) await browser.close(); server.kill(); await once(server, 'exit'); await rm(fixture, { recursive: true, force: true });
}
