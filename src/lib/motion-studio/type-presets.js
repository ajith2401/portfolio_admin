// Typography presets (P8): DATA ONLY. Each names a VERIFIED registry font (font-registry.js), a weight that font really
// has, a size at or above every route's text floor (safe-zone.js MIN_TEXT_PX), a line height, an alignment and a title
// treatment. Candidate (verified:false) and unloadable fonts can never appear here: assertTypePreset throws at import.
//
// Tamil: letterSpacing must be exactly 0. Tracking (extra space between letters) breaks the visual joins of Tamil
// syllables and vowel signs, so no preset may set it, and nothing in the renderer applies it.
// role 'body'    = poem text (font must be body-capable).
// role 'display' = titles/headlines only (font must be title-capable); a template never uses one for poem text.
// title.font null = the title uses the poem font; otherwise a verified title-capable font id.
// needsAestheticReview:true = machine-checked only. No human design sign-off has been given.
import { fontById, canBody, canTitle, fontHasWeight } from "./font-registry.js";
export { fontHasWeight };
import { MIN_TEXT_PX } from "./safe-zone.js";

export const TYPE_SIZE_MIN = Math.max(...Object.values(MIN_TEXT_PX)); // the strictest scene floor (poster 46px)
export const TYPE_SIZE_MAX = 140; // normalizeComposition's clamp
export const TYPE_WEIGHTS = [400, 500, 600, 700]; // normalizeComposition's whitelist
const ALIGN = ["left", "center", "right"];

/** Throws (with every reason) unless the preset only uses verified fonts, real weights, legible sizes and no tracking. */
export function assertTypePreset(p) {
  const why = [];
  if (!p || typeof p !== "object")
    throw new Error("type preset: not an object");
  if (typeof p.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(p.id))
    why.push("bad id");
  const f = fontById(p.font);
  if (!f) why.push(`unknown font ${p.font}`);
  else {
    if (f.verified !== true)
      why.push(
        `font ${p.font} is not verified (candidate fonts are not allowed in presets)`,
      );
    if (f.loadable !== true) why.push(`font ${p.font} cannot be loaded`);
    if (p.role === "body" && !canBody(p.font))
      why.push(`font ${p.font} is display-only and cannot set poem text`);
    if (p.role === "display" && !canTitle(p.font))
      why.push(`font ${p.font} cannot be a title font`);
  }
  if (!["body", "display"].includes(p.role))
    why.push("role must be body or display");
  if (!TYPE_WEIGHTS.includes(p.weight) || !fontHasWeight(p.font, p.weight))
    why.push(`weight ${p.weight} is not available in ${p.font}`);
  if (!(
    Number.isInteger(p.sizePx) &&
    p.sizePx >= TYPE_SIZE_MIN &&
    p.sizePx <= TYPE_SIZE_MAX
  ))
    why.push(
      `sizePx ${p.sizePx} is outside ${TYPE_SIZE_MIN}..${TYPE_SIZE_MAX}`,
    );
  if (!(p.lineHeight >= 1.2 && p.lineHeight <= 2.4))
    why.push(`lineHeight ${p.lineHeight} is outside 1.2..2.4`);
  if (!ALIGN.includes(p.align)) why.push(`bad align ${p.align}`);
  if (p.letterSpacing !== 0)
    why.push(`letterSpacing must be 0 for Tamil (got ${p.letterSpacing})`);
  const t = p.title;
  if (!t || typeof t !== "object") why.push("missing title treatment");
  else if (t.font != null) {
    const tf = fontById(t.font);
    if (!tf || tf.verified !== true || !canTitle(t.font))
      why.push(`title font ${t.font} is not a verified title font`);
  }
  if (why.length) throw new Error(`type preset ${p.id}: ${why.join("; ")}`);
  return p;
}

