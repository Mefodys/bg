import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { GitHubScanner, githubLimits, organization, scanOptions } from '../web/github.mjs';
import { createFixture } from './github-fixture.mjs';
const binary=path.resolve('bg');
const options={organization:'https://github.com/demo'};
async function setup(config={},limits=githubLimits){const fixture=await createFixture(config);const scanner=new GitHubScanner({binary,transport:fixture.transport,token:'secret-never-echo',limits});return {fixture,scanner};}

test('organization input and options reject SSRF and credentials',()=>{
  for(const input of ['demo','github.com/demo','https://github.com/demo/'])assert.equal(organization(input),'demo');
  for(const input of ['http://localhost','https://evil.example/demo','github.com/demo/repo','https://token@github.com/demo','../demo','demo?x=1','demo--a','',null])assert.throws(()=>organization(input));
  for(const input of [{organization:'demo',token:'x'},{organization:'demo',concurrency:0},{organization:'demo',refresh:1}])assert.throws(()=>scanOptions(input));
});
test('untrusted repository names cannot escape a temporary tree',async()=>{
  const {scanner}=await setup();
  for(const name of ['demo/..','demo/.','demo/../../outside'])await assert.rejects(()=>scanner.repository({id:1,full_name:name,default_branch:'main'}, {}, AbortSignal.timeout(1000), {}),/Invalid repository identity/);
});
test('native selection is shared, escaped, mode-aware and bounded',()=>{
  const records=[['100644','SKILL.md'],['100755','skills/世界\nextra/SKILL.md'],['100644','vendor/x/SKILL.md'],['120000','link/SKILL.md'],['100644','contest/SKILL.md']];
  const result=execFileSync(binary,['--select-manifests'],{input:records.map(([mode,p])=>mode+'\t'+JSON.stringify(p)+'\n').join(''),encoding:'utf8'});
  assert.deepEqual(result.trim().split('\n').map(JSON.parse),['SKILL.md','skills/世界\nextra/SKILL.md','contest/SKILL.md']);
  assert.throws(()=>execFileSync(binary,['--select-manifests'],{input:'100644\t"../outside/SKILL.md"\n',stdio:['pipe','pipe','pipe']}));
});
test('remote inventory exactly matches local native discovery, all corner cases and text',async()=>{
  const {scanner,fixture}=await setup();const result=await scanner.scan(options);assert.equal(result.partial,false);assert.equal(result.repositories.length,3);
  const remote=result.repositories.find(r=>r.full_name==='demo/r0');const root=await mkdtemp('/tmp/bg-org-reference-');
  try{const repo=path.join(root,'r0');await mkdir(repo);for(const [name,bytes] of fixture.files){const file=path.join(repo,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);}
    const local=JSON.parse(execFileSync(binary,['scan',repo,'--json'],{encoding:'utf8'}));assert.deepEqual(remote.inventory.sections,local.sections);
    assert.deepEqual(new Set(remote.inventory.sections.flatMap(s=>s.skills.map(k=>k.category))),new Set(['development','test-fixture','product']));
    assert.ok(remote.inventory.sections.flatMap(s=>s.skills).some(k=>k.sources.length===2));assert.ok(remote.sources.some(s=>s.content.includes('DeepBodyToken')));
    assert.ok(!remote.sources.some(s=>s.path.startsWith('vendor/') || s.path.includes('/link/')));
  }finally{await rm(root,{recursive:true,force:true});}
  assert.ok(fixture.calls.every(c=>c.authorization==='Bearer secret-never-echo'));assert.ok(!JSON.stringify(result).includes('secret-never-echo'));
  assert.ok(result.metrics.blob_cache_hits>=1,'Mirror blobs are fetched once.');
});
test('organization pagination beyond 100 and archived/fork options',async()=>{
  const {scanner}=await setup({count:105});const result=await scanner.scan({...options,include_archived:false,include_forks:false});assert.equal(result.repositories.length,103);assert.equal(result.partial,false);
});
test('truncated recursive trees fall back completely; truncated fallback is partial',async()=>{
  const first=await setup({truncated:true});const result=await first.scanner.scan(options);assert.equal(result.partial,false);assert.ok(first.fixture.calls.some(c=>c.endpoint.endsWith('/git/trees/'+'c'.repeat(40))));
  const second=await setup({truncated:true,nonrecursiveTruncated:true});assert.equal((await second.scanner.scan(options)).partial,true);
});
test('immutable cache skips trees/blobs/native, refresh and changed head rescan',async()=>{
  const {scanner,fixture}=await setup();await scanner.scan(options);const warm=await scanner.scan(options);assert.equal(warm.metrics.cache_hits,1);assert.equal(warm.metrics.native_scans,0);assert.equal(warm.metrics.requests,2);
  assert.equal((await scanner.scan({...options,refresh:true})).metrics.native_scans,1);fixture.config.changed=true;assert.equal((await scanner.scan(options)).metrics.native_scans,1);
  fixture.config.renamed=true;const renamed=await scanner.scan(options);assert.equal(renamed.metrics.cache_hits,1);assert.equal(renamed.repositories.find(r=>r.cached).full_name,'demo/renamed');assert.equal(renamed.repositories.find(r=>r.cached).inventory.repository,'demo/renamed');
});
test('disk cache is private, versioned and reused by a new scanner',async()=>{
  const {scanner,fixture}=await setup();const directory=await mkdtemp('/tmp/bg-org-cache-');scanner.cacheDirectory=directory;
  try{await scanner.scan(options);const other=new GitHubScanner({binary,transport:fixture.transport,cacheDirectory:directory});assert.equal((await other.scan(options)).metrics.cache_hits,1);}
  finally{await rm(directory,{recursive:true,force:true});}
});
test('rate limits retry and ordinary access errors are explicit partial results',async()=>{
  const first=await setup({rate:true});assert.equal((await first.scanner.scan(options)).partial,false);assert.equal(first.scanner.throttled,false,'Expired rate-limit pacing must not latch for the process lifetime.');
  const second=await setup({fail:true});const partial=await second.scanner.scan(options);assert.equal(partial.partial,true);assert.match(partial.repositories.find(r=>r.error).error,/404/);assert.equal(partial.repositories.length,3);
  const third=await setup({count:105,enumerationFailure:true});const incomplete=await third.scanner.scan(options);assert.equal(incomplete.partial,true);assert.equal(incomplete.repositories.length,100);
  const fourth=await setup({transient:true});assert.equal((await fourth.scanner.scan(options)).partial,false);
  const fifth=await setup({redirect:true});assert.equal((await fifth.scanner.scan(options)).partial,true);
});
test('content warnings do not claim incomplete coverage or disable immutable caching',async()=>{
  const {scanner}=await setup({invalidUtf8:true});const result=await scanner.scan(options);
  const repository=result.repositories.find(item=>item.full_name==='demo/r0');
  assert.equal(result.partial,false);assert.equal(repository.partial,false);assert.ok(repository.inventory.warnings.length>0);
  const warm=await scanner.scan(options);assert.equal(warm.metrics.cache_hits,1);
});
test('native selector diagnostics survive repository failure reporting',async()=>{
  const {scanner}=await setup();const directory=await mkdtemp('/tmp/bg-selector-');const selector=path.join(directory,'selector');
  try{
    await writeFile(selector,'#!/usr/bin/env node\nconsole.error("Unsafe Git tree path: bad/SKILL.md");process.exit(2);\n');await chmod(selector,0o700);scanner.binary=selector;
    const result=await scanner.scan(options);assert.equal(result.partial,true);
    assert.match(result.repositories.find(item=>item.error).error,/Unsafe Git tree path: bad\/SKILL\.md/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('unsafe paths, corrupted blobs and response/source/result limits fail visibly',async()=>{
  for(const config of [{unsafe:true},{corrupt:true}]){const {scanner}=await setup(config);assert.equal((await scanner.scan(options)).partial,true);}
  for(const overrides of [{responseBytes:50},{entries:1},{sourceBytes:1},{sources:1},{resultBytes:40}]){const {scanner}=await setup({}, {...githubLimits,...overrides});assert.equal((await scanner.scan(options)).partial,true);}
});
test('deadline and cancellation stop work, bounded pool never exceeds configured concurrency',async()=>{
  const first=await setup({count:20,allSkills:true,delay:10});const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),40);
  try{const result=await first.scanner.scan({...options,concurrency:2},{signal:controller.signal});assert.equal(result.partial,true);assert.equal(result.cancelled,true);assert.ok(first.fixture.requests.peak<=2);}finally{clearTimeout(timer);}
  const second=await setup({delay:30},{...githubLimits,deadline:5});assert.equal((await second.scanner.scan(options)).partial,true);
});
