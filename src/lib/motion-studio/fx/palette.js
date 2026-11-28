// Seeded PRNG + contrast-safe colours for material effects. Pure: depends only on the composition (and an optional
// readability scrim), never on pixels, time or randomness, so preview and export draw the same material.
import { hexRgb, lum, ratio } from "../contrast.js";
import { textileBases } from "../textiles.js";
import { skyBases } from "../sky.js";

/** WCAG target used by contrast.js (requiredScrim). An effect may never push text contrast below it (or below the
 *  template's own contrast when that is already lower). */
export const CONTRAST_TARGET = 4.5;
/** Worst-case number of tinted (toward-text) ops a plan may stack on one pixel; per-op alpha is budgeted for it. */
export const TINT_OVERLAP = 4;
export const FX_FPS = 30;

// ---------------------------------------------------------------- deterministic PRNG (mulberry32 over a hashed key)
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
/** rng(seed, ...keys): a deterministic generator of floats in [0,1). Same inputs => same sequence, everywhere. */
export function makeRng(seed, ...keys) {
  let a = (Number(seed) >>> 0) ^ hashStr(keys.join("|"));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- colour model
const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const rgba = (rgb, a) =>
  `rgba(${rgb.map((v) => Math.round(v)).join(",")},${clamp01(a).toFixed(4)})`;

/** Every text colour drawn on the frame (poem text, and the signature / page label colour). */
export const textColours = (comp) => [...new Set([comp.style.color, comp.branding?.color].filter((c) => /^#[0-9a-f]{6}$/i.test(c || "")))];

/**
 * Background colours an effect is drawn over, for the contrast model: the template's background stops (and their
 * midpoint) with the colour overlay applied. With a photo background the pixels are unknown, so the model uses the
 * colour that sits exactly AT the contrast target on the far side of the poem text (the worst case the readability
 * scrim allows). Returns [{rgb}]. The readability scrim is deliberately ignored (it only ever darkens/lightens toward
 * more contrast), so preview, export and the verifier all use the same model.
 */
export function fxBases(comp) {
  const st = comp.style, text = hexRgb(st.color), tl = lum(...text), lightText = tl > 0.4;
  let bases;
  if (st.bg?.image) {
    const far = lightText ? [0, 0, 0] : [255, 255, 255];
    let k = 0;
    for (; k <= 1.0001; k += 0.01) if (ratio(tl, lum(...mix(text, far, k))) >= CONTRAST_TARGET) break;
    bases = [mix(text, far, Math.min(1, k))];
  } else if (skyBases(comp)) {
    bases = skyBases(comp); // a Sky & Celestial background replaces the template gradient (sky.js)
  } else {
    const a = hexRgb(st.bg.a), b = hexRgb(st.bg.kind === "solid" ? st.bg.a : st.bg.b);
    bases = [a, b, mix(a, b, 0.5)];
  }
  const ov = st.overlay?.opacity > 0 ? hexRgb(st.overlay.color) : null;
  if (ov) bases = bases.map((c) => mix(c, ov, st.overlay.opacity));
  // a woven textile covers the template background: its dark / middle / light cloth over each base (textiles.js)
  return comp.material?.textile ? textileBases(comp, bases.map((rgb) => ({ rgb }))) : bases.map((rgb) => ({ rgb }));
}
/** Contrast floor of a text colour on a base: the target, or the text's own contrast there when already lower. */
export const floorFor = (textRgb, baseRgb) => Math.min(CONTRAST_TARGET, ratio(lum(...textRgb), lum(...baseRgb)));

/** Largest single-layer alpha of `ink` over every base that keeps every text colour's contrast >= its floor. */
export function safeAlpha(bases, inkRgb, texts) {
  const pairs = [];
  for (const t of texts) { const rgb = hexRgb(t), tl = lum(...rgb); for (const b of bases) pairs.push({ tl, b: b.rgb, floor: floorFor(rgb, b.rgb) }); }
  let ok = 0;
  for (let i = 1; i <= 50; i++) {
    const a = i / 50;
    if (!pairs.every((q) => ratio(q.tl, lum(...mix(q.b, inkRgb, a))) >= q.floor - 1e-6)) break;
    ok = a;
  }
  return ok;
}

const cache = new WeakMap();
/**
 * Contrast-safe palette for one composition. Every colour an effect asks for goes through the same clamp: its alpha
 * is limited so that TINT_OVERLAP stacked layers still keep every text colour at or above its floor. `away` (darker
 * for light text, lighter for dark text) normally has no limit; `toward` and named tints usually do.
 */
export function fxPalette(comp) {
  if (cache.has(comp)) return cache.get(comp);
  const lightText = lum(...hexRgb(comp.style.color)) > 0.4;
  const bases = fxBases(comp), texts = textColours(comp);
  const away = lightText ? [0, 0, 0] : [255, 255, 255], toward = lightText ? [255, 255, 255] : [0, 0, 0];
  const safe = new Map();
  const opAlpha = (rgb) => {
    const k = rgb.join(",");
    if (!safe.has(k)) { const A = safeAlpha(bases, rgb, texts); safe.set(k, A >= 1 ? 1 : 1 - Math.pow(1 - A, 1 / TINT_OVERLAP)); }
    return safe.get(k);
  };
  const pal = {
    lightText, bases, texts, awayRgb: away, towardRgb: toward,
    /** any colour (hex or [r,g,b]) with its alpha clamped to the contrast-safe budget; `scale` = the op's globalAlpha cap */
    tint: (hexOrRgb, a, scale = 1) => {
      const rgb = Array.isArray(hexOrRgb) ? hexOrRgb : hexRgb(hexOrRgb);
      return rgba(rgb, Math.min(a, opAlpha(rgb) / Math.max(1e-6, scale)));
    },
    away: (a, scale = 1) => pal.tint(away, a, scale),
    toward: (a, scale = 1) => pal.tint(toward, a, scale),
  };
  cache.set(comp, pal);
  return pal;
}
