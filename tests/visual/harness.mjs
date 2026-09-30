import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile, readFile, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const option=(name,fallback)=>process.env[{'--root':'VISUAL_ROOT','--feature':'VISUAL_FEATURE','--run':'VISUAL_RUN'}[name]]||fallback;
const root=path.resolve(process.env.VISUAL_ROOT||path.join(import.meta.dirname,'../..'));
const feature=option('--feature','search-field-color'), run=option('--run','run-001');
assert.match(feature,/^[a-z0-9-]+$/);assert.match(run,/^run-[a-z0-9-]+$/);
const support=import.meta.dirname;
const suite=JSON.parse(await readFile(path.join(support,'scenarios.json'),'utf8'));
const fixtures=JSON.parse(await readFile(path.join(support,'fixtures.json'),'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
// Harness from the PR captures the requested application checkout.
const output=path.resolve(process.env.VISUAL_OUTPUT||path.join(root,'screenshots',feature,sha,run));
export async function initialize(){
try{await stat(output);throw new Error('Run already exists; choose a fresh --run ID.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(output,{recursive:true});
const marker=path.join(suite.fixture_root,'.skill-atlas-visual-owned');
try{await stat(suite.fixture_root);assert.equal(await readFile(marker,'utf8'),'visual-suite-v1');}
catch(e){if(e.code!=='ENOENT')throw e;await mkdir(suite.fixture_root,{recursive:true});await writeFile(marker,'visual-suite-v1');}
}
const app=path.join(suite.fixture_root,'app'),lib=path.join(suite.fixture_root,'library');
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if(process.env.VISUAL_SCENARIOS){const ids=JSON.parse(process.env.VISUAL_SCENARIOS);suite.scenarios=suite.scenarios.filter(s=>ids.includes(s.id));assert.equal(suite.scenarios.length,ids.length);}
const fontLock=JSON.parse(await readFile(path.join(support,'fonts/manifest.json'),'utf8'));
for(const f of fontLock.files)assert.equal(hash(await readFile(path.join(support,'fonts',f.name))),f.sha256,'Font asset changed: '+f.name);
export {suite};
const records=[];
async function write(relative,text){const file=path.join(suite.fixture_root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);}
async function reset(){for(const name of ['app','library','library-unavailable'])await rm(path.join(suite.fixture_root,name),{recursive:true,force:true});for(const [file,text]of Object.entries(fixtures))await write(file,text);}
function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='scanned_at'?suite.time:normalize(v)]));return value;}
export async function captureScenario(page,scenario,expect,testInfo){
 await reset();
 const server=spawn(process.execPath,['web/server.mjs'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const [chunk]=await once(server.stdout,'data');const url=chunk.toString().trim().replace('Skill Atlas: ','');
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(suite.time));
  await page.route('**/api/**',async route=>{
   try{
   const response=await route.fetch();const data=await response.json();
   const payload=route.request().url().endsWith('/api/repositories')?data.filter(r=>r.path.startsWith(suite.fixture_root+path.sep)):normalize(data);
   await route.fulfill({response,json:payload});
   }catch(error){if(!page.isClosed())errors.push('Capture route: '+error.message);}
  });
  const registered=await(await page.request.post(url+'/api/scan',{data:{path:lib}})).json();
  const libId=registered.repository.repository_id;
  await page.route('**/__visual-fonts/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();assert.ok(fontLock.files.some(f=>f.name===name));await route.fulfill({body:await readFile(path.join(support,'fonts',name)),contentType:'font/ttf'});});
  await page.goto(url);
  await page.addStyleTag({content:`@font-face{font-family:VisualSans;src:url('/__visual-fonts/NotoSans.ttf');font-weight:100 900}@font-face{font-family:VisualMono;src:url('/__visual-fonts/NotoSansMono.ttf');font-weight:100 900}@font-face{font-family:VisualCJK;src:url('/__visual-fonts/NotoSansSC-subset.ttf')} :root{font-family:VisualSans,VisualCJK,sans-serif!important}`});
  await page.evaluate(async()=>{await Promise.all([document.fonts.load('14px VisualSans'),document.fonts.load('14px VisualMono'),document.fonts.load('14px VisualCJK','世界')]);await document.fonts.ready;});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}'});
  await page.waitForFunction(()=>document.querySelectorAll('#repositories .repo').length>=0 && document.querySelector('#search-scope'));
  // Ensure initial catalogue has completed; native API is retained for scan/index/details.
  await page.waitForFunction(()=>document.querySelector('#repositories').textContent.includes('library'));
  const query=page.locator('#search');
  const count=async text=>page.waitForFunction(t=>document.querySelector('#filter-count').textContent===t,text);
  const focus=async()=>page.locator('.feature-panels').evaluate(el=>el.scrollIntoView({block:'start'}));
  const all=async()=>{await page.locator('#search-scope').selectOption('all');await count('8 of 8');};
  const other=async()=>{await all();await query.fill('OtherBodyNeedle');await count('1 of 8');};
  const details=async()=>{await other();await page.locator('.card').click();await page.waitForFunction(()=>document.querySelector('#manifest-content').textContent.includes('OtherBodyNeedle'));assert.ok((await page.locator('#detail-repository').textContent()).includes(lib));};
  if(scenario.action!=='initial'){
   await page.locator('#repository-path').fill(app);await page.locator('#scan-button').click();
   await count('4 of 4');await page.getByText('Full-manifest search ready.',{exact:true}).waitFor();
   await expect(page.locator('.filter-panel .search')).toBeVisible();
  }
  switch(scenario.action){
   case 'initial':assert.equal(await page.locator('#filter-count').textContent(),'0 of 0');break;
   case 'scanned':await focus();break;
   case 'name':await query.fill('release-checklist');await count('1 of 4');await focus();break;
   case 'description':await query.fill('automated review');await count('1 of 4');await focus();break;
   case 'body':await query.fill('AlphaBodyToken');await count('1 of 4');assert.ok((await page.locator('.card').textContent()).includes('AlphaBodyToken'));await focus();break;
   case 'current-miss':await query.fill('OtherBodyNeedle');await count('0 of 4');await focus();break;
   case 'selected':await query.fill('OtherBodyNeedle');await page.locator('#search-scope').selectOption('selected');await page.locator(`#repository-choices input[value="${libId}"]`).check();await count('1 of 8');assert.equal(await page.locator('.card').getAttribute('data-repository'),libId);await focus();break;
   case 'all':await all();assert.equal(await page.locator('.repository-heading').count(),2);await focus();break;
   case 'category':await page.locator('[data-category="product"]').click();await count('1 of 1');await focus();break;
   case 'empty':await query.fill('missing-visual-token');await count('0 of 4');await page.getByText('No matching skills.',{exact:true}).waitFor();await focus();break;
   case 'clear':await query.fill('release');await query.press('Escape');await count('4 of 4');assert.equal(await query.evaluate(el=>document.activeElement===el),true);await focus();break;
   case 'details':await details();break;
   case 'similar':await page.locator('.card[data-manifest="skills/release/SKILL.md"]').click();await page.waitForFunction(()=>document.querySelector('#manifest-content').textContent.includes('AlphaBodyToken'));await page.locator('#close-detail').click();await page.locator('#similarity-form > details > summary').click();await page.locator('#similarity-targets').fill(lib);await page.locator('#compare-button').click();await page.waitForFunction(()=>!document.querySelector('#compare-button').disabled);assert.ok(await page.locator('.similarity-row').count());await page.locator('#similarity-form > details > summary').click();await focus();break;
   case 'refresh':await all();await write('library/skills/release/SKILL.md',fixtures['library/skills/release/SKILL.md']+'\nRefreshBodyToken');await query.fill('RefreshBodyToken');await count('0 of 8');await page.locator('#refresh-search').click();await count('1 of 8');await focus();break;
   case 'partial':await other();await rename(lib,path.join(suite.fixture_root,'library-unavailable'));await page.locator('#refresh-search').click();await page.getByText(/Stale results.*does not exist/).waitFor();assert.equal(await page.locator('.card').count(),1);assert.ok((await page.locator('#filter-count').textContent()).includes('Partial'));await focus();break;
   case 'expired':case 'recovered':await other();for(let i=0;i<8;i++)assert.equal((await page.request.post(url+'/api/scan',{data:{path:app}})).status(),200);await page.locator('.card').click();await page.locator('#refresh-detail').waitFor({state:'visible'});if(scenario.action==='recovered'){await page.locator('#refresh-detail').click();await page.waitForFunction(()=>document.querySelector('#manifest-content').textContent.includes('OtherBodyNeedle'));}break;
   case 'pagination':for(let i=0;i<101;i++)await write(`library/many/${String(i).padStart(3,'0')}/SKILL.md`,`# paged-${String(i).padStart(3,'0')}\n\nPaginationNeedle`);await all();await query.fill('PaginationNeedle');await page.locator('#refresh-search').click();await count('101 of 109');await page.locator('#next-page').click();assert.equal(await page.locator('.card').count(),1);assert.equal(await page.locator('#page-number').textContent(),'Page 2 of 2');await focus();break;
   case 'mirrors':await all();await query.fill('mirror-helper');await count('1 of 8');await page.locator('.card').click();await page.waitForFunction(()=>document.querySelector('#manifest-content').textContent.includes('世界'));assert.equal(await page.locator('#source-select option').count(),2);break;
   case 'unicode':await all();await query.fill('世界');await count('1 of 8');assert.ok(await page.locator('.card mark').count());await focus();break;
   default:throw new Error('Unknown scenario '+scenario.action);
  }
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const file=scenario.id+'.png';await mkdir(path.dirname(path.join(output,file)),{recursive:true});
  await page.evaluate(()=>{for(const el of document.querySelectorAll('*'))if(getComputedStyle(el).fontFamily.includes('monospace'))el.style.fontFamily='VisualMono,VisualCJK,monospace';});
  await page.mouse.move(0,0); // Fixed neutral hover; scrolling must not hover a result card.
  // Invalidate the whole paint tree after scrolling to avoid incremental edge raster artifacts.
  await page.evaluate(()=>{document.body.style.visibility='hidden';void document.body.offsetHeight;});
  await page.evaluate(()=>{document.body.style.visibility='visible';void document.body.offsetHeight;});
  await expect(page).toHaveScreenshot(file,{threshold:0,maxDiffPixels:0,animations:'disabled',caret:'hide'});
  const bytes=await page.screenshot({path:path.join(output,file),animations:'disabled',caret:'hide'});
  await testInfo.attach(scenario.id,{body:bytes,contentType:'image/png'});
  const observed=await page.evaluate(()=>({count:document.querySelector('#filter-count').textContent,query:document.querySelector('#search').value,scope:document.querySelector('#search-scope').value,dialog:document.querySelector('#detail').open,searchBackground:getComputedStyle(document.querySelector('.filter-panel .search')).backgroundColor,scrollY,bodyFont:getComputedStyle(document.body).fontFamily}));
  const record={...scenario,file,sha256:hash(bytes),observed,assertions:'Scenario-specific count/content/ownership/state assertions passed; no JS errors or horizontal overflow.'};
  await writeFile(path.join(output,scenario.id.replace('/','-')+'.json'),JSON.stringify(record));
  records.push(record);
  console.log(scenario.id+' OK');
 }finally{server.kill();await once(server,'exit');}
}
export async function finalize(browser){
records.length=0;
for(const scenario of suite.scenarios){try{records.push(JSON.parse(await readFile(path.join(output,scenario.id.replace('/','-')+'.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
const environment={browser:await browser.version(),browserExecutable:executable,browserHash:executable?hash(await readFile(executable)):null,playwright:JSON.parse(await readFile(path.join(support,'../../node_modules/playwright/package.json'),'utf8')).version,os:process.platform==='darwin'?execFileSync('sw_vers',{encoding:'utf8'}).trim():await readFile('/etc/os-release','utf8'),image:process.env.VISUAL_CI_IMAGE||null,fonts:fontLock,arch:process.arch,node:process.version,dpr:1,zoom:100,locale:'en-US',timezone:'UTC',colorScheme:'light',reducedMotion:true,fixedTime:suite.time,fixtureRoot:suite.fixture_root,normalization:['API scanned_at fixed to suite time','optional host catalogue filtered to fixture entries'],masks:[]};
const manifest={version:1,feature,run,createdAt:new Date().toISOString(),mergeSHA:sha,servingSHA:sha,servingURL:'http://127.0.0.1:4173',capture:'Isolated native server from serving checkout; versioned deterministic fixtures, not live host repository data.',baselineSHA:process.env.VISUAL_BASE_SHA||sha,prURL:process.env.VISUAL_PR_URL||null,testRunner:'Playwright Test',environment,suiteHash:hash(await readFile(path.join(support,'scenarios.json'))),fixtureHash:hash(await readFile(path.join(support,'fixtures.json'))),scriptHash:hash(Buffer.concat(await Promise.all(['harness.mjs','visual.spec.mjs','setup.mjs','../../playwright.visual.config.mjs'].map(f=>readFile(path.join(support,f)))))),binaryHash:hash(await readFile(path.join(root,'bg'))),scenarios:records};
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(output,'README.md'),`# ${feature} — initial visual run\n\nRevision: \`${sha}\`. Playwright Test visual run.\n\n${manifest.capture}\n\nCapture settings and asserted outcomes: [manifest.json](manifest.json).\nReusable suite: workspace tests/visual/visual.spec.mjs and scenarios.json.\n\n`+records.map(s=>`## ${s.id}\n\n${s.caption}\n\n![${s.caption}](${s.file})\n\nCount: ${s.observed.count}; query: ${JSON.stringify(s.observed.query)}; scope: ${s.observed.scope}.\n`).join('\n'));
console.log('Saved '+records.length+' screenshots in '+output);
if(records.length!==suite.scenarios.length)await writeFile(path.join(output,'INCOMPLETE.txt'),'Missing/failed Playwright tests: '+records.length+'/'+suite.scenarios.length);
}
