// Text-in behaviours. Each behaviour answers ONE question: for this row of this scene, `localMs` into the scene, what
// is its state? rowState(scene, row, localMs, info) -> {alpha, dy, dx}. Behaviours never touch the text itself (no
// per-code-point effects, no tracking): they only move and fade whole rows, so Tamil shaping is never split.
//
// Invariant (tested): once a behaviour's in-phase is over (localMs >= inEndMs) and before the scene's out-fade, every row
// is in the HOLD state {alpha:1, dy:0, dx:0}: a held frame is exactly the static layout that validateScene checked.
//
// `info`: { intensity (0..1), last (is this the last scene: no out-fade), index (row index among drawn rows) }.
// The four original behaviours below are moved verbatim from drawFrame (same expressions, same evaluation order).

import { wordRanges, renderText, isBreakableWhitespace } from "./graphemes.js";
import { newResult, note, TOLERANCE } from "./coverage.js";

export const HOLD = Object.freeze({ alpha: 1, dy: 0, dx: 0 });
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const FADE_IN_MS = 700;
export const FADE_OUT_MS = 500;

/** Out-fade multiplier shared by every behaviour (1 on the last scene). */
export const fadeOutAt = (scene, localMs, last) =>
  last
    ? 1
    : 1 - clamp01((localMs - (scene.durationMs - FADE_OUT_MS)) / FADE_OUT_MS);

export const BEHAVIOURS = Object.freeze({
  fade: {
    id: "fade",
    label: "Fade",
    inEndMs: () => FADE_IN_MS,
    rowState: (scene, row, localMs, info = {}) => ({
      alpha: ease(localMs / FADE_IN_MS) * fadeOutAt(scene, localMs, info.last),
      dy: 0,
      dx: 0,
    }),
  },
  line: {
    id: "line",
    label: "Line by line",
    inEndMs: (scene, row) => row.line * 450 + 600,
    rowState: (scene, row, localMs, info = {}) => ({
      alpha:
        ease((localMs - row.line * 450) / 600) *
        fadeOutAt(scene, localMs, info.last),
      dy: 0,
      dx: 0,
    }),
  },
  rise: {
    id: "rise",
    label: "Rise",
    inEndMs: (scene, row, info = {}) => (info.index || 0) * 150 + 800,
    rowState: (scene, row, localMs, info = {}) => {
      const p = ease((localMs - (info.index || 0) * 150) / 800);
      return {
        alpha: p * fadeOutAt(scene, localMs, info.last),
        dy: (1 - p) * 40 * (0.4 + (info.intensity || 0)),
        dx: 0,
      };
    },
  },
  none: {
    id: "none",
    label: "None",
    inEndMs: () => 0,
    rowState: (scene, row, localMs, info = {}) => ({
      alpha: fadeOutAt(scene, localMs, info.last),
      dy: 0,
      dx: 0,
    }),
  },
});
export const BEHAVIOUR_IDS = Object.keys(BEHAVIOURS);
/** Unknown ids behave like "fade" (the historical default branch of drawFrame). */
export const behaviourFor = (id) => BEHAVIOURS[id] || BEHAVIOURS.fade;

/** Row state as drawFrame paints it. Stills are always HOLD. Reduce motion degrades every behaviour to the plain fade. */
export function rowState(
  comp,
  scene,
  row,
  localMs,
  { still = false, last = false, index = 0, plan = null } = {},
) {
  if (still) return HOLD;
  const b = activeBehaviour(comp);
  if (!b.library)
    return b.rowState(scene, row, localMs, {
      intensity: comp.motion?.intensity,
      last,
      index,
    });
  const pl = plan || buildPlan(b, scene, null);
  return b.rowState(scene, row, localMs, { intensity: comp.motion?.intensity, last, index, plan: pl, u: pl.rows[index], p: prefParams(comp) });
}

