#!/usr/bin/env node
/**
 * Set a new password directly, or send a reset link — for annotators who are
 * locked out and cannot use the "Forgot password?" link themselves (wrong
 * email at signup, mail not arriving, no access to that inbox).
 *
 * Nobody can RETRIEVE an existing password: Firebase stores only a salted
 * hash. The only options are to replace it or to email a reset link.
 *
 *   npm install firebase-admin
 *
 *   # look someone up by roll number or email
 *   node tools/reset_password.js --key serviceAccountKey.json --roll 2221cs28
 *
 *   # set a new password you then tell them in person
 *   node tools/reset_password.js --key serviceAccountKey.json --roll 2221cs28 --password "newpass123"
 *
 *   # or generate one
 *   node tools/reset_password.js --key serviceAccountKey.json --email u@x.com --generate
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes("--" + n);

const keyPath = arg("key", "serviceAccountKey.json");
const roll = arg("roll");
const email = arg("email");
let password = arg("password");

if (!roll && !email) {
  console.error("Pass --roll <rollNo> or --email <address>. Add --help for examples.");
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error(`Service account key not found at ${keyPath}.
Firebase console -> Project settings -> Service accounts -> Generate new private key.`);
  process.exit(1);
}

// firebase-admin v14 dropped the old namespace API; support both.
let initializeApp, cert, getFirestore, getAuth;
try {
  ({ initializeApp, cert } = require("firebase-admin/app"));
  ({ getFirestore } = require("firebase-admin/firestore"));
  ({ getAuth } = require("firebase-admin/auth"));
} catch {
  const admin = require("firebase-admin");
  if (!admin.credential) {
    console.error("Reinstall firebase-admin:  npm install firebase-admin");
    process.exit(1);
  }
  initializeApp = admin.initializeApp;
  cert = admin.credential.cert;
  getFirestore = () => admin.firestore();
  getAuth = () => admin.auth();
}

initializeApp({ credential: cert(require(path.resolve(keyPath))) });
const db = getFirestore();
const auth = getAuth();

(async () => {
  let user;

  if (email) {
    try { user = await auth.getUserByEmail(email); }
    catch { console.error(`No account with email ${email}.`); process.exit(1); }
  } else {
    // roll -> uid via the profile documents
    const snap = await db.collection("users").where("rollNo", "==", roll.toLowerCase()).get();
    if (snap.empty) {
      console.error(`No profile with roll number "${roll.toLowerCase()}".`);
      process.exit(1);
    }
    if (snap.size > 1) console.warn(`${snap.size} profiles share that roll number; using the first.`);
    const uid = snap.docs[0].data().uid || snap.docs[0].id;
    try { user = await auth.getUser(uid); }
    catch {
      console.error(`Profile exists for ${roll} but its auth account (uid ${uid}) is gone.`);
      console.error("Delete users/" + uid + " and rolls/" + roll.toLowerCase() + ", then have them sign up again.");
      process.exit(1);
    }
  }

  console.log(`account : ${user.email}`);
  console.log(`uid     : ${user.uid}`);
  console.log(`created : ${user.metadata.creationTime}`);
  console.log(`last in : ${user.metadata.lastSignInTime || "never"}`);

  if (has("generate")) {
    password = crypto.randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "") + "99";
  }

  if (!password) {
    console.log("\nNo --password given, so nothing was changed.");
    console.log("Add --password \"newpass123\" to set one, or --generate to make one up,");
    console.log("or --send-link to email them a reset link instead.");
    if (has("send-link")) {
      const link = await auth.generatePasswordResetLink(user.email);
      console.log("\nreset link (send this to them yourself):\n" + link);
    }
    process.exit(0);
  }

  if (password.length < 6) {
    console.error("\nFirebase requires at least 6 characters.");
    process.exit(1);
  }

  await auth.updateUser(user.uid, { password });
  console.log(`\npassword changed. Tell them:\n  email    ${user.email}\n  password ${password}`);
  console.log("\nAsk them to change it after logging in — this travelled through you.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
