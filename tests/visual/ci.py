#!/usr/bin/env python3
"""Run base/head twice in one environment, then gate the exact PR difference."""
import json,os,subprocess,sys
from pathlib import Path
from failure import failure_heading
from tag_capture import validate_tag_capture

base,head,artifacts=map(lambda p:Path(p).resolve(),sys.argv[1:4]);tools=head/'tests/visual'
artifacts.mkdir(parents=True,exist_ok=False)
current_results=None
def call(args,**kwargs):subprocess.run(args,check=True,**kwargs)
def sha(root):return subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
def summary(text):
    (artifacts/'summary.md').write_text(text)
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write(text)

def contract():
    old=base/'tests/visual'
    if not old.exists():return # Explicit bootstrap: replay preexisting app with the introduced suite.
    for name in ['fixtures.json','scenarios.json','fonts/manifest.json']:
        if (old/name).read_bytes()!=(tools/name).read_bytes():raise ValueError('INCOMPATIBLE TEST CONTRACT: fixtures, viewports or font versions changed: '+name)
    for f in json.loads((tools/'fonts/manifest.json').read_text())['files']:
        if (old/'fonts'/f['name']).read_bytes()!=(tools/'fonts'/f['name']).read_bytes():raise ValueError('INCOMPATIBLE FONT: '+f['name'])

