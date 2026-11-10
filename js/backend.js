// ---------------------------------------------------------------------------
// Picks the backend at load time.
//
//   CONFIG.DEMO_MODE === false  ->  real Firebase (js/backend-firebase.js)
//   CONFIG.DEMO_MODE === true   ->  browser-only fake (js/backend-demo.js)
//
// Every page imports from here, so flipping the flag in js/config.js is the
// only change needed to go between "just let me look at it" and live.
// ---------------------------------------------------------------------------
import { CONFIG } from "./config.js";

// Going live with placeholder keys produces an opaque SDK error at the moment
// someone tries to sign up ("auth/api-key-not-valid"). Catch it here instead,
// before Firebase loads, and say what is actually wrong.
if (!CONFIG.DEMO_MODE) {
  const { firebaseConfig } = await import("./firebase-config.js");
  const problems = checkFirebaseConfig(firebaseConfig);
  if (problems.length) {
    showSetupError(problems);
    throw new Error("Firebase config is not filled in: " + problems.join(" | "));
  }
}

function checkFirebaseConfig(c) {
  const out = [];
  if (!c || typeof c !== "object") return ["js/firebase-config.js does not export a firebaseConfig object."];

  for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
    const v = c[key];
    if (typeof v !== "string" || !v.trim()) {
      out.push(`"${key}" is missing or empty.`);
      continue;
    }
    if (/PASTE|YOUR_|XXXX|<.*>/i.test(v))
      out.push(`"${key}" is still the placeholder text ("${v}").`);
    else if (v !== v.trim())
      out.push(`"${key}" has stray spaces around it.`);
    else if (/^["']|["']$/.test(v))
      out.push(`"${key}" has extra quote marks inside the string.`);
  }

  const k = (c.apiKey || "").trim();
  if (k && !/PASTE|YOUR_/i.test(k) && !/^AIza[0-9A-Za-z_-]{35}$/.test(k))
    out.push(`"apiKey" does not look like a Firebase web API key — they start with ` +
             `"AIza" and are 39 characters. Yours is ${k.length} characters.`);

  const d = (c.authDomain || "").trim();
  if (d && !/PASTE|YOUR_/i.test(d) && !/^[a-z0-9-]+\.(firebaseapp\.com|web\.app)$/i.test(d))
    out.push(`"authDomain" is usually PROJECT_ID.firebaseapp.com — yours is "${d}".`);

  return out;
}

function showSetupError(problems) {
  const render = () => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;inset:0;z-index:999;background:#f7f8fa;overflow:auto;padding:40px 20px;" +
      "font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1d2330";
    box.innerHTML =
      `<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e3e6ec;
        border-radius:12px;padding:26px;box-shadow:0 6px 18px rgba(20,25,40,.06)">
        <h1 style="margin:0 0 6px;font-size:20px">Firebase is not configured yet</h1>
        <p style="color:#6b7488;margin:0 0 18px">
          <code>DEMO_MODE</code> is off, so the portal is trying to use a real Firebase
          project — but <code>js/firebase-config.js</code> is not filled in correctly.
        </p>
        <ul style="margin:0 0 18px;padding-left:20px">${
          problems.map((p) => `<li style="margin-bottom:6px">${p}</li>`).join("")
        }</ul>
        <p style="margin:0 0 8px"><strong>To fix it:</strong></p>
        <ol style="margin:0 0 18px;padding-left:20px;color:#3a4256">
          <li>Firebase console → gear icon → <strong>Project settings</strong>.</li>
          <li>Scroll to <strong>Your apps</strong>, pick your web app, choose <strong>Config</strong>.</li>
          <li>Copy the values into <code>js/firebase-config.js</code>, keeping the quotes.</li>
          <li>Commit and push, then hard-refresh this page (Ctrl/Cmd + Shift + R).</li>
        </ol>
        <p style="color:#6b7488;margin:0">
          Just looking around? Set <code>DEMO_MODE: true</code> in <code>js/config.js</code>
          to run without Firebase.
        </p>
      </div>`;
    document.body.appendChild(box);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", render);
  else render();
}

const impl = await import(
  CONFIG.DEMO_MODE ? "./backend-demo.js" : "./backend-firebase.js"
);

export const auth = impl.auth;
export const db = impl.db;
export const createUserWithEmailAndPassword = impl.createUserWithEmailAndPassword;
export const signInWithEmailAndPassword = impl.signInWithEmailAndPassword;
export const signOut = impl.signOut;
export const deleteUser = impl.deleteUser;
export const onAuthStateChanged = impl.onAuthStateChanged;
export const doc = impl.doc;
export const getDoc = impl.getDoc;
export const setDoc = impl.setDoc;
export const updateDoc = impl.updateDoc;
export const deleteDoc = impl.deleteDoc;
export const serverTimestamp = impl.serverTimestamp;
export const requireAuth = impl.requireAuth;
export const friendlyAuthError = impl.friendlyAuthError;
