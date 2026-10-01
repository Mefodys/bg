#!/usr/bin/env python3
"""Replay additive feature scenes against the exact base revision."""
import os,shutil,subprocess,sys
from pathlib import Path

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

# First prove the base is deterministic, then use its exact locator snapshots as
# the head baseline for every established scenario.
run(base,shared,'base-first','all');run(base,shared,'base-repeat','none')
base_snapshots=base/'reports/feature-snapshots';head_snapshots=head/'reports/feature-snapshots'
if shared and not base_snapshots.exists():raise SystemExit('INCOMPLETE FEATURE VERIFICATION: base snapshots were not produced.')
if head_snapshots.exists():shutil.rmtree(head_snapshots)
if base_snapshots.exists():shutil.copytree(base_snapshots,head_snapshots)
run(head,shared,'head-first','none');run(head,shared,'head-repeat','none')

# A newly introduced scene has no historical image. Bootstrap it explicitly and
# verify an ordinary second run. Once merged, its path joins `shared` above and
# every later PR compares it with the exact previous-main rendering.
run(head,introduced,'introduced-first','all');run(head,introduced,'introduced-repeat','none')
(artifacts/'README.md').write_text(
    '# Additive feature visual verification\n\n'
    f'Established scenarios compared with exact base: {len(shared)}.\n\n'
    f'Initial candidate scenarios repeated exactly: {len(introduced)}.\n'
)
