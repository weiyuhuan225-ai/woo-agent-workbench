#!/usr/bin/env python3
"""Rebuild the OFL font subset from the pinned official font. Requires fontTools 4.61.1."""
import argparse, hashlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset

ap = argparse.ArgumentParser()
ap.add_argument('source', type=Path)
ap.add_argument('output', type=Path)
args = ap.parse_args()
source_sha = '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b'
if hashlib.sha256(args.source.read_bytes()).hexdigest() != source_sha:
    raise SystemExit('Official Sans2.004 source SHA mismatch')
font = TTFont(args.source)
chars = set(range(32, 256)) | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3040)) | set(range(0xff00, 0xffef))
for a in range(0xa1, 0xf8):
    for b in range(0xa1, 0xff):
        try: chars.update(ord(c) for c in bytes([a, b]).decode('gb2312'))
        except UnicodeError: pass
chars &= set(font.getBestCmap())
options = subset.Options()
options.layout_features = []
options.recalc_timestamp = False
processor = subset.Subsetter(options=options)
processor.populate(unicodes=chars)
processor.subset(font)
for name in font['name'].names:
    if name.nameID in [1, 4, 6, 16]:
        value = 'WOO Noto CJK SC' if name.nameID != 6 else 'WOONotoCJKSC-Regular'
        name.string = value.encode(name.getEncoding(), errors='replace')
font.save(args.output)
sha = hashlib.sha256(args.output.read_bytes()).hexdigest()
print(f'{len(chars)} characters; SHA-256 {sha}')
if sha != '8718450eae59cfb3cdf6a92905835d5b406155c23a6425d4ed219f7de30f1762':
    raise SystemExit('Derived bytes differ; verify fontTools version before updating pinned metadata')
