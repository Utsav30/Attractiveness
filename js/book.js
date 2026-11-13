import { CONFIG, originalUrl, generatedUrl, coverUrl } from "./config.js";
import { emptyResponse, hydrate, rowDone, panelDone, originalDone, progressOf } from "./model.js";
import { booksFor, loadAssignments } from "./assign.js";
import {
  requireAuth, db, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "./backend.js";

// --------------------------------------------------------------- bootstrap
const bookId = new URLSearchParams(location.search).get("id");
if (!bookId) location.replace("dashboard.html");

const { user, profile } = await requireAuth();

// Same source of truth as the dashboard, so a book removed from
// assignments.json also stops being reachable by typing its id into the URL.
const allowed = booksFor(profile.rollNo, (await loadAssignments()).map);
if (!allowed.includes(bookId)) {
  alert("That book is not in your assigned set.");
  location.replace("dashboard.html");
  // Stall rather than throw: the page is navigating away, and an uncaught
  // error here would just litter the console on the way out.
  await new Promise(() => {});
}

/**
 * Load a JSON file and explain itself when it cannot. A missing or malformed
 * data file used to throw during module evaluation, which leaves a blank page
 * and no clue — the same failure mode assignments.json had.
 */
async function loadJson(path) {
  let res;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch (e) {
    throw new Error(`Could not load ${path} (${e.message}).`);
  }
  if (!res.ok) {
    throw new Error(
      `${path} was not found (HTTP ${res.status}). It must sit next to ` +
      `data/books.json in the repo.`
    );
  }
  try {
    return JSON.parse(await res.text());
  } catch (e) {
    throw new Error(
      `${path} is not valid JSON — ${e.message}. Remember: no // comments, ` +
      `no trailing commas, double quotes only.`
    );
  }
}

function fatal(message) {
  const box = document.createElement("div");
  box.style.cssText =
    "max-width:620px;margin:40px auto;background:#fff;border:1px solid #e3e6ec;" +
    "border-radius:12px;padding:24px;box-shadow:0 6px 18px rgba(20,25,40,.06);" +
    "font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  box.innerHTML =
    `<h1 style="margin:0 0 10px;font-size:19px">This book cannot be shown</h1>
     <p style="margin:0 0 16px;color:#9c2020;background:#fdecec;border:1px solid #f3c9c9;
        border-radius:9px;padding:10px 12px">${message}</p>
     <p style="margin:0"><a href="dashboard.html">&larr; Back to your books</a></p>`;
  const main = document.querySelector("main.page") || document.body;
  main.innerHTML = "";
  main.appendChild(box);
  throw new Error(message);
}

let books, prompts;
try {
  [books, prompts] = await Promise.all([
    loadJson("data/books.json"),
    loadJson("data/prompts.json"),
  ]);
} catch (e) {
  fatal(e.message);
}

if (!Array.isArray(prompts) || !prompts.length) {
  fatal("data/prompts.json must be a non-empty array of " +
        '{ "id": "p01", "text": "…" } entries, one per prompt row.');
}
const badPrompt = prompts.find((p) => !p || typeof p.id !== "string" || !p.id);
if (badPrompt) {
  fatal('Every entry in data/prompts.json needs a string "id" such as "p01". ' +
        `Found: ${JSON.stringify(badPrompt)}`);
}
if (!Array.isArray(books)) {
  fatal("data/books.json must be an array of book objects.");
}

const book = books.find((b) => b && b.id === bookId);
if (!book) {
  fatal(`"${bookId}" is listed in data/assignments.json but there is no book ` +
        `with that id in data/books.json. The ids must match exactly.`);
}

const respRef = doc(db, "users", user.uid, "responses", bookId);
const stored = await getDoc(respRef);
const state = hydrate(stored.exists() ? stored.data() : null, prompts);

document.querySelectorAll(".topn").forEach((e) => (e.textContent = CONFIG.PANEL_TOP_N));
document.getElementById("bookTitleTop").textContent = book.title;
document.title = `${book.title} — Book Cover Study`;

// ------------------------------------------------------------ saving layer
const saveState = document.getElementById("saveState");
let timer = null, saving = false, dirty = false;

function markDirty() {
  dirty = true;
  saveState.textContent = "Unsaved changes";
  saveState.className = "save-state dirty";
  clearTimeout(timer);
  timer = setTimeout(save, CONFIG.AUTOSAVE_MS);
}

async function save() {
  if (saving) return;
  clearTimeout(timer);
  saving = true;
  saveState.textContent = "Saving…";
  saveState.className = "save-state busy";
  try {
    const prog = progressOf(state, prompts);
    await setDoc(respRef, {
      ...state,
      bookId,
      rollNo: profile.rollNo,
      progress: prog,
      updatedAt: serverTimestamp(),
    });
    // keep a tiny summary on the user doc so the dashboard costs 1 read
    await updateDoc(doc(db, "users", user.uid), {
      [`progress.${bookId}`]: { pct: prog.pct, complete: prog.complete },
    });
    dirty = false;
    saveState.textContent = "Saved";
    saveState.className = "save-state ok";
  } catch (e) {
    console.error(e);
    saveState.textContent = "Save failed — retrying";
    saveState.className = "save-state err";
    setTimeout(save, 4000);
  } finally {
    saving = false;
  }
}

document.getElementById("saveNow").onclick = save;
document.getElementById("saveBottom").onclick = async () => {
  await save();
  location.href = "dashboard.html";
};
window.addEventListener("beforeunload", (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

// --------------------------------------------------------------- utilities
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function numberSelect(max, value, placeholder, onChange) {
  const s = el("select", "num");
  s.appendChild(new Option(placeholder, ""));
  for (let i = 1; i <= max; i++) s.appendChild(new Option(i, i));
  s.value = value == null ? "" : String(value);
  s.onchange = () => onChange(s.value === "" ? null : Number(s.value));
  return s;
}

function coverImg(src, caption) {
  const img = el("img");
  img.src = src;
  img.loading = "lazy";
  img.alt = caption;
  img.onerror = () => { img.classList.add("missing"); img.alt = "image missing"; };
  img.onclick = () => openLightbox(src, caption);
  return img;
}

// lightbox
const lb = document.getElementById("lightbox");
document.getElementById("lbClose").onclick = () => (lb.hidden = true);
lb.onclick = (e) => { if (e.target === lb) lb.hidden = true; };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.hidden = true; });
function openLightbox(src, cap) {
  document.getElementById("lbImg").src = src;
  document.getElementById("lbCap").textContent = cap;
  lb.hidden = false;
}

// ------------------------------------------------------------- book header
function renderHead() {
  const head = document.getElementById("bookHead");
  head.innerHTML = "";

  const left = el("div", "head-cover");
  left.appendChild(coverImg(originalUrl(bookId), `${book.title} — original cover`));
  left.appendChild(el("span", "cap", "Original cover"));

  const right = el("div", "head-info");
  right.appendChild(el("h1", null, esc(book.title)));
  // right.appendChild(el("p", "muted",
  //   `<strong>Author:</strong> ${esc(book.author)} &nbsp;·&nbsp;`)); 
  // right.appendChild(el("p", "muted", `<strong>Genre:</strong> ${esc(book.genre)} &nbsp;·&nbsp;`));
  // right.appendChild(el("p", "muted", `<strong>ID:</strong> ${esc(book.id)}`));
  const meta = el("div", "book-meta-list");
  meta.style.cssText =
    "display:grid;grid-template-columns:auto 1fr;gap:5px 12px;" +
    "margin:8px 0 0;font-size:14px;align-items:baseline";
  for (const [label, value] of [
    ["Author", book.author],
    ["Genre", book.genre],
    ["ID", book.id],
  ]) {
    const l = el("span", null, label);
    l.style.cssText = "color:var(--muted);font-weight:600;white-space:nowrap";
    const v = el("span", null, value ? esc(value) : "&mdash;");
    meta.append(l, v);
  }
  right.appendChild(meta);
  // Blurb / description, straight from data/books.json. Accepts either key
  // name, and renders paragraphs separated by a blank line. Styled inline so
  // this needs no change to css/styles.css.
  const blurb = String(book.blurb ?? "").trim();
  console.warn(blurb);
  if (blurb) {
    const box = el("div", "book-blurb");
    box.style.cssText =
      "margin-top:12px;padding:12px 14px;background:#f7f9fc;" +
      "border:1px solid var(--line);border-radius:10px";
    box.appendChild(el("div", null,
      '<strong style="font-size:12.5px;color:var(--muted);' +
      'text-transform:uppercase;letter-spacing:.04em">Description</strong>'));
    for (const para of blurb.split(/\n\s*\n/)) {
      const t = para.trim();
      if (!t) continue;
      const pEl = el("p", null, esc(t).replace(/\n/g, "<br />"));
      pEl.style.cssText = "margin:6px 0 0;font-size:14px;line-height:1.55";
      box.appendChild(pEl);
    }
    right.appendChild(box);
  } else {
    console.warn(
      `No description for "${bookId}" — add a "description" (or "blurb") ` +
      `field to its entry in data/books.json.`
    );
  }

  const box = el("div", "orig-rate");
  box.appendChild(el("h3", null, "Rate the original cover"));

  const r1 = el("div", "field");
  r1.appendChild(el("label", null, `Attractiveness (1–${CONFIG.RATING_MAX})`));
  r1.appendChild(numberSelect(CONFIG.RATING_MAX, state.original.rating, "–", (v) => {
    state.original.rating = v; markDirty(); refreshStatus();
  }));
  box.appendChild(r1);

  const r2 = el("div", "field");
  r2.appendChild(el("label", null, `Confidence (1–${CONFIG.CONFIDENCE_MAX})`));
  r2.appendChild(numberSelect(CONFIG.CONFIDENCE_MAX, state.original.confidence, "–", (v) => {
    state.original.confidence = v; markDirty(); refreshStatus();
  }));
  box.appendChild(r2);

  // Same free-text reasoning the prompt rows ask for, so the original cover is
  // not the one judgement with no explanation attached to it.
  const r3 = el("div", "field grow");
  r3.appendChild(el("label", null, "Why did you rate it this way?"));
  const ta = el("textarea");
  ta.rows = 2;
  ta.placeholder = "e.g. the type is confident and the colour palette suits the genre, but it is busy at thumbnail size…";
  ta.value = state.original.reason || "";
  ta.oninput = () => { state.original.reason = ta.value; markDirty(); refreshStatus(); };
  r3.appendChild(ta);
  box.appendChild(r3);

  right.appendChild(box);
  head.appendChild(left);
  head.appendChild(right);
}

// ---------------------------------------------------------------- step 1
function renderRows() {
  const pane = document.getElementById("rowsPane");
  pane.innerHTML = "";

  prompts.forEach((p, idx) => {
    const row = state.rows[p.id];
    const card = el("section", "card row-card");
    card.id = "row-" + p.id;

    const head = el("div", "row-head");
    head.appendChild(el("div", null,
      `<span class="rowno">${idx + 1}, ${p.task}</span>
       <span class="prompt-text">${esc(p.text)}</span>`));
    const tick = el("span", "row-tick");
    head.appendChild(tick);
    card.appendChild(head);

    const strip = el("div", "cover-strip");
    for (let i = 1; i <= CONFIG.COVERS_PER_PROMPT; i++) {
      const key = "c" + i;
      const cell = el("div", "cover-cell");
      cell.appendChild(coverImg(generatedUrl(bookId, p.id, i),
        `${book.title} — prompt ${idx + 1}, cover ${i}`));
      cell.appendChild(el("span", "cap", `Cover ${i}`));

      const f1 = el("div", "field tight");
      f1.appendChild(el("label", null, "Rating"));
      f1.appendChild(numberSelect(CONFIG.RATING_MAX, row.ratings[key], "–", (v) => {
        row.ratings[key] = v; markDirty(); refreshRow(p.id); refreshStatus();
      }));
      cell.appendChild(f1);

      const f2 = el("div", "field tight");
      f2.appendChild(el("label", null, "Rank"));
      const rk = numberSelect(CONFIG.COVERS_PER_PROMPT, row.ranks[key], "–", (v) => {
        row.ranks[key] = v; markDirty(); refreshRow(p.id); refreshStatus();
      });
      rk.classList.add("rank");
      rk.dataset.key = key;
      f2.appendChild(rk);
      cell.appendChild(f2);

      strip.appendChild(cell);
    }
    card.appendChild(strip);

    const foot = el("div", "row-foot");

    const fc = el("div", "field");
    fc.appendChild(el("label", null, `Confidence in this row (1–${CONFIG.CONFIDENCE_MAX})`));
    fc.appendChild(numberSelect(CONFIG.CONFIDENCE_MAX, row.confidence, "–", (v) => {
      row.confidence = v; markDirty(); refreshRow(p.id); refreshStatus();
    }));
    foot.appendChild(fc);

    // Two separate boxes: the scores and the ordering are different judgements
    // and people explain them differently.
    const reasonBox = (label, key, placeholder) => {
      const f = el("div", "field grow");
      f.appendChild(el("label", null, label));
      const ta = el("textarea");
      ta.rows = 2;
      ta.placeholder = placeholder;
      ta.value = row[key] || "";
      ta.oninput = () => { row[key] = ta.value; markDirty(); refreshRow(p.id); refreshStatus(); };
      f.appendChild(ta);
      return f;
    };

    foot.appendChild(reasonBox(
      "Why did you rate them this way?", "reasonRating",
      "e.g. Cover 3 reads clearly at thumbnail size; covers 1 and 4 have muddy typography…"));

    foot.appendChild(reasonBox(
      "Why did you rank them this way?", "reasonRank",
      "e.g. I put 3 first because the title is legible before anything else draws the eye…"));

    card.appendChild(foot);
    card.appendChild(el("p", "rank-warn", "This row has a duplicate rank saved from an earlier version — pick each rank 1–" + CONFIG.COVERS_PER_PROMPT + " once."));
    pane.appendChild(card);
  });

  prompts.forEach((p) => refreshRow(p.id));
}

function refreshRow(promptId) {
  const row = state.rows[promptId];
  const card = document.getElementById("row-" + promptId);
  if (!card) return;

  // A rank chosen on one cover is removed from the other dropdowns, so a row
  // can only ever hold a true 1..N permutation and the remaining choices are
  // the only ones shown.
  const used = new Set(
    Object.values(row.ranks).filter((v) => v != null && v !== "").map(String)
  );
  const counts = {};
  Object.values(row.ranks).forEach((v) => { if (v) counts[v] = (counts[v] || 0) + 1; });
  let dup = false;

  card.querySelectorAll("select.rank").forEach((sel) => {
    const mine = row.ranks[sel.dataset.key];
    const mineStr = mine == null ? "" : String(mine);

    // Build the list this dropdown should offer: the blank placeholder, this
    // cover's own current rank, and any rank no other cover has taken.
    const wanted = [""];
    for (let i = 1; i <= CONFIG.COVERS_PER_PROMPT; i++) {
      const v = String(i);
      if (!used.has(v) || v === mineStr) wanted.push(v);
    }

    // Only touch the DOM when the list actually differs, so reopening a
    // dropdown does not fight with the rebuild.
    const current = [...sel.options].map((o) => o.value);
    if (current.join(",") !== wanted.join(",")) {
      sel.innerHTML = "";
      for (const v of wanted) sel.appendChild(new Option(v === "" ? "–" : v, v));
    }
    sel.value = mineStr;

    // Duplicates cannot be produced through the UI, but responses saved before
    // this change may still contain them, so keep flagging them.
    const bad = mine && counts[mine] > 1;
    sel.classList.toggle("bad", !!bad);
    if (bad) dup = true;
  });
  card.querySelector(".rank-warn").style.display = dup ? "block" : "none";

  const done = rowDone(row);
  card.classList.toggle("row-done", done);
  card.querySelector(".row-tick").textContent = done ? "✓ complete" : "incomplete";
  card.querySelector(".row-tick").className = "row-tick " + (done ? "ok" : "no");
}

// ---------------------------------------------------------------- step 2
function allCoverIds() {
  const ids = ["original"];
  prompts.forEach((p) => {
    for (let i = 1; i <= CONFIG.COVERS_PER_PROMPT; i++) ids.push(`${p.id}_c${i}`);
  });
  return ids;
}

function coverLabel(id) {
  if (id === "original") return "Original";
  const [pid, c] = id.split("_c");
  const idx = prompts.findIndex((p) => p.id === pid) + 1;
  return `P${idx}·C${c}`;
}

function renderPanel() {
  const pane = document.getElementById("panelPane");
  pane.innerHTML = "";

  const intro = el("section", "card");
  intro.appendChild(el("h2", null, `Pick the ${CONFIG.PANEL_TOP_N} most attractive covers`));
  // intro.appendChild(el("p", "muted",
  //   `All ${1 + prompts.length * CONFIG.COVERS_PER_PROMPT} covers for this book are below — the original plus every generated one. Click to select up to ${CONFIG.PANEL_TOP_N}. Selected covers appear in the ranking list on the right; reorder them so rank 1 is the most attractive.`));
  pane.appendChild(intro);

  const wrap = el("div", "panel-wrap");

  const gridCard = el("section", "card");
  const grid = el("div", "panel-grid");
  grid.id = "panelGrid";
  allCoverIds().forEach((id) => {
    const cell = el("button", "panel-cell");
    cell.type = "button";
    cell.dataset.id = id;
    const img = el("img");
    img.src = coverUrl(bookId, id);
    img.loading = "lazy";
    img.alt = coverLabel(id);
    img.onerror = () => { img.classList.add("missing"); };
    cell.appendChild(img);
    cell.appendChild(el("span", "panel-cap", coverLabel(id)));
    cell.appendChild(el("span", "panel-rank"));
    cell.onclick = () => toggleSelect(id);
    grid.appendChild(cell);
  });
  gridCard.appendChild(grid);
  wrap.appendChild(gridCard);

  const side = el("aside", "card panel-side");
  side.innerHTML = `<h3>Your ranking <span class="muted" id="selCount"></span></h3>`;
  const list = el("ol", "sel-list");
  list.id = "selList";
  side.appendChild(list);

  const fc = el("div", "field");
  fc.appendChild(el("label", null, `Confidence in this ranking (1–${CONFIG.CONFIDENCE_MAX})`));
  fc.appendChild(numberSelect(CONFIG.CONFIDENCE_MAX, state.panel.confidence, "–", (v) => {
    state.panel.confidence = v; markDirty(); refreshPanel(); refreshStatus();
  }));
  side.appendChild(fc);

  const fr = el("div", "field");
  fr.appendChild(el("label", null, "Why did you interpret them this way?"));
  const ta = el("textarea");
  ta.rows = 5;
  ta.placeholder = "Explain what made your top picks attractive — composition, colour, typography, genre fit, how well they read as a thumbnail…";
  ta.value = state.panel.reason || "";
  ta.oninput = () => { state.panel.reason = ta.value; markDirty(); refreshPanel(); refreshStatus(); };
  fr.appendChild(ta);
  side.appendChild(fr);

  side.appendChild(el("p", "panel-status", ""));
  wrap.appendChild(side);
  pane.appendChild(wrap);

  refreshPanel();
}

function toggleSelect(id) {
  const sel = state.panel.selected;
  const i = sel.indexOf(id);
  if (i >= 0) sel.splice(i, 1);
  else if (sel.length < CONFIG.PANEL_TOP_N) sel.push(id);
  else { flash(`You can only pick ${CONFIG.PANEL_TOP_N}. Remove one first.`); return; }
  markDirty(); refreshPanel(); refreshStatus();
}

function move(id, dir) {
  const sel = state.panel.selected;
  const i = sel.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sel.length) return;
  [sel[i], sel[j]] = [sel[j], sel[i]];
  markDirty(); refreshPanel();
}

