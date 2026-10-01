import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';

export async function createFixture(options={}) {
  const files=new Map(), blobs=new Map();
  async function collect(root, relative='') {
    for(const item of await readdir(path.join(root,relative),{withFileTypes:true})) {
      const name=relative?relative+'/'+item.name:item.name;
      if(item.isDirectory())await collect(root,name);
      else if(item.isFile()){const bytes=await readFile(path.join(root,name));files.set(name,bytes);}
    }
  }
  await collect(path.resolve(import.meta.dirname,'fixtures/corner-cases'));
  files.set('skills/世界\nextra/SKILL.md',Buffer.from('# Unicode\n\nDeepBodyToken <script>window.remoteExecuted=true</script>'));
  for(let i=0;i<(options.unrelated || 0);i++)files.set(`source/${i}.txt`,Buffer.from('Unrelated source code. '.repeat(800)));
  const entries=[];
  for(const [name,bytes] of files){const hash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');blobs.set(hash,bytes);entries.push({path:name,mode:'100644',type:'blob',sha:hash,size:bytes.length});}
  for(const [name,mode] of [['vendor/ignored/SKILL.md','100644'],['skills/link/SKILL.md','120000'],['submodule','160000']]) entries.push({path:name,mode,type:mode==='160000'?'commit':'blob',sha:'d'.repeat(40),size:12});
  const config={count:3,truncated:false,delay:0,fail:false,...options},calls=[],requests={active:0,peak:0};
  const trees=new Map();
  function treeFor(prefix){if(!trees.has(prefix))trees.set(prefix,new Map());return trees.get(prefix);}
  const treeSHA=prefix=>prefix?createHash('sha1').update('fixture-tree:'+prefix).digest('hex'):'c'.repeat(40);
  for(const entry of entries){const parts=entry.path.split('/');let prefix='';for(let i=0;i<parts.length;i++){const children=treeFor(prefix),name=parts[i];if(i===parts.length-1)children.set(name,{...entry,path:name});else{const next=prefix+name+'/';children.set(name,{path:name,mode:'040000',type:'tree',sha:treeSHA(next)});prefix=next;}}}
  const bySHA=new Map([...trees].map(([prefix,children])=>[treeSHA(prefix),[...children.values()]]));
  async function response(input,settings={}) {
    settings.signal?.throwIfAborted();const url=new URL(input);const endpoint=url.pathname+url.search;calls.push({endpoint,authorization:settings.headers?.Authorization});
    requests.active++;requests.peak=Math.max(requests.peak,requests.active);
    try {
      if(config.delay)await wait(config.delay,undefined,{signal:settings.signal});
      if(config.transient && !config.retried){config.retried=true;return Response.json({}, {status:503});}
      if(config.rate && !config.rated){config.rated=true;return Response.json({message:'limited'},{status:429,headers:{'retry-after':'0.001'}});}
      if(config.redirect)return new Response(null,{status:302,headers:{location:'https://example.com/steal'}});
      if(config.enumerationFailure && endpoint.includes('page=2'))return Response.json({}, {status:403});
      if(url.pathname==='/orgs/demo/repos') {
        const page=Number(url.searchParams.get('page'));const repos=Array.from({length:config.count},(_,i)=>({id:i+1,full_name:config.renamed && i===0?'demo/renamed':'demo/r'+i,default_branch:i===0 || config.allSkills?'main':null,size:i===0?1:0,archived:i===1,fork:i===2}));
        return Response.json(repos.slice((page-1)*100,page*100));
      }
      if(url.pathname.includes('/commits/')){if(config.fail)return Response.json({}, {status:404});return Response.json({sha:(config.changed?'b':'a').repeat(40),commit:{tree:{sha:'c'.repeat(40)}}});}
      if(url.pathname.includes('/git/trees/')) {
        if(config.unsafe)return Response.json({tree:[{path:'../outside/SKILL.md',mode:'100644',type:'blob',sha:'d'.repeat(40)}],truncated:false});
        if(config.truncated && url.searchParams.has('recursive'))return Response.json({tree:[],truncated:true});
        return Response.json({tree:!url.searchParams.has('recursive')?bySHA.get(url.pathname.split('/').pop()) || []:entries,truncated:Boolean(config.nonrecursiveTruncated)});
      }
      if(url.pathname.includes('/git/blobs/')) {
        const hash=url.pathname.split('/').pop(),bytes=blobs.get(hash);
        if(!bytes)return Response.json({}, {status:404});
        return Response.json({sha:hash,encoding:'base64',size:bytes.length,content:config.corrupt?Buffer.from('corrupt').toString('base64'):bytes.toString('base64')});
      }
      return Response.json({}, {status:404});
    }finally{requests.active--;}
  }
  return {transport:response,config,calls,requests,files,entries,async server(){
    const server=http.createServer(async(req,res)=>{
      try{const answer=await response('https://api.github.com'+req.url,{headers:{Authorization:req.headers.authorization}});res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(Buffer.from(await answer.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}
    });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,url:'http://127.0.0.1:'+server.address().port};
  }};
}
