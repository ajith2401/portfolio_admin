// Font registry: the ONE list of every font the Studio knows. render.js FONT_FAMILY, templates.js FONT_KEYS/FONT_LABELS,
// normalizeComposition's whitelist, requiredFaces/ensureFonts and the Look panel picker all derive from it.
//
// tier 'core'      = the five families the Studio has always shipped (their CSS stacks are unchanged byte-for-byte; the
//                    golden fixture depends on it). verified:true.
// tier 'approved'  = promoted 2026-11-27 after (1) a licence check (SIL OFL 1.1, file provenance recorded below), (2) an
//                    automated HarfBuzz/fontTools check (full Tamil block, no .notdef on the Tamil test corpus incl. ஸ்ரீ
//                    க்ஷ கொ கோ கௌ, pre-base vowel reordering, Latin for mixed text) and (3) a visual specimen review of the
//                    real rendering. verified:true = selectable in the normal picker. A review by a native Tamil reader on
//                    real Android/iOS devices is still RECOMMENDED (humanReview:'recommended'); it is not claimed done.
// tier 'candidate' = verified:false. Not selectable in normal mode, replaced (with a notice) by normalizeComposition unless
//                    the composition opted in via the explicit "Preview candidate fonts (not reviewed)" toggle, and every
//                    export with one carries fontReview:'unreviewed'. `reviewNote` says why it was held back.
// role: 'body' | 'display' | 'both'. A 'display' font is title/headline only: using it for body text is refused.
// loadable:false = cannot be self-hosted (see `why`); it can never be selected or exported.
// category: one of FONT_CATEGORIES (the font browser groups by it).
// Self-hosting: Google families through next/font/google (downloaded at BUILD time); Korkai/Panai/Vaagai/Neythal through
// next/font/local from the original, unmodified OFL files in app/admin/poem-motion-studio/fonts-local (OFL.txt beside
// them; RFN fonts are never subset/converted). No runtime request to any font CDN.

const OFL = "OFL (Google Fonts)";
const NEEDS_LICENCE = "needs human licence confirmation";
const LICENCE_CONFIRMED = "SIL OFL 1.1 confirmed from upstream OFL.txt + METADATA.pb (2026-11-27)";
const RMRL = "OFL (RMRL Tamil Font Studio, vendored)";
// upstream: provenance read from github.com/google/fonts on 2026-11-27 (METADATA.pb + OFL.txt of each family directory):
// every candidate is SIL OFL 1.1, has the Tamil subset, and no Reserved Font Name clause was found. This is RECORDED
// evidence for the human reviewer; it does not verify a font (rendering review by a Tamil reader is still required).

