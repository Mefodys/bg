#!/usr/bin/env python3
"""Download only a successful main baseline for the exact base SHA."""
import io,json,os,sys,urllib.request,urllib.error,zipfile
from pathlib import Path
repo,sha,destination=sys.argv[1:4];out=Path(destination)
token=os.environ.get('GH_TOKEN','')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None

def api(url):
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
 return json.load(urllib.request.urlopen(req,timeout=30))
artifacts=api(f'https://api.github.com/repos/{repo}/actions/artifacts?name=visual-baseline-{sha}&per_page=100')['artifacts']
valid=[a for a in artifacts if not a['expired'] and a.get('workflow_run',{}).get('head_sha')==sha and a['workflow_run'].get('head_branch')=='main']
if not valid:
 print('No retained main baseline for exact SHA; CI will reconstruct the previous revision in the pinned environment.');sys.exit(0)
artifact=max(valid,key=lambda a:a['id']);run=api(f"https://api.github.com/repos/{repo}/actions/runs/{artifact['workflow_run']['id']}")
if run.get('conclusion')!='success':print('Previous main run was not successful; refusing baseline.');sys.exit(0)
url=f"https://api.github.com/repos/{repo}/actions/artifacts/{artifact['id']}/zip"
request=urllib.request.Request(url,headers={'Authorization':'Bearer '+token})
try:
 response=urllib.request.build_opener(NoRedirect).open(request,timeout=30);body=response.read()
except urllib.error.HTTPError as e:
 if e.code not in (301,302,303,307,308):raise
 # Signed storage request carries no GitHub token.
 body=urllib.request.urlopen(e.headers['Location'],timeout=60).read()
out.mkdir(parents=True,exist_ok=False)
with zipfile.ZipFile(io.BytesIO(body)) as archive:
 for member in archive.infolist():
  p=Path(member.filename)
  if p.is_absolute() or '..' in p.parts or (member.external_attr>>16)&0o170000==0o120000:raise ValueError('Unsafe baseline archive')
 archive.extractall(out)
manifest=json.loads((out/'manifest.json').read_text())
if manifest['servingSHA']!=sha:raise ValueError('Baseline artifact revision mismatch')
print('Downloaded previous accepted baseline:',sha)
