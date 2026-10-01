import { test, expect } from 'playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tagFixtures } from '../tag-fixtures.mjs';

for (const mobile of [false,true]) test(`stars retain tag filtering ${mobile?'mobile':'desktop'}`, async ({page}) => {
  if (mobile) await page.setViewportSize({width:390,height:844});
  const root=await realpath(await mkdtemp('/tmp/bg-starred-tags-')); await tagFixtures(root);
  const server=spawn(process.execPath,['web/server.mjs'],{env:{...process.env,PORT:'0',BG_REFERENCE_ROOTS:root+'/roots.json',BG_TAG_DATA_DIR:root+'/data'},stdio:['ignore','pipe','inherit']});
  try {
    const [chunk]=await once(server.stdout,'data'); const url=chunk.toString().trim().replace('Skill Atlas: ',''); await page.goto(url);
    await page.locator('#repository-path').fill(root+'/mps'); await page.locator('#scan-button').click();
    await expect(page.locator('#filter-count')).toHaveText('121 of 121');
    await expect(page.locator('#tag-coverage')).toContainText('120 of 121');
    await expect(page.locator('#index-status')).toHaveText('Full-manifest search ready.');
    await page.locator('#tag-panel').evaluate(el=>el.open=true);
    await page.locator('#search').fill('testneedle');
    await page.locator('input[data-tag="task:testing"]').check();
    await page.locator('input[data-tag="focus:agent-evals"]').check();
    await expect(page.locator('#filter-count')).toHaveText('3 of 121');
    const manifest=await page.locator('.card').last().getAttribute('data-manifest');
    await page.locator('.skill-result > .star-button').last().click();
    await expect(page.locator('.card').first()).toHaveAttribute('data-manifest',manifest);
    await expect(page.locator('.skill-result').first().locator('.tag-badges')).toContainText('Testing');
    await page.locator('input[data-tag="focus:agent-evals"]').uncheck();
    await expect(page.locator('#filter-count')).toHaveText('12 of 121');
    await expect(page.locator('.card').first()).toHaveAttribute('data-manifest',manifest);
    await page.locator('#clear-search').click();
    await page.locator('#unclassified-only').check();
    await expect(page.locator('#filter-count')).toHaveText('1 of 121');
    await expect(page.locator('.skill-result > .star-button[aria-pressed=true]')).toHaveCount(0);
    await page.locator('#unclassified-only').uncheck();
    await expect(page.locator('.card').first()).toHaveAttribute('data-manifest',manifest);
    await page.locator('.card').first().click();
    await expect(page.locator('#detail-tags')).toContainText('Testing');
    await expect(page.locator('#detail-star')).toHaveAttribute('aria-pressed','true');
    await page.locator('#close-detail').click();
    expect(await page.locator('button button').count()).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {server.kill();await once(server,'exit');await rm(root,{recursive:true,force:true});}
});