// ================================================================ animation library (P6)
// Every behaviour is row-, word- or block-level ONLY. Nothing is ever split per code point or per grapheme: a word unit is
// a maximal run of non-breakable-whitespace (graphemes.wordRanges), so a Tamil conjunct, vowel sign, pulli or an
// NBSP-joined pair always stays inside one fillText and is shaped as written. A row with no breakable whitespace
// animates as one unit. "Typewriter" (per-letter) is rejected for Tamil.
//
// A registered animation declares: { id, label, description, unit:'row'|'word'|'block', maxDy, maxDx, minAlpha,
//   maxScale, minHoldMs, minSceneMs, holdBy(scene, plan, p, last), outMs(scene, plan, p, last),
//   rowState(scene, row, t, info), wordState?(scene, row, word, t, info), blockState?(scene, t, info), split? }
// and validateAnimation() proves, for the exact scene and layout, that it is safe (see below). The renderer and the
// validator both go through animFrame(), so what is validated is what is drawn (preview == export).
//
// Hold: from holdBy until the out phase every unit is EXACTLY {alpha:1, dy:0, dx:0} and the block scale is 1, i.e. the
// static layout validateScene checked. Stills always draw HOLD. Timing is pure arithmetic of the scene and layout:
// deterministic (no Math.random, no clock).
export const MOTION_PREFS = Object.freeze(["calm", "normal", "expressive"]);
export const PREF_LABELS = Object.freeze({ calm: "Calm", normal: "Normal", expressive: "Expressive" });
// time: duration multiplier; dist: offset multiplier (always capped by the behaviour's maxDy); zoom: slow-zoom amplitude;
// dim: highlight dimming level (never below MIN_DIM_ALPHA); ease: calm eases more slowly (sine in-out).
export const PREF_PARAMS = Object.freeze({
  calm: Object.freeze({ time: 1.35, dist: 0.5, zoom: 0.02, dim: 0.7, ease: "sine" }),
  normal: Object.freeze({ time: 1, dist: 1, zoom: 0.03, dim: 0.6, ease: "cubic" }),
  expressive: Object.freeze({ time: 0.85, dist: 1.6, zoom: 0.04, dim: 0.55, ease: "cubic" }),
});
export const motionPrefOf = (comp) => (MOTION_PREFS.includes(comp?.motion?.pref) ? comp.motion.pref : "normal");
export const reduceMotionOf = (comp) => comp?.motion?.reduceMotion === true;
export const prefParams = (comp) => PREF_PARAMS[motionPrefOf(comp)];
export const MIN_HOLD_MS = 1000; // a library animation must hold the finished text at least this long before the out phase
export const MAX_SCALE = 1.04;
export const MIN_DIM_ALPHA = 0.55;
export const UNITS = Object.freeze(["row", "word", "block"]);
export const REJECTED_ANIMATIONS = Object.freeze({
  typewriter: "Typewriter (letter by letter) is not available for Tamil: splitting a word into letters breaks conjuncts and vowel signs.",
});
const ZOOM_MIN_MS = 1500; // = MIN_SCENE_MS - MIN_HOLD_MS - FADE_OUT_MS: slow zoom fits every scene length the Studio allows
const ez = (p, x) => (p.ease === "sine" ? (1 - Math.cos(Math.PI * clamp01(x))) / 2 : ease(x));
const T = (p, ms) => ms * p.time;
const stdOut = (scene, plan, p, last) => (last ? 0 : FADE_OUT_MS);
/** Stagger step for n units of length `unit` that must all finish within `room` ms (never below `floor`, never above `want`). */
const fitStep = (n, unit, want, floor, room) => (n <= 1 ? 0 : Math.max(floor, Math.min(want, (room - unit) / (n - 1))));
const prefOf = (info) => info?.p || PREF_PARAMS.normal;
const readRoom = (scene, plan, p, last) => scene.durationMs - stdOut(scene, plan, p, last) - MIN_HOLD_MS;

/** Rows to plan with when no layout is available (rowState() called directly): one row per non-empty source line. */
function fallbackRows(scene) {
  const out = [];
  (scene?.lines || []).forEach((ln, i) => { if (ln !== "") out.push({ text: ln, start: 0, end: String(ln).length, line: out.length, srcLine: i }); });
  return out;
}
/**
 * Animation plan of a laid-out scene: reading-order units and the room the text block has inside the safe rect.
 * geo (render.js sceneGeometry): { rows: layout rows + {top, bottom, left, right}, rect, measure }. Without geo the plan is
 * built from the source lines (no room limit) so rowState() can be called on its own.
 */
