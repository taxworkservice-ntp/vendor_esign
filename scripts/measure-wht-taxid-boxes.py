#!/usr/bin/env python3
"""Re-derive the WHT tax-ID cell geometry from the blank form scan.

The 13 digits of a Thai tax ID are pre-printed in the standard 1-4-5-2-1
grouping, separated by gaps of varying size. These constants live in
src/lib/wht-form.ts (TAX_GROUP_LEFT / TAX_GROUP_W / TAX_VENDOR_DX). Run this if
public/wht/form_page_final.png ever changes, then update the arrays.

Output is in the 1512-wide design space (the image is 2x: 3024x4276).

Usage: python3 scripts/measure-wht-taxid-boxes.py
Requires: Pillow (pip install pillow)
"""
from PIL import Image

IMG = "public/wht/form_page_final.png"

# Horizontal bands to scan, in design y (roughly the box interiors).
ROWS = {
    "payer": (212, 247),   # payer tax-ID row, configTop 241
    "vendor": (386, 422),  # vendor tax-ID row, configTop 416
}
X0, X1 = 945, 1430  # design x window covering all 13 cells


def dark(c):
    return c < 90


def find_vlines(px, y0, y1, x0, x1, frac=0.85):
    """Columns that are dark for most of the band = cell borders."""
    band = y1 - y0
    cols = []
    for x in range(x0 * 2, x1 * 2):
        n = sum(1 for y in range(y0 * 2, y1 * 2) if dark(px[x, y]))
        if n >= band * 2 * frac:
            cols.append(x)
    merged = []
    for x in cols:
        if merged and x - merged[-1] <= 2:
            merged[-1] = (merged[-1] + x) / 2
        else:
            merged.append(float(x))
    return [round(m / 2, 2) for m in merged]


def main():
    im = Image.open(IMG).convert("L")
    px = im.load()
    print(f"{IMG}: {im.size[0]}x{im.size[1]} (design {im.size[0] // 2}x{im.size[1] // 2})")
    for name, (y0, y1) in ROWS.items():
        borders = find_vlines(px, y0, y1, X0, X1)
        print(f"\n{name} row borders (design x):")
        print(borders)
        # Grouped lefts are every other border: [left0, right0, left1, ...].
        # 1-4-5-2-1 => 5 groups. Expect 10 borders (one extra at the form frame).
        if len(borders) >= 10:
            lefts = borders[0:10:2]
            rights = borders[1:11:2]
            print("TAX_GROUP_LEFT =", lefts)
            print("TAX_GROUP_W    =", [round(r - l, 2) for l, r in zip(lefts, rights)])


if __name__ == "__main__":
    main()
