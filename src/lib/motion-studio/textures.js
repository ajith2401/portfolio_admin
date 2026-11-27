// Surface textures (paper, paint, print) and film grain: seeded procedural TILES, generated once per (texture, seed)
// and painted with createPattern UNDER the poem text (material layer). Trusted renderer code, not an fx/ effect: the
// fx guard forbids patterns because effects are untrusted plug-ins; this module draws only its own tiles.
//
// Readability: a tile pixel is either lighter or darker than the background (never both), drawn in two passes —
// "toward" ink (toward the text colour, the one that can LOWER contrast) and "away" ink. Each pass's opacity is capped
// by the same contrast model as every material (fx/palette.js safeAlpha), shared with any material preset on the same
// frame, so text contrast stays >= min(4.5, the template's own). Every pass is recorded for fx/verify.js.
//
// Determinism: tiles come from makeRng(seed, ...) only (no Math.random / clock), so preview == export. Absent
// comp.material.texture / grain (every legacy project) => nothing is drawn and output is byte-identical.
import {
  makeRng,
  fxBases,
  textColours,
  safeAlpha,
  TINT_OVERLAP,
  FX_FPS,
} from "./fx/palette.js";
import { hexRgb, lum } from "./contrast.js";

export const TEXTURE_NONE = "none";
/** id -> label, family (for the picker), the strongest look it ever asks for (before the contrast cap), tile size. */
export const TEXTURES = Object.freeze(
  [
    { id: "paper", label: "Paper", family: "Paper", max: 0.5 },
    { id: "cold-press", label: "Watercolour paper", family: "Paper", max: 0.6 },
    { id: "kraft", label: "Kraft", family: "Paper", max: 0.6 },
    { id: "crumpled", label: "Crumpled", family: "Paper", max: 0.55 },
    { id: "parchment", label: "Parchment", family: "Paper", max: 0.55 },
    { id: "linen", label: "Linen", family: "Cloth", max: 0.45 },
    { id: "canvas", label: "Canvas", family: "Cloth", max: 0.5 },
    { id: "watercolor", label: "Watercolour wash", family: "Paint", max: 0.6 },
    { id: "brush", label: "Brush strokes", family: "Paint", max: 0.55 },
    { id: "gouache", label: "Gouache", family: "Paint", max: 0.55 },
    { id: "ink-splatter", label: "Ink splatter", family: "Paint", max: 0.6 },
    { id: "halftone", label: "Halftone", family: "Print", max: 0.45 },
    { id: "risograph", label: "Risograph", family: "Print", max: 0.55 },
    { id: "concrete", label: "Concrete", family: "Stone", max: 0.5 },
  ].map((t) => Object.freeze(t)),
);
export const TEXTURE_IDS = Object.freeze([
  TEXTURE_NONE,
  ...TEXTURES.map((t) => t.id),
]);
export const textureById = (id) => TEXTURES.find((t) => t.id === id) || null;
export const TEXTURE_FAMILIES = Object.freeze([
  ...new Set(TEXTURES.map((t) => t.family)),
]);
export const DEFAULT_TEXTURE_AMOUNT = 0.6;
export const GRAIN_MAX = 0.42; // film grain look at 100% (before the contrast cap)
const TILE = 512,
  GRAIN_TILE = 256;

// ---------------------------------------------------------------- what a composition asks for
/** The texture + grain a composition draws ([] = nothing). "Reduce effects" turns both off. */
export function texturePasses(comp) {
  const m = comp?.material;
  if (!m || m.reduce) return [];
  const out = [];
  const t = textureById(m.texture),
    amt = Number(m.textureAmount ?? DEFAULT_TEXTURE_AMOUNT);
  if (t && amt > 0)
    out.push({
      kind: "texture",
      id: t.id,
      amount: Math.min(1, amt),
      max: t.max,
    });
  const g = Number(m.grain || 0);
  if (g > 0)
    out.push({
      kind: "grain",
      id: "grain",
      amount: Math.min(1, g),
      max: GRAIN_MAX,
      moving: m.grainMove !== false,
    });
  return out;
}
export const textureLayerCount = (comp) => texturePasses(comp).length;

/**
 * Per-pass opacity caps for one composition: { toward: {rgb, alpha}, away: {rgb, alpha} }. `others` = how many other
 * stacked toward-ops share the budget (a material preset's TINT_OVERLAP). Pure.
 */