export function buildPlan(b, scene, geo = null) {
  const rows = geo?.rows ?? fallbackRows(scene);
  const split = b?.split || wordRanges;
  const units = [];
  let group = 0, order = 0, sawText = false;
  for (const row of rows) {
    if (row.gap) { if (sawText) group++; sawText = false; continue; }
    sawText = true;
    const u = { row, index: units.length, line: Number.isInteger(row.line) ? row.line : units.length, group, words: [] };
    if (b?.unit === "word") {
      const src = String(scene.lines?.[row.srcLine] ?? row.text ?? "");
      const ranges = split(src, row.start ?? 0, row.end ?? src.length) || [];
      for (const w of ranges) {
        const word = { start: w.start, end: w.end, order: order++, text: renderText(src.slice(w.start, w.end)) };
        if (geo?.measure && Number.isFinite(row.left)) {
          word.left = row.left + geo.measure(renderText(src.slice(row.start, w.start)));
          word.right = word.left + geo.measure(word.text);
        }
        u.words.push(word);
      }
    }
    units.push(u);
  }
  // groups are numbered from the first text row: a leading gap never creates an empty group
  const nGroups = units.length ? units[units.length - 1].group - units[0].group + 1 : 0;
  if (units.length && units[0].group) units.forEach((u) => (u.group -= units[0].group));
  const lines = new Set(units.map((u) => u.line));
  const plan = { rows: units, nRows: units.length, nLines: lines.size, nGroups, nWords: order, room: { down: Infinity, up: Infinity, scale: MAX_SCALE }, block: null };
  if (geo?.rect && units.length && units.every((u) => Number.isFinite(u.row.top))) {
    const L = Math.min(...units.map((u) => u.row.left)), R = Math.max(...units.map((u) => u.row.right));
    const top = Math.min(...units.map((u) => u.row.top)), bottom = Math.max(...units.map((u) => u.row.bottom));
    const cx = (L + R) / 2, cy = (top + bottom) / 2, rc = geo.rect;
    plan.block = { left: L, right: R, top, bottom, cx, cy };
    plan.room.down = Math.max(0, rc.y + rc.h - bottom);
    plan.room.up = Math.max(0, top - rc.y);
    // largest scale about the block centre that keeps every row inside the rect
    let s = MAX_SCALE;
    for (const u of units) {
      const r = u.row;
      if (r.left < cx) s = Math.min(s, (cx - rc.x) / (cx - r.left));
      if (r.right > cx) s = Math.min(s, (rc.x + rc.w - cx) / (r.right - cx));
      if (r.top < cy) s = Math.min(s, (cy - rc.y) / (cy - r.top));
      if (r.bottom > cy) s = Math.min(s, (rc.y + rc.h - cy) / (r.bottom - cy));
    }
    plan.room.scale = Math.max(1, s);
  }
  return plan;
}
const planOf = (b, scene, info) => info?.plan || buildPlan(b, scene, null);

/**
 * Staggered reveal: unit k starts at k*step and eases in over `unitMs`, rising by at most `maxDy` (capped by the room
 * below the block, so the rise never leaves the safe rect). The stagger shrinks to fit the scene; when even the minimum
 * stagger cannot finish and hold, validateAnimation refuses the scene.
 */
function reveal({ id, label, description, unit, count, keyOf, unitMs, stepMs, minStep, maxDy, baseDy }) {
  const timing = (scene, plan, p, last) => {
    const n = count(plan), u = T(p, unitMs);
    const step = fitStep(n, u, T(p, stepMs), minStep, readRoom(scene, plan, p, last));
    return { u, step, holdBy: Math.max(0, n - 1) * step + u, d: Math.max(0, Math.min(maxDy, baseDy * p.dist, plan.room.down)) };
  };
  const at = (scene, k, t, info) => {
    const p = prefOf(info), tm = timing(scene, planOf(B, scene, info), p, info?.last), start = k * tm.step;
    const e = t >= start + tm.u ? 1 : ez(p, (t - start) / tm.u);
    return { alpha: e * fadeOutAt(scene, t, info?.last), dy: tm.d * (1 - e), dx: 0 };
  };
  const B = {
    id, label, description, unit, library: true, maxDy, maxDx: 0, minAlpha: 1, maxScale: 1, minHoldMs: MIN_HOLD_MS, minSceneMs: MIN_SCENE_FLOOR_MS,
    holdBy: (scene, plan, p, last) => timing(scene, plan, p, last).holdBy,
    outMs: stdOut,
    rowState: (scene, row, t, info = {}) => {
      if (unit !== "word") return at(scene, keyOf(info.u || { line: row.line ?? 0, index: info.index ?? 0, group: 0 }), t, info);
      const ws = info.u?.words;
      return ws?.length ? at(scene, ws[ws.length - 1].order, t, info) : at(scene, 0, t, info);
    },
    ...(unit === "word" ? { wordState: (scene, row, word, t, info = {}) => at(scene, word.order, t, info) } : {}),
  };
  return B;
}
const MIN_SCENE_FLOOR_MS = 3000; // = scenes.js MIN_SCENE_MS

