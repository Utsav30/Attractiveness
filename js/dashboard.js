import { CONFIG, originalUrl } from "./config.js";
import { booksFor, loadAssignments } from "./assign.js";
import { requireAuth, auth, signOut } from "./backend.js";

const { profile } = await requireAuth();

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
    `${assigned.length} book${assigned.length === 1 ? "" : "s"} assigned to ` +
    `${profile.rollNo}. Click a cover to start rating.`;
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
  `${completeCount} of ${assigned.length} books finished (${pct}%)`;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