export function textureBudget(comp, { others = 0 } = {}) {
  const lightText = lum(...hexRgb(comp.style.color)) > 0.4;
  const toward = lightText ? [255, 255, 255] : [0, 0, 0],
    away = lightText ? [0, 0, 0] : [255, 255, 255];
  const bases = fxBases(comp),
    texts = textColours(comp),
    n = Math.max(1, textureLayerCount(comp) + others);
  const per = (rgb) => {
    const A = safeAlpha(bases, rgb, texts);
    return A >= 1 ? 1 : 1 - Math.pow(1 - A, 1 / n);
  };
  return {
    lightText,
    toward: { rgb: toward, alpha: per(toward) },
    away: { rgb: away, alpha: per(away) },
  };
}
/** The opacity each ink of a pass is drawn with: the look the author chose, never above the contrast cap. */
export function passAlphas(comp, pass, { others = 0 } = {}) {
  const b = textureBudget(comp, { others }),
    want = pass.amount * pass.max;
  return {
    toward: { rgb: b.toward.rgb, alpha: Math.min(want, b.toward.alpha) },
    away: { rgb: b.away.rgb, alpha: Math.min(want, b.away.alpha) },
    lightText: b.lightText,
  };
}

// ---------------------------------------------------------------- seamless procedural fields, values in [-1, 1]
const smooth = (t) => t * t * (3 - 2 * t);
function lattice(rng, P) {
  const a = new Float32Array(P * P);
  for (let i = 0; i < a.length; i++) a[i] = rng() * 2 - 1;
  return a;
}
/** Periodic value noise: P lattice cells across the tile (P divides the tile, so it tiles seamlessly). */
function noiseField(
  rng,
  S,
  P,
  out = new Float32Array(S * S),
  w = 1,
  warp = null,
) {
  const L = lattice(rng, P),
    k = P / S;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let u = x * k,
        v = y * k;
      if (warp) {
        u += warp[y * S + x] * P * 0.18;
        v += warp[((y * 7 + 13) % S) * S + ((x * 5 + 29) % S)] * P * 0.18;
      }
      const x0 = Math.floor(u),
        y0 = Math.floor(v),
        fx = smooth(u - x0),
        fy = smooth(v - y0);
      const X0 = ((x0 % P) + P) % P,
        Y0 = ((y0 % P) + P) % P,
        X1 = (X0 + 1) % P,
        Y1 = (Y0 + 1) % P;
      const a = L[Y0 * P + X0],
        b = L[Y0 * P + X1],
        c = L[Y1 * P + X0],
        d = L[Y1 * P + X1];
      out[y * S + x] +=
        w * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
    }
  return out;
}
function fbm(rng, S, P, octaves, { gain = 0.5, warp = null } = {}) {
  const out = new Float32Array(S * S);
  let w = 1;
  for (let o = 0; o < octaves && P <= S; o++, P *= 2, w *= gain)
    noiseField(rng, S, P, out, w, o === 0 ? warp : null);
  return out;
}
/** Anisotropic periodic noise: Px cells across, Py cells down (long streaks when Px << Py). */
function streaks(rng, S, Px, Py, out, w) {
  const L = lattice(rng, Math.max(Px, Py));
  const P = Math.max(Px, Py);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = (x * Px) / S,
        v = (y * Py) / S,
        x0 = Math.floor(u),
        y0 = Math.floor(v),
        fx = smooth(u - x0),
        fy = smooth(v - y0);
      const X0 = x0 % Px,
        Y0 = y0 % Py,
        X1 = (X0 + 1) % Px,
        Y1 = (Y0 + 1) % Py;
      const g = (i, j) => L[(j % P) * P + (i % P)];
      const a = g(X0, Y0),
        b = g(X1, Y0),
        c = g(X0, Y1),
        d = g(X1, Y1);
      out[y * S + x] +=
        w * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
    }
  return out;
}
const addPixelNoise = (rng, f, w) => {
  for (let i = 0; i < f.length; i++)
    f[i] += (w * (rng() + rng() + rng() - 1.5)) / 1.5;
  return f;
};
/** Stamp soft round dots (wrapping at the tile edge). */
function dots(rng, S, f, count, rMin, rMax, w) {
  for (let n = 0; n < count; n++) {
    const cx = rng() * S,
      cy = rng() * S,
      r = rMin + rng() * (rMax - rMin),
      s = w * (0.6 + rng() * 0.4),
      R = Math.ceil(r + 1);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 1) continue;
        const x = ((Math.floor(cx + dx) % S) + S) % S,
          y = ((Math.floor(cy + dy) % S) + S) % S;
        f[y * S + x] += s * Math.min(1, r + 1 - d);
      }
  }
  return f;
}
/** Short wandering fibres (paper), wrapping at the tile edge. */
function fibres(rng, S, f, count, len, w) {
  for (let n = 0; n < count; n++) {
    let x = rng() * S,
      y = rng() * S,
      a = rng() * Math.PI * 2;
    const L = len * (0.4 + rng()),
      s = w * (rng() < 0.5 ? -1 : 0.7) * (0.5 + rng() * 0.5);
    for (let i = 0; i < L; i++) {
      a += (rng() - 0.5) * 0.35;
      x += Math.cos(a);
      y += Math.sin(a);
      const X = ((Math.floor(x) % S) + S) % S,
        Y = ((Math.floor(y) % S) + S) % S;
      f[Y * S + X] += s;
    }
  }
  return f;
}
/** Normalise so the 98th percentile of |v| is 1, then clamp to [-1, 1]. */
function normalise(f, rng) {
  const sample = [];
  for (let i = 0; i < 4096; i++)
    sample.push(Math.abs(f[Math.floor(rng() * f.length)]));
  sample.sort((a, b) => a - b);
  const p = sample[Math.floor(sample.length * 0.98)] || 1;
  for (let i = 0; i < f.length; i++) f[i] = Math.max(-1, Math.min(1, f[i] / p));
  return f;
}