const slowZoom = (() => {
  const timing = (scene, plan, p, last) => {
    const fade = T(p, 700);
    const zoomMs = Math.max(ZOOM_MIN_MS, Math.min(T(p, 2600), readRoom(scene, plan, p, last)));
    return { fade, zoomMs, holdBy: Math.max(fade, zoomMs), s0: Math.min(MAX_SCALE, 1 + p.zoom, plan.room.scale) };
  };
  return {
    id: "slow-zoom", label: "Slow zoom", description: "The whole poem settles from a slight zoom (at most 4%) to its exact size.",
    unit: "block", library: true, maxDy: 0, maxDx: 0, minAlpha: 1, maxScale: MAX_SCALE, minHoldMs: MIN_HOLD_MS, minSceneMs: ZOOM_MIN_MS + MIN_HOLD_MS + FADE_OUT_MS,
    holdBy: (scene, plan, p, last) => timing(scene, plan, p, last).holdBy,
    outMs: stdOut,
    blockState: (scene, t, info = {}) => {
      const p = prefOf(info), tm = timing(scene, planOf(null, scene, info), p, info.last);
      return { scale: t >= tm.zoomMs ? 1 : 1 + (tm.s0 - 1) * (1 - ez(p, t / tm.zoomMs)) };
    },
    rowState: (scene, row, t, info = {}) => {
      const p = prefOf(info), tm = timing(scene, planOf(null, scene, info), p, info.last);
      return { alpha: (t >= tm.fade ? 1 : ez(p, t / tm.fade)) * fadeOutAt(scene, t, info.last), dy: 0, dx: 0 };
    },
  };
})();

const highlightLine = (() => {
  const timing = (scene, plan, p, last) => {
    const n = plan.nLines, fade = T(p, 600), settle = T(p, 400), tr = T(p, 200);
    if (n <= 1) return { n, fade, settle, tr, step: 0, hlEnd: fade, holdBy: fade };
    const step = Math.max(350, Math.min(T(p, 900), (readRoom(scene, plan, p, last) - fade - settle) / n));
    const hlEnd = fade + n * step;
    return { n, fade, settle, tr, step, hlEnd, holdBy: hlEnd + settle };
  };
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - Math.cos(Math.PI * x)) / 2);
  return {
    id: "highlight-line", label: "Highlight current line", description: "All lines appear softly; each line brightens in turn, then the whole poem is fully lit.",
    unit: "row", library: true, maxDy: 0, maxDx: 0, minAlpha: MIN_DIM_ALPHA, maxScale: 1, minHoldMs: MIN_HOLD_MS, minSceneMs: 3200,
    holdBy: (scene, plan, p, last) => timing(scene, plan, p, last).holdBy,
    outMs: stdOut,
    rowState: (scene, row, t, info = {}) => {
      const p = prefOf(info), plan = planOf(null, scene, info), tm = timing(scene, plan, p, info.last);
      const fadeIn = t >= tm.fade ? 1 : ez(p, t / tm.fade);
      const k = info.u ? info.u.line : row.line ?? 0;
      let lvl = 1;
      if (tm.n > 1 && t < tm.holdBy) {
        const dim = Math.max(MIN_DIM_ALPHA, p.dim);
        const hs = tm.fade + k * tm.step, he = hs + tm.step;
        const on = k === 0 ? 1 : smooth((t - (hs - tm.tr)) / tm.tr);
        const off = k === tm.n - 1 ? 0 : smooth((t - he) / tm.tr);
        const settle = t <= tm.hlEnd ? 0 : smooth((t - tm.hlEnd) / tm.settle);
        const mix = (w) => (w >= 1 ? 1 : dim + (1 - dim) * w); // exactly 1 when lit (no float overshoot)
        lvl = Math.max(mix(on * (1 - off)), mix(settle));
      }
      return { alpha: fadeIn * lvl * fadeOutAt(scene, t, info.last), dy: 0, dx: 0 };
    },
  };
})();

