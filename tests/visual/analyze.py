#!/usr/bin/env python3
"""Exact pixel gate; feature declarations never suppress behavior failures."""
import hashlib,json,sys,shutil
from pathlib import Path
from compare import decode,png

def classify(identifier,points,after_hash,base_sha,declarations,observed_matches=True,observed=None):
    if not points and observed_matches:return 'UNCHANGED'
    rule=next((r for r in declarations.get('changes',[]) if r.get('scenario')==identifier),None)
    if not rule or declarations.get('baseSHA')!=base_sha:return 'REGRESSION'
    if not rule.get('reason','').strip() or rule.get('afterPixelSHA256')!=after_hash:return 'REGRESSION'
    if not observed_matches and rule.get('observedAfter')!=observed:return 'REGRESSION'
    regions=rule.get('regions',[])
    if not regions or any(set(r)!=set(('x','y','width','height')) or any(not isinstance(v,int) or v<0 for v in r.values()) or r['width']==0 or r['height']==0 for r in regions):return 'REGRESSION'
    return 'EXPECTED FEATURE CHANGE' if all(any(r['x']<=x<r['x']+r['width'] and r['y']<=y<r['y']+r['height'] for r in regions) for x,y in points) else 'REGRESSION'

def analyze(before,after,output,declarations):
    output.mkdir(parents=True,exist_ok=False)
    a,b=[json.loads((p/'manifest.json').read_text()) for p in (before,after)]
    incompatible=[k for k in ['environment','suiteHash','fixtureHash','scriptHash'] if a[k]!=b[k]]
    if incompatible:raise ValueError('INCOMPATIBLE CAPTURES: '+','.join(incompatible))
    old={s['id']:s for s in a['scenarios']};new={s['id']:s for s in b['scenarios']}
    if old.keys()!=new.keys():raise ValueError('INCOMPLETE: missing or unexpected scenarios')
    results=[]
    for identifier,s in old.items():
        w,h,one=decode(before/s['file']);w2,h2,two=decode(after/new[identifier]['file'])
        if (w,h)!=(w2,h2):raise ValueError('INCOMPATIBLE VIEWPORT: '+identifier)
        points=[];diff=bytearray(b'\xff\xff\xff\xff'*(w*h))
        if one!=two:
            for pos in range(0,len(one),4):
                if one[pos:pos+4]!=two[pos:pos+4]:
                    points.append((pos//4%w,pos//4//w));diff[pos:pos+4]=b'\xff\x00\x40\xff'
        pixel_hash=hashlib.sha256(two).hexdigest();matches=s['observed']==new[identifier]['observed']
        status=classify(identifier,points,pixel_hash,a['servingSHA'],declarations,matches,new[identifier]['observed'])
        first=output/'before'/s['file'];second=output/'after'/new[identifier]['file']
        first.parent.mkdir(parents=True,exist_ok=True);second.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(before/s['file'],first);shutil.copyfile(after/new[identifier]['file'],second)
        png(output/'diff'/(identifier+'.png'),w,h,diff)
        rule=next((r for r in declarations.get('changes',[]) if r.get('scenario')==identifier),{})
        bounds=None if not points else {'x':min(x for x,_ in points),'y':min(y for _,y in points),'width':max(x for x,_ in points)-min(x for x,_ in points)+1,'height':max(y for _,y in points)-min(y for _,y in points)+1}
        results.append({'id':identifier,'changedPixels':len(points),'changedBounds':bounds,'totalPixels':w*h,'status':status,'reason':rule.get('reason',''),'afterPixelSHA256':pixel_hash,'observedStateMatches':matches,'observedAfter':new[identifier]['observed'],'before':str(first.resolve()),'after':str(second.resolve()),'diff':'diff/'+identifier+'.png'})
    failed=any(s['status']=='REGRESSION' for s in results)
    heading='REGRESSION' if failed else 'EXPECTED FEATURE CHANGE — REVIEW REQUIRED' if any(s['status']=='EXPECTED FEATURE CHANGE' for s in results) else 'NO REGRESSION'
    report={'beforeSHA':a['servingSHA'],'afterSHA':b['servingSHA'],'status':heading,'exactMatch':all(s['changedPixels']==0 and s['observedStateMatches'] for s in results),'threshold':0,'scenarios':results}
    (output/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
    lines=['# '+heading,'',f"Base: `{a['servingSHA']}` · Current: `{b['servingSHA']}`",'', '[OLD / NEW / HIGHLIGHTED CHANGES](gallery.html)','', 'Feature declarations are explicit reviewed expectations, not automatic proof of correctness. Behavior assertions always remain required.','', '| Scenario | Changed pixels | Classification | Reason |','| --- | ---: | --- | --- |']
    lines += [f"| {s['id']} | {s['changedPixels']} | **{s['status']}** | {s['reason'].replace('|','/').replace(chr(10),' ')} |" for s in results]
    (output/'comparison.md').write_text('\n'.join(lines)+'\n')
    print(heading,flush=True)
    return 1 if failed else 0

if __name__=='__main__':
    before,after,output,declaration=map(Path,sys.argv[1:5])
    try:sys.exit(analyze(before,after,output,json.loads(declaration.read_text())))
    except (ValueError,AssertionError,KeyError) as e:
        output.mkdir(parents=True,exist_ok=True);(output/'comparison.md').write_text('# INCOMPLETE VISUAL VERIFICATION\n\n'+str(e)+'\n');print(e,file=sys.stderr);sys.exit(2)
