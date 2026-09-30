#!/usr/bin/env python3
"""Run base/head twice in one environment, then gate the exact PR difference."""
import json,os,subprocess,sys
from pathlib import Path

base,head,artifacts=map(lambda p:Path(p).resolve(),sys.argv[1:4]);tools=head/'tests/visual'
artifacts.mkdir(parents=True,exist_ok=False)
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
    if result.returncode:print('::error title=REGRESSION::Visual regression or incomplete screenshot verification; open the comparison artifact.');sys.exit(result.returncode)
except ValueError as e:
    summary('# INCOMPLETE VISUAL VERIFICATION\n\n'+str(e)+'\n');print('::error title=INCOMPLETE VISUAL VERIFICATION::'+str(e));sys.exit(2)
except subprocess.CalledProcessError as e:
    heading='INCOMPLETE — NONDETERMINISTIC SCREENSHOTS' if 'compare.py' in str(e.cmd) else 'REGRESSION — PLAYWRIGHT TEST FAILURE'
    summary('# '+heading+'\n\nThe visual check failed. Inspect test results/traces before merging; failures are never accepted as expected feature changes.\n')
    print('::error title='+heading+'::Required visual checks failed; inspect uploaded artifacts.');sys.exit(1)
