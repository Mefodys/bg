#!/usr/bin/env python3
"""Replay additive feature scenes against the exact base revision."""
import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
from compare import decode,png

base,head,artifacts=map(lambda value:Path(value).resolve(),sys.argv[1:4])
artifacts.mkdir(parents=True,exist_ok=False)
base_specs={path.relative_to(base).as_posix() for path in (base/'tests/features').glob('*.spec.mjs')}
head_specs={path.relative_to(head).as_posix() for path in (head/'tests/features').glob('*.spec.mjs')}
removed=base_specs-head_specs
if removed:raise SystemExit('INCOMPATIBLE FEATURE CONTRACT: removed scenarios: '+', '.join(sorted(removed)))
shared=sorted(base_specs);introduced=sorted(head_specs-base_specs)
cli=head/'node_modules/playwright/cli.js'
if not cli.exists():raise SystemExit('Playwright is not installed in the head checkout.')
base_modules=base/'node_modules'
if not base_modules.exists():base_modules.symlink_to(head/'node_modules',target_is_directory=True)

def run(root,specs,label,update):
    if not specs:return
    env={**os.environ,'FEATURE_VISUAL':'1','FEATURE_ARTIFACTS':str(artifacts/label)}
    subprocess.run(['node',str(cli),'test','--config','playwright.features.config.mjs',*specs,'--update-snapshots='+update],cwd=root,env=env,check=True)

def snapshot_map(root):
    folder=root/'reports/feature-snapshots'
    return {path.relative_to(folder).as_posix():path for path in folder.rglob('*.png')}

def compare_feature_snapshots(before,after):
    base_sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=base,text=True).strip()
    declaration_file=head/'tests/visual/feature-expected-changes.json'
    declarations=json.loads(declaration_file.read_text()) if declaration_file.exists() else {'baseSHA':base_sha,'changes':[]}
    rules={rule.get('scenario'):rule for rule in declarations.get('changes',[])}
    if None in rules or len(rules)!=len(declarations.get('changes',[])):raise SystemExit('INCOMPLETE FEATURE DECLARATIONS: missing or duplicate scenario key.')
    if before.keys()!=after.keys():raise SystemExit('INCOMPLETE FEATURE CONTRACT: missing or unexpected locator snapshots: '+', '.join(sorted(before.keys()^after.keys())))
    output=artifacts/'comparison';output.mkdir()
    results=[];changed_keys=set()
    for identifier in sorted(before):
        width,height,old=decode(before[identifier]);new_width,new_height,new=decode(after[identifier])
        if (width,height)!=(new_width,new_height):raise SystemExit('INCOMPATIBLE FEATURE SNAPSHOT SIZE: '+identifier)
        points=[];diff=bytearray(b'\xff\xff\xff\xff'*(width*height))
        for offset in range(0,len(old),4) if old!=new else ():
            if old[offset:offset+4]!=new[offset:offset+4]:
                x,y=offset//4%width,offset//4//width;points.append((x,y));diff[offset:offset+4]=b'\xff\x00\x40\xff'
        after_hash=hashlib.sha256(new).hexdigest();rule=rules.get(identifier);status='UNCHANGED'
        if points:
            changed_keys.add(identifier)
            if declarations.get('baseSHA')!=base_sha or not rule or not rule.get('reason','').strip() or rule.get('afterPixelSHA256')!=after_hash:status='REGRESSION'
            else:status='EXPECTED FEATURE CHANGE'
        png(output/'diff'/identifier,width,height,diff)
        bounds=None if not points else {'x':min(x for x,_ in points),'y':min(y for _,y in points),'width':max(x for x,_ in points)-min(x for x,_ in points)+1,'height':max(y for _,y in points)-min(y for _,y in points)+1}
        results.append({'id':identifier,'changedPixels':len(points),'changedBounds':bounds,'status':status,'reason':rule.get('reason','') if rule else '','afterPixelSHA256':after_hash,'observedStateMatches':True,'observedAfter':{}})
    stale=set(rules)-changed_keys
    if stale:raise SystemExit('STALE FEATURE DECLARATIONS: '+', '.join(sorted(stale)))
    report={'beforeSHA':base_sha,'afterSHA':subprocess.check_output(['git','rev-parse','HEAD'],cwd=head,text=True).strip(),'status':'REGRESSION' if any(row['status']=='REGRESSION' for row in results) else 'EXPECTED FEATURE CHANGE — REVIEW REQUIRED' if changed_keys else 'NO REGRESSION','scenarios':results}
    (output/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
    (output/'comparison.md').write_text('# '+report['status']+'\n\nEvery changed locator snapshot requires the exact base SHA, a review reason and its decoded after-image hash.\n')
    if report['status']=='REGRESSION':raise SystemExit('REGRESSION: undeclared established feature snapshot change.')

# First prove the base is deterministic, then use its exact locator snapshots as
# the head baseline for every established scenario.
run(base,shared,'base-first','all');run(base,shared,'base-repeat','none')
base_snapshots=base/'reports/feature-snapshots';head_snapshots=head/'reports/feature-snapshots'
if shared and not base_snapshots.exists():raise SystemExit('INCOMPLETE FEATURE VERIFICATION: base snapshots were not produced.')
if base_snapshots.exists():shutil.copytree(base_snapshots,artifacts/'base-snapshots')
if head_snapshots.exists():shutil.rmtree(head_snapshots)
run(head,shared,'head-first','all');run(head,shared,'head-repeat','none')
if shared and not head_snapshots.exists():raise SystemExit('INCOMPLETE FEATURE VERIFICATION: head snapshots were not produced.')
if head_snapshots.exists():shutil.copytree(head_snapshots,artifacts/'head-snapshots')
compare_feature_snapshots(snapshot_map(base),snapshot_map(head))

# A newly introduced scene has no historical image. Bootstrap it explicitly and
# verify an ordinary second run. Once merged, its path joins `shared` above and
# every later PR compares it with the exact previous-main rendering.
run(head,introduced,'introduced-first','all');run(head,introduced,'introduced-repeat','none')
(artifacts/'README.md').write_text(
    '# Additive feature visual verification\n\n'
    f'Established scenarios compared with exact base: {len(shared)}.\n\n'
    f'Initial candidate scenarios repeated exactly: {len(introduced)}.\n'
)
