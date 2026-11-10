// ---------------------------------------------------------------------------
// Study configuration. Edit this file, not the rest of the code.
// ---------------------------------------------------------------------------

export const CONFIG = {
  STUDY_NAME: "Assignment 2-B",

  // ---------------------------------------------------------------- DEMO ---
  // true  = no Firebase, no image files needed. Sign-ups and ratings are kept
  //         in your own browser only, and covers are drawn on the fly as
  //         coloured placeholders. Use this to look at the portal and show it
  //         to people before anything is set up.
  // false = live: real Firebase Auth + Firestore, real images from IMAGE_BASE.
  //         This is what you want in production.
  //
  // Flip this to false once you have pasted your keys into
  // js/firebase-config.js and added your covers. Never collect real study
  // data with DEMO_MODE on — it is not saved anywhere you can export.
  DEMO_MODE: false,

  // How many books each annotator gets is NOT set here — it is however many
  // ids you list for them in data/assignments.json.
  COVERS_PER_PROMPT: 4,     // generated covers in each prompt row (one per generator)
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
  if (CONFIG.DEMO_MODE) return fakeCover(bookId, "original");
  return `${CONFIG.IMAGE_BASE}/${bookId}/original.${CONFIG.IMAGE_EXT}`;
}

export function generatedUrl(bookId, promptId, n) {
  if (CONFIG.DEMO_MODE) return fakeCover(bookId, `${promptId}_c${n}`);
  return `${CONFIG.IMAGE_BASE}/${bookId}/${promptId}_c${n}.${CONFIG.IMAGE_EXT}`;
}

// A cover is identified by "original" or "<promptId>_c<n>" (e.g. "p07_c3").
export function coverUrl(bookId, coverId) {
  if (coverId === "original") return originalUrl(bookId);
  const [promptId, c] = coverId.split("_c");
  return generatedUrl(bookId, promptId, c);
}

// ------------------------------------------------------- demo placeholders
// Draws a deterministic coloured "cover" as an inline SVG, so DEMO_MODE needs
// no image files at all. Unused when DEMO_MODE is false.
function fakeCover(bookId, coverId) {
  const seed = [...(bookId + "|" + coverId)].reduce(
    (h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const hue = seed % 360;
  const isOrig = coverId === "original";
  const sat = isOrig ? 46 : 38 + (seed >> 9) % 22;
  const lum = isOrig ? 38 : 40 + (seed >> 17) % 26;
  const bg = `hsl(${hue} ${sat}% ${lum}%)`;
  const label = isOrig ? "ORIGINAL" : coverId.toUpperCase().replace("_C", " · C");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">
<rect width="400" height="600" fill="${bg}"/>
${isOrig ? '<rect x="12" y="12" width="376" height="576" fill="none" stroke="#fff" stroke-width="7"/>' : ""}
<rect x="44" y="118" width="312" height="30" fill="#fff" opacity=".92"/>
<rect x="44" y="166" width="214" height="20" fill="#fff" opacity=".72"/>
<circle cx="200" cy="350" r="86" fill="#fff" opacity=".88"/>
<rect x="68" y="486" width="264" height="22" fill="#fff" opacity=".8"/>
<text x="20" y="574" font-family="monospace" font-size="21" fill="#fff" opacity=".85">${bookId} ${label}</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
