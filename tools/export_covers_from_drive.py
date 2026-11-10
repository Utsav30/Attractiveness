#!/usr/bin/env python3
"""
Move your generated covers OUT of Google Drive and into the portal's images/
layout, compressed and correctly named.

Run it in Colab, where Drive is just a mounted folder — no Drive API, no
credentials, no rate limits:

    from google.colab import drive
    drive.mount('/content/drive')

    !python export_covers_from_drive.py \
        --src "/content/drive/MyDrive/book_covers" \
        --pattern "(?P<book>[^/]+)/(?P<prompt>p\\d+)_(?P<cover>c\\d)\\.(png|jpg|jpeg)" \
        --dry-run

Drop --dry-run once the preview looks right, then:

    !zip -rq images.zip images && echo done     # download images.zip

ALWAYS --dry-run first. It prints what it matched and what it skipped, which is
how you find out your Drive layout is not what you remembered.

Originals: name them `original.*` inside each book folder, or pass
--original-pattern to match wherever they live.
"""
import argparse, os, re, shutil, sys
from collections import defaultdict

try:
    from PIL import Image
except ImportError:
    Image = None


def walk(src):
    for root, _dirs, files in os.walk(src):
        for f in files:
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                full = os.path.join(root, f)
                yield full, os.path.relpath(full, src).replace(os.sep, "/")


def save(src_path, dst_path, quality, max_h, copy_only):
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    if copy_only or Image is None:
        shutil.copy2(src_path, dst_path)
        return
    im = Image.open(src_path)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    if max_h and im.height > max_h:
        im = im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)
    im.save(dst_path, "JPEG", quality=quality, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="folder in the mounted Drive")
    ap.add_argument("--out", default="images")
    ap.add_argument("--pattern", required=True,
                    help="regex over the path relative to --src, with named "
                         r"groups book, prompt, cover. e.g. "
                         r"'(?P<book>[^/]+)/(?P<prompt>p\d+)_(?P<cover>c\d)\.png'")
    ap.add_argument("--original-pattern",
                    default=r"(?P<book>[^/]+)/original\.(png|jpg|jpeg|webp)",
                    help="regex matching the ORIGINAL cover of each book")
    ap.add_argument("--quality", type=int, default=78)
    ap.add_argument("--max-height", type=int, default=800,
                    help="downscale taller images; 0 to keep full size")
    ap.add_argument("--copy-only", action="store_true",
                    help="copy bytes as-is instead of re-encoding to JPEG")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if not os.path.isdir(a.src):
        sys.exit(f"--src not found: {a.src}\nIs Drive mounted?")
    if Image is None and not a.copy_only:
        sys.exit("Pillow is not installed. `pip install pillow`, or pass --copy-only.")

    gen_re = re.compile(a.pattern)
    org_re = re.compile(a.original_pattern)

    planned, skipped = [], []
    for full, rel in walk(a.src):
        m = org_re.fullmatch(rel) or org_re.search(rel)
        if m and "prompt" not in (m.groupdict() or {}):
            planned.append((full, f"{m.group('book')}/original.jpg"))
            continue
        m = gen_re.fullmatch(rel) or gen_re.search(rel)
        if m:
            g = m.groupdict()
            prompt = g["prompt"].lower()
            if re.fullmatch(r"p\d", prompt):            # p1 -> p01
                prompt = "p0" + prompt[1:]
            cover = g["cover"].lower()
            if not cover.startswith("c"):
                cover = "c" + cover
            planned.append((full, f"{g['book']}/{prompt}_{cover}.jpg"))
        else:
            skipped.append(rel)

    by_book = defaultdict(list)
    for _src, dst in planned:
        by_book[dst.split("/")[0]].append(dst)

    print(f"matched {len(planned)} files across {len(by_book)} books")
    print(f"skipped {len(skipped)} files\n")

    print("first 10 mappings:")
    for full, dst in planned[:10]:
        print(f"  {os.path.relpath(full, a.src)}\n      -> {a.out}/{dst}")

    if skipped:
        print("\nfirst 10 skipped (fix --pattern if these should have matched):")
        for s in skipped[:10]:
            print("  ", s)

    expected = 1 + 15 * 5
    bad = {b: len(v) for b, v in by_book.items() if len(v) != expected}
    if bad:
        print(f"\nbooks without exactly {expected} files (1 original + 75 generated):")
        for b, n in list(bad.items())[:15]:
            print(f"   {b}: {n}")
    else:
        print(f"\nevery book has exactly {expected} files")

    dupes = [d for d in by_book.values() for d in d]
    if len(dupes) != len(set(dupes)):
        seen, dup = set(), set()
        for d in dupes:
            (dup if d in seen else seen).add(d)
        print(f"\nWARNING: {len(dup)} destinations collide, e.g. {sorted(dup)[:5]}")
        print("Two source files map to the same name — tighten --pattern.")

    if a.dry_run:
        print("\n--dry-run: nothing written. Re-run without it to write files.")
        return

    print(f"\nwriting to {a.out}/ …")
    for i, (full, dst) in enumerate(planned, 1):
        save(full, os.path.join(a.out, dst), a.quality, a.max_height, a.copy_only)
        if i % 200 == 0:
            print(f"  {i}/{len(planned)}")

    total = sum(os.path.getsize(os.path.join(r, f))
                for r, _d, fs in os.walk(a.out) for f in fs)
    print(f"done — {len(planned)} files, {total / 1e6:.0f} MB in {a.out}/")
    print("\nNext: copy images/ into the repo and `git add images && git commit && git push`,")
    print("or upload it to a Hugging Face dataset and point IMAGE_BASE at that.")


if __name__ == "__main__":
    main()
