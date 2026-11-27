// Writing animations: Tamil Ink Reveal and a cluster-safe Typewriter, shared by Scene-by-Scene (render.js) and
// Whole-Poem (full-poem.js), in preview and in export.
//
// Rules (Tamil first):
// - The text is never re-ordered, normalised or split into codepoints. Every row is drawn with ONE fillText of the
//   original string, so the browser's shaper (HarfBuzz in Chrome/Firefox, CoreText in Safari) shapes it exactly as the
//   static poem. Ink Reveal only MASKS that shaped row with a soft, slightly irregular edge; it never cuts glyph data.
// - Units are extended grapheme clusters (Intl.Segmenter, graphemes.js), merged further wherever the font joins two
//   clusters into one shape (க்ஷ, ஸ்ரீ, any kerning/ligature): a unit boundary is only kept where the width of the
//   parts equals the width of the whole. Typewriter draws whole-unit prefixes, so it never shows half a conjunct.
// - Pure function of (settings, layout, time): no wall clock, no unseeded random, no CSS animation. The same inputs
//   always paint the same pixels, so preview, scrubbing and the MP4 export share one model.
// - Pen-stroke handwriting (glyph centre-lines drawn stroke by stroke) needs per-font Tamil stroke data that has passed
//   human review. No Tamil font has stroke data or a review yet (docs: Tegaki ships none for Tamil), so the pen presets
//   are listed for transparency but are never selectable, and nothing here claims an authentic stroke order.
import { graphemes, isBreakableWhitespace } from "./graphemes.js";

export const WRITING_MODES = Object.freeze(["none", "ink", "type"]);
export const WRITING_LABELS = Object.freeze({
  none: "Off",
  ink: "Ink Reveal",
  type: "Typewriter",
});
export const WRITING_UNITS = Object.freeze(["cluster", "word", "line"]);
export const UNIT_LABELS = Object.freeze({
  cluster: "Letter cluster",
  word: "Word",
  line: "Line",
});

/** Pen-stroke presets. validated:false = no Tamil font has passed stroke validation + human review: not selectable. */
export const PEN_PRESETS = Object.freeze([
  { id: "natural", label: "Natural Handwriting", validated: false },
  { id: "fine-nib", label: "Fine Nib", validated: false },
  { id: "fountain", label: "Fountain Pen", validated: false },
  { id: "brush", label: "Brush Pen", validated: false },
  { id: "pencil", label: "Pencil Sketch", validated: false },
]);
/** Fonts whose Tamil stroke data passed validation AND a named human reviewer's sign-off. Empty until that happens. */
export const PEN_VALIDATED_FONTS = Object.freeze([]);
export const PEN_STATUS =
  "Write by Hand (pen strokes) is not available yet: no Tamil font has stroke data that has passed review. Ink Reveal keeps your real font and is the supported writing style.";

export const INK_COLOURS = Object.freeze({
  text: { label: "Text colour", hex: null },
  black: { label: "Black ink", hex: "#151515" },
  blue: { label: "Deep blue", hex: "#1d3b8f" },
  navy: { label: "Dark navy", hex: "#16213f" },
  sepia: { label: "Sepia", hex: "#704214" },
  brown: { label: "Dark brown", hex: "#4a2c17" },
  green: { label: "Forest green", hex: "#1f4d2b" },
});
export const INK_KEYS = Object.keys(INK_COLOURS);

export const SPEEDS = Object.freeze({ slow: 0.6, normal: 1, fast: 1.6 });
export const CLUSTER_MS = Object.freeze({ ink: 150, type: 95 }); // per unit at speed 1
const WORD_GAP_MS = 90;
const LIMITS = {
  speed: [0.25, 3],
  startDelayMs: [0, 10_000],
  linePauseMs: [0, 5_000],
  stanzaPauseMs: [0, 8_000],
  finalHoldMs: [0, 20_000],
  edge: [0, 1],
};
export const WRITING_DEFAULTS = Object.freeze({
  mode: "none",
  unit: "cluster",
  ink: "text",
  inkHex: "#151515",
  speed: 1,
  startDelayMs: 400,
  linePauseMs: 250,
  stanzaPauseMs: 700,
  finalHoldMs: 2000,
  edge: 0.5,
});
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, [lo, hi], d) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;

