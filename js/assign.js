// ---------------------------------------------------------------------------
// Deterministic book assignment from the roll number.
//
// Same roll number  -> same 21 books, every time, on any device.
// Different roll no -> a different (but overlapping) set, so every book in the
// pool collects a similar number of annotations and you still get overlap for
// inter-annotator agreement.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash. Stable across browsers, unlike Java-style hashCode. */
export function hashRoll(rollNo) {
  const s = String(rollNo).trim().toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Books available for assignment: anything not explicitly switched off. */
export function activeBooks(pool) {
  return pool.filter((b) => b && b.id && b.active !== false);
}

/**
 * Pick `count` distinct books out of `pool` using a rotation with a stride that
 * is coprime to the pool size. Guarantees no duplicates when count <= pool.
 * Returns an array of book ids.
 */
export function assignBooks(rollNo, pool, count) {
  const n = pool.length;
  if (n < count) {
    throw new Error(
      `Book pool has only ${n} books but each user needs ${count}. ` +
        `Add more books to data/books.json.`
    );
  }
  const h = hashRoll(rollNo);
  const start = h % n;

  // Find a stride coprime with n, derived from the hash so it varies per user.
  // Guard n < 3: (h % (n - 1)) divides by zero when the pool holds one book,
  // which yields NaN and indexes the pool out of bounds.
  let stride = 1;
  if (n > 2) {
    stride = (h % (n - 1)) + 1;
    for (let k = 0; k < n; k++) {
      if (gcd(stride, n) === 1) break;
      stride = (stride % (n - 1)) + 1;
    }
    if (gcd(stride, n) !== 1) stride = 1;
  }

  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(start + i * stride) % n].id);
  }
  return out;
}

/**
 * Resolve one annotator's book list.
 *
 * If data/assignments.json names this roll number, that list wins — use it when
 * you want to control coverage yourself (balanced blocks, a pilot subset,
 * deliberate overlap for inter-annotator agreement). Otherwise fall back to the
 * deterministic rotation above.
 *
 * `explicit` is the parsed assignments.json: { "<rollNo>": ["b001", ...] }.
 */
export function assignBooksFor(rollNo, pool, count, explicit) {
  const roll = String(rollNo).trim().toLowerCase();
  const listed = explicit && explicit[roll];

  if (Array.isArray(listed) && listed.length) {
    const known = new Set(pool.map((b) => b.id));
    const missing = listed.filter((id) => !known.has(id));
    if (missing.length) {
      throw new Error(
        `data/assignments.json gives ${roll} book ids that are not in ` +
        `data/books.json: ${missing.slice(0, 5).join(", ")}` +
        (missing.length > 5 ? ` (+${missing.length - 5} more)` : "")
      );
    }
    return [...new Set(listed)];
  }

  return assignBooks(roll, pool, count);
}

/**
 * What this annotator may actually open, right now.
 *
 * data/assignments.json is authoritative and is re-read on every page load, so
 * editing it changes what people see immediately — including accounts that
 * already exist. The list frozen into users/{uid} at signup is the fallback for
 * roll numbers the file does not mention, and stays as an audit record of what
 * was originally handed out.
 */
export function effectiveBooks(profile, overrides) {
  const roll = String(profile && profile.rollNo || "").trim().toLowerCase();
  const listed = overrides && overrides[roll];
  if (Array.isArray(listed) && listed.length) return [...new Set(listed)];
  return (profile && profile.assignedBooks) || [];
}

/** Fetch data/assignments.json, tolerating a missing file. */
export function loadAssignments() {
  return fetch("data/assignments.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}
