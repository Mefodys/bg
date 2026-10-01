import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, readFile, chmod, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
export const githubLimits = { repositories: 10000, entries: 250000, sources: 512, sourceBytes: 1024*1024, repositoryBytes: 8*1024*1024, resultBytes: 64*1024*1024, responseBytes: 32*1024*1024, deadline: 600000 };
const fail = (status, message) => Object.assign(new Error(message), {status});
export function organization(value) {
  if (typeof value !== 'string') throw fail(400, 'Enter a GitHub organization login or URL.');
  const login = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/^github\.com\//i, '').replace(/\/$/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login) || login.includes('--')) throw fail(400, 'Use a GitHub organization login or https://github.com/<organization>.');
  return login;
}
export function scanOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k=>!['organization','refresh','concurrency','include_archived','include_forks'].includes(k))) throw fail(400, 'Invalid organization scan options.');
  const options = { organization: organization(input.organization), refresh: input.refresh ?? false, concurrency: input.concurrency ?? 4, include_archived: input.include_archived ?? true, include_forks: input.include_forks ?? true };
  if (['refresh','include_archived','include_forks'].some(k=>typeof options[k] !== 'boolean') || !Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw fail(400, 'Use boolean options and concurrency between 1 and 8.');
  return options;
}
function safePath(value) {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0') || value.split('/').some(p=>!p || p==='.' || p==='..')) throw fail(502, 'GitHub returned an unsafe tree path.');
  return value;
}
const sha = value => { if (!/^[a-f\d]{40,64}$/.test(value)) throw fail(502, 'Invalid Git object identity.'); return value; };
export class GitHubScanner {
  constructor({ binary, token = process.env.BG_GITHUB_TOKEN || process.env.GH_TOKEN, transport = fetch, cacheDirectory = null, limits = githubLimits } = {}) {
    this.binary = binary; this.token = token; this.transport = transport; this.cacheDirectory = cacheDirectory; this.limits = limits;
    this.cache = new Map(); this.cacheBytes = 0; this.nextRequest = 0; this.throttledUntil = 0; this.throttled = false;
    this.blobs = new Map(); this.blobBytes = 0;
  }
  async request(endpoint, signal, metrics) {
    if (!endpoint.startsWith('/') || endpoint.startsWith('//')) throw fail(400, 'Invalid API endpoint.');
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      const now = Date.now(), at = Math.max(now, this.nextRequest, this.throttledUntil);
      this.nextRequest = at + (this.throttled ? 1000 : 0);
      if (at > now) await delay(at-now, undefined, {signal});
      metrics.requests++;
      let response;
      try { response = await this.transport('https://api.github.com'+endpoint, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), redirect:'error', headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'bg-skill-atlas', ...(this.token ? {Authorization:'Bearer '+this.token} : {})} }); }
      catch { signal.throwIfAborted(); if (attempt===3) throw fail(502,'GitHub network request failed.'); await delay(250 * 2**attempt,undefined,{signal}); continue; }
      const rateLimited = response.status===429 || (response.status===403 && (response.headers.get('retry-after') || response.headers.get('x-ratelimit-remaining')==='0'));
      if (rateLimited || response.status>=500) {
        await response.body?.cancel();
        if (attempt===3) throw fail(response.status,'GitHub request failed after retries (HTTP '+response.status+').');
        if (rateLimited) {
          const retry = Number(response.headers.get('retry-after'));
          const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          const wait = retry > 0 ? retry * 1000 : reset > Date.now() ? reset-Date.now() : 60000;
          this.throttledUntil = Math.max(this.throttledUntil, Date.now()+wait+Math.floor(Math.random()*250)); this.throttled = true;
        } else await delay(250 * 2**attempt,undefined,{signal});
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw fail(response.status,'GitHub request failed (HTTP '+response.status+'). Check access and organization visibility.'); }
      if (Number(response.headers.get('content-length')) > this.limits.responseBytes) { await response.body?.cancel(); throw fail(413,'GitHub response exceeds the byte limit.'); }
      const chunks=[]; let bytes=0;
      for await (const chunk of response.body) { signal.throwIfAborted(); bytes+=chunk.length; metrics.bytes+=chunk.length; if (bytes>this.limits.responseBytes) throw fail(413,'GitHub response exceeds the byte limit.'); chunks.push(chunk); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(502,'GitHub returned invalid JSON.'); }
    }
  }
  async cached(key) {
    if (this.cache.has(key)) return structuredClone(this.cache.get(key));
    if (!this.cacheDirectory) return null;
    try {
      const file=path.join(this.cacheDirectory,createHash('sha256').update(key).digest('hex')+'.json');
      if ((await stat(file)).size>this.limits.resultBytes) return null;
      const text=await readFile(file,'utf8'); if (text.length>this.limits.resultBytes) return null;
      const item=JSON.parse(text); if (item.version!==1 || item.key!==key) return null;
      // A persisted cache is data, never a pathname or source of executable content.
      if (!item.value?.inventory?.sections || !Array.isArray(item.value.sources) || item.value.partial) return null;
      return item.value;
    } catch { return null; }
  }
  async remember(key, value) {
    if (value.partial) return;
    const text=JSON.stringify(value), bytes=Buffer.byteLength(text);
    if (bytes>this.limits.resultBytes) return;
    if (this.cache.has(key)) { this.cacheBytes-=Buffer.byteLength(JSON.stringify(this.cache.get(key))); this.cache.delete(key); }
    while (this.cache.size && (this.cacheBytes+bytes>this.limits.resultBytes || this.cache.size>=256)) { const first=this.cache.keys().next().value;this.cacheBytes-=Buffer.byteLength(JSON.stringify(this.cache.get(first)));this.cache.delete(first); }
    this.cache.set(key,structuredClone(value));this.cacheBytes+=bytes;
    if (this.cacheDirectory) {
      await mkdir(this.cacheDirectory,{recursive:true,mode:0o700}); await chmod(this.cacheDirectory,0o700);
      // Bounded on-disk store is reconciled separately by CLI; filenames are hashes.
      await writeFile(path.join(this.cacheDirectory,createHash('sha256').update(key).digest('hex')+'.json'),JSON.stringify({version:1,key,value}),{mode:0o600});
      const files=[];
      for(const name of await readdir(this.cacheDirectory)) if (/^[a-f0-9]{64}\.json$/.test(name)) {const file=path.join(this.cacheDirectory,name);const info=await stat(file);files.push({file,size:info.size,time:info.mtimeMs});}
      files.sort((a,b)=>b.time-a.time);let total=0;
      for(let index=0;index<files.length;index++){total+=files[index].size;if(index>=256 || total>this.limits.resultBytes)await rm(files[index].file,{force:true});}
    }
  }
  async tree(repo, root, signal, metrics) {
    const prefix='/repos/'+repo+'/git/trees/';
    const recursive=await this.request(prefix+sha(root)+'?recursive=1',signal,metrics);
    if (!Array.isArray(recursive.tree)) throw fail(502,'Invalid Git tree response.');
    if (!recursive.truncated) { if(recursive.tree.length>this.limits.entries) throw fail(413,'Git tree entry limit reached.'); return recursive.tree; }
    const pending=[{path:'',sha:root}], entries=[];let treeBytes=0;
    while(pending.length) {
      const node=pending.pop(), tree=await this.request(prefix+sha(node.sha),signal,metrics);
      if (tree.truncated || !Array.isArray(tree.tree)) throw fail(502,'GitHub returned an incomplete nonrecursive tree.');
      for(const entry of tree.tree) {
        const relative=safePath(node.path+safePath(entry.path));
        entries.push({...entry,path:relative});
        treeBytes+=Buffer.byteLength(JSON.stringify(entry))+Buffer.byteLength(node.path);
        if(treeBytes>this.limits.responseBytes) throw fail(413,'Accumulated Git tree byte limit reached.');
        if(entries.length>this.limits.entries) throw fail(413,'Git tree entry limit reached.');
        if(entry.type==='tree' && entry.mode==='040000') pending.push({path:relative+'/',sha:entry.sha});
      }
    }
    return entries;
  }
  async blob(repo, entry, signal, metrics) {
    const hash=sha(entry.sha);
    if(this.blobs.has(hash)) {metrics.blob_cache_hits=(metrics.blob_cache_hits || 0)+1;return this.blobs.get(hash);}
    const promise=(async()=>{
      const blob=await this.request('/repos/'+repo+'/git/blobs/'+hash,signal,metrics);
      if(blob.encoding!=='base64' || typeof blob.content!=='string') throw fail(502,'Invalid blob encoding.');
      const bytes=Buffer.from(blob.content,'base64');
      if(bytes.length>this.limits.sourceBytes) throw fail(413,'Manifest byte limit exceeded.');
      const actual=createHash(hash.length===64?'sha256':'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if(actual!==hash || blob.sha!==hash) throw fail(502,'Git blob identity mismatch.');
      this.blobBytes+=bytes.length;
      if(this.blobBytes>this.limits.resultBytes) {this.blobs.clear();this.blobBytes=bytes.length;}
      return bytes;
    })();
    this.blobs.set(hash,promise);
    try{return await promise;}catch(error){this.blobs.delete(hash);throw error;}
  }
  async repository(repo, options, signal, metrics) {
    // Repository heads/trees must be authorized before content reuse.
    if (!/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repo.full_name) || !Number.isInteger(repo.id)) throw fail(502,'Invalid repository identity.');
    const empty=()=>({ full_name:repo.full_name,url:'https://github.com/'+repo.full_name,commit_sha:null,inventory:{repository:repo.full_name,sections:[],warnings:[]},sources:[],partial:false,cached:false });
    if (!repo.default_branch) return empty();
    let ref;
    try {ref=await this.request('/repos/'+repo.full_name+'/commits/'+encodeURIComponent(repo.default_branch),signal,metrics);}
    catch(error) {if(error.status===409 && repo.size===0)return empty();throw error;}
    const commit=sha(ref.sha), root=sha(ref.commit?.tree?.sha), key=`v1:${repo.id}:${commit}`;
    if (!options.refresh) { const cached=await this.cached(key); if (cached) { metrics.cache_hits++;return {...cached,full_name:repo.full_name,url:'https://github.com/'+repo.full_name,inventory:{...cached.inventory,repository:repo.full_name},cached:true}; } }
    const entries=await this.tree(repo.full_name,root,signal,metrics);
    for(const entry of entries) { safePath(entry.path); sha(entry.sha); }
    const input=entries.map(e=>e.mode+'\t'+JSON.stringify(e.path)+'\n').join('');
    const selection = await new Promise((resolve,reject)=> {
      const child=execFile(this.binary,['--select-manifests'],{signal,maxBuffer:this.limits.repositoryBytes},(error,stdout)=>error?reject(fail(502,'Native manifest selection failed.')):resolve(stdout));
      child.stdin.on('error',()=>{}); child.stdin.end(input);
    });
    const selected=selection.trim()?selection.trim().split('\n').map(v=>JSON.parse(v)):[];
    const blobs=new Map(entries.map(e=>[e.path,e]));
    const temporary=await mkdtemp(path.join(tmpdir(),'bg-github-')), directory=path.join(temporary,repo.full_name.split('/')[1]);
    const sources=[], warnings=[];let total=0,visited=0;
    try {
      await mkdir(directory,{mode:0o700});
      for(const relative of selected) {
        signal.throwIfAborted();
        if(visited++>=this.limits.sources || total>=this.limits.repositoryBytes) {warnings.push('Manifest count/total byte limit reached; remaining sources omitted.');break;}
        const entry=blobs.get(relative);
        try {
          if(entry.size>this.limits.sourceBytes || entry.size+total>this.limits.repositoryBytes) throw fail(413,'Manifest byte limit exceeded.');
          const bytes=await this.blob(repo.full_name,entry,signal,metrics);
          if(bytes.length>this.limits.sourceBytes || bytes.length+total>this.limits.repositoryBytes) throw fail(413,'Manifest byte limit exceeded.');
          total+=bytes.length; const file=path.join(directory,safePath(relative));await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,bytes,{flag:'wx',mode:0o600});
          let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{content='';}
          sources.push({path:relative,content});
        } catch(error) { signal.throwIfAborted();warnings.push(relative+': '+error.message); }
      }
      const {stdout}=await execute(this.binary,['scan',directory,'--json'],{signal,timeout:120000,maxBuffer:16*1024*1024});
      metrics.native_scans++;
      const inventory=JSON.parse(stdout);inventory.repository=repo.full_name;inventory.warnings.push(...warnings);
      const result={full_name:repo.full_name,url:'https://github.com/'+repo.full_name,commit_sha:commit,inventory,sources,partial:inventory.warnings.length>0,cached:false};
      await this.remember(key,result);return result;
    } finally { await rm(temporary,{recursive:true,force:true}); }
  }
  async scan(input,{signal: externalSignal,onProgress=()=>{}}={}) {
    const options=scanOptions(input), controller=new AbortController();
    this.blobs.clear();this.blobBytes=0;
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(this.limits.deadline),...(externalSignal?[externalSignal]:[])]);
    const started=Date.now(),metrics={requests:0,bytes:0,cache_hits:0,blob_cache_hits:0,native_scans:0,elapsed_ms:0,peak_rss_bytes:process.memoryUsage().rss};
    const result={organization:options.organization,repositories:[],warnings:[],partial:false,cancelled:false,metrics};
    let repos=[],resultBytes=0,enumerated=0;
    const progress=()=>{metrics.elapsed_ms=Date.now()-started;metrics.peak_rss_bytes=Math.max(metrics.peak_rss_bytes,process.memoryUsage().rss);onProgress({discovered:repos.length,completed:result.repositories.length,metrics:{...metrics},result});};
    try {
      for(let page=1;;page++) {
        const batch=await this.request('/orgs/'+options.organization+'/repos?type=all&per_page=100&page='+page,signal,metrics);
        if(!Array.isArray(batch)) throw fail(502,'Invalid organization repositories response.');
        const accepted=batch.slice(0,Math.max(0,this.limits.repositories-enumerated));
        repos.push(...accepted.filter(repo=>(options.include_archived || !repo.archived) && (options.include_forks || !repo.fork)));
        enumerated+=batch.length;
        if(enumerated>this.limits.repositories) throw fail(413,'Organization repository limit reached.');
        progress(); if(batch.length<100) break;
      }
    } catch(error) { result.partial=true;result.warnings.push(error.status?error.message:'Organization enumeration interrupted.'); }
    // Deduplicate paginated results by immutable ID, then preserve deterministic order.
    repos=[...new Map(repos.map(r=>[r.id,r])).values()].sort((a,b)=>a.full_name.localeCompare(b.full_name,'en'));
    let next=0;
    await Promise.all(Array.from({length:options.concurrency},async()=>{
      while(next<repos.length && !signal.aborted) {
        if(this.throttled) await delay(1000,undefined,{signal}).catch(()=>{});
        if(signal.aborted) break;
        if(next>=repos.length) break;
        const repo=repos[next++];let item;
        try {item=await this.repository(repo,options,signal,metrics);}
        catch(error){item={full_name:repo.full_name,url:'https://github.com/'+repo.full_name,partial:true,error:error.status?error.message:signal.aborted?'Scan interrupted.':'Repository scan failed.'};}
        const bytes=Buffer.byteLength(JSON.stringify(item));
        if(resultBytes+bytes>this.limits.resultBytes) {result.partial=true;result.warnings.push('Organization result byte limit reached.');controller.abort();break;}
        resultBytes+=bytes;result.repositories.push(item);result.partial ||= item.partial;progress();
      }
    }));
    result.cancelled=Boolean(externalSignal?.aborted);
    if(signal.aborted || next<repos.length){result.partial=true;result.warnings.push(result.cancelled?'Scan cancelled.':'Scan deadline or result limit reached.');}
    result.repositories.sort((a,b)=>a.full_name.localeCompare(b.full_name,'en'));progress();return result;
  }
}
