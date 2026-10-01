#!/usr/bin/env python3
"""Print bounded visual-review metadata without embedding screenshot files."""
import json,sys
from pathlib import Path

for name in sys.argv[1:]:
    source=Path(name)
    if not source.exists():continue
    report=json.loads(source.read_text())
    keys=('id','changedPixels','changedBounds','afterWidth','afterHeight','afterPixelSHA256','observedAfter')
    rows=[{key:item[key] for key in keys if key in item} for item in report['scenarios'] if item['changedPixels'] or not item['observedStateMatches']]
    print(json.dumps({'comparison':str(source),'baseSHA':report['beforeSHA'],'afterSHA':report['afterSHA'],'changes':rows},separators=(',',':')))
