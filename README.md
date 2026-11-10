# Book Cover Attractiveness Study — annotation portal

A static site (plain HTML/CSS/JS, no build step) + Firebase Auth + Firestore.
Hosts free on GitHub Pages. Each annotator signs up, gets 21 books assigned
deterministically from their roll number, and rates covers.

---

## 0. First: is there anything easier than Firebase? Can I use Google Drive?

**Short answer: Google Drive cannot do this job, but Google Sheets + Apps Script can.
Firebase is still the better fit here, and the only thing you must avoid is Firebase *Storage*.**

Drive is a file store. It has no login system for *your* users, no way to accept a
write from a web page without a signed-in Google account and an OAuth consent
screen, and no query layer. Hotlinked Drive image URLs are also rate-limited and
break without warning. So Drive is out as a backend.

Here is the honest comparison for a study of this shape (~1,600 ratings per annotator):

| Option | Setup effort | Login | Where data lands | Catch |
|---|---|---|---|---|
| **Firebase Auth + Firestore** (what this repo uses) | ~20 min, no credit card | Real email/password auth, built in | Firestore, export to CSV with the included script | Data is JSON; you run one export script |
| Google Sheets + Apps Script | ~30 min | You roll your own (hashed passwords in a sheet) — weaker | Straight into a Sheet you can open | Apps Script locks the sheet per write; concurrent annotators queue up and time out. Fine for 5 people, painful for 30 |
| Supabase (Postgres) | ~25 min | Real auth, built in | SQL tables, `select *` to CSV | Free projects pause after ~1 week of inactivity; you un-pause from the dashboard |
| Firebase **Storage** | — | — | — | **Avoid.** Since 3 February 2026 Cloud Storage for Firebase requires a linked billing account (Blaze plan) even inside the always-free tier. Do not put your cover images here |

**Recommendation: Firebase Auth + Firestore for the data, and keep the ~2,300 cover
images as ordinary files in the GitHub repo**, served by GitHub Pages. That way you
never touch Firebase Storage, never enter a card, and the images get a CDN for free.

Relevant free limits (Spark plan, no payment method needed):

- Firestore: 50,000 document reads/day, 20,000 writes/day, 1 GiB stored, 10 GiB egress/month
- Authentication: 50,000 monthly active users
- GitHub Pages: 1 GB repo, 100 GB bandwidth/month (soft limits)

This portal writes **one document per (annotator, book)**, debounced, so a full book
costs roughly 30–60 writes. All 21 books for one annotator ≈ 1,000 writes. You stay
inside 20,000/day unless ~20 people annotate flat out on the same day. The dashboard
costs **1 read** because progress is mirrored onto the user document.