const T = (
  id,
  label,
  role,
  font,
  weight,
  sizePx,
  lineHeight,
  align,
  title = { font: null, treatment: "same as poem" },
) => ({
  id,
  label,
  role,
  font,
  weight,
  sizePx,
  lineHeight,
  align,
  letterSpacing: 0,
  title,
  needsAestheticReview: true,
});
const TITLE_SERIF = { font: "noto-serif", treatment: "serif title" };
const TITLE_TIRO = { font: "tiro", treatment: "literary serif title" };

export const TYPE_PRESETS = Object.freeze(
  [
    // body presets
    T(
      "serif-quiet",
      "Serif, quiet",
      "body",
      "noto-serif",
      500,
      64,
      1.7,
      "center",
    ),
    T(
      "serif-classic",
      "Serif, classic",
      "body",
      "noto-serif",
      400,
      62,
      1.75,
      "center",
    ),
    T(
      "serif-firm",
      "Serif, firm",
      "body",
      "noto-serif",
      600,
      60,
      1.65,
      "center",
    ),
    T("serif-left", "Serif, left", "body", "noto-serif", 500, 60, 1.7, "left"),
    T(
      "tiro-literary",
      "Tiro, literary",
      "body",
      "tiro",
      400,
      66,
      1.75,
      "center",
    ),
    T("tiro-large", "Tiro, large", "body", "tiro", 400, 70, 1.8, "center"),
    T(
      "tiro-left",
      "Tiro, left",
      "body",
      "tiro",
      400,
      62,
      1.75,
      "left",
      TITLE_SERIF,
    ),
    T(
      "hind-soft",
      "Hind, soft",
      "body",
      "hind-madurai",
      500,
      62,
      1.65,
      "center",
    ),
    T(
      "hind-medium",
      "Hind, medium",
      "body",
      "hind-madurai",
      600,
      60,
      1.6,
      "center",
      TITLE_TIRO,
    ),
    T("hind-left", "Hind, left", "body", "hind-madurai", 500, 58, 1.65, "left"),
    T("anek-warm", "Anek, warm", "body", "anek", 600, 64, 1.6, "center"),
    T(
      "anek-light",
      "Anek, light",
      "body",
      "anek",
      500,
      62,
      1.65,
      "center",
      TITLE_SERIF,
    ),
    T("anek-strong", "Anek, strong", "body", "anek", 700, 60, 1.55, "center"),
    T("sans-clean", "Sans, clean", "body", "noto-sans", 600, 60, 1.6, "left"),
    T(
      "sans-regular",
      "Sans, regular",
      "body",
      "noto-sans",
      500,
      58,
      1.65,
      "left",
    ),
    T(
      "sans-center",
      "Sans, centred",
      "body",
      "noto-sans",
      500,
      60,
      1.6,
      "center",
    ),
    T("sans-bold", "Sans, bold", "body", "noto-sans", 700, 56, 1.55, "left"),
    // display presets: title/headline only (verified fonts whose role allows titles)
    T(
      "display-serif",
      "Display serif (titles)",
      "display",
      "noto-serif",
      700,
      76,
      1.4,
      "center",
      { font: "noto-serif", treatment: "display" },
    ),
    T(
      "display-anek",
      "Display Anek (titles)",
      "display",
      "anek",
      700,
      78,
      1.35,
      "center",
      { font: "anek", treatment: "display" },
    ),
    T(
      "display-sans",
      "Display sans (titles)",
      "display",
      "noto-sans",
      700,
      72,
      1.4,
      "left",
      { font: "noto-sans", treatment: "display" },
    ),
  ].map((p) => Object.freeze({ ...p, title: Object.freeze({ ...p.title }) })),
);
for (const p of TYPE_PRESETS) assertTypePreset(p);
if (new Set(TYPE_PRESETS.map((p) => p.id)).size !== TYPE_PRESETS.length)
  throw new Error("type presets: duplicate id");

export const typePresetById = (id) =>
  TYPE_PRESETS.find((p) => p.id === id) || null;