/** Safe settings for any input (old projects have none: mode "none", so nothing they saved changes). */
export function normalizeWriting(w) {
  const s = w && typeof w === "object" ? w : {};
  const D = WRITING_DEFAULTS;
  return {
    mode: WRITING_MODES.includes(s.mode) ? s.mode : D.mode,
    unit: WRITING_UNITS.includes(s.unit) ? s.unit : D.unit,
    ink: s.ink === "custom" || INK_KEYS.includes(s.ink) ? s.ink : D.ink,
    inkHex: HEX.test(s.inkHex || "") ? s.inkHex : D.inkHex,
    speed: num(s.speed, LIMITS.speed, D.speed),
    startDelayMs: num(s.startDelayMs, LIMITS.startDelayMs, D.startDelayMs),
    linePauseMs: num(s.linePauseMs, LIMITS.linePauseMs, D.linePauseMs),
    stanzaPauseMs: num(s.stanzaPauseMs, LIMITS.stanzaPauseMs, D.stanzaPauseMs),
    finalHoldMs: num(s.finalHoldMs, LIMITS.finalHoldMs, D.finalHoldMs),
    edge: num(s.edge, LIMITS.edge, D.edge),
  };
}
/** The writing settings in effect (reduce-motion turns writing off: the reader gets the plain fade). */
export function writingOf(comp) {
  const w = normalizeWriting(comp?.motion?.writing);
  if (comp?.motion?.reduceMotion === true) w.mode = "none";
  return w;
}
export const writingOn = (comp) => writingOf(comp).mode !== "none";
export const inkColour = (w, textColour) =>
  w.ink === "custom" ? w.inkHex : INK_COLOURS[w.ink]?.hex || textColour;

// ---------------------------------------------------------------- cluster-safe units
const VIRAMA = "்";
/** Tamil conjuncts the shaper joins across a grapheme boundary (no ZWNJ between): pulli + ஷ (க்ஷ), ஸ் + ரீ (ஸ்ரீ). */
const joinsAcross = (a, b) =>
  a.endsWith(VIRAMA) &&
  (b.startsWith("ஷ") || (a.endsWith("ஸ்") && b.startsWith("ரீ")));

/**
 * Split `text` into drawable units: grapheme clusters, merged where the font shapes two of them together. Boundaries
 * are code-unit offsets into the ORIGINAL string. measure (optional) = width of a string in the row's font; a boundary
 * survives only if width(left)+width(right) ≈ width(left+right) for its neighbours (no ligature/kerning across it).
 */
export function safeUnits(text, measure = null, tol = 0.5) {
  const s = String(text ?? "");
  const gs = graphemes(s);
  const units = [];
  let at = 0;
  for (const g of gs) {
    const u = { start: at, end: at + g.length };
    at = u.end;
    const prev = units[units.length - 1];
    if (prev) {
      const a = s.slice(prev.start, prev.end),
        b = s.slice(u.start, u.end);
      // a cluster never starts with a combining mark or ZWJ/ZWNJ (guards the no-Intl.Segmenter fallback too)
      let join = /^[\p{M}\u200c\u200d]/u.test(b) || joinsAcross(a, b);
      if (
        !join &&
        measure &&
        !isBreakableWhitespace(a) &&
        !isBreakableWhitespace(b)
      )
        join = Math.abs(measure(a) + measure(b) - measure(a + b)) > tol;
      if (join) {
        prev.end = u.end;
        continue;
      }
    }
    units.push(u);
  }
  return units.map((u) => ({
    ...u,
    text: s.slice(u.start, u.end),
    space: isBreakableWhitespace(s.slice(u.start, u.end)),
  }));
}

