#!/usr/bin/env node
/**
 * Find (and optionally remove) roll-number claims that no longer belong to a
 * real account.
 *
 * An earlier version of the signup code claimed the roll number BEFORE writing
 * the profile. If the profile write then failed, the claim stayed behind and
 * that roll number became unusable: signing up said "already registered" and
 * logging in said "wrong email or password", because no account existed.
 * Signup now claims the roll last, so no new orphans appear — this cleans up
 * any left over from before.
 *
 *   npm install firebase-admin
 *   node tools/fix_orphan_rolls.js --key serviceAccountKey.json          # report
 *   node tools/fix_orphan_rolls.js --key serviceAccountKey.json --fix    # delete
 */
const fs = require("fs");
const path = require("path");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const FIX = process.argv.includes("--fix");
const keyPath = arg("key", "serviceAccountKey.json");

if (!fs.existsSync(keyPath)) {
  console.error(`Service account key not found at ${keyPath}.
Firebase console -> Project settings -> Service accounts -> Generate new private key.`);
  process.exit(1);
}

const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();
const auth = admin.auth();

(async () => {
  const rolls = await db.collection("rolls").get();
  if (rolls.empty) { console.log("No roll claims at all."); process.exit(0); }

  const healthy = [], orphans = [];

  for (const r of rolls.docs) {
    const rollNo = r.id;
    const uid = r.data().uid;
    let reason = null;

    if (!uid) {
      reason = "claim has no uid";
    } else {
      const profile = await db.collection("users").doc(uid).get();
      let authUser = null;
      try { authUser = await auth.getUser(uid); } catch { /* deleted */ }

      if (!authUser && !profile.exists) reason = "no auth account and no profile";
      else if (!authUser) reason = "profile exists but the auth account is gone";
      else if (!profile.exists) reason = `auth account ${authUser.email} exists but has no profile`;
    }

    if (reason) orphans.push({ rollNo, uid, reason });
    else healthy.push({ rollNo, uid });
  }

  console.log(`${rolls.size} roll claims: ${healthy.length} healthy, ${orphans.length} orphaned\n`);

  if (healthy.length) {
    console.log("in use:");
    for (const h of healthy) {
      const p = (await db.collection("users").doc(h.uid).get()).data();
      console.log(`   ${h.rollNo.padEnd(12)} ${p.email}`);
    }
    console.log();
  }

  if (!orphans.length) {
    console.log("Nothing to clean up. If a roll number is still refused, it belongs to a");
    console.log("real account — log in with that account's email, or reset its password in");
    console.log("the Firebase console under Authentication > Users.");
    process.exit(0);
  }

  console.log("orphaned (blocking signup for no reason):");
  for (const o of orphans) console.log(`   ${o.rollNo.padEnd(12)} ${o.reason}`);

  if (!FIX) {
    console.log("\nRe-run with --fix to delete these claims and free the roll numbers.");
    process.exit(0);
  }

  for (const o of orphans) {
    await db.collection("rolls").doc(o.rollNo).delete();
    if (o.uid) await db.collection("users").doc(o.uid).delete().catch(() => {});
    console.log(`   freed ${o.rollNo}`);
  }
  console.log(`\ndone — ${orphans.length} roll numbers are available again.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