const lineFadeOut = (() => {
  const timing = (scene, plan, p, last) => {
    const inMs = T(p, 900);
    if (last) return { inMs, holdBy: inMs, outMs: 0, step: 0, unit: 0, outStart: Infinity };
    const n = Math.max(1, plan.nLines), unit = T(p, 450);
    const step = fitStep(n, unit, T(p, 220), 40, scene.durationMs - inMs - MIN_HOLD_MS);
    const outMs = (n - 1) * step + unit;
    return { inMs, holdBy: inMs, outMs, step, unit, outStart: scene.durationMs - outMs };
  };
  return {
    id: "line-fade-out", label: "Line fade-out", description: "The poem fades in, holds, then leaves line by line (the last scene stays on screen).",
    unit: "row", library: true, maxDy: 0, maxDx: 0, minAlpha: 1, maxScale: 1, minHoldMs: MIN_HOLD_MS, minSceneMs: MIN_SCENE_FLOOR_MS,
    holdBy: (scene, plan, p, last) => timing(scene, plan, p, last).holdBy,
    outMs: (scene, plan, p, last) => timing(scene, plan, p, last).outMs,
    rowState: (scene, row, t, info = {}) => {
      const p = prefOf(info), tm = timing(scene, planOf(null, scene, info), p, info.last);
      const a = t >= tm.inMs ? 1 : ez(p, t / tm.inMs);
      if (info.last) return { alpha: a, dy: 0, dx: 0 };
      const s = tm.outStart + (info.u ? info.u.line : row.line ?? 0) * tm.step;
      const o = t <= s ? 1 : t >= s + tm.unit ? 0 : 1 - ez(p, (t - s) / tm.unit);
      return { alpha: a * o, dy: 0, dx: 0 };
    },
  };
})();

export const LIBRARY = Object.freeze({
  "soft-fade": reveal({ id: "soft-fade", label: "Soft fade", description: "The whole poem fades in slowly and evenly.", unit: "block",
    count: () => 1, keyOf: () => 0, unitMs: 1100, stepMs: 0, minStep: 0, maxDy: 0, baseDy: 0 }),
  "line-reveal": reveal({ id: "line-reveal", label: "Line by line reveal", description: "Each line appears in reading order with a small lift.", unit: "row",
    count: (pl) => pl.nLines, keyOf: (u) => u.line, unitMs: 700, stepMs: 550, minStep: 120, maxDy: 16, baseDy: 10 }),
  "stanza-reveal": reveal({ id: "stanza-reveal", label: "Stanza by stanza", description: "Each stanza (block between blank lines) fades in as a whole.", unit: "row",
    count: (pl) => pl.nGroups, keyOf: (u) => u.group, unitMs: 900, stepMs: 1400, minStep: 300, maxDy: 0, baseDy: 0 }),
  "word-reveal": reveal({ id: "word-reveal", label: "Word by word", description: "Whole words appear in reading order; letters are never split.", unit: "word",
    count: (pl) => pl.nWords, keyOf: () => 0, unitMs: 450, stepMs: 160, minStep: 30, maxDy: 12, baseDy: 8 }),
  "gentle-rise": reveal({ id: "gentle-rise", label: "Gentle rise", description: "Rows drift up a few pixels into place, one after another.", unit: "row",
    count: (pl) => pl.nRows, keyOf: (u) => u.index, unitMs: 900, stepMs: 200, minStep: 60, maxDy: 24, baseDy: 16 }),
  "slow-zoom": slowZoom,
  "highlight-line": highlightLine,
  "line-fade-out": lineFadeOut,
});
export const LIBRARY_IDS = Object.keys(LIBRARY);

// Validation declarations of the four classic behaviours (their rowState/inEndMs above are unchanged).
const CLASSIC_DECL = {
  fade: { unit: "block", maxDy: 0, holdBy: () => FADE_IN_MS, description: "The scene fades in." },
  line: { unit: "row", maxDy: 0, holdBy: (scene, plan) => Math.max(0, plan.nLines - 1) * 450 + 600, description: "Lines fade in one after another." },
  rise: { unit: "row", maxDy: 56, holdBy: (scene, plan) => Math.max(0, plan.nRows - 1) * 150 + 800, description: "Rows rise into place." },
  none: { unit: "block", maxDy: 0, holdBy: () => 0, description: "Text is shown at once." },
};
export const ANIMATIONS = Object.freeze({
  ...Object.fromEntries(BEHAVIOUR_IDS.map((id) => [id, Object.freeze({ ...BEHAVIOURS[id], ...CLASSIC_DECL[id], maxDx: 0, minAlpha: 1, maxScale: 1, minHoldMs: 0, minSceneMs: 0, outMs: stdOut })])),
  ...LIBRARY,
});
export const ANIMATION_IDS = Object.keys(ANIMATIONS);
/** The behaviour drawFrame uses: reduce motion degrades EVERY behaviour to the plain fade with hold. */
export const activeBehaviour = (comp) => (reduceMotionOf(comp) ? ANIMATIONS.fade : ANIMATIONS[comp?.motion?.textIn] || ANIMATIONS.fade);

