#!/usr/bin/env python3
"""Extract the Cordia New faces from public/fonts/cordia.ttc into standalone
TTFs that pdf-lib can embed (it cannot embed a TTC collection directly).

Faces: 0 = Cordia New Regular, 1 = Cordia New Bold.
Run once; the generated TTFs are committed. Requires fonttools:
    pip install fonttools
Usage: python3 scripts/extract-cordia-fonts.py
"""
from fontTools.ttLib import TTCollection

SRC = "public/fonts/cordia.ttc"
OUT = {0: "public/fonts/CordiaNew-Regular.ttf", 1: "public/fonts/CordiaNew-Bold.ttf"}

coll = TTCollection(SRC)
for idx, path in OUT.items():
    coll.fonts[idx].save(path)
    print(f"wrote {path} ({coll.fonts[idx]['name'].getDebugName(4)})")
