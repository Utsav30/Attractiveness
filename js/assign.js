// ---------------------------------------------------------------------------
// Book assignment.
//
// data/assignments.json is the ONLY source of truth:
//
//     { "2311ai01": ["b0001", "b0002"], "2311ai02": ["b0003"] }
//
// Keys are lowercased roll numbers, values are book ids from data/books.json.
// Nothing about the assignment is stored in Firestore, so editing the file
// changes what an annotator sees on their next page load — including accounts
// that already exist. A roll number the file does not list gets no books.
// ---------------------------------------------------------------------------

/**
 * Fetch data/assignments.json.
 *
 * Returns { map, problem, rolls }. `problem` is a human-readable string when
 * the file is missing or malformed, so an empty dashboard can say WHY it is
 * empty instead of looking broken. A missing file and a file with a stray
 * comma produce the same empty result otherwise, and they need different fixes.
 */
export async function loadAssignments() {
  let res;
  try {
    // no-store because GitHub Pages caches assets for ~10 minutes, and this is
    // the one file you edit expecting an immediate effect.
    res = await fetch("data/assignments.json", { cache: "no-store" });
  } catch (e) {
    return { map: {}, rolls: [], problem: `Could not load data/assignments.json (${e.message}).` };
  }

  if (!res.ok) {
    return {
      map: {}, rolls: [],
      problem: `data/assignments.json was not found (HTTP ${res.status}). ` +
               `Add it to the repo next to data/books.json.`,
    };
  }

  let map;
  const text = await res.text();
  try {
    map = JSON.parse(text);
  } catch (e) {
    return { map: {}, rolls: [], problem: `data/assignments.json is not valid JSON — ${e.message}` };
  }

  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {
      map: {}, rolls: [],
      problem: `data/assignments.json must be an object of "rollNo": [book ids], not an array.`,
    };
  }

  const rolls = Object.keys(map);
  console.info(
    `assignments.json loaded: ${rolls.length} roll number(s) — ${rolls.join(", ") || "(none)"}`
  );
  return { map, rolls, problem: null };
}

/**
 * The book ids this roll number may open. Empty array when the roll is not
 * listed — callers show an explanatory empty state rather than guessing.
 */
export function booksFor(rollNo, assignments) {
  const roll = String(rollNo || "").trim().toLowerCase();
  const listed = assignments && assignments[roll];
  if (!Array.isArray(listed)) return [];
  return [...new Set(listed.filter((id) => typeof id === "string" && id))];
}
