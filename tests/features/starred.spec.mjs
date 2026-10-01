import { test, expect } from 'playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';

for (const mobile of [false, true]) test(`starred skills ${mobile ? 'mobile' : 'desktop'} demo and behavior`, async ({ page }, info) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const root = await mkdtemp('/tmp/bg-starred-'), a = path.join(root, 'a'), b = path.join(root, 'b');
  async function write(repo, relative, content) { const file = path.join(repo, relative); await mkdir(path.dirname(file), {recursive:true}); await writeFile(file, content); }
  for (const repo of [a, b]) for (let i = 0; i < 101; i++) await write(repo, `skills/${String(i).padStart(3,'0')}/SKILL.md`, `# Skill ${i}\n\nDemo needle ${i}`);
  let server = spawn(process.execPath, ['web/server.mjs'], { env: {...process.env, PORT:'0'}, stdio:['ignore','pipe','pipe'] });
  try {
    const [chunk] = await once(server.stdout, 'data'); const url = chunk.toString().trim().replace('Skill Atlas: ', '');
    await page.goto(url);
    const scan = async (count = 101) => { await page.locator('#repository-path').fill(a); await page.locator('#scan-button').click(); await expect(page.locator('#filter-count')).toHaveText(`${count} of ${count}`); await expect(page.locator('#index-status')).toHaveText('Full-manifest search ready.'); };
    await scan(); await page.locator('#next-page').click();
    await page.locator('.star-button').filter({hasText:'☆'}).first().focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#page-number')).toHaveText('Page 1 of 2');
    await expect(page.locator('.card').first()).toHaveAttribute('data-manifest','skills/100/SKILL.md');
    await expect(page.locator('#detail')).not.toBeVisible();
    await expect(page.locator('.star-button[aria-pressed=true]')).toHaveCount(1);
    if (process.env.FEATURE_VISUAL === '1') await expect(page.locator('.skill-result').first()).toHaveScreenshot(`starred-card-${mobile ? 'mobile' : 'desktop'}.png`, {threshold:0,maxDiffPixels:0});
    await page.screenshot({path:info.outputPath('01-pinned.png'), fullPage:true});
    await page.locator('.card').first().click(); await expect(page.locator('#detail-star')).toHaveAttribute('aria-pressed','true');
    await page.locator('#detail-star').click(); await expect(page.locator('#detail-star')).toHaveAttribute('aria-pressed','false');
    await page.locator('#detail-star').click(); await page.locator('#close-detail').click();
    await page.reload(); await scan(); await expect(page.locator('.card').first()).toHaveAttribute('data-manifest','skills/100/SKILL.md');
    const tab = await page.context().newPage(); await tab.goto(url);
    await tab.locator('#repository-path').fill(a); await tab.locator('#scan-button').click(); await expect(tab.locator('#filter-count')).toHaveText('101 of 101'); await expect(tab.locator('#index-status')).toHaveText('Full-manifest search ready.');
    await tab.locator('.star-button[aria-pressed=true]').click(); await expect(page.locator('.skill-result > .star-button[aria-pressed=true]')).toHaveCount(0);
    await tab.locator('#search').fill('needle 100'); await tab.locator('.card[data-manifest="skills/100/SKILL.md"]').locator('..').locator('.star-button').click(); await expect(page.locator('.skill-result > .star-button[aria-pressed=true]')).toHaveCount(1); await tab.close();
    await page.locator('#search').fill('needle 0'); await expect(page.locator('.card')).toHaveCount(1); await expect(page.locator('.star-button[aria-pressed=true]')).toHaveCount(0);
    await page.locator('#clear-search').click();
    await rename(path.join(a,'skills/100/SKILL.md'),path.join(a,'skills/100/absent.md')); await scan(100);
    await expect(page.locator('.star-button[aria-pressed=true]')).toHaveCount(0);
    await rename(path.join(a,'skills/100/absent.md'),path.join(a,'skills/100/SKILL.md')); await scan();
    await expect(page.locator('.star-button[aria-pressed=true]')).toHaveCount(1);
    await page.request.post(url+'/api/scan', {data:{path:b}}); await page.reload(); await scan();
    await page.locator('#search-scope').selectOption('all'); await expect(page.locator('#filter-count')).toHaveText('202 of 202');
    await expect(page.locator('.star-button[aria-pressed=true]')).toHaveCount(1);
    await page.locator('#search').fill('needle 100'); await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.locator('.star-button[aria-pressed=true]')).toHaveCount(1);
    await page.screenshot({path:info.outputPath('02-scoped.png'), fullPage:true});
    server.kill(); await once(server,'exit');
    server = spawn(process.execPath, ['web/server.mjs'], { env: {...process.env, PORT:new URL(url).port}, stdio:['ignore','pipe','pipe'] });
    await once(server.stdout,'data'); await page.reload(); await scan();
    await expect(page.locator('.card').first()).toHaveAttribute('data-manifest','skills/100/SKILL.md');
    await expect(page.locator('.skill-result > .star-button[aria-pressed=true]')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await writeFile(info.outputPath('README.md'), '# Starred skills demo\n\nVideo demonstrates real native discovery, page-two pinning, keyboard control, detail synchronization, reload, missing/restored manifests, filters and repository ownership. PNGs show pinned and scoped states.\n');
  } finally { server.kill(); await once(server,'exit'); await rm(root,{recursive:true,force:true}); }
});
