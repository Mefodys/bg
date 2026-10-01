import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { Tagging, validateCatalogue } from '../web/tagging.mjs';
import { manifestDigest, readManifestText } from '../web/manifests.mjs';
import { Repositories } from '../web/repositories.mjs';
import { compare, pairScores, scores } from '../web/similarity.mjs';
import { facetCounts, matchesFacets } from '../web/public/tags.js';
const live = await Tagging.load();
const clone = v => structuredClone(v);
const selected = () => ({ task: new Set(), focus: new Set(), platform: new Set() });
const raw = Buffer.from('# Testing\r\n\r\nRun tests.\r');
const hash = manifestDigest(raw);
const record = { ...live.catalogue.assignments[0], repository_key: 'mps', category: 'development', manifest_path: '.agents/skills/shared/SKILL.md', source_aliases: ['.agents/skills/shared/SKILL.md','.claude/skills/shared/SKILL.md'], manifest_sha256: hash, primary_task: 'task:testing', tag_ids: ['task:testing','focus:unit-tests'], reason: 'Creates tests.' };
const skill = { name: 'Testing', description: 'Run tests.', category: 'development', manifest_path: record.manifest_path, sources: record.source_aliases.map(manifest_path=>({manifest_path})), location: '.agents/skills/shared' };
const inventory = { sections: [{ skills: [skill] }], warnings: [] };
function fixtureTagging() { return new Tagging(live.taxonomy, { schema_version: 1, taxonomy_version: 1, assignments: [record] }); }
test('raw-byte hashes preserve BOM and invalid UTF-8 while normalizing CR and CRLF', () => {
  assert.equal(hash, manifestDigest(Buffer.from('# Testing\n\nRun tests.\n')));
  assert.notEqual(manifestDigest(Buffer.from([0xff])), manifestDigest(Buffer.from([0xfe])));
  assert.notEqual(manifestDigest(Buffer.from([0xef,0xbb,0xbf,65])), manifestDigest(Buffer.from([65])));
});
test('catalogue rejects duplicate IDs/identities, traversal, hashes, unknown tags and invalid primaries', () => {
  assert.equal(live.warning, null);
  for (const mutate of [
    (t,c)=>t.tags.push(t.tags[0]), (t,c)=>c.assignments.push(c.assignments[0]),
    (t,c)=>c.assignments[0].manifest_path='../SKILL.md', (t,c)=>c.assignments[0].manifest_sha256='abc',
    (t,c)=>c.assignments[0].tag_ids.push('task:unknown'), (t,c)=>c.assignments[0].primary_task='focus:gradle',
    (t,c)=>c.assignments[0].source_aliases.push('/SKILL.md'), (t,c)=>c.assignments[0].taxonomy_version=2,
  ]) { const t=clone(live.taxonomy),c=clone(live.catalogue);mutate(t,c);assert.throws(()=>validateCatalogue(t,c),/Invalid/); }
});
test('identity uses trusted root, role, canonical path and full hash; aliases require uniqueness', () => {
  const tagging = fixtureTagging(); tagging.bindings.set('/bound','mps');
  assert.equal(tagging.assignment('/bound',skill,hash).status,'reviewed');
  for (const [root,k,h] of [['/other',skill,hash],['/bound',{...skill,category:'product'},hash],['/bound',skill,'0'.repeat(64)],['/bound',skill,null],['/bound',{...skill,manifest_path:'renamed/SKILL.md'},hash]])
    assert.equal(tagging.assignment(root,k,h).status,'needs-classification');
  assert.equal(tagging.assignment('/bound',{...skill,manifest_path:record.source_aliases[1]},hash).status,'reviewed');
  const second = {...record,manifest_path:'other/SKILL.md',source_aliases:['other/SKILL.md',record.source_aliases[1]]};
  const ambiguous = new Tagging(live.taxonomy,{schema_version:1,taxonomy_version:1,assignments:[record,second]});ambiguous.bindings.set('/bound','mps');
  assert.match(ambiguous.assignment('/bound',{...skill,manifest_path:record.source_aliases[1]},hash).reason,/Ambiguous/);
});
test('invalid catalogue degrades visibly; no stale active assignments', () => {
  const broken = new Tagging(live.taxonomy,{...live.catalogue,taxonomy_version:2});
  assert.throws(()=>broken.definitions(),{status:503});
  const envelope=broken.envelope('/bound',inventory);
  assert.equal(envelope.coverage.needs_classification,1);assert.equal(envelope.coverage.warnings.length,1);
  assert.deepEqual(envelope.assignments[skill.manifest_path].tag_ids,[]);
});
test('reference aliases bind by realpath; duplicate roots cannot overwrite a trusted key', async t => {
  const root=await realpath(await mkdtemp('/tmp/bg-tags-bind-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(root+'/real');await symlink(root+'/real',root+'/alias');
  const tagging=fixtureTagging();await tagging.bind([{reference_key:'mps',path:root+'/alias'}]);
  assert.equal(tagging.assignment(root+'/real',skill,hash).status,'reviewed');
  await assert.rejects(tagging.bind([{reference_key:'koog',path:root+'/real'}]),/Duplicate reference realpath/);
  assert.equal(tagging.bindings.get(root+'/real'),'mps');
});
test('native complete reads and index preserve BOM/invalid byte identities; truncation cannot classify', async t => {
  const root=await realpath(await mkdtemp('/tmp/bg-tags-bytes-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(root+'/.agents/skills/shared',{recursive:true});
  for (const bytes of [Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),raw]),Buffer.concat([raw,Buffer.from([0xff])]),Buffer.concat([raw,Buffer.from([0xfe])])]) {
    await writeFile(root+'/'+skill.manifest_path,bytes);
    const manifest=await readManifestText(root,skill.manifest_path,1024*1024,10000);
    assert.equal(manifest.manifest_sha256,manifestDigest(bytes));
    const tagging=fixtureTagging();tagging.bindings.set(root,'mps');
    const store=new Repositories(root,async()=>inventory,async(s,p,l,d)=>readManifestText(s.repository,p,l,d),[],tagging);
    const scan=await store.scan(root), index=await store.index(store.sessions.get(scan.scan_id));
    assert.equal(index.sources[0].manifest_sha256,manifestDigest(bytes));
    assert.equal(scan.tagging.coverage.needs_classification,1);
    assert.equal(tagging.assignment(root,skill,(await readManifestText(root,skill.manifest_path,2)).manifest_sha256).status,'needs-classification');
  }
});
test('facets use OR within group, AND across groups; counts ignore own group and cover all records', () => {
  const s=selected();s.task.add('task:testing');s.task.add('task:debugging');s.focus.add('focus:gradle');
  const records=[{status:'reviewed',tag_ids:['task:testing','focus:gradle']},{status:'reviewed',tag_ids:['task:debugging','focus:gradle']},{status:'reviewed',tag_ids:['task:testing','focus:ci']},{status:'needs-classification',tag_ids:[]}];
  assert.deepEqual(records.map(r=>matchesFacets(r,s)),[true,true,false,false]);
  assert.deepEqual(records.map(r=>matchesFacets(r,s,true)),[false,false,false,true]);
  const counts=facetCounts(records,live.taxonomy.tags,s);assert.equal(counts.get('task:testing'),1);assert.equal(counts.get('focus:ci'),1);
  assert.equal(facetCounts(Array(110).fill(records[0]),live.taxonomy.tags,s).get('task:testing'),110);
});
test('batch shares the scorer and includes zero, same-repository and identical-vector pairs', () => {
  const texts=['compiler types','compiler','weather','compiler types',''];const pairs=pairScores(texts);
  assert.equal(pairs.length,10);assert.equal(pairs.find(p=>p.left===0&&p.right===3).score,100);
  assert.equal(pairs.find(p=>p.left===0&&p.right===2).score,0);
  assert.deepEqual(pairs.filter(p=>p.left===0).map(p=>p.score),scores(texts));
});
test('bound scan/index/snapshot coalesce reads, refresh invalidates digest and restart reloads catalogue', async t => {
  const directory=await realpath(await mkdtemp('/tmp/bg-tags-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const tagging=fixtureTagging(); await tagging.bind([{reference_key:'mps',path:directory}]);
  let reads=0,text=raw;
  const store=new Repositories(directory,async()=>inventory,async()=>{reads++;return {content:text.toString(),bytes:text.length,truncated:false,manifest_sha256:manifestDigest(text)};},[],tagging);
  const scan=await store.scan(directory);assert.equal(scan.tagging.coverage.reviewed,1);assert.equal(reads,2);
  const session=store.sessions.get(scan.scan_id);const [a,b]=await Promise.all([store.index(session),store.index(session)]);assert.equal(a,b);assert.equal(reads,2);
  const snap=await store.snapshot(scan.repository.repository_id,{});assert.deepEqual(snap.tagging,scan.tagging);assert.equal(reads,2);
  text=Buffer.from('# Changed');const fresh=await store.snapshot(scan.repository.repository_id,{refresh:true});assert.equal(fresh.tagging.coverage.reviewed,0);assert.deepEqual(fresh.tagging.assignments[skill.manifest_path].tag_ids,[]);
  const restarted=fixtureTagging();restarted.bindings.set(directory,'mps');assert.equal(restarted.assignment(directory,skill,hash).status,'reviewed');
});
test('similarity targets get owning classifications using existing native complete reads', async t => {
  const directory=await realpath(await mkdtemp('/tmp/bg-tags-compare-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const source=directory+'/source',target=directory+'/target';await mkdir(source);await mkdir(target);
  for(const root of [source,target]) {await mkdir(root+'/.agents/skills/shared',{recursive:true});await writeFile(root+'/'+skill.manifest_path,raw);}
  const tagging=fixtureTagging();tagging.bindings.set(target,'mps');
  const session={repository:source,inventory};
  const result=await compare({manifest_path:skill.manifest_path,targets:[target]},session,async()=>inventory,directory,tagging);
  assert.equal(result.results[0].tagging.status,'reviewed');assert.equal(result.results[0].score,100);
  await writeFile(target+'/'+skill.manifest_path,'# Changed');
  assert.equal((await compare({manifest_path:skill.manifest_path,targets:[target]},session,async()=>inventory,directory,tagging)).results[0].tagging.status,'needs-classification');
  assert.equal((await readManifestText(target,skill.manifest_path,2)).manifest_sha256,null);
});
