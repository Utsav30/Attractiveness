import { CONFIG, originalUrl } from "./config.js";
import { booksFor, loadAssignments } from "./assign.js";
import { hydrate, progressOf } from "./model.js";
import {
  requireAuth, auth, signOut, db, doc, getDoc, updateDoc, serverTimestamp,
} from "./backend.js";

const { user, profile } = await requireAuth();

document.getElementById("brand").textContent = CONFIG.STUDY_NAME;
document.getElementById("whoami").textContent =
  ` — ${profile.name} (${profile.rollNo})`;
document.getElementById("logoutBtn").onclick = async () => {
  await signOut(auth);
  location.replace("index.html");
};

const [books, plan] = await Promise.all([
  fetch("data/books.json").then((r) => r.json()),
  loadAssignments(),
]);
const byId = Object.fromEntries(books.map((b) => [b.id, b]));

// The roll number's entry in data/assignments.json, read fresh on every load.
const assigned = booksFor(profile.rollNo, plan.map);
const progress = profile.progress || {};

const subline = document.getElementById("subline");
if (assigned.length) {
  subline.textContent =
    `${profile.rollNo}: Click a cover image to start.`;
} else {
  // Say exactly which of the three failure modes this is.
  subline.textContent = plan.problem
    ? plan.problem
    : `Roll number "${profile.rollNo}" is not listed in data/assignments.json. ` +
      `The file lists ${plan.rolls.length} roll number(s); add yours as a ` +
      `lowercase key, e.g. {"${profile.rollNo}": ["b0001"]}.`;
  subline.className = "error";
}

let completeCount = 0;
const grid = document.getElementById("grid");

assigned.forEach((bookId, idx) => {
  const b = byId[bookId] || { id: bookId, title: bookId, author: "—", genre: "—" };
  const p = progress[bookId] || { pct: 0, complete: false };
  if (p.complete) completeCount++;

  const a = document.createElement("a");
  a.className = "book-card " + (p.complete ? "done" : "todo");
  a.href = `book.html?id=${encodeURIComponent(bookId)}`;

  a.innerHTML = `
    <div class="thumb">
      <img src="${originalUrl(bookId)}" alt="${escapeHtml(b.title)}" loading="lazy"
           onerror="this.classList.add('missing'); this.alt='image missing';" />
      <span class="badge">${idx + 1}</span>
    </div>
    <div class="book-meta">
      <strong title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</strong>
      <span class="muted">${escapeHtml(b.author)}</span>
      <span class="chip">${escapeHtml(b.genre)}</span>
      <div class="mini-bar"><span style="width:${p.pct || 0}%"></span></div>
      <span class="muted small">${p.complete ? "All answered" : (p.pct || 0) + "% answered"}</span>
    </div>`;
  grid.appendChild(a);
});

const pct = assigned.length ? Math.round((completeCount / assigned.length) * 100) : 0;
document.getElementById("overallBar").style.width = pct + "%";
document.getElementById("overallText").textContent =
  `${completeCount} of ${assigned.length} finished (${pct}%)`;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------------
// Final submit
// ---------------------------------------------------------------------------
const submitBox = document.getElementById("submitBox");
const submitBtn = document.getElementById("submitBtn");
const submitStatus = document.getElementById("submitStatus");
const submitTitle = document.getElementById("submitTitle");
const submitHelp = document.getElementById("submitHelp");

if (assigned.length) submitBox.hidden = false;

function showStatus(msg, kind) {
  submitStatus.innerHTML = msg;
  submitStatus.className = "submit-status " + kind;
  submitStatus.hidden = false;
}

// Already submitted: say so and offer the confirmation page instead.
if (profile.submitted && profile.submitted.at) {
  submitTitle.textContent = "Assignment is submitted";
  submitHelp.textContent =
    "Your answers have been recorded. You can still look back over them.";
  submitBtn.textContent = "View confirmation";
  submitBtn.onclick = () => location.href = "submitted.html";
} else {
  submitBtn.onclick = finalSubmit;
}

/**
 * Re-check every assigned book against its stored response rather than
 * trusting the progress summary on the user document. The summary is a cached
 * mirror; a final submit should be decided by the actual answers.
 */
async function finalSubmit() {
  submitBtn.disabled = true;
  submitBtn.textContent = "Checking…";
  showStatus("Checking every book…", "busy");

  let prompts;
  try {
    prompts = await fetch("data/prompts.json", { cache: "no-store" }).then((r) => r.json());
  } catch {
    submitBtn.disabled = false; submitBtn.textContent = "Final submit";
    return showStatus("Could not read data/prompts.json, so nothing was checked.", "no");
  }

  const incomplete = [];
  const fresh = {};
  for (const bookId of assigned) {
    let snap;
    try {
      snap = await getDoc(doc(db, "users", user.uid, "responses", bookId));
    } catch (e) {
      submitBtn.disabled = false; submitBtn.textContent = "Final submit";
      return showStatus("Could not read your answers: " + e.message, "no");
    }
    const prog = progressOf(hydrate(snap.exists() ? snap.data() : null, prompts), prompts);
    fresh[bookId] = { pct: prog.pct, complete: prog.complete };
    if (!prog.complete) {
      const b = byId[bookId];
      incomplete.push({ bookId, title: (b && b.title) || bookId, done: prog.done, total: prog.total });
    }
  }

  // Repaint the borders from what we just measured, in case the cached
  // summary had drifted.
  updateCards(fresh);

  if (incomplete.length) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Final submit";
    const list = incomplete
      .map((x) => `<li><a href="book.html?id=${encodeURIComponent(x.bookId)}">` +
                  `${escapeHtml(x.title)}</a> — ${x.done} of ${x.total} parts done</li>`)
      .join("");
    return showStatus(
      `<strong>There is still task to be complete.</strong> ` +
      `${incomplete.length} of ${assigned.length} book(s) are unfinished:<ul>${list}</ul>`,
      "no");
  }

  showStatus("Everything is complete — submitting…", "busy");
  try {
    await updateDoc(doc(db, "users", user.uid), {
      progress: fresh,
      submitted: {
        at: serverTimestamp(),
        bookCount: assigned.length,
        books: assigned,
      },
    });
  } catch (e) {
    submitBtn.disabled = false; submitBtn.textContent = "Final submit";
    return showStatus("Could not save your submission: " + e.message, "no");
  }
  location.href = "submitted.html";
}

/** Repaint one card's border, bar and caption from a measured progress map. */
function updateCards(fresh) {
  let done = 0;
  document.querySelectorAll(".book-card").forEach((card) => {
    const id = decodeURIComponent(card.getAttribute("href").split("id=")[1]);
    const p = fresh[id];
    if (!p) return;
    if (p.complete) done++;
    card.className = "book-card " + (p.complete ? "done" : "todo");
    card.querySelector(".mini-bar span").style.width = (p.pct || 0) + "%";
    card.querySelector(".book-meta .small").textContent =
      p.complete ? "All answered" : (p.pct || 0) + "% answered";
  });
  const pc = assigned.length ? Math.round((done / assigned.length) * 100) : 0;
  document.getElementById("overallBar").style.width = pc + "%";
  document.getElementById("overallText").textContent =
    `${done} of ${assigned.length} books finished (${pc}%)`;
}