/** The signed field of one texture (pure; exported for tests). */
export function textureField(
  id,
  seed = 1,
  S = id === "grain" ? GRAIN_TILE : TILE,
) {
  const rng = makeRng(seed, "texture", id, S);
  let f;
  switch (id) {
    case "paper":
      f = fbm(rng, S, 4, 5, { gain: 0.55 });
      for (let i = 0; i < f.length; i++) f[i] *= 0.6;
      addPixelNoise(rng, f, 0.28);
      fibres(rng, S, f, 420, 22, 0.55);
      break;
    case "cold-press": {
      f = fbm(rng, S, 16, 4, { gain: 0.6 });
      const pits = fbm(rng, S, 64, 2, { gain: 0.5 });
      for (let i = 0; i < f.length; i++)
        f[i] = 0.55 * f[i] - 0.6 * Math.max(0, pits[i] - 0.15);
      addPixelNoise(rng, f, 0.18);
      break;
    }
    case "kraft":
      f = fbm(rng, S, 8, 5, { gain: 0.55 });
      fibres(rng, S, f, 1400, 26, 0.7);
      dots(rng, S, f, 260, 0.4, 1.4, -0.9);
      addPixelNoise(rng, f, 0.3);
      break;
    case "crumpled": {
      const n = fbm(rng, S, 4, 4, { gain: 0.5 });
      f = new Float32Array(S * S);
      for (let i = 0; i < f.length; i++) f[i] = 0.9 - 2.2 * Math.abs(n[i]);
      const fine = fbm(rng, S, 32, 2);
      for (let i = 0; i < f.length; i++) f[i] += 0.25 * fine[i];
      break;
    }
    case "parchment": {
      f = fbm(rng, S, 2, 6, { gain: 0.6 });
      const blot = fbm(rng, S, 8, 3);
      for (let i = 0; i < f.length; i++)
        f[i] = 0.7 * f[i] - 0.5 * Math.max(0, blot[i] - 0.25);
      fibres(rng, S, f, 220, 30, 0.35);
      addPixelNoise(rng, f, 0.15);
      break;
    }
    case "linen": {
      f = new Float32Array(S * S);
      const row = Array.from({ length: S }, () => rng() * 2 - 1),
        col = Array.from({ length: S }, () => rng() * 2 - 1);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++)
          f[y * S + x] =
            0.55 * row[y] * (0.6 + 0.4 * Math.cos((x * Math.PI * 2) / 4)) +
            0.55 * col[x] * (0.6 + 0.4 * Math.cos((y * Math.PI * 2) / 4));
      noiseField(rng, S, 8, f, 0.35);
      addPixelNoise(rng, f, 0.12);
      break;
    }
    case "canvas": {
      f = new Float32Array(S * S);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const over = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
          const tx = Math.cos(((x % 8) / 8) * Math.PI * 2),
            ty = Math.cos(((y % 8) / 8) * Math.PI * 2);
          f[y * S + x] = 0.6 * (over ? ty : tx);
        }
      noiseField(rng, S, 16, f, 0.45);
      addPixelNoise(rng, f, 0.2);
      break;
    }
    case "watercolor": {
      const warp = fbm(rng, S, 4, 3);
      const n = fbm(rng, S, 4, 5, { gain: 0.55, warp });
      f = new Float32Array(S * S);
      // pigment pools: darker blooms with darker rims where the wash dried (edge darkening)
      for (let i = 0; i < f.length; i++) {
        const v = n[i];
        const rim = Math.max(0, 1 - Math.abs(v - 0.1) * 9);
        f[i] = -0.8 * Math.max(0, v) - 0.7 * rim + 0.35 * Math.min(0, v);
      }
      noiseField(rng, S, 64, f, 0.12);
      break;
    }
    case "brush": {
      f = new Float32Array(S * S);
      streaks(rng, S, 2, 32, f, 0.7);
      streaks(rng, S, 4, 128, f, 0.45);
      streaks(rng, S, 8, 256, f, 0.3);
      addPixelNoise(rng, f, 0.08);
      break;
    }
    case "gouache": {
      f = fbm(rng, S, 4, 3, { gain: 0.45 });
      for (let i = 0; i < f.length; i++) f[i] = Math.round(f[i] * 3) / 3; // flat, matte patches
      streaks(rng, S, 4, 64, f, 0.25);
      addPixelNoise(rng, f, 0.1);
      break;
    }
    case "ink-splatter":
      f = new Float32Array(S * S);
      dots(rng, S, f, 26, 3, 10, -1.2);
      dots(rng, S, f, 420, 0.6, 2.4, -1);
      dots(rng, S, f, 1600, 0.3, 0.9, -0.8);
      noiseField(rng, S, 8, f, 0.12);
      break;
    case "halftone": {
      f = new Float32Array(S * S);
      const tone = fbm(rng, S, 4, 3);
      const P = 8;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          // 45-degree screen: rotate into the dot grid (P divides S, so the tile is seamless along both axes)
          const u = (x + y) / 2,
            v = (x - y + S) / 2;
          const cx = (u % P) - P / 2,
            cy = (v % P) - P / 2;
          const r = (0.25 + 0.5 * (tone[y * S + x] * 0.5 + 0.5)) * P * 0.5;
          const d = Math.hypot(cx, cy);
          f[y * S + x] = d < r ? -1 : d < r + 1 ? -(r + 1 - d) : 0.12;
        }
      break;
    }
    case "risograph":
      f = fbm(rng, S, 8, 3, { gain: 0.5 });
      for (let i = 0; i < f.length; i++) f[i] *= 0.35;
      dots(rng, S, f, 5200, 0.3, 1.3, -1);
      dots(rng, S, f, 1200, 0.3, 1, 0.8);
      addPixelNoise(rng, f, 0.25);
      break;
    case "concrete":
      f = fbm(rng, S, 8, 5, { gain: 0.6 });
      dots(rng, S, f, 900, 0.4, 2.2, -1.1);
      dots(rng, S, f, 300, 0.4, 1.4, 0.8);
      addPixelNoise(rng, f, 0.3);
      break;
    case "grain":
      f = addPixelNoise(rng, new Float32Array(S * S), 1);
      noiseField(rng, S, S / 2, f, 0.35); // a touch of clumping, like silver grain
      break;
    default:
      return null;
  }
  return normalise(f, rng);
}

