import { CONFIG, originalUrl } from "./config.js";
import { requireAuth, auth, signOut } from "./backend.js";

const { profile } = await requireAuth();

document.getElementById("brand").textContent = CONFIG.STUDY_NAME;
document.getElementById("whoami").textContent =
  ` — ${profile.name} (${profile.rollNo})`;
document.getElementById("logoutBtn").onclick = async () => {
  await signOut(auth);
  location.replace("index.html");
};

const books = await fetch("data/books.json").then((r) => r.json());
const byId = Object.fromEntries(books.map((b) => [b.id, b]));
const assigned = profile.assignedBooks || [];
const progress = profile.progress || {};

document.getElementById("subline").textContent =
  `${assigned.length} books assigned from your roll number. Click a cover to start rating.`;

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
