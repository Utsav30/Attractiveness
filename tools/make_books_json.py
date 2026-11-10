#!/usr/bin/env python3
"""
Build data/books.json for the portal.

Two ways to use it:

1. From a CSV of your book metadata (recommended):
       python tools/make_books_json.py --csv my_books.csv
   CSV columns: id,title,author,genre[,description]

2. From the images folder (ids are the folder names, metadata left blank
   for you to fill in):
       python tools/make_books_json.py --scan images

It also checks that every expected image file exists:
   images/<id>/original.jpg
   images/<id>/p01_c1.jpg ... p15_c5.jpg
"""
import argparse, csv, json, os, sys

PROMPTS = [f"p{i:02d}" for i in range(1, 16)]
COVERS = 5


def from_csv(path):
    books = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            books.append({
                "id": row["id"].strip(),
                "title": row.get("title", "").strip(),
                "author": row.get("author", "").strip(),
                "genre": row.get("genre", "").strip(),
                **({"description": row["description"].strip()}
                   if row.get("description") else {}),
            })
    return books


def from_scan(images_dir):
    ids = sorted(d for d in os.listdir(images_dir)
                 if os.path.isdir(os.path.join(images_dir, d)))
    return [{"id": i, "title": i, "author": "", "genre": ""} for i in ids]


def check_images(books, images_dir, ext):
    missing = []
    for b in books:
        want = [f"original.{ext}"] + [
            f"{p}_c{c}.{ext}" for p in PROMPTS for c in range(1, COVERS + 1)
        ]
        for name in want:
            if not os.path.exists(os.path.join(images_dir, b["id"], name)):
                missing.append(f"{b['id']}/{name}")
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    ap.add_argument("--scan")
    ap.add_argument("--images", default="images")
    ap.add_argument("--ext", default="jpg")
    ap.add_argument("--out", default="data/books.json")
    a = ap.parse_args()

    if a.csv:
        books = from_csv(a.csv)
    elif a.scan:
        books = from_scan(a.scan)
    else:
        ap.error("pass --csv FILE or --scan IMAGES_DIR")

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(books, f, indent=2, ensure_ascii=False)
    print(f"wrote {a.out} with {len(books)} books")

    print("Remember: a book is only visible to someone whose roll number lists it "
          "in data/assignments.json.")

    if os.path.isdir(a.images):
        missing = check_images(books, a.images, a.ext)
        if missing:
            print(f"\n{len(missing)} image files are missing. First 20:")
            for m in missing[:20]:
                print("  ", m)
        else:
            print("all expected image files found")
    else:
        print(f"(images folder '{a.images}' not found — skipped the file check)")


if __name__ == "__main__":
    main()