If your image set is larger than ~800 MB even after compression, put `images/` in a
[Hugging Face dataset repo](https://huggingface.co/new-dataset) instead and point
`IMAGE_BASE` at `https://huggingface.co/datasets/USER/REPO/resolve/main`. Everything
else stays the same.

---

## Part A — Create the Firebase project

**A1.** Go to <https://console.firebase.google.com> and sign in with your Google account.

**A2.** Click **Create a project** (or **Add project**). Name it, e.g. `book-cover-study`.
Firebase will show a project ID like `book-cover-study-4f2a1` — note it down, you will see it again.

**A3.** On the Google Analytics step, choose **Disable Google Analytics**. You do not need it
and it adds a consent surface you would have to explain in your ethics paperwork.
Click **Create project**, wait, then **Continue**.

**A4. Stay on the free Spark plan.** Do not click any "Upgrade" prompt. You only need
Authentication and Firestore, both of which are free without a card.

### Turn on Authentication

**A5.** Left sidebar → **Build** → **Authentication** → **Get started**.

**A6.** On the **Sign-in method** tab, click **Email/Password**.

**A7.** Toggle the first switch (**Email/Password**) to **Enabled**. Leave
*Email link (passwordless sign-in)* **off**. Click **Save**.

### Create the database

**A8.** Left sidebar → **Build** → **Firestore Database** → **Create database**.

**A9.** Pick a location. For users in India, `asia-south1` (Mumbai) gives the lowest
latency. **This cannot be changed later.**

**A10.** Choose **Start in production mode** (locked down). Click **Create**. Do *not*
pick test mode — it leaves the database world-writable for 30 days.

**A11.** Open the **Rules** tab. Delete everything in the editor and paste the entire
contents of `firestore.rules` from this repo. Click **Publish**.

These rules mean an annotator can only ever read and write their own profile and their
own ratings; nobody can read anyone else's data or the list of registered roll numbers;
a roll number can be claimed exactly once; and `assignedBooks` is frozen after signup so
nobody can swap onto a different book set.

### Get your web config keys

**A12.** Click the **gear icon** (top-left, next to *Project Overview*) → **Project settings**.

**A13.** Scroll to **Your apps**. Click the **web icon** `</>`.

**A14.** App nickname: `portal`. **Leave "Also set up Firebase Hosting" unchecked**
(you are hosting on GitHub Pages). Click **Register app**.

**A15.** You now see a `firebaseConfig` object. Copy it.

**A16.** Open `js/firebase-config.js` in this repo and replace the placeholder values
with yours. It ends up looking like:

```js
export const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "book-cover-study-4f2a1.firebaseapp.com",
  projectId: "book-cover-study-4f2a1",
  storageBucket: "book-cover-study-4f2a1.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456",
};
```

> These keys are **not secrets** and are safe to commit. Every Firebase web app ships
> them in its JavaScript. Your security comes from the rules you published in A11.

---

## Part B — Put it on GitHub and turn on Pages

**B1.** Create a repo at <https://github.com/new>. Name it e.g. `book-cover-study`.
Set it to **Public** (GitHub Pages on free accounts requires public). Do **not** add a
README — this repo already has one.

**B2.** From the folder containing these files:

```bash
git init
git add .
git commit -m "Book cover annotation portal"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/book-cover-study.git
git push -u origin main
```

**B3.** In the repo on github.com: **Settings** → **Pages** (left sidebar).

**B4.** Under *Build and deployment* → *Source*, choose **Deploy from a branch**.

**B5.** Branch: **main**, folder: **/ (root)**. Click **Save**.

**B6.** Wait 1–2 minutes, refresh the page. GitHub shows your live URL:
`https://YOUR_USERNAME.github.io/book-cover-study/`

> The `.nojekyll` file in this repo is already there on purpose — without it GitHub
> Pages ignores folders starting with `_` and sometimes mangles asset paths.

---

## Part C — Connect Firebase to GitHub (the step people miss)

**This is the one that breaks logins if you skip it.** Firebase refuses auth requests
from domains it does not know.

**C1.** Firebase console → **Build** → **Authentication** → **Settings** tab →
**Authorized domains**.

**C2.** Click **Add domain**.

**C3.** Enter exactly `YOUR_USERNAME.github.io` — the **host only**: no `https://`,
no repository path, no trailing slash. Click **Add**.

**C4.** Confirm `localhost` is also in the list (it is there by default) so you can
test on your own machine.

That is the whole connection. The portal is a static site that talks to Firebase from
the browser; there is nothing to deploy *to* Firebase.

### C-alt — if you would rather host on Firebase and auto-deploy from GitHub

Only do this if you want pushes to `main` to publish automatically. It is optional.

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

Answer: **Use an existing project** → pick yours; public directory → `.`;
configure as a single-page app → **No**; set up automatic builds with GitHub → **Yes**.
The CLI opens a browser to authorize the Firebase GitHub app, asks for your repo as
`YOUR_USERNAME/book-cover-study`, and writes `.github/workflows/firebase-hosting-*.yml`
plus a `FIREBASE_SERVICE_ACCOUNT_*` repo secret for you. Then:

```bash
firebase deploy --only hosting
```

Your site lands at `https://PROJECT_ID.web.app`, which is already an authorized domain,
so you can skip C1–C3. Firebase Hosting is free on Spark (10 GB storage, 10 GB/month
transfer) — but note that 10 GB/month of transfer is less headroom than GitHub Pages
gives you if your images are large.

---

## Part D — Load your books, prompts and images

**D1. Prompts.** Edit `data/prompts.json` and replace the 15 placeholder strings with
your actual generation prompts. Keep the ids `p01`…`p15` exactly as they are — image
filenames and stored data key off them.

**D2. Images.** Lay them out like this:

```
images/
  b001/
    original.jpg
    p01_c1.jpg  p01_c2.jpg  p01_c3.jpg  p01_c4.jpg  p01_c5.jpg
    p02_c1.jpg  …
    p15_c5.jpg          <- 76 files per book
  b002/
    …
```

Compress hard before committing — these are thumbnails on screen, not prints:

```bash
# ~60–90 KB each at 800px tall, from a folder of PNGs
for f in images/*/*.png; do
  convert "$f" -resize x800 -quality 78 "${f%.png}.jpg" && rm "$f"
done
```

At ~80 KB × 76 images × 30 books ≈ 180 MB — comfortable for a GitHub repo.

**D3. Book metadata.** Put your books in a CSV with columns
`id,title,author,genre[,description]`, then:

```bash
python tools/make_books_json.py --csv my_books.csv
```

It writes `data/books.json` **and** reports any missing image files, which is the
fastest way to catch a mis-named cover before annotators do.

No metadata handy? `python tools/make_books_json.py --scan images` builds the list from
the folder names and you fill in titles afterwards.

**D4. Pool size matters.** The file shipped here has 30 sample books so you can click
around. Each annotator gets 21 of them, so with a pool of exactly 21 *everyone gets the
same set*. Aim for a pool of at least 40–60 if you want meaningful variation; the
assignment keeps per-book coverage even and still overlaps annotators so you can compute
inter-annotator agreement.

**D5. Study knobs.** `js/config.js` holds `BOOKS_PER_USER`, `COVERS_PER_PROMPT`,
`RATING_MAX`, `CONFIDENCE_MAX`, `PANEL_TOP_N`, `IMAGE_BASE` and `IMAGE_EXT`. Change them
there and nothing else needs touching.

---

## Part E — Test before you send the link to anyone

The pages use ES modules, so `file://` will not work. Serve over HTTP:

```bash
python -m http.server 8000
# open http://localhost:8000
```

No real covers yet? Generate placeholders so you can walk the whole flow:

```bash
pip install pillow
python tools/make_placeholder_images.py --books 30
```

Checklist:

1. Sign up with a throwaway roll number → you land on the dashboard with 21 red-bordered books.
2. Open a book → rate the original, fill one prompt row (5 ratings, ranks 1–5, confidence, reason).
   The row's left edge turns green. Give two covers the same rank — it should go red and warn you.
3. Step 2 tab → pick 10 covers, reorder them, add confidence and a reason.
4. Go back to the dashboard → that book is now green at 100%.
5. Log out, log back in → everything is still there.
6. Firebase console → Firestore → confirm `users/{uid}/responses/{bookId}` looks right.

Then delete the test account: Firebase console → Authentication → Users → ⋮ → Delete,
and delete the matching `users/{uid}` and `rolls/{rollNo}` documents in Firestore.

---

## Part F — Get the data out

```bash
npm install firebase-admin
```

Firebase console → **Project settings** → **Service accounts** → **Generate new private key**.
Save the downloaded file as `serviceAccountKey.json` next to the repo.
**It is already in `.gitignore` — never commit it.**

```bash
node tools/export_responses.js --key serviceAccountKey.json --out export
```

You get four tidy CSVs, ready for pandas or R:

| File | One row per | Key columns |
|---|---|---|
| `annotators.csv` | annotator | `roll_no`, `gender`, `assigned_books`, `books_complete` |
| `original.csv` | (annotator, book) | `rating`, `confidence` |
| `generated.csv` | (annotator, book, prompt, cover) | `rating`, `rank_in_row`, `row_confidence`, `row_reason` |
| `panel.csv` | (annotator, book, rank 1–10) | `cover_id`, `is_original`, `panel_confidence`, `panel_reason` |

`generated.csv` is the main analysis table — ~1,575 rows per annotator per completed
book set, with `prompt_id` ready to group by.

---

## How the portal works

**Assignment.** `js/assign.js` hashes the lowercased roll number (FNV-1a, stable across
browsers) and walks the pool with a stride coprime to the pool size. Same roll number
always yields the same 21 distinct books, on any device; different roll numbers get
different but overlapping sets. The list is written to the user document at signup and
frozen, so editing `books.json` later never reshuffles someone mid-study.

**Per book, an annotator provides:** 1 rating + confidence for the original;
for each of 15 prompts, 5 ratings, a 1–5 ranking, a confidence and a free-text reason;
then a top-10 ranking across all 76 covers with confidence and a reason.
A book only turns green when every one of those 17 units is complete — ranks have to be
a true permutation and reason boxes have to be non-empty.

**Saving.** Autosaves 1.2 s after the last edit, into one document per book, plus a tiny
progress mirror on the user doc. The header shows Saved / Unsaved / Saving, failed saves
retry, and closing a tab with unsaved edits prompts.

### File map

```
index.html          signup + login
dashboard.html      21 books, red/green borders, progress
book.html           Step 1 (15 prompt rows) + Step 2 (76-cover panel)
js/config.js        all study knobs
js/firebase-config.js  <- paste your keys here
js/firebase.js      Firebase init + auth guard
js/assign.js        roll-number -> 21 books
js/model.js         response shape + completeness rules
js/auth.js  js/dashboard.js  js/book.js
css/styles.css      light theme
data/books.json     book pool (regenerate from your CSV)
data/prompts.json   your 15 prompts
firestore.rules     paste into the Firebase console
tools/              books.json builder, placeholder images, CSV export
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| `auth/unauthorized-domain` on login | Part C skipped, or the domain was typed with `https://` or a path |
| `auth/operation-not-allowed` | Email/Password not enabled (A7) |
| `Missing or insufficient permissions` | `firestore.rules` not published (A11) |
| Blank page, console says CORS / module error | Opened via `file://` — serve over HTTP instead (Part E) |
| Covers show "image missing" | Filename mismatch; run `python tools/make_books_json.py --csv …` to list what is missing |
| Everyone gets identical books | Pool is 21 — add more books (D4) |
| Signup says roll number already registered | It is; that is the rules doing their job. Delete the old `rolls/{rollNo}` doc to free it |