// ---------------------------------------------------------------- tiles (browser only) + cache
const tiles = new Map(); // key -> { toward, away } canvases; small LRU
const TILE_CACHE = 6;
const newCanvas = (S) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(S, S);
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    return c;
  }
  return null;
};
/** Two RGBA tiles of one field: white where it is lighter, black where it is darker (alpha = |v|). */
function tilesFor(id, seed, flip = false) {
  const key = `${id}|${seed}|${flip ? 1 : 0}`;
  if (tiles.has(key)) {
    const t = tiles.get(key);
    tiles.delete(key);
    tiles.set(key, t);
    return t;
  }
  const S = id === "grain" ? GRAIN_TILE : TILE;
  const light = newCanvas(S),
    dark = newCanvas(S);
  const lc = light?.getContext?.("2d"),
    dc = dark?.getContext?.("2d");
  if (!lc || !dc || typeof lc.createImageData !== "function") return null;
  const f = textureField(id, seed, S);
  if (!f) return null;
  const L = lc.createImageData(S, S),
    D = dc.createImageData(S, S);
  for (let i = 0; i < f.length; i++) {
    const v = flip ? -f[i] : f[i],
      j = i * 4;
    L.data[j] = L.data[j + 1] = L.data[j + 2] = 255;
    L.data[j + 3] = v > 0 ? Math.round(v * 255) : 0;
    D.data[j] = D.data[j + 1] = D.data[j + 2] = 0;
    D.data[j + 3] = v < 0 ? Math.round(-v * 255) : 0;
  }
  lc.putImageData(L, 0, 0);
  dc.putImageData(D, 0, 0);
  const t = { light, dark, S };
  tiles.set(key, t);
  while (tiles.size > TILE_CACHE) tiles.delete(tiles.keys().next().value);
  return t;
}
export const clearTextureCache = () => tiles.clear();

