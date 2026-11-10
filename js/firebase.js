// Firebase initialisation + thin helpers used by every page.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
};

/** Redirect to login if signed out; otherwise hand back {user, profile}. */
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        location.replace("index.html");
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        await signOut(auth);
        location.replace("index.html");
        return;
      }
      resolve({ user, profile: snap.data() });
    });
  });
}

export function friendlyAuthError(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in.",
    "auth/invalid-email": "That email address does not look valid.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/user-not-found": "No account found for that email.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
    "auth/network-request-failed": "Network problem. Check your connection.",
    "auth/operation-not-allowed":
      "Email/password sign-in is not enabled in the Firebase console.",
  };
  return map[code] || (err && err.message) || "Something went wrong.";
}
