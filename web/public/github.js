const $ = id => document.getElementById(id);
let job = null, poll = null, page = 0, generation = 0;
const node = (tag, text, className) => {const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
async function api(url, options) {const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw Error(data.error || 'Request failed.');return data;}
const request = data => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function render() {
  const result=job?.result, query=$('github-search').value.trim().toLowerCase(), category=$('github-category').value;
  $('github-status').textContent=job ? `${job.progress.completed} of ${job.progress.discovered} repositories · ${job.state}${result?.partial?' · Partial coverage':''}${job.error?' · '+job.error:''}` : '';
  $('github-cancel').disabled=job?.state!=='running';$('github-submit').disabled=job?.state==='running';$('github-export').disabled=!result;
  const host=$('github-results');host.replaceChildren();if(!result)return;
  const warnings=[...result.warnings,...result.repositories.flatMap(repo=>repo.error?[repo.full_name+': '+repo.error]:(repo.inventory?.warnings || []).map(w=>repo.full_name+': '+w))];
  $('github-warnings').textContent=warnings.join('\n');
  const rows=result.repositories.flatMap(repo=>(repo.inventory?.sections || []).flatMap(section=>section.skills.map(skill=>({repo,skill})))).filter(({repo,skill})=>{
    if(category!=='all' && skill.category!==category)return false;
    return !query || [repo.full_name,skill.name,skill.description,...skill.sources.map(s=>s.manifest_path),...(repo.sources || []).filter(s=>skill.sources.some(source=>source.manifest_path===s.path)).map(s=>s.content)].filter(Boolean).some(text=>text.toLowerCase().includes(query));
  });
  $('github-count').textContent=`${rows.length} matching skills${result.partial?' · Partial':''}`;
  page=Math.min(page,Math.max(0,Math.ceil(rows.length/100)-1));let previous='';
  for(const {repo,skill} of rows.slice(page*100,(page+1)*100)) {
    if(previous!==repo.full_name){host.append(node('h3',repo.full_name,'github-repository'));previous=repo.full_name;}
    const button=node('button',undefined,'github-result');button.type='button';button.append(node('strong',skill.name),node('span',skill.description || 'No description available.'),node('small',`${skill.category} · ${skill.manifest_path}${skill.sources.length>1?' · '+skill.sources.length+' mirrors':''}${skill.conflict?' · Conflicting variant':''}`));
    button.addEventListener('click',()=>{
      $('github-detail-name').textContent=skill.name;$('github-detail-repository').textContent=repo.full_name+' · '+repo.commit_sha;
      $('github-detail-sources').replaceChildren(...skill.sources.map(source=>{const option=node('option',source.manifest_path);option.value=source.manifest_path;return option;}));
      const show=()=>{const relative=$('github-detail-sources').value;$('github-detail-content').textContent=repo.sources.find(s=>s.path===relative)?.content || 'Manifest unavailable.';$('github-detail-link').href=repo.url+'/blob/'+repo.commit_sha+'/'+relative.split('/').map(encodeURIComponent).join('/');};
      $('github-detail-sources').onchange=show;show();$('github-detail').showModal();
    });host.append(button);
  }
  if(!rows.length)host.append(node('p',job.state==='running'?'Waiting for matching results…':result.partial?'No matching skills in loaded data. Coverage is partial.':'No matching skills.'));
  $('github-pages').hidden=rows.length<=100;$('github-previous').disabled=page===0;$('github-next').disabled=(page+1)*100>=rows.length;
  $('github-page').textContent=`Page ${page+1} of ${Math.max(1,Math.ceil(rows.length/100))}`;
}
async function follow(id, token) {
  try {const current=await api('/api/github/scans/'+id);if(token!==generation)return;job=current;render();if(job.state==='running')poll=setTimeout(()=>follow(id,token),750);}
  catch(error){if(token===generation){$('github-status').textContent=error.message;$('github-submit').disabled=false;$('github-cancel').disabled=true;}}
}
$('github-form').addEventListener('submit',async event=>{
  event.preventDefault();clearTimeout(poll);const token=++generation;page=0;$('github-submit').disabled=true;$('github-status').textContent='Starting organization scan…';
  try{job=await api('/api/github/scans',request({organization:$('github-organization').value,concurrency:Number($('github-concurrency').value),refresh:$('github-refresh').checked,include_archived:$('github-archived').checked,include_forks:$('github-forks').checked}));render();await follow(job.id,token);}
  catch(error){$('github-status').textContent=error.message;$('github-submit').disabled=false;}
});
$('github-cancel').addEventListener('click',async()=>{if(!job)return;try{await api('/api/github/scans/'+job.id,{method:'DELETE'});await follow(job.id,generation);}catch(error){$('github-status').textContent=error.message;}});
for(const id of ['github-search','github-category'])$(id).addEventListener('input',()=>{page=0;render();});
$('github-previous').addEventListener('click',()=>{page--;render();});$('github-next').addEventListener('click',()=>{page++;render();});
$('github-detail-close').addEventListener('click',()=>$('github-detail').close());
$('github-export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(job.result,null,2)+'\n'],{type:'application/json'}));const link=node('a');link.href=url;link.download='github-organization-skills.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
