"""Reject missing feature captures/observations rather than vacuous green repeats."""
import json

def validate_tag_capture(directory, expected_ids):
    pngs={str(p.relative_to(directory))[:-4] for p in directory.glob('*/*.png')}
    records=[json.loads(p.read_text()) for p in directory.glob('*.json') if p.name not in ('results.json','manifest.json')]
    manifest=json.loads((directory/'manifest.json').read_text())
    for source in (records,manifest['scenarios']):
        ids=[r['id'] for r in source]
        if len(ids)!=len(expected_ids) or set(ids)!=expected_ids:raise ValueError('Missing/duplicate/unexpected tag observations')
        if any(not r.get('observed') or r.get('file')!=r['id']+'.png' for r in source):raise ValueError('Missing tag DOM observation/file')
    if pngs!=expected_ids:raise ValueError('Missing/unexpected tag PNGs')
    if sorted(records,key=lambda r:r['id'])!=sorted(manifest['scenarios'],key=lambda r:r['id']):raise ValueError('Tag manifest/observation mismatch')
