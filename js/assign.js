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

/** Fetch data/assignments.json, tolerating a missing or malformed file. */
export function loadAssignments() {
  return fetch("data/assignments.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
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