/** One animated frame of a planned scene, as drawn by drawFrame and checked by validateAnimation. */
export function animFrame(b, scene, plan, t, { last = false, p = PREF_PARAMS.normal, intensity = 0.5, still = false } = {}) {
  const base = { plan, p, last, intensity };
  const scale = still || !b.blockState ? 1 : b.blockState(scene, t, base).scale;
  const rows = plan.rows.map((u) => {
    if (still) return { u, state: HOLD, words: null, whole: true };
    const info = { ...base, u, index: u.index };
    const state = b.rowState(scene, u.row, t, info);
    if (b.unit !== "word") return { u, state, words: null, whole: true };
    const words = u.words.map((w) => ({ w, state: b.wordState(scene, u.row, w, t, info) }));
    const s0 = words[0]?.state;
    const whole = !!s0 && words.every((x) => x.state.alpha === s0.alpha && x.state.dy === 0 && x.state.dx === 0);
    return { u, state: whole ? { alpha: s0.alpha, dy: 0, dx: 0 } : state, words, whole };
  });
  return { scale, rows };
}

const NONDETERMINISTIC_RE = /\bMath\s*\.\s*random\b|\bDate\b|\bperformance\s*\.\s*now\b|\bcrypto\b/;
const isHold = (s) => s.alpha === 1 && s.dy === 0 && s.dx === 0;
const secs = (ms) => `${(Math.ceil(ms / 100) / 10).toFixed(1)} s`;

/**
 * Prove an animation is safe for ONE laid-out scene. geo = render.js sceneGeometry(ctx, comp, scene) (rows with boxes,
 * rect, canvas W/H, signature box, measure). opts: { last, p (PREF_PARAMS entry), intensity, label }.
 * Refuses (newResult shape, ok:false + message) when: the declaration is invalid or rejected; a function is
 * non-deterministic; a word split is not exactly at breakable whitespace; the scene is too short for the text to be
 * shown and held (never silently truncated); alpha leaves [0,1] or drops below minAlpha once shown; an offset exceeds
 * maxDy/maxDx or a scale exceeds maxScale; a moving, visible unit leaves the safe rect / canvas or meets the signature;
 * a unit is never fully visible; units become fully visible out of reading order; the state is not EXACT hold from
 * holdBy to the out phase.
 */
