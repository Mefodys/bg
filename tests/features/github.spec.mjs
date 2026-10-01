import {test,expect} from 'playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {createFixture} from '../github-fixture.mjs';

for(const mobile of [false,true])test(`GitHub organization ${mobile?'mobile':'desktop'} demo and behavior`,async({page},info)=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const fixture=await createFixture({delay:10,truncated:true}),remote=await fixture.server();
  const server=spawn(process.execPath,['web/server.mjs'],{env:{...process.env,PORT:'0',NODE_ENV:'test',BG_GITHUB_TEST_API:remote.url},stdio:['ignore','pipe','pipe']});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    const [chunk]=await once(server.stdout,'data'),url=chunk.toString().trim().replace('Skill Atlas: ','');await page.goto(url);
    await page.locator('#github-panel > summary').click();await page.locator('#github-organization').fill('github.com/demo');await page.locator('#github-submit').click();
    await expect(page.locator('#github-status')).toContainText('3 of 3 repositories · complete');await expect(page.locator('#github-count')).toHaveText('5 matching skills');
    await page.locator('#github-search').fill('DeepBodyToken');await expect(page.locator('.github-result')).toHaveCount(1);
    await page.locator('#github-panel').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('01-organization.png')});
    if(process.env.FEATURE_VISUAL==='1')await expect(page.locator('.github-result')).toHaveScreenshot(`organization-result-${mobile?'mobile':'desktop'}.png`,{threshold:0,maxDiffPixels:0});
    await page.locator('.github-result').focus();await page.keyboard.press('Enter');await expect(page.locator('#github-detail-content')).toContainText('DeepBodyToken');
    expect(await page.evaluate(()=>window.remoteExecuted)).toBeUndefined();await expect(page.locator('#github-detail-link')).toHaveAttribute('href',/\/blob\/a{40}\/skills\/%E4%B8%96%E7%95%8C%0Aextra\/SKILL.md$/);
    await page.screenshot({path:info.outputPath('02-details.png')});await page.locator('#github-detail-close').click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#github-export').click()]);
    const {readFile}=await import('node:fs/promises');const result=JSON.parse(await readFile(await download.path(),'utf8'));expect(result.partial).toBe(false);expect(result.repositories).toHaveLength(3);
    await page.locator('#github-search').fill('');await page.locator('#github-category').selectOption('product');await expect(page.locator('.github-result')).toHaveCount(1);
    await page.locator('#github-category').selectOption('all');await page.locator('#github-submit').click();await expect(page.locator('#github-status')).toContainText('complete');
    // Labelled remote error, while the real native scanner is still used for success.
    fixture.config.fail=true;await page.locator('#github-refresh').check();await page.locator('#github-submit').click();
    await expect(page.locator('#github-status')).toContainText('partial');await expect(page.locator('#github-warnings')).toContainText('HTTP 404');await expect(page.locator('.github-result')).toHaveCount(0);
    await page.screenshot({path:info.outputPath('03-partial.png')});
    fixture.config.fail=false;fixture.config.delay=1000;await page.locator('#github-submit').click();await expect(page.locator('#github-cancel')).toBeEnabled();await page.locator('#github-cancel').click();await expect(page.locator('#github-status')).toContainText('cancelled');
    expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await writeFile(info.outputPath('README.md'),'# GitHub organization demo\n\nRemote GitHub API is replaced by a labelled seeded fixture server. Native selection/discovery/parsing/classification/mirrors run for real. Video covers truncated-tree fallback, complete progress, deep body search, safe manifest details, pinned commit links, JSON export, category selection, cache reuse, explicit partial failure, and cancellation.\n');
  }finally{server.kill();await once(server,'exit');await new Promise(resolve=>remote.server.close(resolve));}
});