function refreshPanel() {
  const sel = state.panel.selected;

  document.querySelectorAll(".panel-cell").forEach((c) => {
    const pos = sel.indexOf(c.dataset.id);
    c.classList.toggle("selected", pos >= 0);
    c.querySelector(".panel-rank").textContent = pos >= 0 ? pos + 1 : "";
  });

  const list = document.getElementById("selList");
  if (!list) return;
  list.innerHTML = "";
  sel.forEach((id, i) => {
    const li = el("li", "sel-item");
    li.innerHTML = `
      <img src="${coverUrl(bookId, id)}" alt="" loading="lazy" />
      <span class="sel-label">${coverLabel(id)}</span>`;
    const ctr = el("span", "sel-ctrl");
    const up = el("button", "mini", "▲"); up.type = "button";
    up.disabled = i === 0; up.onclick = () => move(id, -1);
    const dn = el("button", "mini", "▼"); dn.type = "button";
    dn.disabled = i === sel.length - 1; dn.onclick = () => move(id, 1);
    const rm = el("button", "mini x", "✕"); rm.type = "button";
    rm.onclick = () => toggleSelect(id);
    ctr.append(up, dn, rm);
    li.appendChild(ctr);
    list.appendChild(li);
  });
  for (let i = sel.length; i < CONFIG.PANEL_TOP_N; i++) {
    list.appendChild(el("li", "sel-item empty", `<span class="muted">rank ${i + 1} — not chosen yet</span>`));
  }

  document.getElementById("selCount").textContent =
    `${sel.length}/${CONFIG.PANEL_TOP_N} chosen`;

  const st = document.querySelector(".panel-status");
  if (st) {
    const ok = panelDone(state.panel);
    st.textContent = ok ? "✓ Final panel complete" : "Still missing something above.";
    st.className = "panel-status " + (ok ? "ok" : "no");
  }
}