// ---------------------------------------------------------------- timeline
/**
 * Plan the writing of laid-out rows. rows: [{ text, left, group }] (group = stanza; rows with gap:true are skipped).
 * Returns per-row { start, end, units:[{start,end,x0,x1,t0,t1}] } in ms from the scene/video start, plus
 * writeEnd (last ink laid) and total (= writeEnd + final hold): the time the writing NEEDS.
 */
export function planWriting(rows, w, measure = null) {
  const per = CLUSTER_MS[w.mode === "type" ? "type" : "ink"] / w.speed;
  let t = w.startDelayMs,
    prevGroup = null;
  const out = [];
  for (const r of rows) {
    if (r.gap || !r.text) continue;
    if (prevGroup !== null)
      t += r.group !== prevGroup ? w.stanzaPauseMs : w.linePauseMs;
    prevGroup = r.group;
    const m = measure ? (x) => measure(x, r.font) : null;
    const us = safeUnits(r.text, m);
    const start = t;
    const units = [];
    const W = (i) => (m ? m(r.text.slice(0, i)) : i * 10);
    for (const u of us) {
      const dur = u.space
        ? per * 0.5 + (w.unit === "word" ? WORD_GAP_MS / w.speed : 0)
        : per;
      units.push({
        start: u.start,
        end: u.end,
        x0: W(u.start),
        x1: W(u.end),
        t0: t,
        t1: t + dur,
        space: u.space,
      });
      t += dur;
    }
    if (w.unit === "word") {
      // each word is swept evenly as one piece (its clusters share the word's time in proportion to their width)
      for (let i = 0; i < units.length; ) {
        if (units[i].space) { i++; continue; }
        let j = i;
        while (j + 1 < units.length && !units[j + 1].space) j++;
        const a = units[i], z = units[j], span = z.x1 - a.x0 || 1, t0 = a.t0, t1 = z.t1;
        for (let k = i; k <= j; k++) {
          const u = units[k];
          u.t0 = t0 + ((u.x0 - a.x0) / span) * (t1 - t0);
          u.t1 = t0 + ((u.x1 - a.x0) / span) * (t1 - t0);
        }
        i = j + 1;
      }
    }
    if (w.unit === "line" && units.length) {
      // one even sweep across the line: same duration, edge moves at constant speed in x
      const x1 = units[units.length - 1].x1 || 1;
      for (const u of units) {
        u.t0 = start + (u.x0 / x1) * (t - start);
        u.t1 = start + (u.x1 / x1) * (t - start);
      }
    }
    out.push({
      row: r,
      start,
      end: t,
      units,
      width: units.length ? units[units.length - 1].x1 : 0,
    });
  }
  const writeEnd = out.length ? out[out.length - 1].end : w.startDelayMs;
  return {
    rows: out,
    writeEnd,
    total: writeEnd + w.finalHoldMs,
    perUnitMs: per,
  };
}

/** Recommended video length (whole seconds, rounded up to the next offered step) for a plan. */
export function recommendSeconds(
  plan,
  steps = [10, 15, 20, 30, 45, 60, 90, 120],
) {
  const need = Math.ceil(plan.total / 1000);
  return steps.find((s) => s >= need) ?? need;
}

/** Revealed width (px from the row's left) of a planned row at time t, and whether it is complete. */
export function revealAt(pr, t, mode) {
  if (t >= pr.end)
    return {
      x: pr.width,
      done: true,
      upto: pr.units.length ? pr.units[pr.units.length - 1].end : 0,
    };
  if (t < pr.start) return { x: 0, done: false, upto: 0 };
  let x = 0,
    upto = 0;
  for (const u of pr.units) {
    if (t >= u.t1) {
      x = u.x1;
      upto = u.end;
      continue;
    }
    if (t > u.t0 && mode !== "type")
      x = u.x0 + (u.x1 - u.x0) * smooth((t - u.t0) / (u.t1 - u.t0));
    break;
  }
  return { x, done: false, upto };
}
const smooth = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

// deterministic per-row noise for the organic ink edge (seeded by row index and band; no Math.random)
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/**
 * Draw one planned row at time t. ctx must already have font, fill colour, textBaseline and shadow set; the row is
 * drawn left-aligned at (left, mid). Ink: the whole shaped row is masked by a feathered, slightly ragged edge.
 * Type: the shaped prefix of whole safe units (identical shaping, since unit boundaries are shaping-neutral).
 */
