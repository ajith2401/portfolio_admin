// Font registry: the ONE list of every font the Studio knows. render.js FONT_FAMILY, templates.js FONT_KEYS/FONT_LABELS,
// normalizeComposition's whitelist, requiredFaces/ensureFonts and the Look panel picker all derive from it.
//
// verified:true  = the five families the Studio has always shipped (their CSS stacks are unchanged byte-for-byte; the
//                  golden fixture depends on it).
// verified:false = CANDIDATES. Not selectable in normal mode, replaced (with a notice) by normalizeComposition unless the
//                  composition opted in via the explicit "Preview candidate fonts (not reviewed)" toggle, and every export
//                  with one carries fontReview:'unreviewed'. A candidate only becomes verified after a Tamil-literate human
//                  review of real rendering (tamil-font-review sheet) AND a licence confirmation. Flip the flag by hand;
//                  nothing in code ever does it.
// role: 'body' | 'display' | 'both'. A 'display' font is title/headline only: using it for body text is refused.
// loadable:false = cannot be self-hosted through next/font/google (see `why`); it can never be selected or exported.

const OFL = "OFL (Google Fonts)";
const NEEDS_LICENCE = "needs human licence confirmation";
// upstream: provenance read from github.com/google/fonts on 2026-11-27 (METADATA.pb + OFL.txt of each family directory):
// every candidate is SIL OFL 1.1, has the Tamil subset, and no Reserved Font Name clause was found. This is RECORDED
// evidence for the human reviewer; it does not verify a font (rendering review by a Tamil reader is still required).

export const FONT_REGISTRY = Object.freeze([
  // ---- verified: the original five (stacks are the exact strings render.js has always used)
  {
    id: "noto-serif",
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
    label: "Tiro Tamil",
    family: '"Tiro Tamil", serif',
    weights: [400],
    role: "both",
    verified: true,
    loadable: true,
    license: OFL,
    tamilSubset: true,
  },
  // ---- candidates: unreviewed, self-hosted by next/font/google at build time (no runtime request to Google)
  {
    id: "kavivanar",
    label: "Kavivanar",
    family: '"Kavivanar", serif',
    weights: [400],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/kavivanar", licence: "SIL OFL 1.1", reservedName: false, category: "HANDWRITING", source: "github.com/enathu/kavivanar", note: "© 2015 Tharique Azeez" },
    tamilSubset: true,
  },
  {
    id: "mukta-malar",
    label: "Mukta Malar",
    family: '"Mukta Malar", sans-serif',
    weights: [400, 500, 600, 700],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/muktamalar", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/EkType/Mukta", note: "© 2016 Ek Type" },
    tamilSubset: true,
  },
  {
    id: "catamaran",
    label: "Catamaran",
    family: '"Catamaran", sans-serif',
    weights: ["100-900 (variable)"],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/catamaran", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/VanillaandCream/Catamaran-Tamil" },
    tamilSubset: true,
  },
  {
    id: "pavanam",
    label: "Pavanam",
    family: '"Pavanam", sans-serif',
    weights: [400],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/pavanam", licence: "SIL OFL 1.1", reservedName: false, category: "SANS_SERIF", source: "github.com/enathu/pavanam" },
    tamilSubset: true,
  },
  {
    id: "baloo-thambi-2",
    label: "Baloo Thambi 2",
    family: '"Baloo Thambi 2", sans-serif',
    weights: ["400-800 (variable)"],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/baloothambi2", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/yanone/Baloo2-Variable" },
    tamilSubset: true,
  },
  {
    id: "meera-inimai",
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
    label: "Arima",
    family: '"Arima", serif',
    weights: ["100-700 (variable)"],
    role: "both",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/arima", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/NDISCOVER/Arima-Font" },
    tamilSubset: true,
  },
  {
    id: "arima-madurai",
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
    label: "Oi",
    family: '"Oi", serif',
    weights: [400],
    role: "display",
    verified: false,
    loadable: true,
    license: OFL,
    licenseReview: NEEDS_LICENCE,
    upstream: { dir: "ofl/oi", licence: "SIL OFL 1.1", reservedName: false, category: "DISPLAY", source: "github.com/kosbarts/Oi" },
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