// ------------------------------------------------------------ tabs/status
const tabRows = document.getElementById("tabRows");
const tabPanel = document.getElementById("tabPanel");
const rowsPane = document.getElementById("rowsPane");
const panelPane = document.getElementById("panelPane");

tabRows.onclick = () => {
  tabRows.classList.add("active"); tabPanel.classList.remove("active");
  rowsPane.hidden = false; panelPane.hidden = true;
  window.scrollTo({ top: 0 });
};
tabPanel.onclick = () => {
  tabPanel.classList.add("active"); tabRows.classList.remove("active");
  panelPane.hidden = false; rowsPane.hidden = true;
  window.scrollTo({ top: 0 });
};

function refreshStatus() {
  const rowsOk = prompts.filter((p) => rowDone(state.rows[p.id])).length;
  document.getElementById("pillRows").textContent =
    `${rowsOk + (originalDone(state) ? 1 : 0)}/${prompts.length}`;
  document.getElementById("pillPanel").textContent = panelDone(state.panel) ? "✓" : "—";
}

function flash(msg) {
  const n = el("div", "toast", msg);
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2600);
}

// ------------------------------------------------------------------- go
renderHead();
renderRows();
renderPanel();
refreshStatus();
saveState.textContent = "Saved";
saveState.className = "save-state ok";