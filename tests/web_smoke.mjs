import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';

const fixture = await mkdtemp('/tmp/bg-filter-');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn(process.execPath, ['web/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
const timeout = setTimeout(() => { console.error('Browser smoke test timed out'); server.kill(); process.exit(1); }, 60000);
try {
  const [chunk] = await once(server.stdout, 'data');
  const url = chunk.toString().trim().replace('Skill Atlas: ', '');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#repository-path').fill(path.join(root, 'tests/fixtures/corner-cases'));
  await page.locator('#scan-button').click();
  await page.waitForFunction(() => document.querySelector('#count-skills').textContent === '4');
  assert.equal(await page.locator('.card').count(), 4);
  assert.equal(await page.locator('#count-sources').textContent(), '5');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.sections.flatMap(section => section.skills).length, 4);
  await page.locator('[data-category="product"]').click();
  assert.equal(await page.locator('.card').count(), 1);
  await page.locator('[data-category="all"]').click();
  await page.locator('#search').fill('.claude');
  assert.equal(await page.locator('.card').count(), 1);
  await page.locator('.card').click();
  await page.waitForFunction(() => document.querySelector('#manifest-content').textContent.includes('name: shared-skill'));
  assert.equal(await page.locator('#source-select option').count(), 2);
  await page.locator('#source-select').selectOption('.claude/skills/shared/SKILL.md');
  await page.waitForFunction(() => document.querySelector('#manifest-message').textContent === '');
  await page.locator('#close-detail').click();
  await page.locator('#search').fill('no-such-skill');
  assert.equal(await page.locator('.card').count(), 0);
  await page.getByText('No matching skills.', { exact: true }).waitFor();
  await page.locator('#search').fill('');
  await page.screenshot({ path: path.join(root, 'reports/web-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'reports/web-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile layout overflows');
  await page.locator('#repository-path').fill(path.join(root, 'does-not-exist'));
  await page.locator('#scan-button').click();
  await page.locator('#message.error').waitFor();
  assert.equal(await page.locator('.card').count(), 4, 'Failed scan should preserve old inventory');
  const manifests = {
    '.agents/skills/mixed/SKILL.md': '# teSt-helper\n\nTest tests teSt routines.',
    '.claude/skills/mixed/SKILL.md': '# teSt-helper\n\nTest tests teSt routines.',
    'agent/skills/body/SKILL.md': '# mps-aspect-typesystem\n\nLanguage structure.\n\n' + 'Ordinary text. '.repeat(80) + 'WhenConcreteStatement block and tests.',
    'skills/unicode/SKILL.md': '# İ工具😀\n\n世界 CAFÉ — Ελληνικά.',
    'skills/literal/SKILL.md': '# literal\n\nLiteral <script>window.filterExecuted = true</script> and .* tokens.',
    'tests/fixture/SKILL.md': '# fixture\n\nTests fixture.',
    'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/product/SKILL.md': '# shipped\n\nTest product.'
  };
  for (const [relative, content] of Object.entries(manifests)) {
    await mkdir(path.dirname(path.join(fixture, relative)), { recursive: true });
    await writeFile(path.join(fixture, relative), content);
  }
  let indexRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/search-index')) indexRequests++; });
  await page.route('**/search-index', async route => {
    await page.locator('#index-status').getByText('Loading full-manifest search index…', { exact: true }).waitFor();
    await route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('#repository-path').fill(fixture);
  await page.locator('#scan-button').click();
  await page.waitForFunction(() => document.querySelector('#count-skills').textContent === '6');
  await page.getByText('Full-manifest search ready.', { exact: true }).waitFor();
  assert.equal(await page.locator('#filter-count').textContent(), '6 of 6');
  const search = page.locator('#search');
  await search.fill('  test  ');
  assert.equal(await page.locator('#filter-count').textContent(), '4 of 6');
  assert.equal(await page.locator('.card').filter({ hasText: 'mps-aspect-typesystem' }).count(), 1);
  assert.ok((await page.locator('.card mark').allTextContents()).includes('teSt'));
  assert.ok((await page.locator('.card p').allTextContents()).some(text => text.includes('…') && text.includes('WhenConcreteStatement')));
  await page.screenshot({ path: path.join(root, 'reports/web-filter-desktop.png'), fullPage: true });
  await page.locator('[data-category="test-fixture"]').click();
  assert.equal(await page.locator('#filter-count').textContent(), '1 of 1');
  await page.locator('#clear-search').click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('#filter-count').textContent(), '1 of 1');
  assert.equal(await search.evaluate(node => node === document.activeElement), true);
  await page.locator('[data-category="development"]').click();
  await search.fill('.claude/skills/mixed/SKILL.md');
  assert.equal(await page.locator('#filter-count').textContent(), '1 of 4');
  await search.fill('Language structure');
  assert.equal(await page.locator('.card').count(), 1);
  await search.fill('<script>');
  assert.equal(await page.locator('.card mark').first().textContent(), '<script>');
  assert.equal(await page.evaluate(() => window.filterExecuted), undefined);
  assert.equal(await page.locator('#inventory script').count(), 0);
  await search.fill('.*');
  assert.equal(await page.locator('.card').count(), 1);
  assert.equal(await page.locator('.card mark').first().textContent(), '.*');
  for (const query of ['世界', 'café', 'i̇工具', '😀']) {
    await search.fill(query);
    assert.equal(await page.locator('.card').count(), 1, `Unicode query ${query}`);
    assert.ok(await page.locator('.card mark').count());
  }
  await search.fill('nonexistent');
  assert.equal(await page.locator('#filter-count').textContent(), '0 of 4');
  await page.getByText('No matching skills.', { exact: true }).waitFor();
  assert.equal(await page.locator('.section-title').count(), 0);
  await search.press('Escape');
  assert.equal(await page.locator('#filter-count').textContent(), '4 of 4');
  await search.fill('WhenConcreteStatement');
  await page.locator('.card').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#manifest-content').textContent.includes('WhenConcreteStatement'));
  await page.keyboard.press('Escape');
  await search.fill('test');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'reports/web-filter-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Filter mobile layout overflows');
  assert.equal(indexRequests, 1, 'Typing and categories must reuse the index');
  await page.unroute('**/search-index');
  await page.route('**/search-index', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Scan expired. Scan the repository again.' }) }));
  await page.locator('#scan-button').click();
  await page.getByText(/Full-manifest search unavailable: Scan expired/).waitFor();
  await search.fill('teSt-helper');
  assert.equal(await page.locator('.card').count(), 1, 'Metadata fallback survives index failure');
  await page.unroute('**/search-index');
  await page.route('**/search-index', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sources: [{ path: 'agent/skills/body/SKILL.md', content: 'WhenConcreteStatement', truncated: true }, { path: 'skills/literal/SKILL.md', content: '', error: 'Manifest is no longer available.' }] }) }));
  await page.locator('#scan-button').click();
  await page.getByText(/Partial search index:.*truncated.*no longer available/).waitFor();
  await search.fill('WhenConcreteStatement');
  assert.equal(await page.locator('.card').count(), 1);
  await page.unroute('**/search-index');
  await rm(fixture, { recursive: true, force: true });
  await mkdir(fixture);
  await page.locator('#scan-button').click();
  await page.getByText('No skills found.', { exact: true }).waitFor();
  assert.equal(await page.locator('#filter-count').textContent(), '0 of 0');
  assert.deepEqual(errors, [], 'Browser console errors');
  console.log('Browser checks passed: scan/export/details/mirrors, full-body/name/description/source filtering, literal safe highlights, Unicode, scoped counts/clear, keyboard, cached index/loading/partial/failure, empty states, desktop/mobile overflow and no JS errors.');
} finally {
  await rm(fixture, { recursive: true, force: true });
  clearTimeout(timeout);
  if (browser) await browser.close();
  server.kill();
  await once(server, 'exit');
}
