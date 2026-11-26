// Font readiness for every export path. Before ANY measurement or drawing, the exact faces the composition will use
// (family + weight, at the real size, with the poem's own text so the Tamil subset is requested) must be loaded AND proven
// to cover the glyphs. No silent fallback measurement: if a face cannot be loaded in time, the export stops with an error.
import { FONT_FAMILY } from "./render.js";
import { graphemes } from "./graphemes.js";
import { signatureBox } from "./signature.js";
import { FORMATS } from "./safe-zone.js";

export const FONT_TIMEOUT_MS = 8000;
export const TAMIL_FIXTURE =
  "தமிழ் அ ஆ இ ஈ உ ஊ எ ஏ ஐ ஒ ஓ ஔ க ங ச ஞ ட ண த ந ப ம ய ர ல வ ழ ள ற ன ஜ ஷ ஸ ஹ க்ஷ ஶ்ரீ கொ கோ கௌ";

export class FontReadinessError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "FontReadinessError";
    this.details = details;
  }
}

/** Unique Tamil-relevant characters of the poem (plus title/signature), so the browser fetches the right unicode-range subset. */
export const sampleText = (...parts) => {
  const set = new Set();
  for (const p of parts)
    for (const g of graphemes(String(p ?? ""))) if (g.trim()) set.add(g);
  set.add("A");
  return [...set].join("");
};

/**
 * The faces a composition needs, as {key, font, text, role}. `font` is a CSS shorthand `weight size family` that is
 * exactly what the renderers set on the canvas. Only the families actually used are listed.
 */
export function requiredFaces(
  comp,
  { poemText = "", title = "", titleWeight = 700, sizePx } = {},
) {
  const st = comp.style;
  const px = sizePx || st.sizePx || 40;
  const body = sampleText(
    poemText,
    ...(comp.scenes || []).flatMap((s) => s.lines),
  );
  const faces = [
    {
      role: "body",
      font: `${st.weight} ${px}px ${FONT_FAMILY[st.font]}`,
      text: body,
    },
  ];
  const titleScene = (comp.scenes || []).some((s) => s.kind === "title");
  if (title || titleScene)
    faces.push({
      role: "title",
      font: `${titleWeight} ${px}px ${FONT_FAMILY[st.font]}`,
      text: sampleText(
        title,
        ...(comp.scenes || [])
          .filter((s) => s.kind === "title")
          .flatMap((s) => s.lines),
      ),
    });
  const sg = signatureBox(comp, FORMATS[comp.format] || FORMATS.reel);
  if (sg)
    faces.push({
      role: "signature",
      font: sg.font,
      text: sampleText(sg.text),
    });
  const seen = new Set();
  return faces.filter((f) =>
    seen.has(f.font + "|" + f.text) ? false : seen.add(f.font + "|" + f.text),
  );
}

const withTimeout = (p, ms, what) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new FontReadinessError(
            `${what} did not load within ${Math.round(ms / 1000)} seconds.`,
          ),
        ),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

const familyOf = (font) => font.replace(/^\s*\d+\s+[\d.]+px\s+/, "");
const weightOf = (font) => font.match(/^\s*(\d+)/)?.[1];

/**
 * Load and verify every required face. Resolves to a report; throws FontReadinessError with a human message otherwise.
 * deps lets tests inject a fake FontFaceSet and a measuring function.
 *
 * Glyph coverage is checked, not assumed: document.fonts.load() resolving does not prove the font has the Tamil glyphs
 * (an empty result means NO declared face matched, and a face can resolve while the browser still falls back). So after
 * loading we require fonts.check(font, text) and that the Tamil fixture measures differently in the family than in the
 * generic fallback alone.
 */
export async function ensureFonts(comp, opts = {}, deps = {}) {
  const fonts =
    deps.fonts || (typeof document !== "undefined" ? document.fonts : null);
  const timeoutMs = opts.timeoutMs ?? FONT_TIMEOUT_MS;
  if (!fonts?.load)
    throw new FontReadinessError(
      "This browser cannot load web fonts, so the poem cannot be measured safely. Nothing was exported.",
    );
  const faces = requiredFaces(comp, opts);
  const report = [];
  for (const f of faces) {
    let loaded;
    try {
      loaded = await withTimeout(
        fonts.load(f.font, f.text),
        timeoutMs,
        `The ${f.role} font (${weightOf(f.font)})`,
      );
    } catch (e) {
      if (e instanceof FontReadinessError) throw e;
      throw new FontReadinessError(
        `The ${f.role} font (${weightOf(f.font)}) could not be loaded: ${e?.message || e}`,
      );
    }
    if (!loaded || loaded.length === 0)
      throw new FontReadinessError(
        `No font file matches the ${f.role} text (${f.font}). It would be drawn in a fallback font, so nothing was exported.`,
      );
    if (fonts.check && !fonts.check(f.font, f.text))
      throw new FontReadinessError(
        `The ${f.role} font is not ready for this text (${f.font}). Nothing was exported.`,
      );
    if (deps.measure) {
      const generic = familyOf(f.font).split(",").pop().trim();
      const w = deps.measure(f.font, TAMIL_FIXTURE),
        fb = deps.measure(`${weightOf(f.font)} 40px ${generic}`, TAMIL_FIXTURE),
        w40 = deps.measure(f.font.replace(/[\d.]+px/, "40px"), TAMIL_FIXTURE);
      if (!(w40 > 0) || Math.abs(w40 - fb) < 0.01 || !(w > 0))
        throw new FontReadinessError(
          `The ${f.role} font does not draw Tamil glyphs (${f.font}); it measured the same as the fallback. Nothing was exported.`,
        );
    }
    report.push({ role: f.role, font: f.font, files: loaded.length });
  }
  return { ok: true, faces: report };
}

/** Canvas-based glyph probe used in the browser: width of `text` in the CSS `font`. */
export function canvasMeasure() {
  const c =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(10, 10)
      : Object.assign(document.createElement("canvas"), {
          width: 10,
          height: 10,
        });
  const ctx = c.getContext("2d");
  return (font, text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}
