#!/usr/bin/env node
/**
 * Export every annotator's responses from Firestore into tidy CSVs for analysis.
 *
 *   npm install firebase-admin
 *   node tools/export_responses.js --key serviceAccountKey.json --out export
 *
 * Produces:
 *   export/annotators.csv  one row per annotator
 *   export/original.csv    one row per (annotator, book)        — original cover rating
 *   export/generated.csv   one row per (annotator, book, prompt, cover)
 *   export/panel.csv       one row per (annotator, book, rank)  — the top-10 panel
 *
 * The Admin SDK bypasses Firestore security rules, so keep the service-account
 * key off GitHub. (.gitignore already excludes *serviceAccount*.json.)
 */
const fs = require("fs");
const path = require("path");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : dflt;
}

const keyPath = arg("key", "serviceAccountKey.json");
const outDir = arg("out", "export");
// Assignment lives in the repo, not in Firestore, so read it from disk.
const assignPath = arg("assignments", "data/assignments.json");
let ASSIGNMENTS = {};
try {
  ASSIGNMENTS = JSON.parse(fs.readFileSync(assignPath, "utf8"));
  console.log(`assignments: ${Object.keys(ASSIGNMENTS).length} roll numbers from ${assignPath}`);
} catch {
  console.log(`(no ${assignPath} — assigned_books will be blank)`);
}

if (!fs.existsSync(keyPath)) {
  console.error(`Service account key not found at ${keyPath}.
Firebase console -> Project settings -> Service accounts -> Generate new private key.`);
  process.exit(1);
}

const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const writeCsv = (file, header, rows) => {
  const body = [header.join(",")]
    .concat(rows.map((r) => header.map((h) => csvCell(r[h])).join(",")))
    .join("\n");
  fs.writeFileSync(file, body + "\n", "utf8");
  console.log(`  ${file}  (${rows.length} rows)`);
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const annotators = [], original = [], generated = [], panel = [];
  const users = await db.collection("users").get();

  for (const u of users.docs) {
    const p = u.data();
    annotators.push({
      uid: u.id,
      roll_no: p.rollNo,
      name: p.name,
      gender: p.gender,
      email: p.email,
      assigned_books: (ASSIGNMENTS[String(p.rollNo || "").toLowerCase()] || []).join(" "),
      books_complete: Object.values(p.progress || {}).filter((x) => x.complete).length,
      submitted: !!(p.submitted && p.submitted.at),
      submitted_at: p.submitted && p.submitted.at ? p.submitted.at.toDate().toISOString() : "",
      created_at: p.createdAt ? p.createdAt.toDate().toISOString() : "",
    });

    const responses = await u.ref.collection("responses").get();
    for (const r of responses.docs) {
      const d = r.data();
      const bookId = r.id;
      const common = { uid: u.id, roll_no: p.rollNo, gender: p.gender, book_id: bookId };
      const updated = d.updatedAt ? d.updatedAt.toDate().toISOString() : "";

      original.push({
        ...common,
        rating: d.original?.rating ?? "",
        confidence: d.original?.confidence ?? "",
        reason: d.original?.reason ?? "",
        book_complete: d.progress?.complete ?? false,
        updated_at: updated,
      });

      for (const [promptId, row] of Object.entries(d.rows || {})) {
        for (const [cover, rating] of Object.entries(row.ratings || {})) {
          generated.push({
            ...common,
            prompt_id: promptId,
            cover_id: `${promptId}_${cover}`,
            cover_index: Number(String(cover).replace("c", "")),
            rating: rating ?? "",
            rank_in_row: row.ranks?.[cover] ?? "",
            row_confidence: row.confidence ?? "",
            // split in two; `reason` is the pre-split field, kept so older
            // responses still export rather than coming back blank
            row_reason_rating: row.reasonRating ?? row.reason ?? "",
            row_reason_rank: row.reasonRank ?? "",
            updated_at: updated,
          });
        }
      }

      (d.panel?.selected || []).forEach((coverId, i) => {
        panel.push({
          ...common,
          panel_rank: i + 1,
          cover_id: coverId,
          is_original: coverId === "original",
          panel_confidence: d.panel?.confidence ?? "",
          panel_reason: d.panel?.reason ?? "",
          updated_at: updated,
        });
      });
    }
    console.log(`fetched ${p.rollNo} (${responses.size} books)`);
  }

  console.log("\nwriting:");
  writeCsv(path.join(outDir, "annotators.csv"),
    ["uid","roll_no","name","gender","email","assigned_books","books_complete","submitted","submitted_at","created_at"], annotators);
  writeCsv(path.join(outDir, "original.csv"),
    ["uid","roll_no","gender","book_id","rating","confidence","reason","book_complete","updated_at"], original);
  writeCsv(path.join(outDir, "generated.csv"),
    ["uid","roll_no","gender","book_id","prompt_id","cover_id","cover_index","rating","rank_in_row","row_confidence","row_reason_rating","row_reason_rank","updated_at"], generated);
  writeCsv(path.join(outDir, "panel.csv"),
    ["uid","roll_no","gender","book_id","panel_rank","cover_id","is_original","panel_confidence","panel_reason","updated_at"], panel);

  console.log(`\ndone — ${annotators.length} annotators`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