export function validateAnimation(b, scene, geo, opts = {}) {
  const { last = false, p = PREF_PARAMS.normal, intensity = 0.5, label = "scene" } = opts;
  const r = newResult();
  r.warnings = [];
  const fail = (list, msg) => { if (!r.messages.includes(`${label}: ${msg}`)) note(r, list, `${label}: ${msg}`); };
  // The four CLASSIC behaviours keep their original motion (unchanged since before the library). Their in-motion bounds
  // findings are reported as warnings, not refusals, so projects that exported before still export; every other check
  // (hold, visibility, order, timing, determinism) refuses as for any animation. Identity, not a flag: a forged object
  // can never claim this.
  const classic = BEHAVIOUR_IDS.includes(b?.id) && ANIMATIONS[b.id] === b;
  const motionBound = (msg) => {
    const m = `${label}: ${msg}`;
    if (!classic) return fail("outOfBounds", msg);
    if (!r.warnings.includes(m)) r.warnings.push(m);
  };
  const done = () => { r.ok = r.messages.length === 0; return r; };
  const name = b?.label ? `"${b.label}"` : "the text animation";
  if (!b || typeof b !== "object") { fail("orderIssues", "unknown text animation"); return done(); }
  if (REJECTED_ANIMATIONS[b.id]) { fail("orderIssues", REJECTED_ANIMATIONS[b.id]); return done(); }
  if (!UNITS.includes(b.unit)) fail("orderIssues", `${name} animates by "${b.unit}"; only whole rows, whole words or the whole block may move (never letters).`);
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!num(b.maxDy) || b.maxDy < 0 || !num(b.maxDx) || b.maxDx < 0) fail("orderIssues", `${name} does not declare its maximum offsets.`);
  if (!num(b.minAlpha) || b.minAlpha < MIN_DIM_ALPHA || b.minAlpha > 1) fail("orderIssues", `${name} would dim text below ${MIN_DIM_ALPHA}.`);
  const maxScale = b.maxScale ?? 1;
  if (!num(maxScale) || maxScale < 1 || maxScale > MAX_SCALE) fail("orderIssues", `${name} would scale text by more than ${MAX_SCALE}.`);
  const fns = ["rowState", "holdBy", ...(b.unit === "word" ? ["wordState"] : [])];
  for (const f of fns) if (typeof b[f] !== "function") fail("orderIssues", `${name} is missing ${f}.`);
  for (const f of ["rowState", "wordState", "blockState", "holdBy", "outMs", "split"])
    if (typeof b[f] === "function" && NONDETERMINISTIC_RE.test(Function.prototype.toString.call(b[f]))) fail("orderIssues", `${name} uses randomness or the clock (${f}); animations must be deterministic.`);
  if (r.messages.length) return done();

  const plan = buildPlan(b, scene, geo);
  // word units: split ONLY at breakable whitespace, covering each row exactly
  if (b.unit === "word") {
    for (const u of plan.rows) {
      const src = String(scene.lines?.[u.row.srcLine] ?? "");
      const ws = u.words, row = u.row;
      const bad = (why) => fail("textDiffs", `${name} splits ${JSON.stringify(String(row.text).slice(0, 40))} ${why}; words may only be split at spaces.`);
      if (!ws.length) { bad("into nothing"); continue; }
      if (ws[0].start !== row.start || ws[ws.length - 1].end !== row.end) bad("so that part of the row is not in any word");
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        if (!(Number.isInteger(w.start) && Number.isInteger(w.end) && w.end > w.start)) { bad("into an empty piece"); break; }
        if (i && !(w.start > ws[i - 1].end && isBreakableWhitespace(src.slice(ws[i - 1].end, w.start)))) { bad("inside a word or letter cluster"); break; }
        if (/[\s]/.test(src.slice(w.start, w.end).replace(/[   ﻿]/g, ""))) { bad("with spaces inside one word"); break; }
      }
    }
  }
  const outMs = typeof b.outMs === "function" ? b.outMs(scene, plan, p, last) : last ? 0 : FADE_OUT_MS;
  const holdBy = b.holdBy(scene, plan, p, last);
  const D = scene.durationMs, readEnd = D - outMs, minHold = b.minHoldMs ?? MIN_HOLD_MS;
  r.animation = { id: b.id, holdBy, outMs, durationMs: D, units: b.unit === "word" ? plan.nWords : plan.nRows };
  if (!num(holdBy) || !num(outMs) || holdBy < 0 || outMs < 0) { fail("orderIssues", `${name} has no valid timing.`); return done(); }
  const fits = (d) => {
    const sc = { ...scene, durationMs: d };
    const o = typeof b.outMs === "function" ? b.outMs(sc, plan, p, last) : last ? 0 : FADE_OUT_MS;
    return d >= (b.minSceneMs || 0) && b.holdBy(sc, plan, p, last) + minHold <= d - o;
  };
  if (!fits(D)) {
    let need = Math.ceil(D / 100) * 100;
    while (need < 60000 && !fits(need)) need += 100; // the shortest scene (0.1 s steps) this text can be shown and held in
    fail("missingLines", `${name} needs this scene to last at least ${secs(need)} so every line is fully shown and held (it is ${secs(D)}). Lengthen the scene or choose another text animation.`);
    return done();
  }
  // sample the whole scene (and the exact hold boundaries)
  const STEP = 40;
  const times = [];
  for (let t = 0; t <= D; t += STEP) times.push(t);
  times.push(holdBy, readEnd, D);
  times.sort((a, x) => a - x);
  const units = b.unit === "word" ? plan.rows.flatMap((u) => u.words.map((w) => ({ u, w }))) : plan.rows.map((u) => ({ u }));
  const firstFull = new Array(units.length).fill(null), shown = new Array(units.length).fill(false);
  const rc = geo?.rect, W = geo?.W ?? Infinity, H = geo?.H ?? Infinity, sg = geo?.sig || null, block = plan.block;
  const info = { last, p, intensity };
  for (const t of times) {
    const f = animFrame(b, scene, plan, t, info);
    const again = animFrame(b, scene, plan, t, info);
    if (JSON.stringify(f.scale) !== JSON.stringify(again.scale) || f.rows.some((x, i) => JSON.stringify(x.state) !== JSON.stringify(again.rows[i].state) || JSON.stringify(x.words?.map((w) => w.state)) !== JSON.stringify(again.rows[i].words?.map((w) => w.state))))
      fail("orderIssues", `${name} is not deterministic (two draws of the same frame differ).`);
    const s = f.scale;
    if (!num(s) || s < 1 - 1e-9 || s > maxScale + 1e-9) fail("outOfBounds", `${name} scales the text to ${s} (allowed 1 to ${maxScale}).`);
    const states = b.unit === "word" ? f.rows.flatMap((x) => x.words.map((w) => w.state)) : f.rows.map((x) => x.state);
    const inHold = t >= holdBy && t <= readEnd;
    if (inHold && s !== 1) fail("outOfBounds", `${name} is still zoomed at ${Math.round(t)} ms, after its hold time.`);
    states.forEach((st, i) => {
      if (!st || ![st.alpha, st.dy, st.dx].every(num)) return fail("orderIssues", `${name} produced an invalid state at ${Math.round(t)} ms.`);
      if (st.alpha < 0 || st.alpha > 1) fail("orderIssues", `${name} produced opacity ${st.alpha} (must be 0 to 1).`);
      if (Math.abs(st.dy) > b.maxDy + 1e-9) fail("outOfBounds", `${name} moves text ${Math.abs(st.dy).toFixed(1)}px vertically (its maximum is ${b.maxDy}px).`);
      if (Math.abs(st.dx) > b.maxDx + 1e-9) fail("outOfBounds", `${name} moves text ${Math.abs(st.dx).toFixed(1)}px sideways (its maximum is ${b.maxDx}px).`);
      if (inHold && !isHold(st)) fail("orderIssues", `${name} is not at rest at ${Math.round(t)} ms (after its hold time ${Math.round(holdBy)} ms): the held frame must be exactly the checked layout.`);
      if (t <= readEnd) {
        if (st.alpha === 1 && st.dy === 0 && st.dx === 0 && firstFull[i] == null) firstFull[i] = t;
        if (firstFull[i] != null && st.alpha < b.minAlpha - 1e-9) fail("missingLines", `${name} dims text below ${b.minAlpha} after it was shown.`);
      }
      if (st.alpha > 0.01) shown[i] = true;
      // a visible unit that is moved (offset or zoom) must stay inside the safe rect, the canvas, and clear of the signature
      const { u, w } = units[i];
      const moved = st.dy !== 0 || st.dx !== 0 || s !== 1;
      if (!moved || st.alpha <= 0.01 || !rc || !Number.isFinite(u.row.top)) return;
      let L = (w ? w.left : u.row.left) + st.dx, R = (w ? w.right : u.row.right) + st.dx, T0 = u.row.top + st.dy, B0 = u.row.bottom + st.dy;
      if (!Number.isFinite(L) || !Number.isFinite(R)) return fail("outOfBounds", `${name}: a word could not be measured.`);
      if (s !== 1 && block) { L = block.cx + (L - block.cx) * s; R = block.cx + (R - block.cx) * s; T0 = block.cy + (T0 - block.cy) * s; B0 = block.cy + (B0 - block.cy) * s; }
      const tol = TOLERANCE;
      if (L < rc.x - tol || R > rc.x + rc.w + tol || T0 < rc.y - tol || B0 > rc.y + rc.h + tol || L < -tol || R > W + tol || T0 < -tol || B0 > H + tol)
        motionBound(`${name} moves ${JSON.stringify(String(w ? w.text : u.row.text).slice(0, 40))} outside the safe area while it animates.`);
      if (sg && B0 > sg.top + tol && T0 < sg.bottom - tol) motionBound(`${name} moves text over the signature while it animates.`);
    });
  }
  units.forEach(({ u, w }, i) => {
    const what = JSON.stringify(String(w ? w.text : u.row.text).slice(0, 40));
    if (firstFull[i] == null) fail("missingLines", `${name} never fully shows ${what}.`);
    else if (firstFull[i] > holdBy + 1e-6) fail("missingLines", `${name} shows ${what} only after its declared hold time.`);
    if (i && firstFull[i] != null && firstFull[i - 1] != null && firstFull[i] < firstFull[i - 1]) fail("orderIssues", `${name} shows ${what} before the text that comes earlier in the poem.`);
  });
  if (!shown.every(Boolean)) fail("missingLines", `${name} keeps some text hidden.`);
  return done();
}
