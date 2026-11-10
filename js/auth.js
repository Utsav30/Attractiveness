import { CONFIG } from "./config.js";
import { assignBooks } from "./assign.js";
import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  deleteUser, onAuthStateChanged, doc, setDoc, deleteDoc, serverTimestamp,
  friendlyAuthError,
} from "./backend.js";

document.getElementById("studyName").textContent = CONFIG.STUDY_NAME;

// Already signed in? Go straight to the dashboard.
let signingUp = false;
onAuthStateChanged(auth, (user) => {
  if (user && !signingUp) location.replace("dashboard.html");
});

// ----------------------------- tab switching -----------------------------
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginPane = document.getElementById("loginPane");
const signupPane = document.getElementById("signupPane");

tabLogin.onclick = () => {
  tabLogin.classList.add("active"); tabSignup.classList.remove("active");
  loginPane.hidden = false; signupPane.hidden = true;
};
tabSignup.onclick = () => {
  tabSignup.classList.add("active"); tabLogin.classList.remove("active");
  signupPane.hidden = false; loginPane.hidden = true;
};

function showError(el, msg) { el.textContent = msg; el.hidden = false; }
function clearError(el) { el.hidden = true; }

// --------------------------------- login ---------------------------------
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  clearError(loginError);
  const btn = document.getElementById("loginBtn");
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value
    );
    location.replace("dashboard.html");
  } catch (err) {
    showError(loginError, friendlyAuthError(err));
    btn.disabled = false; btn.textContent = "Log in";
  }
};

// -------------------------------- signup ---------------------------------
const signupForm = document.getElementById("signupForm");
const signupError = document.getElementById("signupError");
const rollInput = document.getElementById("suRoll");

// Force lowercase as the user types.
rollInput.addEventListener("input", () => {
  const pos = rollInput.selectionStart;
  rollInput.value = rollInput.value.toLowerCase().replace(/\s+/g, "");
  rollInput.setSelectionRange(pos, pos);
});

signupForm.onsubmit = async (e) => {
  e.preventDefault();
  clearError(signupError);
  const btn = document.getElementById("signupBtn");

  const name = document.getElementById("suName").value.trim();
  const rollNo = rollInput.value.trim().toLowerCase();
  const gender = document.getElementById("suGender").value;
  const email = document.getElementById("suEmail").value.trim();
  const password = document.getElementById("suPassword").value;

  if (!/^[a-z0-9_\-]{3,20}$/.test(rollNo)) {
    return showError(signupError,
      "Roll number must be lowercase letters, digits, - or _ (3–20 characters).");
  }

  btn.disabled = true; btn.textContent = "Creating…";
  signingUp = true;
  let cred = null, profileWritten = false;
  try {
    // 1. Load the book pool and work out this person's books.
    const pool = await fetch("data/books.json").then((r) => r.json());
    const assignedBooks = assignBooks(rollNo, pool, CONFIG.BOOKS_PER_USER);

    // 2. Create the auth account.
    cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // 3. Profile document. Books are frozen at signup, so editing the pool
    //    later never reshuffles an annotator mid-study.
    await setDoc(doc(db, "users", uid), {
      uid, name, rollNo, gender, email,
      assignedBooks,
      progress: {},
      createdAt: serverTimestamp(),
    });
    profileWritten = true;

    // 4. Claim the roll number LAST. Security rules allow create only, so this
    //    fails if the roll is taken — that is the duplicate check, done
    //    server-side without exposing the roll list.
    //
    //    Claiming last matters: if an earlier step fails we have not reserved
    //    anything, so a half-finished signup can never leave a roll number
    //    locked against a real person.
    await setDoc(doc(db, "rolls", rollNo), { uid, createdAt: serverTimestamp() });

    signingUp = false;
    location.replace("dashboard.html");
  } catch (err) {
    console.error(err);
    // Roll back everything this attempt created, so retrying is clean.
    if (profileWritten && cred) await deleteDoc(doc(db, "users", cred.user.uid)).catch(() => {});
    if (cred) await deleteUser(cred.user).catch(() => {});
    signingUp = false;
    btn.disabled = false; btn.textContent = "Create account";

    const taken = err && (err.code === "permission-denied" ||
                          /insufficient permissions/i.test(err.message || ""));
    showError(signupError, taken
      ? "That roll number is already registered to another account. " +
        "Log in with the email you first used, or ask the study owner to free it."
      : friendlyAuthError(err));
  }
};
