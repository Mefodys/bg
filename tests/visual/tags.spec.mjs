// Additive feature suite: common fixture/scenario IDs and pixel gate stay intact.
import { test, expect } from 'playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tagFixtures } from '../tag-fixtures.mjs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const output=process.env.TAG_VISUAL_OUTPUT || 'reports/tags-visual';
const fixed='/private/tmp/skill-atlas-tags-visual-v1';
const fontRoot=new URL('./fonts/',import.meta.url);
const fonts=JSON.parse(await readFile(new URL('manifest.json',fontRoot),'utf8'));
const sha256=b=>createHash('sha256').update(b).digest('hex');
const scenarios=JSON.parse(await readFile(new URL('./tag-scenarios.json',import.meta.url),'utf8')).scenarios;
const root=path.resolve(process.env.TAG_VISUAL_ROOT || '.');
for(const [id,action,viewport] of scenarios) test.describe(id,()=>{
  test.use({viewport});
  test(action,async({page},info)=>{
    await rm(fixed,{recursive:true,force:true});await mkdir(fixed,{recursive:true});await tagFixtures(fixed);
    if(action==='unavailable')await writeFile(fixed+'/data/skill-tags.json','{invalid');
    const server=spawn(process.execPath,['web/server.mjs'],{cwd:root,env:{...process.env,PORT:'0',BG_REFERENCE_ROOTS:fixed+'/roots.json',BG_TAG_DATA_DIR:fixed+'/data'},stdio:['ignore','pipe','pipe']});
    try {
      const [data]=await once(server.stdout,'data');const url=data.toString().trim().replace('Skill Atlas: ','');
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.clock.setFixedTime(new Date('2026-01-01T12:00:00.000Z'));
      await page.route('**/api/**',async route=>{
        const response=await route.fetch(),data=await response.json();
        function fixedTime(value) { if(Array.isArray(value)) return value.map(fixedTime); if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='scanned_at'?'2026-01-01T12:00:00.000Z':fixedTime(v)]));return value; }
        await route.fulfill({response,json:fixedTime(data)});
      });
      for(const f of fonts.files)expect(sha256(await readFile(new URL(f.name,fontRoot)))).toBe(f.sha256);
      await page.route('**/__tag-fonts/*',async route=>{
        const name=new URL(route.request().url()).pathname.split('/').pop();expect(fonts.files.some(f=>f.name===name)).toBe(true);
        await route.fulfill({body:await readFile(new URL(name,fontRoot)),contentType:'font/ttf'});
      });
      await page.goto(url);
      await page.addStyleTag({content:"@font-face{font-family:VisualSans;src:url('/__tag-fonts/NotoSans.ttf');font-weight:100 900}@font-face{font-family:VisualMono;src:url('/__tag-fonts/NotoSansMono.ttf');font-weight:100 900}:root{--mono:VisualMono,monospace!important;font-family:VisualSans,sans-serif!important}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}pre,.path{font-family:VisualMono,monospace!important}"});
      await page.evaluate(async()=>{await document.fonts.load('14px VisualSans');await document.fonts.load('14px VisualMono');await document.fonts.ready;});
      await page.locator('#repository-path').fill(fixed+'/mps');await page.locator('#scan-button').click();
      const count=async n=>expect(page.locator('#filter-count')).toHaveText(n);
      await count('121 of 121');await expect(page.locator('#index-status')).toHaveText('Full-manifest search ready.');
      await page.locator('#tag-panel').evaluate(el=>el.open=true);
      const tag=id=>page.locator(`input[data-tag="${id}"]`);
      await page.locator('#search').fill('testneedle');await count('90 of 121');
      if(action==='task'||action==='task-focus'||action==='unclassified'||action==='zero'||action==='clear') { await tag('task:testing').check();await count('12 of 121'); }
      if(action==='task-focus'||action==='unclassified'||action==='zero'||action==='clear') { await tag('focus:agent-evals').check();await count('3 of 121'); }
      if(action==='zero'||action==='clear') {
        await page.locator('#search').fill('otherneedle');await count('0 of 121');await expect(tag('task:testing')).toBeChecked();await expect(tag('task:testing')).toBeEnabled();
        if(action==='clear'){await page.locator('#clear-search').click();await count('3 of 121');await expect(page.locator('#search')).toBeFocused();}
      }
      if(action==='similar') {
        await page.locator('.card[data-manifest="skills/000/SKILL.md"]').click();await expect(page.locator('#manifest-content')).toContainText('Body text 0.');await page.locator('#close-detail').click();
        await page.locator('#similarity-form > details > summary').click();await page.locator('#similarity-targets').fill(fixed+'/koog');await page.locator('#compare-button').click();
        await expect(page.locator('.similarity-row')).toHaveCount(1);await expect(page.locator('.similarity-row .tag-badges')).toContainText('Debugging');
      }
      if(action==='unavailable') {await expect(page.locator('#tag-coverage')).toContainText('Tagging unavailable');await count('90 of 121');}
      if(action==='unclassified') {
        await page.locator('#clear-search').click();await page.locator('#unclassified-only').check();await count('1 of 121');
        await expect(tag('task:testing')).toBeChecked();await expect(tag('task:testing')).toBeDisabled();
      }
      if(action==='changed') {
        await writeFile(fixed+'/mps/skills/000/SKILL.md','# Changed\n\nChangedbody');await page.locator('#refresh-search').click();
        await expect(page.locator('#tag-coverage')).toContainText('119 of 121');await page.locator('#search').fill('Changedbody');await count('1 of 121');
        await expect(page.locator('.tag-unknown').filter({hasText:'Needs classification'})).toHaveCount(1);
      }
      if(action==='details') {
        await page.locator('#search-scope').selectOption('all');await page.locator('#search').fill('Ownerneedle');await count('1 of 122');await page.locator('.card').click();
        await expect(page.locator('#manifest-content')).toContainText('Other repository manifest.');await expect(page.locator('#detail-tags')).toContainText('Debugging');await expect(page.locator('#detail-repository')).toContainText('/koog');
      } else if(action==='similar')await page.locator('#similarity-title').evaluate(el=>el.scrollIntoView({block:'start'}));
      else await page.locator('#tag-panel').evaluate(el=>el.scrollIntoView({block:'start'}));
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
      await page.mouse.move(0,0);await page.evaluate(()=>{document.body.style.visibility='hidden';void document.body.offsetHeight;});await page.evaluate(()=>{document.body.style.visibility='visible';void document.body.offsetHeight;});
      await expect(page).toHaveScreenshot(id+'.png',{threshold:0,maxDiffPixels:0,animations:'disabled',caret:'hide'});
      const target=path.join(output,id+'.png');await mkdir(path.dirname(target),{recursive:true});const bytes=await page.screenshot({path:target,animations:'disabled',caret:'hide'});
      await info.attach(id,{body:bytes,contentType:'image/png'});
      const observed=await page.evaluate(()=>({count:document.querySelector('#filter-count').textContent,coverage:document.querySelector('#tag-coverage').textContent,query:document.querySelector('#search').value,dialog:document.querySelector('#detail').open,selected:[...document.querySelectorAll('#tag-groups input:checked')].map(n=>n.dataset.tag),scrollY}));
      await writeFile(path.join(output,id.replace('/','-')+'.json'),JSON.stringify({id,action,viewport,file:id+'.png',sha256:sha256(bytes),observed,assertions:'Scenario-specific counts, selection, ownership, status, overflow and JS-error assertions passed.'}));
    }finally {server.kill();await once(server,'exit');}
  });
});

