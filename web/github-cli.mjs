#!/usr/bin/env node
import { GitHubScanner } from './github.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const usage='Usage: node web/github-cli.mjs scan-org <organization> [--json] [--refresh] [--concurrency 1..8] [--no-archived] [--no-forks] [--cache-dir <directory>]';
const args=process.argv.slice(2);
if(args.length===1 && args[0]==='--help'){console.log(usage);process.exit(0);}
try {
  if(args.shift()!=='scan-org' || !args.length)throw Error(usage);
  const options={organization:args.shift()},controller=new AbortController();let json=false,cacheDirectory=null;
  while(args.length){const arg=args.shift();if(arg==='--json')json=true;else if(arg==='--refresh')options.refresh=true;else if(arg==='--no-archived')options.include_archived=false;else if(arg==='--no-forks')options.include_forks=false;else if(arg==='--concurrency')options.concurrency=Number(args.shift());else if(arg==='--cache-dir'){cacheDirectory=args.shift();if(!cacheDirectory)throw Error(usage);}else throw Error(usage);}
  process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
  const scanner=new GitHubScanner({binary:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../bg'),cacheDirectory});
  const result=await scanner.scan(options,{signal:controller.signal,onProgress:state=>console.error(`${state.completed}/${state.discovered} repositories · ${state.metrics.requests} requests · ${state.metrics.bytes} bytes`)});
  if(json)console.log(JSON.stringify(result));
  else {for(const repo of result.repositories){console.log(`\n${repo.full_name} · ${repo.commit_sha || 'empty'}${repo.cached?' · cached':''}`);if(repo.error)console.log('Warning: '+repo.error);else for(const section of repo.inventory.sections)for(const skill of section.skills)console.log(`  ${skill.name} · ${skill.manifest_path} · ${skill.category}`);}for(const warning of result.warnings)console.error('Warning: '+warning);console.log(`\n${result.partial?'Partial scan':'Complete scan'} · ${result.repositories.length} repositories · ${result.metrics.elapsed_ms} ms`);}
  process.exitCode=result.partial?1:0;
}catch(error){console.error(error.status?error.message:usage);process.exitCode=2;}