export const FONT_REGISTRY = Object.freeze([
  // ---- verified: the original five (stacks are the exact strings render.js has always used)
  {
    id: "noto-serif",
    tier: "core",
    category: "literary",
    label: "Noto Serif Tamil",
    family: '"Noto Serif Tamil", serif',
    weights: ["100-900 (variable)"],
    role: "both",
    verified: true,
    loadable: true,
    license: OFL,
    tamilSubset: true,
  },
  {
    id: "noto-sans",
    tier: "core",
    category: "editorial",
    label: "Noto Sans Tamil",
    family: '"Noto Sans Tamil", sans-serif',
    weights: ["100-900 (variable)"],
    role: "both",
    verified: true,
    loadable: true,
    license: OFL,
    tamilSubset: true,
  },
  {
    id: "hind-madurai",
    tier: "core",
    category: "editorial",
    label: "Hind Madurai",
    family: '"Hind Madurai", sans-serif',
    weights: [400, 500, 600, 700],
    role: "both",
    verified: true,
    loadable: true,
    license: OFL,
    tamilSubset: true,
  },
  {
    id: "anek",
    tier: "core",
    category: "editorial",
    label: "Anek Tamil",
    family: '"Anek Tamil", sans-serif',
    weights: ["100-800 (variable)"],
    role: "both",
    verified: true,
    loadable: true,
    license: OFL,
    tamilSubset: true,
  },
  {
    id: "tiro",
    tier: "core",
    category: "archival",
    label: "Tiro Tamil",
    family: '"Tiro Tamil", serif',
    weights: [400],
    role: "both",
    verified: true,
    loadable: true,
    license: OFL,
    tamilSubset: true,
  },
  // ---- Google Fonts families (approved or candidate, see tier), self-hosted by next/font/google at build time
  {
    id: "kavivanar",
    tier: "approved",
    category: "handwritten",
    label: "Kavivanar",
    family: '"Kavivanar", serif',
    weights: [400],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/kavivanar", licence: "SIL OFL 1.1", reservedName: false, category: "HANDWRITING", source: "github.com/enathu/kavivanar", note: "© 2015 Tharique Azeez" },
    tamilSubset: true,
  },
  {
    id: "mukta-malar",
    tier: "approved",
    category: "editorial",
    label: "Mukta Malar",
    family: '"Mukta Malar", sans-serif',
    weights: [400, 500, 600, 700],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/muktamalar", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/EkType/Mukta", note: "© 2016 Ek Type" },
    tamilSubset: true,
  },
  {
    id: "catamaran",
    tier: "approved",
    category: "editorial",
    label: "Catamaran",
    family: '"Catamaran", sans-serif',
    weights: ["100-900 (variable)"],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/catamaran", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/VanillaandCream/Catamaran-Tamil" },
    tamilSubset: true,
  },
  {
    id: "pavanam",
    tier: "approved",
    category: "editorial",
    label: "Pavanam",
    family: '"Pavanam", sans-serif',
    weights: [400],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/pavanam", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/enathu/pavanam" },
    tamilSubset: true,
  },
  {
    id: "baloo-thambi-2",
    tier: "approved",
    category: "rounded",
    label: "Baloo Thambi 2",
    family: '"Baloo Thambi 2", sans-serif',
    weights: ["400-800 (variable)"],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/baloothambi2", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/yanone/Baloo2-Variable" },
    tamilSubset: true,
  },
  {
    id: "meera-inimai",
    tier: "candidate",
    category: "rounded",
    reviewNote: 'Word spaces render very wide in the specimen review (gaps between words look like column breaks); held back.',
    label: "Meera Inimai",
    family: '"Meera Inimai", sans-serif',
    weights: [400],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/meerainimai", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/smc/Meera" },
    tamilSubset: true,
  },
  {
    id: "arima",
    tier: "approved",
    category: "calligraphic",
    label: "Arima",
    family: '"Arima", serif',
    weights: ["100-700 (variable)"],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/arima", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/NDISCOVER/Arima-Font" },
    tamilSubset: true,
  },
  {
    id: "arima-madurai",
    tier: "candidate",
    category: "calligraphic",
    reviewNote: 'Superseded upstream by Arima (approved).',
    label: "Arima Madurai",
    family: '"Arima Madurai", serif',
    weights: [],
    role: "both",
    verified: false,
    loadable: false,
    why: 'Not in the next/font/google catalogue of the installed Next.js (font-data.json); Google Fonts superseded it with "Arima". Loading it would need a runtime Google Fonts request or vendored font files, neither of which this project allows.',
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/arima", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/NDISCOVER/Arima-Font", note: "renamed upstream to Arima; no ofl/arimamadurai directory" },
    tamilSubset: true,
  },
  {
    id: "coiny",
    tier: "candidate",
    category: "bold-display",
    reviewNote: 'Visible gaps inside syllable clusters in the specimen review (e.g. அ ன்பின், தமி ழ்); held back until a Tamil reader confirms.',
    label: "Coiny",
    family: '"Coiny", sans-serif',
    weights: [400],
    role: "display",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/coiny", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/marcelommp/Coiny" },
    tamilSubset: true,
  },
  {
    id: "oi",
    tier: "approved",
    category: "bold-display",
    label: "Oi",
    family: '"Oi", serif',
    weights: [400],
    role: "display",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: OFL,
    licenseReview: LICENCE_CONFIRMED,
    upstream: { dir: "ofl/oi", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/kosbarts/Oi" },
    tamilSubset: true,
  },
  // ---- local OFL families (not on Google Fonts): original files + OFL.txt in fonts-local/<family>/
  {
    id: "korkai",
    tier: "approved",
    category: "literary",
    label: "Korkai",
    family: '"Korkai", serif',
    weights: [400, 500, 700],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: RMRL,
    upstream: { licence: "SIL OFL 1.1", reservedName: "Korkai", source: "tamilfontstudio.net/downloads/korkai_v1_0_0_3.zip", note: "© 2026 Roja Muthiah Research Library, Onemai Foundation. A slanted, high-contrast design (italicAngle -4 is the design, not a faux italic). Files: Regular/Medium/Bold, v1.0.0.3, unmodified." },
    tamilSubset: true,
  },
  {
    id: "panai",
    tier: "approved",
    category: "editorial",
    label: "Panai",
    family: '"Panai", sans-serif',
    weights: ["200-900 (variable)"],
    role: "display",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: RMRL,
    upstream: { licence: "SIL OFL 1.1", reservedName: "Panai", source: "tamilfontstudio.net/downloads/panai_v1_0_0_0.zip", note: "© 2026 Roja Muthiah Research Library, Onemai Foundation. Variable PanaiVF.ttf v1.0.0.0, unmodified. Title-only: the Latin set lacks quotation marks and the em dash." },
    tamilSubset: true,
  },
  {
    id: "vaagai",
    tier: "candidate",
    category: "archival",
    reviewNote: "Woodcut revival. In the specimen review அ reads close to உ and ர is hard to tell from the vowel sign ா at display sizes, and the Latin set lacks ; : ! ? quotes and brackets. Held back as a title-only candidate until a Tamil reader confirms legibility.",
    label: "Vaagai",
    family: '"Vaagai", serif',
    weights: [400],
    role: "display",
    verified: false,
    loadable: true,
    license: RMRL,
    upstream: { licence: "SIL OFL 1.1", reservedName: "Vaagai", source: "tamilfontstudio.net/downloads/vaagai_v1_0_0_0.zip", note: "© 2026 Roja Muthiah Research Library, Onemai Foundation. Vaagai-Regular.ttf v1.0.0.0, unmodified." },
    tamilSubset: true,
  },
  {
    id: "neythal",
    tier: "approved",
    category: "handwritten",
    label: "Neythal",
    family: '"Neythal", sans-serif',
    weights: [400],
    role: "both",
    verified: true,
    humanReview: "recommended",
    loadable: true,
    license: "OFL (vendored)",
    upstream: { licence: "SIL OFL 1.1", reservedName: false, source: "github.com/enathu/neythal-font (build/neythal-regular.ttf)", note: "© 2014 Tharique Azeez. Unmodified." },
    tamilSubset: true,
  },
]);

