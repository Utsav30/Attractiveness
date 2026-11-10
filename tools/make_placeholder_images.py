#!/usr/bin/env python3
"""
Generate placeholder cover images so you can click through the portal before
the real covers exist.

    pip install pillow
    python tools/make_placeholder_images.py --books 30

Creates, for every book id:
    images/<id>/original.jpg
    images/<id>/p01_c1.jpg ... p15_c5.jpg

Delete the whole images/ folder before you drop the real covers in.
"""
import argparse, colorsys, os
from PIL import Image, ImageDraw

W, H = 400, 600
PROMPTS = [f"p{i:02d}" for i in range(1, 16)]
COVERS = 5


def tile(path, label, hue, light, is_original):
    r, g, b = colorsys.hsv_to_rgb(hue, 0.42, light)
    bg = (int(r * 255), int(g * 255), int(b * 255))
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    if is_original:
        d.rectangle([10, 10, W - 11, H - 11], outline=(255, 255, 255), width=6)
    d.rectangle([40, 120, W - 40, 150], fill=(255, 255, 255))
    d.rectangle([40, 170, W - 110, 192], fill=(255, 255, 255))
    d.ellipse([110, 260, W - 110, 260 + (W - 220)], fill=(255, 255, 255))
    d.rectangle([60, H - 120, W - 60, H - 96], fill=(255, 255, 255))
    d.text((18, H - 40), label, fill=(255, 255, 255))
    img.save(path, "JPEG", quality=72)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--books", type=int, default=30,
                    help="how many b001..bNNN folders to create")
    ap.add_argument("--ids", nargs="*",
                    help="explicit book ids instead of b001..bNNN")
    ap.add_argument("--out", default="images")
    a = ap.parse_args()

    ids = a.ids or [f"b{i:03d}" for i in range(1, a.books + 1)]
    n = 0
    for bi, bid in enumerate(ids):
        folder = os.path.join(a.out, bid)
        os.makedirs(folder, exist_ok=True)
        base = (bi * 0.137) % 1.0
        tile(os.path.join(folder, "original.jpg"), f"{bid} ORIGINAL", base, 0.55, True)
        n += 1
        for pi, p in enumerate(PROMPTS):
            for c in range(1, COVERS + 1):
                hue = (base + pi * 0.021 + c * 0.004) % 1.0
                tile(os.path.join(folder, f"{p}_c{c}.jpg"),
                     f"{bid} {p} c{c}", hue, 0.72 - c * 0.04, False)
                n += 1
        print(f"  {bid}: 76 images")
    print(f"\nwrote {n} placeholder images into {a.out}/")


if __name__ == "__main__":
    main()
