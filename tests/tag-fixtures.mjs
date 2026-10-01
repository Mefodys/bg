import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { manifestDigest } from '../web/manifests.mjs';
export async function tagFixtures(root) {
  const taxonomy=JSON.parse(await readFile(new URL('../web/data/skill-tag-taxonomy.json',import.meta.url),'utf8'));
  const catalogue={schema_version:1,taxonomy_version:1,assignments:[]};
  const roots=['mps','koog','android','kotlin'].map(reference_key=>({reference_key,name:reference_key,path:root+'/'+reference_key}));
  for(const r of roots)await mkdir(r.path+'/.git',{recursive:true});
  const write=async(key,relative,content,tags)=>{
    const target=root+'/'+key+'/'+relative;await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await writeFile(target,content);
    if(tags)catalogue.assignments.push({repository_key:key,category:'development',manifest_path:relative,source_aliases:[relative],manifest_sha256:manifestDigest(Buffer.from(content)),taxonomy_version:1,primary_task:tags[0],tag_ids:tags,status:'reviewed',origin:'reviewed',reason:'Versioned deterministic test classification.'});
  };
  for(let i=0;i<120;i++) {
    const relative=`skills/${String(i).padStart(3,'0')}/SKILL.md`;
    const content=`# fixture-${String(i).padStart(3,'0')}\n\n${i<90?'testneedle':'otherneedle'}\n\nBody text ${i}.`;
    const tags=[i<12?'task:testing':'task:code-quality',...(i<3?['focus:gradle','focus:agent-evals']:i<12?['focus:unit-tests']:['focus:api-design']),'platform:mps'];
    await write('mps',relative,content,tags);
  }
  await write('mps','skills/unknown/SKILL.md','# New skill\n\nUnknownbody',null);
  await write('koog','skills/000/SKILL.md','# other-owner\n\nOwnerneedle\n\nOther repository manifest.', ['task:debugging','focus:gradle','platform:kotlin']);
  await mkdir(root+'/data',{recursive:true});
  await writeFile(root+'/data/skill-tag-taxonomy.json',JSON.stringify(taxonomy));
  await writeFile(root+'/data/skill-tags.json',JSON.stringify(catalogue));
  await writeFile(root+'/roots.json',JSON.stringify(roots));
  return {roots,catalogue};
}
