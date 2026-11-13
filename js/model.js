// ---------------------------------------------------------------------------
// Shape of one book's response document + completeness rules.
// Stored at: users/{uid}/responses/{bookId}
// ---------------------------------------------------------------------------
import { CONFIG } from "./config.js";

export function emptyResponse(prompts) {
  const rows = {};
  for (const p of prompts) {
    const ratings = {};
    const ranks = {};
    for (let i = 1; i <= CONFIG.COVERS_PER_PROMPT; i++) {
      ratings["c" + i] = null;
      ranks["c" + i] = null;
    }
    rows[p.id] = {
      ratings, ranks, confidence: null,
      reasonRating: "",   // why these scores
      reasonRank: "",     // why this ordering
    };
  }
  return {
    original: { rating: null, confidence: null, reason: "" },
    rows,
    panel: { selected: [], confidence: null, reason: "" },
  };
}

/** Merge a stored doc over the empty skeleton so missing keys never crash. */
export function hydrate(stored, prompts) {
  const base = emptyResponse(prompts);
  if (!stored) return base;
  if (stored.original) Object.assign(base.original, stored.original);
  if (typeof base.original.reason !== "string") base.original.reason = "";
  if (stored.rows) {
    for (const p of prompts) {
      const s = stored.rows[p.id];
      if (!s) continue;
      const t = base.rows[p.id];
      if (s.ratings) Object.assign(t.ratings, s.ratings);
      if (s.ranks) Object.assign(t.ranks, s.ranks);
      if (s.confidence != null) t.confidence = s.confidence;
      if (typeof s.reasonRating === "string") t.reasonRating = s.reasonRating;
      if (typeof s.reasonRank === "string") t.reasonRank = s.reasonRank;
      // Responses saved before the box was split carry a single `reason`.
      // Keep that text rather than losing it: it was written about the scores.
      if (typeof s.reason === "string" && s.reason && !t.reasonRating)
        t.reasonRating = s.reason;
    }
  }
  if (stored.panel) {
    base.panel.selected = Array.isArray(stored.panel.selected)
      ? stored.panel.selected.slice(0, CONFIG.PANEL_TOP_N)
      : [];
    base.panel.confidence = stored.panel.confidence ?? null;
    base.panel.reason = stored.panel.reason || "";
  }
  return base;
}

const filled = (v) => v !== null && v !== undefined && v !== "";

export function originalDone(r) {
  return filled(r.original.rating) &&
         filled(r.original.confidence) &&
         !!(r.original.reason && r.original.reason.trim());
}

export function rowDone(row) {
  const n = CONFIG.COVERS_PER_PROMPT;
  const ratings = Object.values(row.ratings);
  if (ratings.length !== n || !ratings.every(filled)) return false;
  const ranks = Object.values(row.ranks);
  if (!ranks.every(filled)) return false;
  // ranks must be a permutation of 1..n
  const set = new Set(ranks.map(Number));
  if (set.size !== n) return false;
  for (let i = 1; i <= n; i++) if (!set.has(i)) return false;
  if (!filled(row.confidence)) return false;
  if (!row.reasonRating || !row.reasonRating.trim()) return false;
  if (!row.reasonRank || !row.reasonRank.trim()) return false;
  return true;
}

export function panelDone(panel) {
  return (
    panel.selected.length === CONFIG.PANEL_TOP_N &&
    new Set(panel.selected).size === CONFIG.PANEL_TOP_N &&
    filled(panel.confidence) &&
    !!(panel.reason && panel.reason.trim())
  );
}

/** Returns {done, total, pct, complete} for a single book. */
export function progressOf(r, prompts) {
  let done = 0;
  const total = 1 + prompts.length + 1; // original + 15 rows + panel
  if (originalDone(r)) done++;
  for (const p of prompts) if (rowDone(r.rows[p.id])) done++;
  if (panelDone(r.panel)) done++;
  return { done, total, pct: Math.round((done / total) * 100), complete: done === total };
}
