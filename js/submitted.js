import { requireAuth, auth, signOut } from "./backend.js";

const { profile } = await requireAuth();

// Reaching this page without having submitted means a stray link or a back
// button — send them back rather than claiming something that is not true.
if (!profile.submitted || !profile.submitted.at) {
  location.replace("dashboard.html");
}

const at = profile.submitted && profile.submitted.at;
const when = at && at.toDate ? at.toDate() : (at ? new Date(at) : null);
const books = (profile.submitted && profile.submitted.bookCount) || 0;

document.getElementById("doneDetail").textContent =
  `${profile.name} (${profile.rollNo}) — ${books} book${books === 1 ? "" : "s"} completed` +
  (when && !isNaN(when) ? ` on ${when.toLocaleString()}` : "") + ".";

document.getElementById("logoutBtn").onclick = async () => {
  await signOut(auth);
  location.replace("index.html");
};