test.afterAll(async({browser})=>{
  const records=[];
  for(const [id] of scenarios)try {records.push(JSON.parse(await readFile(path.join(output,id.replace('/','-')+'.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
  const hashFiles=async files=>sha256(Buffer.concat(await Promise.all(files.map(f=>readFile(new URL(f,import.meta.url))))));
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH||null;
  const manifest={version:1,feature:'skill-tags',createdAt:new Date().toISOString(),servingSHA:revision,mergeSHA:revision,baselineSHA:process.env.VISUAL_BASE_SHA||revision,prURL:process.env.VISUAL_PR_URL||null,testRunner:'Playwright Test',capture:'Isolated native server with versioned tag fixtures; initial self-reference is not a cross-revision acceptance.',
    environment:{browser:await browser.version(),browserExecutable:executable,browserHash:executable?sha256(await readFile(executable)):null,playwright:JSON.parse(await readFile(new URL('../../node_modules/playwright/package.json',import.meta.url),'utf8')).version,os:process.platform==='darwin'?execFileSync('sw_vers',{encoding:'utf8'}).trim():await readFile('/etc/os-release','utf8'),image:process.env.VISUAL_CI_IMAGE||null,fonts,arch:process.arch,node:process.version,dpr:1,zoom:100,locale:'en-US',timezone:'UTC',colorScheme:'light',reducedMotion:true,fixedTime:'2026-01-01T12:00:00.000Z',fixtureRoot:fixed,normalization:['API scanned_at fixed to fixture time'],masks:[]},
    suiteHash:await hashFiles(['./tag-scenarios.json']),fixtureHash:await hashFiles(['../tag-fixtures.mjs','../tag-taxonomy.json']),scriptHash:await hashFiles(['./tags.spec.mjs','../../playwright.tags.config.mjs']),binaryHash:sha256(await readFile(path.join(root,'bg'))),scenarios:records};
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(path.join(output,'README.md'),`# Skill tags visual run\n\nRevision: ${revision}. PR: ${manifest.prURL||'local verification'}.\n\n${manifest.capture}\n\nEnvironment, suite/fixture/binary hashes, assertions and image hashes: [manifest.json](manifest.json).\n\n`+records.map(r=>`## ${r.id}\n\n![${r.action}](${r.file})\n\nCount: ${r.observed.count}; coverage: ${r.observed.coverage}.\n`).join('\n'));
  if(records.length!==scenarios.length)await writeFile(path.join(output,'INCOMPLETE.txt'),`Missing/failed scenarios: ${records.length}/${scenarios.length}`);
});