try:
    contract()
    for variant,root in [('base',base),('head',head)]:
        for index in (1,2):
            env={**os.environ,'VISUAL_ROOT':str(root),'VISUAL_OUTPUT':str(artifacts/f'{variant}-{index}'),'VISUAL_RESULTS':str(artifacts/f'{variant}-results-{index}'),'VISUAL_SNAPSHOTS':str(artifacts/f'{variant}-snapshots'),'VISUAL_RUN':f'run-{variant}-{index}','VISUAL_BASE_SHA':sha(base)}
            current_results=Path(env['VISUAL_RESULTS'])/'results.json'
            # Separate ephemeral self-reference generation from the ordinary exact verification.
            call(['node','node_modules/playwright/cli.js','test','--config','playwright.visual.config.mjs','--update-snapshots=all' if index==1 else '--update-snapshots=none'],cwd=head,env=env)
        call(['python3',str(tools/'compare.py'),str(artifacts/f'{variant}-1'),str(artifacts/f'{variant}-2'),str(artifacts/f'{variant}-determinism')])
    previous=Path(os.environ.get('VISUAL_PREVIOUS_BASELINE','/nonexistent'))
    baseline=artifacts/'base-2'
    if (previous/'manifest.json').exists():
        call(['python3',str(tools/'compare.py'),str(previous),str(baseline),str(artifacts/'previous-baseline-verification')])
        baseline=previous
    else:
        (artifacts/'baseline-source.txt').write_text('Previous revision reconstructed from exact base SHA; no retained accepted CI artifact was available.\n')
    result=subprocess.run(['python3',str(tools/'analyze.py'),str(baseline),str(artifacts/'head-2'),str(artifacts/'comparison'),str(tools/'expected-changes.json')])
    if (artifacts/'comparison/comparison.json').exists():call(['python3',str(tools/'build-comparison.py'),str(artifacts/'comparison')])
    report=(artifacts/'comparison/comparison.md').read_text();summary(report)
    common_status=result.returncode
    if common_status:
        title='REGRESSION' if common_status==1 else 'INCOMPLETE VISUAL VERIFICATION'
        print('::error title='+title+'::Open the comparison artifact for the failed visual verification.')
    # Preserve inherited base/head evidence even if the additive feature suite fails.
    tag_status=0
    if (head/'playwright.tags.config.mjs').exists():
        try:
            tag_contract=json.loads((tools/'tag-scenarios.json').read_text())
            expected_ids={row[0] for row in tag_contract['scenarios']}
            if len(expected_ids)!=len(tag_contract['scenarios']) or not expected_ids:raise ValueError('Invalid tag scenario contract')
            variants=[('tags-head',head)]
            if (base/'playwright.tags.config.mjs').exists():
                for name in ['tests/visual/tag-scenarios.json','tests/tag-fixtures.mjs','tests/tag-taxonomy.json']:
                    if (base/name).read_bytes()!=(head/name).read_bytes():raise ValueError('INCOMPATIBLE TAG CONTRACT: '+name)
                variants.insert(0,('tags-base',base))
            for variant,root in variants:
                for index in (1,2):
                    target=artifacts/f'{variant}-{index}'
                    env={**os.environ,'TAG_VISUAL_ROOT':str(root),'TAG_VISUAL_OUTPUT':str(target),'TAG_VISUAL_SNAPSHOTS':str(artifacts/f'{variant}-snapshots'),'VISUAL_BASE_SHA':sha(base)}
                    current_results=target/'results.json'
                    call(['node','node_modules/playwright/cli.js','test','--config','playwright.tags.config.mjs','--update-snapshots=all' if index==1 else '--update-snapshots=none'],cwd=head,env=env)
                    validate_tag_capture(target,expected_ids)
                call(['python3',str(tools/'compare.py'),str(artifacts/f'{variant}-1'),str(artifacts/f'{variant}-2'),str(artifacts/f'{variant}-determinism')])
            count=len(expected_ids)
            (artifacts/'tags-determinism.txt').write_text(f'{count}/{count} tag scenarios repeated with exact decoded pixels and DOM; ordinary snapshot verification passed.\n')
            current=artifacts/'tags-head-2'
            if len(variants)==2:
                tag_baseline=artifacts/'tags-base-2'
                if (previous/'tags/manifest.json').exists():
                    validate_tag_capture(previous/'tags',expected_ids)
                    call(['python3',str(tools/'compare.py'),str(previous/'tags'),str(tag_baseline),str(artifacts/'tags-previous-baseline-verification')])
                    tag_baseline=previous/'tags'
                tag_status=subprocess.run(['python3',str(tools/'analyze.py'),str(tag_baseline),str(current),str(artifacts/'tags-comparison'),str(tools/'tag-expected-changes.json')]).returncode
                if (artifacts/'tags-comparison/comparison.json').exists():call(['python3',str(tools/'build-comparison.py'),str(artifacts/'tags-comparison')])
                report+='\n'+(artifacts/'tags-comparison/comparison.md').read_text()
            else:
                report+='\n## Tag suite: initial candidate\n\nNo previous tag-feature revision exists. Exact repeat is verified; these captures are not an accepted main baseline.\n'
            # Only the actual successful main workflow uploads head-2 as its next baseline.
            import shutil
            shutil.copytree(current,artifacts/'head-2/tags')
        except subprocess.CalledProcessError as e:
            title=failure_heading(e.cmd,current_results);tag_status=1 if title.startswith('REGRESSION') else 2
            report+='\n# '+title+'\n\nTag checks failed; inherited comparison evidence is preserved. Inspect tag traces/results.\n'
        except (ValueError,AssertionError,KeyError,FileNotFoundError) as e:
            tag_status=2;report+='\n# INCOMPLETE VISUAL VERIFICATION\n\nTag checks: '+str(e)+'\n'
        if tag_status:print('::error title='+('REGRESSION' if tag_status==1 else 'INCOMPLETE VISUAL VERIFICATION')+'::Tag verification failed; inherited comparison is retained.')
    summary(report)
    sys.exit(1 if 1 in (common_status,tag_status) else max(common_status,tag_status))
except ValueError as e:
    summary('# INCOMPLETE VISUAL VERIFICATION\n\n'+str(e)+'\n');print('::error title=INCOMPLETE VISUAL VERIFICATION::'+str(e));sys.exit(2)
except subprocess.CalledProcessError as e:
    heading=failure_heading(e.cmd,current_results)
    summary('# '+heading+'\n\nThe visual check failed. Inspect test results/traces before merging; failures are never accepted as expected feature changes.\n')
    print('::error title='+heading+'::Required visual checks failed; inspect uploaded artifacts.');sys.exit(1)