const BY_ID = new Map(FONT_REGISTRY.map((f) => [f.id, f]));
export const fontById = (id) => BY_ID.get(id) || null;
export const ALL_FONT_IDS = FONT_REGISTRY.map((f) => f.id);
/** Verified fonts: the default whitelist (templates, normal-mode picker, normalizeComposition). */
export const VERIFIED_FONT_IDS = FONT_REGISTRY.filter((f) => f.verified).map(
  (f) => f.id,
);
/** The original five: preloaded on open, and their title weight (700) is the legacy behaviour, never changed. */
export const CORE_FONT_IDS = FONT_REGISTRY.filter((f) => f.tier === "core").map((f) => f.id);
export const APPROVED_FONT_IDS = FONT_REGISTRY.filter((f) => f.tier === "approved").map((f) => f.id);
export const CANDIDATE_FONT_IDS = FONT_REGISTRY.filter((f) => !f.verified).map(
  (f) => f.id,
);
export const isVerifiedFont = (id) => fontById(id)?.verified === true;
export const isCandidateFont = (id) => fontById(id)?.verified === false;
export const canBody = (id) => ["body", "both"].includes(fontById(id)?.role);
export const canTitle = (id) =>
  ["display", "both"].includes(fontById(id)?.role);
/** id -> CSS family stack, for every registry font (render.js copies this into FONT_FAMILY). */
export const registryFamilies = () =>
  Object.fromEntries(FONT_REGISTRY.map((f) => [f.id, f.family]));
export const fontLabel = (id) => fontById(id)?.label || id;
export const CANDIDATE_LABEL = "Candidate – unreviewed";
export const CANDIDATE_TOGGLE_LABEL = "Preview candidate fonts (not reviewed)";
export const CANDIDATE_EXPORT_WARNING =
  "This export uses a candidate font that has NOT been reviewed by a Tamil reader. Check every line of the exported image/video against the poem before sharing.";

/**
 * Fonts the picker may offer: verified always; loadable candidates only when the preview toggle is on.
 * role 'body' lists body-capable fonts (display-only fonts are never offered for body text).
 */
export function selectableFonts({ preview = false, role = "body" } = {}) {
  return FONT_REGISTRY.filter(
    (f) =>
      (f.verified || (preview && f.loadable)) &&
      (role === "body" ? canBody(f.id) : canTitle(f.id)),
  ).map((f) => ({
    id: f.id,
    label: f.verified ? f.label : `${f.label} (${CANDIDATE_LABEL})`,
    verified: f.verified,
    tier: f.tier,
    category: f.category,
  }));
}

/**
 * Resolve the font ids a composition may keep. Pure; used by normalizeComposition.
 * Returns { font, titleFont, notices } — notices.unverifiedFont / notices.displayOnlyFont explain every replacement.
 * Unknown ids (not in the registry) fall back to the template font exactly as before (legacy behaviour).
 */
