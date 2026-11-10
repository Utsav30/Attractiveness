// ---------------------------------------------------------------------------
// Study configuration. Edit this file, not the rest of the code.
// ---------------------------------------------------------------------------

export const CONFIG = {
  STUDY_NAME: "Book Cover Attractiveness Study",

  BOOKS_PER_USER: 21,       // how many books each annotator gets
  COVERS_PER_PROMPT: 5,     // generated covers in each prompt row
  RATING_MAX: 10,           // attractiveness scale 1..RATING_MAX
  CONFIDENCE_MAX: 10,       // confidence scale 1..CONFIDENCE_MAX
  PANEL_TOP_N: 10,          // how many covers to pick in the final panel

  // Where the images live. Keep the trailing slash OFF.
  //   same repo (GitHub Pages)  ->  "images"
  //   Hugging Face dataset      ->  "https://huggingface.co/datasets/USER/REPO/resolve/main"
  //   Cloudflare R2 / any CDN   ->  "https://cdn.example.com/covers"
  IMAGE_BASE: "images",
  IMAGE_EXT: "jpg",

  // Autosave delay in milliseconds after the last edit.
  AUTOSAVE_MS: 1200,
};

// File naming convention inside IMAGE_BASE:
//   <IMAGE_BASE>/<bookId>/original.<ext>
//   <IMAGE_BASE>/<bookId>/<promptId>_c<n>.<ext>      e.g. b001/p07_c3.jpg
export function originalUrl(bookId) {
  return `${CONFIG.IMAGE_BASE}/${bookId}/original.${CONFIG.IMAGE_EXT}`;
}

export function generatedUrl(bookId, promptId, n) {
  return `${CONFIG.IMAGE_BASE}/${bookId}/${promptId}_c${n}.${CONFIG.IMAGE_EXT}`;
}

// A cover is identified by "original" or "<promptId>_c<n>" (e.g. "p07_c3").
export function coverUrl(bookId, coverId) {
  if (coverId === "original") return originalUrl(bookId);
  const [promptId, c] = coverId.split("_c");
  return generatedUrl(bookId, promptId, c);
}
