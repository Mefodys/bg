import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { scores } from '../web/similarity.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixture = await realpath(await mkdtemp('/tmp/bg-similarity-'));
const source = path.join(fixture, 'source'), target = path.join(fixture, 'target');
const text = '# compiler\n\nLanguage types compiler. <script>window.similarityExecuted=true</script>';
for (const repository of [source, target]) { await mkdir(repository); await writeFile(path.join(repository, 'SKILL.md'), text); }
await mkdir(path.join(source, 'skills/replacement'), { recursive: true });
await writeFile(path.join(source, 'skills/replacement/SKILL.md'), '# replacement\n\nAnother local skill.');
const server = spawn(process.execPath, ['web/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
const timeout = setTimeout(() => { console.error('Similarity browser timeout'); server.kill(); process.exit(1); }, 60000);
try {
  const [chunk] = await once(server.stdout, 'data');
  const url = chunk.toString().trim().replace('Skill Atlas: ', '');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#repository-path').fill(source);
  await page.locator('#scan-button').click();
  await page.waitForFunction(() => document.querySelector('#similarity-skill').options.length === 2);
  assert.ok((await page.locator('#similarity-skill').textContent()).includes('compiler'));
  assert.equal(await page.locator('#similarity-repository').textContent(), source);
  await page.getByRole('button', { name: 'View replacement', exact: true }).click();
  assert.equal(await page.locator('#similarity-skill').inputValue(), 'skills/replacement/SKILL.md');
  await page.locator('#close-detail').click();
  await page.locator('#similarity-skill').selectOption('SKILL.md');
  await page.locator('#similarity-form > details > summary').click();
  await page.locator('#similarity-targets').fill(target);
  const skill = { name: 'compiler', description: 'Language types compiler.', category: 'development', conflict: false, location: '.', manifest_path: 'SKILL.md', sources: [{ manifest_path: 'SKILL.md', location: '.' }] };
  const values = scores([text, text, 'compiler language']);
  const response = { partial: false, warnings: [], results: [
    { repository: target, repository_name: 'target', skill, content: text, score: values[0] },
    { repository: target, repository_name: 'target', skill: { ...skill, name: 'partial', location: 'skills/partial' }, content: 'compiler language', score: values[1] },
  ] };
  // Controlled transport checks UI states independently of the native reader.
  let release;
  await page.route('**/api/similarity', async route => {
    assert.equal(route.request().postDataJSON().include_roles, true);
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.locator('#similarity-roles').check();
  await page.locator('#compare-button').focus(); await page.keyboard.press('Enter');
  await page.getByText('Comparing full manifests…', { exact: true }).waitFor();
  assert.equal(await page.locator('#compare-button').isDisabled(), true);
  await page.waitForTimeout(50); release();
  await page.locator('.similarity-row').first().waitFor();
  assert.deepEqual(await page.locator('.similarity-score').allTextContents(), values.map(s => `${s.toFixed(1)}%`));
  assert.deepEqual(await page.locator('.similarity-row progress').evaluateAll(nodes => nodes.map(n => n.value)), values);
  await page.locator('.similarity-row').first().locator('summary').first().focus(); await page.keyboard.press('Enter');
  await page.getByText(`Repository: ${target}`, { exact: true }).first().waitFor();
  await page.getByText('View canonical manifest', { exact: true }).first().click();
  assert.equal(await page.locator('.similarity-row pre').first().textContent(), text);
  assert.equal(await page.evaluate(() => window.similarityExecuted), undefined);
  assert.equal(await page.locator('#similarity-results script').count(), 0);
  await page.screenshot({ path: path.join(root, 'reports/web-similarity-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(root, 'reports/web-similarity-mobile.png'), fullPage: true });
  await page.unroute('**/api/similarity');
  await page.route('**/api/similarity', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...response, partial: true, warnings: [{ repository: '/missing', error: 'Repository directory does not exist.' }] }) }));
  await page.locator('#compare-button').click();
  await page.getByText(/Partial comparison:.*missing.*does not exist/).waitFor();
  await page.unroute('**/api/similarity');
  await page.route('**/api/similarity', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ partial: false, warnings: [], results: [] }) }));
  await page.locator('#compare-button').click();
  await page.getByText(/No comparable skills found/).waitFor();
  await page.unroute('**/api/similarity');
  await page.route('**/api/similarity', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Scan expired. Scan the repository again.' }) }));
  await page.locator('#compare-button').click();
  await page.locator('#similarity-status').getByText('Scan expired. Scan the repository again.', { exact: true }).waitFor();
  await page.unroute('**/api/similarity');
  await page.route('**/api/similarity', async route => {
    assert.equal(route.request().postDataJSON().include_roles, true);
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.locator('#compare-button').click();
  await page.getByText('Comparing full manifests…', { exact: true }).waitFor();
  await page.locator('#similarity-skill').selectOption('skills/replacement/SKILL.md');
  await page.waitForTimeout(50); release();
  await page.waitForFunction(() => !document.querySelector('#compare-button').disabled);
  assert.equal(await page.locator('.similarity-row').count(), 0, 'Stale comparison must not replace new selection');
  await page.locator('#similarity-skill').selectOption('SKILL.md');
  await page.unroute('**/api/similarity');
  console.log('Similarity UI checks passed: real algorithm values/bars, selected skill, keyboard, manifest safety/paths, loading/partial/empty/error, screenshots and mobile overflow. Transport was controlled for UI state checks.');
  // Now require real native scanner + reader end to end. Never mock this check.
  await page.locator('#compare-button').click();
  await page.waitForFunction(() => !document.querySelector('#compare-button').disabled);
  assert.equal(await page.locator('.similarity-score').first().textContent({ timeout: 3000 }), '100.0%');
  assert.deepEqual(errors, []);
  console.log('Similarity native API browser integration passed.');
} finally {
  clearTimeout(timeout);
  if (browser) await browser.close();
  server.kill(); await once(server, 'exit');
  await rm(fixture, { recursive: true, force: true });
}
