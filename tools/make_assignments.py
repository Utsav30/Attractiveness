#!/usr/bin/env python3
"""
Build data/assignments.json — an explicit book list per annotator.

Use this when you want to control coverage yourself instead of letting the roll
number hash decide: a small pilot pool, a balanced design, or deliberate
overlap so you can compute inter-annotator agreement.

    # one roll number per line in rolls.txt (lowercase)
    python tools/make_assignments.py --rolls rolls.txt --per-user 21

    # restrict to a subset of the catalogue
    python tools/make_assignments.py --rolls rolls.txt --pool 60

It deals books out round-robin from a seeded shuffle, so every book in the pool
is used almost exactly the same number of times, and prints the coverage you
will actually get BEFORE you commit to it.
"""
import argparse, json, os, random
from collections import Counter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rolls", required=True, help="text file, one roll number per line")
    ap.add_argument("--books", default="data/books.json")
    ap.add_argument("--out", default="data/assignments.json")
    ap.add_argument("--per-user", type=int, default=21)
    ap.add_argument("--pool", type=int, default=0,
                    help="use only the first N active books (0 = all of them)")
    ap.add_argument("--seed", type=int, default=20261110)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    books = json.load(open(a.books, encoding="utf-8"))
    ids = [b["id"] for b in books if b.get("active", True)]
    if a.pool:
        ids = ids[:a.pool]

    rolls = [r.strip().lower() for r in open(a.rolls, encoding="utf-8")
             if r.strip() and not r.startswith("#")]
    dupes = [r for r, n in Counter(rolls).items() if n > 1]
    if dupes:
        raise SystemExit(f"duplicate roll numbers in {a.rolls}: {dupes}")

    if a.per_user > len(ids):
        raise SystemExit(
            f"--per-user is {a.per_user} but the pool has only {len(ids)} books.")

    rng = random.Random(a.seed)
    seq = ids[:]
    rng.shuffle(seq)

    assignments, i = {}, 0
    for roll in rolls:
        picks = []
        guard = 0
        while len(picks) < a.per_user and guard < len(seq) * 3:
            b = seq[i % len(seq)]
            i += 1
            guard += 1
            if b not in picks:
                picks.append(b)
        assignments[roll] = picks

    # ---- what coverage does this actually buy you?
    counts = Counter(b for picks in assignments.values() for b in picks)
    per_book = [counts.get(b, 0) for b in ids]
    unseen = sum(1 for c in per_book if c == 0)
    slots = len(rolls) * a.per_user

    print(f"{len(rolls)} annotators x {a.per_user} books = {slots} ratings slots")
    print(f"pool: {len(ids)} books\n")
    print(f"ratings per book  min {min(per_book)}  max {max(per_book)}  "
          f"mean {slots / len(ids):.1f}")
    print(f"books nobody sees: {unseen}")

    if min(per_book) < 2:
        print(f"\n  WARNING: some books get rated by fewer than 2 people, so you")
        print(f"  cannot measure agreement on them. For at least 2 ratings each,")
        print(f"  cap the pool at about {slots // 2} books (--pool {slots // 2}),")
        print(f"  or recruit more annotators.")
    else:
        print(f"\n  every book is rated by at least {min(per_book)} people")

    if a.dry_run:
        print("\n--dry-run: nothing written.")
        return

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(assignments, f, indent=2)
    print(f"\nwrote {a.out} for {len(assignments)} annotators")
    print("Commit it alongside data/books.json. Annotators who are not listed")
    print("still get books from the roll-number hash.")


if __name__ == "__main__":
    main()