export function resolveFonts({ font, titleFont, preview = false, fallback }) {
  const notices = {};
  const usable = (id) => {
    const f = fontById(id);
    return !!f && (f.verified || (preview && f.loadable));
  };
  const why = (id) => {
    const f = fontById(id);
    if (!f.loadable)
      return `"${f.label}" cannot be loaded in this Studio (${f.why})`;
    return `"${f.label}" is a candidate font that has not been reviewed for Tamil`;
  };
  let body = fallback;
  if (fontById(font)) {
    if (!canBody(font))
      notices.displayOnlyFont = `"${fontLabel(font)}" is a display (title-only) font and cannot be used for poem text, so "${fontLabel(fallback)}" is used instead.`;
    else if (usable(font)) body = font;
    else
      notices.unverifiedFont = `${why(font)}, so "${fontLabel(fallback)}" is used instead. Turn on "${CANDIDATE_TOGGLE_LABEL}" to try it.`;
  }
  let title = null;
  if (titleFont != null && fontById(titleFont)) {
    if (!canTitle(titleFont)) title = null;
    else if (usable(titleFont)) title = titleFont;
    else
      notices.unverifiedFont = `${notices.unverifiedFont ? notices.unverifiedFont + " " : ""}Title font: ${why(titleFont)}, so the poem font is used for the title.`;
  }
  return { font: body, titleFont: title, notices };
}

/** 'unreviewed' when the composition draws with any candidate font, else null. */
export const fontReviewOf = (comp) =>
  [comp?.style?.font, comp?.style?.titleFont].some(
    (id) => id != null && isCandidateFont(id),
  )
    ? "unreviewed"
    : null;

/** Browser groups (typography spec 3). Every registry font has exactly one. */
export const FONT_CATEGORIES = Object.freeze([
  { id: "literary", label: "Elegant literary" },
  { id: "calligraphic", label: "Curved & calligraphic" },
  { id: "handwritten", label: "Handwritten" },
  { id: "archival", label: "Archival & vintage print" },
  { id: "rounded", label: "Rounded & soft" },
  { id: "bold-display", label: "Bold decorative display" },
  { id: "editorial", label: "Modern editorial" },
]);

/** Real weights a font ships (numbers; a variable range contributes the 100-steps inside 400..700). */
export function fontWeights(id) {
  const f = fontById(id);
  if (!f) return [];
  const out = new Set();
  for (const x of f.weights) {
    if (typeof x === "number") out.add(x);
    else {
      const m = /^(\d+)-(\d+)/.exec(String(x));
      if (m) for (let w = 100; w <= 900; w += 100) if (w >= Number(m[1]) && w <= Number(m[2])) out.add(w);
    }
  }
  return [...out].sort((a, b) => a - b);
}
export const fontHasWeight = (id, w) => fontWeights(id).includes(w);

/**
 * The weight actually drawn for `w` in font `id`: `w` when the font ships it, else the nearest real weight (ties go to the
 * lighter one). Never asks the browser for a weight the font lacks, so nothing is faux-bolded. Core fonts keep `w`
 * unchanged (legacy rendering is byte-identical).
 */
export function realWeight(id, w) {
  const f = fontById(id);
  if (!f || f.tier === "core") return w;
  const ws = fontWeights(id);
  if (!ws.length || ws.includes(w)) return w;
  return ws.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), ws[0]);
}
/** Weight of the title line: 700 (legacy) for core fonts, otherwise the font's real weight nearest 700. */
export const titleWeightOf = (st) => realWeight(st?.titleFont || st?.font, 700);

/** A heavy display face for poem text is hard to read over many lines: warn at this many lines. */
export const LONG_POEM_LINES = 12;
export function longPoemFontWarning(st, lineCount) {
  const id = st?.font;
  const f = fontById(id);
  if (!f || lineCount < LONG_POEM_LINES) return null;
  const heavy = f.category === "bold-display" || (Number(st.weight) >= 700 && f.category !== "literary");
  return heavy
    ? `"${f.label}" at weight ${st.weight} is a heavy face for a ${lineCount}-line poem. Consider a lighter weight or a literary/editorial font for the poem and keep this one for the title.`
    : null;
}

/** Evaluated and NOT added, with the reason (shown in the report; nothing here is loadable). */
export const EXCLUDED_FONTS = Object.freeze([
  { name: "Karla Tamil Upright", why: "No Latin glyphs: mixed Tamil/English text draws .notdef boxes. Google Fonts lists it as Early Access only." },
  { name: "Karla Tamil Inclined", why: "Same as Karla Tamil Upright (no Latin; Early Access)." },
  { name: "Aaram", why: "No verifiable source or licence could be found, so it cannot be added." },
  { name: "Arima Madurai", why: "Superseded upstream by Arima (which is approved); kept only as a non-loadable record." },
]);
/** Commercial Tamil fonts are reported, never bundled (no licence to redistribute). */
export const PAID_FONTS_NOTE =
  "Commercial Tamil faces (for example the paid Tamil families sold by type foundries) were not evaluated or integrated: they need a purchased web/app embedding licence.";

/** Is this composition's typography using more than two Tamil families? (body + title only exist, so never true today.) */
export const tamilFamilyCount = (st) => new Set([st?.font, st?.titleFont].filter(Boolean)).size;