// ---------------------------------------------------------------- painting
/**
 * Paint the composition's texture and grain over the background (call in the material layer, before any text).
 * env: { comp, W, H, tMs, still, plan, seed, fxTrace }. Returns the number of passes drawn (0 = untouched ctx).
 */
export function paintTextures(ctx, env) {
  const passes = texturePasses(env.comp);
  if (!passes.length) return 0;
  const others = env.plan?.length ? TINT_OVERLAP : 0;
  const seed = env.seed ?? 1,
    frame = env.still
      ? 0
      : Math.max(0, Math.floor(((env.tMs || 0) * FX_FPS) / 1000));
  let drawn = 0;
  for (const p of passes) {
    const a = passAlphas(env.comp, p, { others });
    // dark background: the marks lighten instead (light paint on dark paper), so a mostly-darkening texture such as a
    // watercolour wash never vanishes into black. Only when the contrast budget leaves room to lighten.
    const flip = p.kind === "texture" && a.lightText && a.toward.alpha >= 0.1;
    const inks = [
      { rgb: a.away.rgb, alpha: a.away.alpha, light: !a.lightText },
      { rgb: a.toward.rgb, alpha: a.toward.alpha, light: a.lightText },
    ];
    for (const ink of inks) {
      if (!(ink.alpha > 0)) continue;
      // the verifier's record of this pass: full canvas, its colour at its opacity (tile alpha <= 1 is never more)
      env.fxTrace?.push({
        fx: `texture:${p.id}`,
        layer: "material",
        bbox: [0, 0, env.W, env.H],
        alpha: ink.alpha,
        paint: { rgb: ink.rgb, a: 1 },
        tf: { tx: 0, ty: 0, sx: 1, sy: 1 },
      });
      if (typeof ctx.createPattern !== "function") continue;
      const t = tilesFor(p.id, seed, flip);
      if (!t) continue;
      const pat = ctx.createPattern(ink.light ? t.light : t.dark, "repeat");
      if (!pat) continue;
      // moving grain: a new seeded offset every 2 frames (15 fps grain); stills and textures stay put
      let ox = 0,
        oy = 0;
      if (p.kind === "grain" && p.moving && !env.still) {
        const r = makeRng(seed, "grain-offset", frame >> 1);
        ox = Math.floor(r() * t.S);
        oy = Math.floor(r() * t.S);
      }
      ctx.save();
      ctx.globalAlpha = ink.alpha;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = pat;
      ctx.translate(-ox, -oy);
      ctx.fillRect(ox, oy, env.W, env.H);
      ctx.restore();
      drawn++;
    }
  }
  return drawn || passes.length; // passes.length: in a tracing ctx (no pixels) the caller still resets text state
}

/** A picker swatch at 1:1 tile scale: the composition's background colour + one texture at full strength. */
export function paintTextureSwatch(ctx, comp, id, w, h) {
  const bg = comp.style.bg || {}, g = ctx.createLinearGradient?.(0, 0, 0, h);
  if (g && bg.kind !== "solid" && bg.b) { g.addColorStop(0, bg.a); g.addColorStop(1, bg.b); ctx.fillStyle = g; }
  else ctx.fillStyle = bg.a || "#222222";
  ctx.fillRect(0, 0, w, h);
  const material = id === "grain" ? { id: "none", grain: 1, grainMove: false } : { id: "none", texture: id, textureAmount: 1 };
  return paintTextures(ctx, { comp: { ...comp, material }, W: w, H: h, still: true, seed: comp.material?.seed ?? 1, plan: [] });
}
