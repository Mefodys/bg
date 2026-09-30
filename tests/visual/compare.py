#!/usr/bin/env python3
"""Compare decoded RGB/RGBA PNG pixels without external imaging dependencies."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

def decode(file):
    data = file.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, chunks = 8, []
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset+4])[0]
        kind, body = data[offset+4:offset+8], data[offset+8:offset+8+size]
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and color in (2, 6) and interlace == 0
        elif kind == b'IDAT':
            chunks.append(body)
        offset += size + 12
    channels = 3 if color == 2 else 4
    stride = width * channels
    raw = zlib.decompress(b''.join(chunks))
    previous, rgba, pos = bytearray(stride), bytearray(), 0
    for _ in range(height):
        algorithm = raw[pos]
        row = bytearray(raw[pos+1:pos+1+stride]); pos += stride+1
        for i in range(stride) if algorithm != 0 else ():
            a = row[i-channels] if i >= channels else 0
            b = previous[i]
            c = previous[i-channels] if i >= channels else 0
            if algorithm == 1: predictor = a
            elif algorithm == 2: predictor = b
            elif algorithm == 3: predictor = (a+b)//2
            elif algorithm == 4:
                p = a+b-c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                predictor = a if pa <= pb and pa <= pc else b if pb <= pc else c
            else:
                assert algorithm == 0
                predictor = 0
            row[i] = (row[i]+predictor)&255
        if channels == 4: rgba.extend(row)
        else:
            for i in range(0, stride, 3): rgba.extend(row[i:i+3]+b'\xff')
        previous = row
    return width, height, rgba

def png(file, width, height, pixels):
    def chunk(kind, body):
        return struct.pack('>I', len(body))+kind+body+struct.pack('>I', zlib.crc32(kind+body)&0xffffffff)
    raw = b''.join(b'\x00'+pixels[y*width*4:(y+1)*width*4] for y in range(height))
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))

def main():
    before, after, output = map(Path, sys.argv[1:4])
    output.mkdir(parents=True, exist_ok=False)
    a, b = [json.loads((p/'manifest.json').read_text()) for p in (before, after)]
    compatibility = ['environment', 'suiteHash', 'fixtureHash', 'scriptHash']
    mismatches = [key for key in compatibility if a[key] != b[key]]
    assert not mismatches, 'Incompatible captures: '+', '.join(mismatches)
    old = {s['id']:s for s in a['scenarios']}
    new = {s['id']:s for s in b['scenarios']}
    assert old.keys() == new.keys(), 'Missing or unexpected scenario IDs'
    results = []
    for identifier in old:
        first, second = before/old[identifier]['file'], after/new[identifier]['file']
        width, height, one = decode(first)
        w2, h2, two = decode(second)
        assert (width,height)==(w2,h2), identifier+' changed dimensions'
        diff = bytearray(b'\xff\xff\xff\xff'*(width*height)); changed = 0
        for pos in range(0,len(one),4) if one != two else ():
            different = one[pos:pos+4] != two[pos:pos+4]
            changed += different
            diff[pos:pos+4] = b'\xff\x00\x40\xff' if different else b'\xff\xff\xff\xff'
        png(output/(identifier+'.png'),width,height,diff)
        results.append({'id':identifier,'changedPixels':changed,'totalPixels':width*height,
                        'beforePixelSHA256':hashlib.sha256(one).hexdigest(),'afterPixelSHA256':hashlib.sha256(two).hexdigest(),
                        'observedStateMatches':old[identifier]['observed']==new[identifier]['observed'],
                        'before':str(first.resolve()),'after':str(second.resolve()),'diff':identifier+'.png'})
        print(identifier, 'changed pixels:', changed)
    successful = all(r['changedPixels']==0 and r['observedStateMatches'] for r in results)
    report={'kind':'same-revision determinism verification' if a['servingSHA']==b['servingSHA'] else 'revision comparison',
            'beforeSHA':a['servingSHA'],'afterSHA':b['servingSHA'],'exactMatch':successful,'threshold':0,'scenarios':results}
    (output/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
    lines=['# Screenshot comparison','',report['kind'], '',f"Before: `{a['servingSHA']}`. After: `{b['servingSHA']}`.", '',
           'Matching frames: '+str(sum(r['changedPixels']==0 for r in results))+'/'+str(len(results))+'.', '',
           ('Same-revision repeat; any difference is capture instability, not a product regression.' if a['servingSHA']==b['servingSHA'] else 'Review every difference as expected change, suspected regression or incompatible capture before accepting a baseline.'), '',
           '| Scenario | Changed pixels | Observed state matches |','| --- | ---: | --- |']
    lines += [f"| {r['id']} | {r['changedPixels']} | {r['observedStateMatches']} |" for r in results]
    (output/'comparison.md').write_text('\n'.join(lines)+'\n')
    if not successful: sys.exit(1)

if __name__ == '__main__': main()
