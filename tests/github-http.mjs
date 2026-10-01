import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createFixture } from './github-fixture.mjs';
import { setTimeout as delay } from 'node:timers/promises';

test('real HTTP organization lifecycle, origin protections, cancellation and native results',async()=>{
  const fixture=await createFixture(),remote=await fixture.server();
  const server=spawn(process.execPath,['web/server.mjs'],{env:{...process.env,PORT:'0',NODE_ENV:'test',BG_GITHUB_TEST_API:remote.url},stdio:['ignore','pipe','pipe']});
  try{
    const [chunk]=await once(server.stdout,'data'),url=chunk.toString().trim().replace('Skill Atlas: ','');
    const post=async(data,headers={})=>fetch(url+'/api/github/scans',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
    assert.equal((await post({organization:'demo'},{Origin:'https://example.com'})).status,403);
    assert.equal((await post({organization:'http://127.0.0.1/evil'})).status,400);
    assert.equal((await post({organization:'demo',concurrency:9})).status,400);
    const started=await post({organization:'demo'});assert.equal(started.status,202);const job=await started.json();
    assert.equal((await post({organization:'demo'})).status,409);
    let current;
    for(let attempt=0;attempt<100;attempt++){current=await(await fetch(url+'/api/github/scans/'+job.id)).json();if(current.state!=='running')break;await delay(20);}
    assert.equal(current.state,'complete');assert.equal(current.progress.completed,3);assert.equal(current.result.partial,false);assert.ok(current.result.repositories.some(r=>r.sources.length));
    assert.ok(fixture.calls.every(c=>!c.authorization));
    fixture.config.delay=100;
    const pending=await(await post({organization:'demo',refresh:true})).json();
    assert.equal((await fetch(url+'/api/github/scans/'+pending.id,{method:'DELETE'})).status,200);
    for(let attempt=0;attempt<100;attempt++){current=await(await fetch(url+'/api/github/scans/'+pending.id)).json();if(current.state!=='running')break;await delay(20);}
    assert.equal(current.state,'cancelled');assert.equal(current.result.partial,true);
    assert.equal((await fetch(url+'/api/github/scans/00000000-0000-0000-0000-000000000000')).status,404);
  }finally{server.kill();await once(server,'exit');await new Promise(resolve=>remote.server.close(resolve));}
});