export function drawWritingRow(
  ctx,
  pr,
  t,
  w,
  { left, mid, size, index = 0, alpha = 1 },
) {
  const text = pr.row.text;
  const r = revealAt(pr, t, w.mode);
  if (r.done) {
    ctx.globalAlpha = alpha;
    ctx.fillText(text, left, mid);
    return;
  }
  if (r.x <= 0 && r.upto === 0) return;
  if (w.mode === "type") {
    ctx.globalAlpha = alpha;
    ctx.fillText(text.slice(0, r.upto), left, mid);
    return;
  }
  const F = size * (0.25 + 0.75 * w.edge); // feather width
  const pad = size; // glyph overhang above/below and left of the row box
  const top = mid - size,
    h = size * 2;
  const BANDS = 5,
    STRIPS = 7;
  const bh = h / BANDS;
  for (let b = 0; b < BANDS; b++) {
    const wob = (hash(index + 1, b + 1) - 0.5) * F * 0.6;
    const edge = left + r.x + wob;
    const y0 = top + b * bh;
    // fully inked part
    ctx.save();
    ctx.beginPath();
    const solid = edge - F / 2 - (left - pad);
    if (solid > 0) {
      ctx.rect(left - pad, y0, solid, bh + 0.5);
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.fillText(text, left, mid);
    }
    ctx.restore();
    // feathered edge: strips of falling opacity (wet ink thinning out)
    for (let k = 0; k < STRIPS; k++) {
      const x0 = edge - F / 2 + (k * F) / STRIPS;
      const a = 1 - (k + 0.5) / STRIPS;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, F / STRIPS + 0.5, bh + 0.5);
      ctx.clip();
      ctx.globalAlpha = alpha * a * a;
      ctx.fillText(text, left, mid);
      ctx.restore();
    }
  }
  ctx.globalAlpha = alpha;
}

/** Left x of a row drawn with textAlign `align` at anchor x and measured width w. */
export const rowLeft = (align, x, w) =>
  align === "left" ? x : align === "right" ? x - w : x - w / 2;

/** measureText bound to a ctx, memoised per (font, text): planning measures every unit boundary on every frame. */
const MEASURERS = new WeakMap();
export function measureIn(ctx, max = 4000) {
  if (MEASURERS.has(ctx)) return MEASURERS.get(ctx);
  const memo = new Map();
  // a font that finishes loading changes widths: drop the memo (export only starts once fonts are proven ready)
  if (typeof document !== "undefined") document.fonts?.addEventListener?.("loadingdone", () => memo.clear());
  const fn = (text, font) => {
    const k = `${font || ctx.font}\u0000${text}`;
    let v = memo.get(k);
    if (v === undefined) {
      if (font && ctx.font !== font) ctx.font = font;
      v = ctx.measureText(text).width;
      if (memo.size >= max) memo.clear();
      memo.set(k, v);
    }
    return v;
  };
  MEASURERS.set(ctx, fn);
  return fn;
}

/**
 * Draw laid-out rows as written at time t. rows: [{ text, left, mid, font, group }]. ctx: fillStyle, baseline and
 * shadow already set. Returns the plan (callers use plan.total for fit checks).
 */
export function drawWrittenRows(ctx, rows, t, w, { size, alpha = 1, measure = null, plan = null } = {}) {
  const m = measure || measureIn(ctx);
  const pl = plan || planWriting(rows, w, m);
  const align = ctx.textAlign;
  ctx.textAlign = "left";
  pl.rows.forEach((pr, i) => {
    if (t < pr.start) return;
    if (pr.row.font) ctx.font = pr.row.font;
    drawWritingRow(ctx, pr, t, w, { left: pr.row.left, mid: pr.row.mid, size: pr.row.size || size, index: i, alpha });
  });
  ctx.textAlign = align;
  ctx.globalAlpha = 1;
  return pl;
}
