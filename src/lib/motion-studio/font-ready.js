// Font readiness for every export path. Before ANY measurement or drawing, the exact faces the composition will use
// (family + weight, at the real size, with the poem's own text so the Tamil subset is requested) must be loaded AND proven
// to cover the glyphs. No silent fallback measurement: if a face cannot be loaded in time, the export stops with an error.
import { FONT_FAMILY } from "./render.js";
import { fontById, canBody, canTitle, fontReviewOf } from "./font-registry.js";
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
 * CSS family for a registry font id in `role`. Every face ensureFonts loads comes from here, so an id outside the
 * registry, a font that cannot be loaded, or a display-only font used for body text is refused (never a silent fallback).
 */
export function registryFamily(id, role = "body") {
  const f = fontById(id);
  if (!f || !FONT_FAMILY[id])
    throw new FontReadinessError(`The font "${id}" is not in the Studio font list. Nothing was exported.`);
  if (!f.loadable)
    throw new FontReadinessError(`The font "${f.label}" cannot be loaded in this Studio (${f.why}). Nothing was exported.`);
  if (role === "body" ? !canBody(id) : !canTitle(id))
    throw new FontReadinessError(`"${f.label}" is a display (title-only) font and cannot be used for poem text. Nothing was exported.`);
  return FONT_FAMILY[id];
}

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
  const bodyFamily = registryFamily(st.font, "body");
  const titleFamily = st.titleFont ? registryFamily(st.titleFont, "title") : bodyFamily;
  const body = sampleText(
    poemText,
    ...(comp.scenes || []).flatMap((s) => s.lines),
  );
  const faces = [
    {
      role: "body",
      font: `${st.weight} ${px}px ${bodyFamily}`,
      text: body,
    },
  ];
  const titleScene = (comp.scenes || []).some((s) => s.kind === "title");
  if (title || titleScene)
    faces.push({
      role: "title",
      font: `${titleWeight} ${px}px ${titleFamily}`,
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

/**
 * Compact, best-effort facts about WHY a font failed (for the error text only; never used to decide anything): the state of
 * the matching @font-face rules, the status of the font files the page requested, and the connection. Everything is guarded.
 */
export function fontDiagnostics(fonts, font, env = typeof window !== "undefined" ? window : {}) {
  const out = [];
  try {
    const fams = familiesOf(font);
    const faces = [];
    if (fonts && typeof fonts[Symbol.iterator] === "function")
      for (const f of fonts) if (sameFam(f, fams)) faces.push(`${fams.indexOf(String(f.family).replace(/["']/g, "").trim())}/${f.weight}:${f.status}`);
    if (faces.length) out.push(`faces ${faces.slice(0, 6).join(",")}`);
    else out.push("no matching @font-face");
  } catch {}
  try {
    const res = (env.performance?.getEntriesByType?.("resource") || []).filter((r) => /\.(woff2?|ttf|otf)(\?|$)/i.test(r.name));
    if (res.length)
      out.push("files " + res.slice(-4).map((r) => `${r.name.split("/").pop().slice(0, 18)} ${r.responseStatus ?? "?"} ${Math.round(r.transferSize || 0)}B`).join("; "));
    else out.push("no font file requested");
  } catch {}
  try {
    const n = env.navigator;
    out.push(`online ${n?.onLine}, net ${n?.connection?.effectiveType ?? "?"}${n?.connection?.saveData ? " saveData" : ""}`);
  } catch {}
  return out.join(" | ");
}

/**
 * Failure-time probe (error text only): tries each matching @font-face that is not loaded, ONE AT A TIME, with a 4 s cap,
 * and reports its unicode-range start plus the exact error name/message, then the font-file resource entries. Never throws.
 */
export async function fontProbe(fonts, font, env = typeof window !== "undefined" ? window : {}) {
  const out = [];
  try {
    const fams = familiesOf(font);
    let n = 0;
    if (fonts && typeof fonts[Symbol.iterator] === "function")
      for (const f of fonts) {
        if (!sameFam(f, fams) || f.status === "loaded" || n++ >= 4) continue;
        const before = f.status;
        let res = "ok";
        try {
          await Promise.race([f.load(), new Promise((_, j) => setTimeout(() => j(new Error("timeout 4s")), 4000))]);
        } catch (e) {
          res = `${e?.name || "Error"}: ${String(e?.message || e).slice(0, 40)}`;
        }
        out.push(`[range ${String(f.unicodeRange).slice(0, 28)} ${before}->${f.status} ${res}]`);
      }
    const res = (env.performance?.getEntriesByType?.("resource") || []).filter((r) => /\.(woff2?|ttf|otf)(\?|$)/i.test(r.name));
    out.push(res.length ? "files " + res.slice(-4).map((r) => `${r.name.split("/").pop().slice(0, 14)} st${r.responseStatus ?? "?"} ${Math.round(r.transferSize || 0)}B ${Math.round(r.duration || 0)}ms`).join("; ") : "no font file in resource timing");
  } catch {}
  return out.join(" ");
}

/**
 * Load the not-yet-loaded @font-face pieces (unicode-range subsets) of a family ONE AT A TIME, each capped at `capMs`.
 * Some mobile browsers reject a single document.fonts.load() that starts several subset downloads together although each
 * subset loads fine alone; this serial warm-up is run before a retry. It only loads the page's OWN declared faces: it
 * never substitutes a font, and a piece that still fails is reported by the caller's normal error. Never throws.
 */
export async function warmFaces(fonts, font, capMs = 8000) {
  try {
    const fams = familiesOf(font);
    if (!fonts || typeof fonts[Symbol.iterator] !== "function") return 0;
    let n = 0;
    for (const f of [...fonts]) {
      if (!sameFam(f, fams) || f.status === "loaded") continue;
      try {
        await withTimeout(f.load(), capMs, "A font piece");
        n++;
      } catch {}
    }
    return n;
  } catch {
    return 0;
  }
}

/** true only when the family has at least one declared face and EVERY declared face of it reports status "loaded". */
function allFacesLoaded(fonts, font) {
  try {
    if (!fonts || typeof fonts[Symbol.iterator] !== "function") return false;
    const fams = familiesOf(font).slice(0, 1); // the MAIN family draws the Tamil; a lazy/failed fallback family must not block
    const mine = [...fonts].filter((x) => sameFam(x, fams));
    return mine.length > 0 && mine.every((x) => x.status === "loaded");
  } catch {
    return false;
  }
}

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif"]);
/** every NON-generic family named in a CSS font string, quotes stripped. */
function familiesOf(font) {
  return familyOf(font).split(",").map((x) => x.replace(/["']/g, "").trim()).filter((x) => x && !GENERIC_FAMILIES.has(x.toLowerCase()));
}
const sameFam = (f, fams) => fams.includes(String(f.family).replace(/["']/g, "").trim());

/** error text only: the first few characters of `text` that fonts.check() reports as not ready, as code points. Never throws. */
function notReadyChars(fonts, font, text) {
  try {
    const bad = [];
    for (const ch of new Set(Array.from(String(text || "")))) {
      if (bad.length >= 8) break;
      if (!fonts.check(font, ch)) bad.push("U+" + ch.codePointAt(0).toString(16).toUpperCase());
    }
    return bad.length ? "notready " + bad.join(",") : "notready (no single character fails)";
  } catch {
    return "notready (probe failed)";
  }
}

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
  const fontReview = fontReviewOf(comp);
  // a candidate (unreviewed) font must PROVE Tamil glyph coverage by measurement: no measuring function, no export
  if (fontReview && !deps.measure)
    throw new FontReadinessError("A candidate (unreviewed) font needs a glyph measurement check, which is not available here. Nothing was exported.");
  const report = [];
  for (const f of faces) {
    let loaded;
    // A mobile connection can drop a single font request. Retry a NETWORK failure (never a timeout, never a wrong
    // face) before giving up; a failure still stops the export with a message that says what to do. No fallback font.
    const attempts = deps.fontRetries ?? 2;
    for (let n = 0; ; n++) {
      try {
        loaded = await withTimeout(
          fonts.load(f.font, f.text),
          timeoutMs,
          `The ${f.role} font (${weightOf(f.font)})`,
        );
        break;
      } catch (e) {
        if (e instanceof FontReadinessError) throw e;
        if (n < attempts) {
          await warmFaces(fonts, f.font, timeoutMs);
          // The load() promise can reject (mobile Chrome: "A network error occurred") although every piece of the face
          // is now loaded. Trust real readiness: check() is true only when every matching face for this text is loaded.
          // (Candidate fonts still have to pass the glyph-measurement proof below.)
          if (allFacesLoaded(fonts, f.font)) {
            loaded = [f.font];
            break;
          }
          await new Promise((r) => setTimeout(r, deps.fontRetryMs ?? 600 * (n + 1)));
          continue;
        }
        throw new FontReadinessError(
          `The ${f.role} font (${weightOf(f.font)}) could not be loaded: ${e?.message || e}. Check your connection, reload the page and try again. Nothing was exported. [fr4 check=${(() => { try { return fonts.check?.(f.font, f.text); } catch { return "throws"; } })()} ${fontDiagnostics(fonts, f.font)}] ${await fontProbe(fonts, f.font)}`,
        );
      }
    }
    if (!loaded || loaded.length === 0)
      throw new FontReadinessError(
        `No font file matches the ${f.role} text (${f.font}). It would be drawn in a fallback font, so nothing was exported.`,
      );
    if (fonts.check && !fonts.check(f.font, f.text))
      throw new FontReadinessError(
        `The ${f.role} font is not ready for this text (${f.font}). Nothing was exported. [fr4 ${notReadyChars(fonts, f.font, f.text)} ${fontDiagnostics(fonts, f.font)}]`,
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
  return { ok: true, faces: report, ...(fontReview ? { fontReview } : {}) };
}

/** Clusters the verification harness measures one by one: conjuncts and two-part vowel signs that break first. */
export const TAMIL_CLUSTERS = ["க்ஷ", "ஶ்ரீ", "கொ", "கோ", "கௌ", "தமிழ்", "ஸ்ரீ", "ஜ", "ஷ", "ஸ", "ஹ", "ழ", "ள", "ற", "ன"];

/**
 * Font verification harness (pure; inject deps {fonts, measure} like ensureFonts). Runs ensureFonts for the font at
 * 400 and 700 (body and title faces) with the Tamil fixture, then checks every cluster individually: fonts.check must
 * pass and the cluster must measure > 0 and differently from the generic fallback alone. Returns
 * { fontId, ok, reasons, checked }. `ok` is a TECHNICAL pre-check only: it never marks a font verified (that needs a
 * Tamil-literate human review of real rendering).
 */
export async function fontVerification(fontId, deps = {}) {
  const reasons = [], checked = [];
  const f = fontById(fontId);
  if (!f) return { fontId, ok: false, reasons: [`"${fontId}" is not in the font registry.`], checked };
  if (!f.loadable) return { fontId, ok: false, reasons: [`not loadable: ${f.why}`], checked };
  if (!deps.measure) return { fontId, ok: false, reasons: ["no measuring function: glyph coverage cannot be proven"], checked };
  const display = f.role === "display";
  const comp = {
    format: "reel",
    style: { font: display ? "noto-sans" : fontId, ...(display ? { titleFont: fontId } : {}), weight: 400, sizePx: 40 },
    scenes: [{ kind: display ? "title" : "stanza", lines: [TAMIL_FIXTURE] }],
    branding: { show: false },
  };
  try {
    await ensureFonts(comp, { poemText: TAMIL_FIXTURE, title: display ? TAMIL_FIXTURE : "", timeoutMs: deps.timeoutMs }, deps);
  } catch (e) {
    reasons.push(e?.message || String(e));
  }
  const family = FONT_FAMILY[fontId];
  const generic = family.split(",").pop().trim();
  for (const wt of display ? [400] : [400, 700]) {
    const font = `${wt} 40px ${family}`;
    for (const cl of TAMIL_CLUSTERS) {
      const w = deps.measure(font, cl), fb = deps.measure(`${wt} 40px ${generic}`, cl);
      const inSet = deps.fonts?.check ? deps.fonts.check(font, cl) : true;
      const ok = w > 0 && Math.abs(w - fb) >= 0.01 && inSet;
      checked.push({ cluster: cl, weight: wt, width: w, fallback: fb, ok });
      if (!ok) reasons.push(`"${cl}" at weight ${wt} ${!inSet ? "is not covered by the font" : "measures like the fallback (not drawn by this font)"}`);
    }
  }
  return { fontId, ok: reasons.length === 0, reasons, checked, humanReview: "pending" };
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
