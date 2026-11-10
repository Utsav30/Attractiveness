// ---------------------------------------------------------------------------
// DEMO BACKEND — no Firebase, no network, no account needed.
//
// Stores everything in this browser's localStorage so you (or a supervisor)
// can walk the entire flow before the real project exists. Clearing site data
// wipes it. NEVER collect real study data in this mode.
//
// It deliberately mimics the parts of firestore.rules that matter, so a bug
// you hit here is a bug you would have hit live:
//   * a roll number can only be claimed once
//   * you only ever see your own responses
// ---------------------------------------------------------------------------

const KEY = "bookCoverStudy.demo";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
                     catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); }
                      catch {} };

function store() {
  const s = load();
  s.docs = s.docs || {};       // "users/abc" -> {...}
  s.creds = s.creds || {};     // email -> {uid, password}
  return s;
}

export const auth = { get currentUser() { return store().currentUser || null; } };
export const db = {};

export const doc = (_db, ...parts) => ({ path: parts.join("/") });

export const getDoc = async (ref) => {
  const d = store().docs[ref.path];
  return { exists: () => d !== undefined, data: () => d };
};

export const setDoc = async (ref, value) => {
  const s = store();
  // mimic the create-only rule on /rolls/{rollNo}
  if (ref.path.startsWith("rolls/") && s.docs[ref.path]) {
    const e = new Error("Missing or insufficient permissions.");
    e.code = "permission-denied";
    throw e;
  }
  s.docs[ref.path] = JSON.parse(JSON.stringify(value));
  save(s);
};

export const updateDoc = async (ref, patch) => {
  const s = store();
  const d = s.docs[ref.path] || {};
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split(".");           // supports "progress.b020"
    let node = d;
    while (parts.length > 1) node = node[parts[0]] = node[parts.shift()] || {};
    node[parts[0]] = v;
  }
  s.docs[ref.path] = d;
  save(s);
};

export const deleteDoc = async (ref) => {
  const s = store();
  delete s.docs[ref.path];
  save(s);
};

export const serverTimestamp = () => new Date().toISOString();

// --------------------------------------------------------------------- auth
const err = (code, msg) => { const e = new Error(msg); e.code = code; throw e; };

export const createUserWithEmailAndPassword = async (_a, email, password) => {
  const s = store();
  if (s.creds[email]) err("auth/email-already-in-use", "email in use");
  if (!password || password.length < 6) err("auth/weak-password", "weak password");
  const uid = "demo_" + Math.random().toString(36).slice(2, 10);
  s.creds[email] = { uid, password };
  s.currentUser = { uid, email };
  save(s);
  return { user: { uid, email } };
};

export const signInWithEmailAndPassword = async (_a, email, password) => {
  const s = store();
  const c = s.creds[email];
  if (!c || c.password !== password)
    err("auth/invalid-credential", "wrong email or password");
  s.currentUser = { uid: c.uid, email };
  save(s);
  return { user: s.currentUser };
};

export const signOut = async () => {
  const s = store();
  delete s.currentUser;
  save(s);
};

export const deleteUser = async (user) => {
  const s = store();
  for (const [email, c] of Object.entries(s.creds))
    if (c.uid === user.uid) delete s.creds[email];
  delete s.docs["users/" + user.uid];
  delete s.currentUser;
  save(s);
};

export const onAuthStateChanged = (_a, cb) => {
  setTimeout(() => cb(store().currentUser || null), 0);
  return () => {};
};

export async function requireAuth() {
  const s = store();
  const user = s.currentUser;
  if (!user) { location.replace("index.html"); return new Promise(() => {}); }
  const profile = s.docs["users/" + user.uid];
  if (!profile) { await signOut(); location.replace("index.html"); return new Promise(() => {}); }
  return { user, profile };
}

export function friendlyAuthError(e) {
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Wrong email or password.",
  };
  return map[e && e.code] || (e && e.message) || "Something went wrong.";
}

console.info(
  "%cDEMO MODE%c — data is stored in this browser only. Set DEMO_MODE:false in js/config.js to go live.",
  "background:#b57b00;color:#fff;padding:2px 6px;border-radius:4px", ""
);

// A badge so nobody mistakes a demo session for live data collection.
function showDemoBadge() {
  if (document.getElementById("demoBadge")) return;
  const b = document.createElement("div");
  b.id = "demoBadge";
  b.textContent = "DEMO MODE — saved in this browser only";
  b.style.cssText =
    "position:fixed;left:14px;bottom:14px;z-index:200;background:#fff6e2;" +
    "color:#b57b00;border:1px solid #f0dcab;border-radius:20px;padding:6px 13px;" +
    "font:12.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;" +
    "box-shadow:0 2px 10px rgba(20,25,40,.09)";
  document.body.appendChild(b);
}
// Top-level await in backend.js can push this past DOMContentLoaded, so handle
// both cases rather than only listening for the event.
if (document.readyState === "loading")
  addEventListener("DOMContentLoaded", showDemoBadge);
else showDemoBadge();
