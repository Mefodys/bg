import { GitHubScanner } from '../web/github.mjs';
import { createFixture } from './github-fixture.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
const execute=promisify(execFile),binary=path.resolve('bg'),measurements=[];
for(const count of [3,30]) {
  const fixture=await createFixture({count,allSkills:true,unrelated:100,delay:1}),scanner=new GitHubScanner({binary,transport:fixture.transport});
  const cold=await scanner.scan({organization:'demo',concurrency:4});
  const warm=await scanner.scan({organization:'demo',concurrency:4});
  const root=await mkdtemp('/tmp/bg-benchmark-');let next=0,transferred=0,requests=0;const start=performance.now();
  try{
    // Full-content reference uses the same bounded workers and immutable trees,
    // materializing all regular fixture blobs before invoking the same scanner.
    await Promise.all(Array.from({length:4},async()=>{
      while(next<count){const index=next++,repo=path.join(root,'r'+index);await mkdir(repo);
        for(const entry of fixture.entries){if(entry.mode!=='100644' || !fixture.files.has(entry.path))continue;const response=await fixture.transport('https://api.github.com/repos/demo/r'+index+'/git/blobs/'+entry.sha,{});const bytes=Buffer.from(await response.arrayBuffer());requests++;transferred+=bytes.length;const blob=JSON.parse(bytes);const file=path.join(repo,entry.path);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,Buffer.from(blob.content,'base64'));}
        await execute(binary,['scan',repo,'--json']);
      }
    }));
  }finally{await rm(root,{recursive:true,force:true});}
  measurements.push({repositories:count,fixture_files_per_repository:fixture.files.size,fixture_delay_ms:1,cold:cold.metrics,warm:warm.metrics,full_content_reference:{blob_requests:requests,bytes:transferred,elapsed_ms:Math.round(performance.now()-start),peak_rss_bytes:process.memoryUsage().rss},complete:!cold.partial && !warm.partial,worker_limit:4});
}
console.log(JSON.stringify({schema_version:1,environment:{node:process.version,os:process.platform,arch:process.arch},note:'Deterministic fake GitHub data, synthetic 1ms per request. Full-content reference excludes head/tree setup, favoring the reference. Results are workload evidence, not a claim of universal optimality. Live GitHub latency/rate limits differ.',measurements},null,2));
