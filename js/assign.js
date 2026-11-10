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
  let stride = (h % (n - 1)) + 1;
  for (let k = 0; k < n; k++) {
    if (gcd(stride, n) === 1) break;
    stride = (stride % (n - 1)) + 1;
  }
  if (gcd(stride, n) !== 1) stride = 1;

  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(start + i * stride) % n].id);
  }
  return out;
}
