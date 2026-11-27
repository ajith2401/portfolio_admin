// Woven Textiles: procedural, seeded cloth surfaces (warp + weft threads, weave structure, fibre, wear, tonal drift).
// comp.material.textile = { id, strength, scale, fibre, contrast, grain, distress, opacity, tonal, tint?, move }.
// Absent (every legacy project) => nothing is drawn and drawFrame is byte-identical (golden fixture).
//
// Rendering: three SEAMLESS tiles are baked ONCE per settings change (pure JS pixel generators, makeRng only — no
// Math.random / clock) and cached (bounded LRU), then painted with createPattern:
//   threads  512px  warp/weft threads + weave + fibre + grain        (period 512)
//   distress 448px  sparse speckles, fine scratches, stray fibres      (period 448: the two never line up for 3584px)
//   tonal    128px  low-frequency organic tonal variation, drawn x12   (period 1536: no visible repeat on one frame)
// Every frame only fills patterns (and, when the cloth moves, translates them by a time-derived offset), so preview,
// PNG/JPEG and MP4 export draw the same pixels. Small canvases get pre-filtered (box-downsampled) tiles, so a scaled
// preview never shimmers with moire.
//
// Readability: the text colour is never changed. Before the poem rows are drawn, the cloth UNDER the text block (and
// under the signature) is sampled from the baked tile data — locally, not a global score — and, only when needed, a
// feathered local scrim (contrast.js requiredScrim) is laid under that block so the text reaches 4.5:1.
import { makeRng } from "./fx/palette.js";
import { hexRgb, lum, ratio, requiredScrim } from "./contrast.js";

export const TEXTILE_NONE = "none";
export const TEXTILE_FAMILY = "Woven Textiles";
const TILE = 512,
  DISTRESS = 448,
  TONAL = 128,
  TONAL_SCALE = 12;

/*
 * Preset data. weave: plain | twill (3/1, diagonal) | basket (2/2 canvas). px/py: warp/weft spacing (px at 1080 wide).
 * cover*: share of the spacing a thread fills. slub: thickness irregularity. wave: thread wander. warp/weft: thread
 * colours. gap: what shows between threads. k*: the preset's own look (user sliders scale these, 0.5 = as designed).
 */
export const TEXTILES = Object.freeze(
  [
    {
      id: "dark-indigo-woven",
      label: "Dark Indigo Woven Fabric",
      hint: "aged indigo linen-canvas, matte",
      level: "medium",
      weave: "plain",
      px: 4.2,
      py: 5.0,
      coverX: 0.94,
      coverY: 0.78,
      slub: 0.16,
      wave: 0.14,
      jitter: 0.1,
      warp: ["#0B2C50", "#123A60", "#0F3358", "#1C4569"],
      weft: ["#071B32", "#0A2645"],
      gap: "#051528",
      dip: 0.3,
      kContrast: 1,
      kFibre: 0.7,
      kGrain: 0.8,
      kDistress: 0.55,
      kTonal: 0.75,
      twist: 0.05,
    },
    {
      id: "midnight-navy-linen",
      label: "Midnight Navy Linen",
      hint: "slubby balanced linen, near-black navy",
      level: "subtle",
      weave: "plain",
      px: 4.8,
      py: 4.8,
      coverX: 0.86,
      coverY: 0.86,
      slub: 0.34,
      wave: 0.2,
      jitter: 0.14,
      warp: ["#0A1A2F", "#0E2240", "#122A4B"],
      weft: ["#091729", "#0D2039", "#10263F"],
      gap: "#040C18",
      dip: 0.28,
      kContrast: 1.05,
      kFibre: 0.9,
      kGrain: 0.6,
      kDistress: 0.3,
      kTonal: 0.6,
      twist: 0.03,
    },
    {
      id: "indigo-denim-twill",
      label: "Indigo Denim Twill",
      hint: "3/1 diagonal twill, ring-spun streaks",
      level: "strong",
      weave: "twill",
      px: 3.4,
      py: 3.8,
      coverX: 0.96,
      coverY: 0.9,
      slub: 0.12,
      wave: 0.08,
      jitter: 0.06,
      warp: ["#1B3A6B", "#22457A", "#173260", "#2A4F86"],
      weft: ["#7F8FA8", "#8E9CB2"],
      gap: "#0E1F3C",
      dip: 0.34,
      kContrast: 1,
      kFibre: 0.5,
      kGrain: 0.7,
      kDistress: 0.35,
      kTonal: 0.7,
      streak: 0.16,
      twist: 0.06,
    },
    {
      id: "blue-cotton-canvas",
      label: "Blue Cotton Canvas",
      hint: "2/2 basket weave, sturdy duck canvas",
      level: "strong",
      weave: "basket",
      px: 4.4,
      py: 4.4,
      coverX: 0.9,
      coverY: 0.9,
      slub: 0.08,
      wave: 0.06,
      jitter: 0.06,
      warp: ["#1F4E79", "#24598A", "#1A4470"],
      weft: ["#1A446C", "#20507E", "#1C4A75"],
      gap: "#0D263F",
      dip: 0.45,
      kContrast: 1.35,
      kFibre: 0.4,
      kGrain: 0.6,
      kDistress: 0.25,
      kTonal: 0.55,
      twist: 0.04,
    },
    {
      id: "distressed-navy-cloth",
      label: "Distressed Navy Cloth",
      hint: "worn navy cotton: faded patches, scuffs",
      level: "strong",
      weave: "plain",
      px: 4.4,
      py: 4.8,
      coverX: 0.9,
      coverY: 0.82,
      slub: 0.22,
      wave: 0.16,
      jitter: 0.12,
      warp: ["#13304F", "#1A3B5E", "#0F2844", "#21456A"],
      weft: ["#0E2640", "#132E4D"],
      gap: "#081A2E",
      fade: "#3E5C7C",
      dip: 0.3,
      kContrast: 0.95,
      kFibre: 0.8,
      kGrain: 0.9,
      kDistress: 1.6,
      kTonal: 1.1,
      twist: 0.05,
    },
    {
      id: "charcoal-woven",
      label: "Charcoal Woven Fabric",
      hint: "heathered charcoal wool-cotton",
      level: "subtle",
      weave: "plain",
      px: 4,
      py: 4.4,
      coverX: 0.9,
      coverY: 0.84,
      slub: 0.18,
      wave: 0.14,
      jitter: 0.1,
      warp: ["#2E2F33", "#36373C", "#292A2E"],
      weft: ["#232428", "#2A2B2F"],
      gap: "#151619",
      dip: 0.28,
      heather: 0.5,
      kContrast: 0.9,
      kFibre: 0.7,
      kGrain: 0.7,
      kDistress: 0.35,
      kTonal: 0.6,
      twist: 0.04,
    },
    {
      id: "natural-linen",
      label: "Natural Linen",
      hint: "light oat linen, slubby threads",
      level: "medium",
      light: true,
      weave: "plain",
      px: 4.6,
      py: 4.6,
      coverX: 0.84,
      coverY: 0.84,
      slub: 0.36,
      wave: 0.2,
      jitter: 0.14,
      warp: ["#D8CAB0", "#CDBD9F", "#E2D6BF", "#D3C4A8"],
      weft: ["#CFC0A4", "#DACDB5"],
      gap: "#A8977A",
      dip: 0.22,
      kContrast: 0.8,
      kFibre: 0.8,
      kGrain: 0.5,
      kDistress: 0.3,
      kTonal: 0.55,
      twist: 0.03,
    },
    {
      id: "soft-cotton-weave",
      label: "Soft Cotton Weave",
      hint: "fine white cotton, barely-there weave",
      level: "subtle",
      light: true,
      weave: "plain",
      px: 3,
      py: 3.2,
      coverX: 0.9,
      coverY: 0.88,
      slub: 0.1,
      wave: 0.08,
      jitter: 0.08,
      warp: ["#ECEAE4", "#E5E2DB", "#F1EFEA"],
      weft: ["#E6E3DC", "#EEEBE5"],
      gap: "#CDC8BE",
      dip: 0.16,
      kContrast: 0.6,
      kFibre: 0.4,
      kGrain: 0.4,
      kDistress: 0.15,
      kTonal: 0.4,
      twist: 0.02,
    },
  ].map((t) =>
    Object.freeze({
      ...t,
      warp: Object.freeze(t.warp),
      weft: Object.freeze(t.weft),
    }),
  ),
);
export const TEXTILE_IDS = Object.freeze([
  TEXTILE_NONE,
  ...TEXTILES.map((t) => t.id),
]);
export const textileById = (id) => TEXTILES.find((t) => t.id === id) || null;

/** Visual-family suggestions (templates.js FAMILIES ids). Suggestions only: every textile works with every look. */
export const TEXTILE_SUGGESTIONS = Object.freeze({
  "ink-silence": Object.freeze(["charcoal-woven", "midnight-navy-linen"]),
  "paper-ink": Object.freeze(["natural-linen"]),
  monsoon: Object.freeze(["blue-cotton-canvas", "indigo-denim-twill"]),
  midnight: Object.freeze([
    "dark-indigo-woven",
    "midnight-navy-linen",
    "charcoal-woven",
  ]),
  "golden-hour": Object.freeze(["natural-linen"]),
  "modern-minimal": Object.freeze(["soft-cotton-weave"]),
});
export const suggestedTextiles = (familyId) =>
  TEXTILE_SUGGESTIONS[familyId] || [];
/** Families that suggest a textile (for the card label). */
export const familiesFor = (id) =>
  Object.keys(TEXTILE_SUGGESTIONS).filter((f) =>
    TEXTILE_SUGGESTIONS[f].includes(id),
  );

// ---------------------------------------------------------------- settings
export const TEXTILE_DEFAULTS = Object.freeze({
  strength: 0.75,
  scale: 1,
  fibre: 0.5,
  contrast: 0.5,
  grain: 0.5,
  distress: 0.5,
  opacity: 1,
  tonal: 0.5,
  move: 0,
});
const num = (v, lo, hi, d) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
const r2 = (v) => Math.round(v * 100) / 100;
const RANGES = {
  strength: [0, 1],
  scale: [0.5, 2],
  fibre: [0, 1],
  contrast: [0, 1],
  grain: [0, 1],
  distress: [0, 1],
  opacity: [0.2, 1],
  tonal: [0, 1],
  move: [0, 1],
};
/** Whitelist + clamp. Unknown / "none" id => null (the key is then not stored at all). */
export function normalizeTextile(t) {
  if (!t || typeof t !== "object" || !textileById(t.id)) return null;
  const out = { id: t.id };
  for (const k of Object.keys(RANGES))
    out[k] = r2(num(t[k], RANGES[k][0], RANGES[k][1], TEXTILE_DEFAULTS[k]));
  if (typeof t.tint === "string" && /^#[0-9a-f]{6}$/i.test(t.tint))
    out.tint = t.tint.toLowerCase();
  return out;
}
/** The textile a composition draws, or null. */
export const textileOf = (comp) => {
  const t = comp?.material?.textile;
  return t && textileById(t.id) ? t : null;
};
export const textileActive = (comp) => textileOf(comp) != null;
/** Subtle / medium / strong for a card: the preset's character, shifted by the strength the author chose. */
export function textileLevel(id, strength = TEXTILE_DEFAULTS.strength) {
  const p = textileById(id);
  if (!p) return "subtle";
  const base = { subtle: 0, medium: 1, strong: 2 }[p.level] ?? 1;
  const n = Math.max(
    0,
    Math.min(2, Math.round(base + (strength - TEXTILE_DEFAULTS.strength) * 3)),
  );
  return ["subtle", "medium", "strong"][n];
}

// ---------------------------------------------------------------- seamless generators (pure)
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Periodic smooth 1D noise of length S with K knots, values in about [-1, 1] (wraps: out[S-1] -> out[0]). */
function noise1(rng, S, K) {
  const k = new Float32Array(K);
  for (let i = 0; i < K; i++) k[i] = rng() * 2 - 1;
  const out = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    const u = (x * K) / S,
      i = Math.floor(u),
      f = smooth(u - i);
    out[x] = k[i % K] + (k[(i + 1) % K] - k[i % K]) * f;
  }
  return out;
}
/** Periodic 2D value noise added into `out` (P lattice cells across the S tile). */
function noise2(rng, S, P, out, w) {
  const L = new Float32Array(P * P);
  for (let i = 0; i < L.length; i++) L[i] = rng() * 2 - 1;
  for (let y = 0; y < S; y++) {
    const v = (y * P) / S,
      y0 = Math.floor(v),
      fy = smooth(v - y0),
      Y0 = y0 % P,
      Y1 = (Y0 + 1) % P;
    for (let x = 0; x < S; x++) {
      const u = (x * P) / S,
        x0 = Math.floor(u),
        fx = smooth(u - x0),
        X0 = x0 % P,
        X1 = (X0 + 1) % P;
      const a = L[Y0 * P + X0],
        b = L[Y0 * P + X1],
        c = L[Y1 * P + X0],
        d = L[Y1 * P + X1];
      out[y * S + x] +=
        w * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
    }
  }
  return out;
}
/** Is the warp (vertical) thread on top at cell (i, j)? Periods 2 / 4 divide the (multiple-of-4) thread counts. */
export function warpOnTop(weave, i, j) {
  if (weave === "twill") return (((i - j) % 4) + 4) % 4 !== 0; // 3/1 warp-faced: a diagonal of weft every 4th cell
  if (weave === "basket") return (((i >> 1) + (j >> 1)) & 1) === 0;
  return ((i + j) & 1) === 0;
}
const mult4 = (n) => Math.max(8, Math.round(n / 4) * 4);
const hexF = (h) => hexRgb(h);
const mixRgb = (a, b, k) => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** Recolour toward a tint while keeping the pixel's lightness (a "colour" blend at `k`). */
function tintRgb(c, t, k) {
  const lt = Math.max(1, luma(t)),
    s = luma(c) / lt;
  return mixRgb(
    c,
    [clamp(t[0] * s, 0, 255), clamp(t[1] * s, 0, 255), clamp(t[2] * s, 0, 255)],
    k,
  );
}
/** User slider (0..1, 0.5 = as designed) -> multiplier 0..2. */
const mul = (v) => clamp(Number(v), 0, 1) * 2;

/**
 * The threads tile as RGBA bytes (pure; exported for tests). Seamless: thread counts are whole numbers across the
 * tile and every per-thread array is indexed modulo the tile, so column S-1 continues into column 0 (rows alike).
 */
export function textileThreads(t, seed = 1, S = TILE) {
  const p = textileById(t.id);
  if (!p) return null;
  const rng = makeRng(seed, "textile", p.id, S);
  const sc = num(t.scale, 0.5, 2, 1) * (S / TILE);
  const Nx = mult4(S / (p.px * sc * (TILE / S) * (S / TILE))),
    Ny = mult4(S / (p.py * sc * (TILE / S) * (S / TILE)));
  const px = S / Nx,
    py = S / Ny;
  const kStr = clamp(num(t.strength, 0, 1, 0.75) / 0.75, 0, 1.34);
  const kC = mul(t.contrast ?? 0.5) * p.kContrast * kStr,
    kF = mul(t.fibre ?? 0.5) * p.kFibre * kStr,
    kG = mul(t.grain ?? 0.5) * p.kGrain * kStr;
  const warpPal = p.warp.map(hexF),
    weftPal = p.weft.map(hexF),
    gap = hexF(p.gap);
  // per-thread properties (index modulo the count => seamless)
  const thread = (N, pitch, pal, cover, len, toneVar) => {
    const base = [],
      jit = new Float32Array(N),
      hw = new Float32Array(N),
      wave = new Float32Array(N * len),
      slub = new Float32Array(N * len),
      fine = new Float32Array(N * len);
    for (let i = 0; i < N; i++) {
      const a = pal[Math.floor(rng() * pal.length)],
        b = pal[Math.floor(rng() * pal.length)];
      const pm = pal.reduce((m, q) => [m[0] + q[0] / pal.length, m[1] + q[1] / pal.length, m[2] + q[2] / pal.length], [0, 0, 0]);
      const c = mixRgb(mixRgb(a, b, rng()), pm, 1 - toneVar / 0.07),
        tone = 1 + (rng() * 2 - 1) * toneVar;
      base.push([c[0] * tone, c[1] * tone, c[2] * tone]);
      jit[i] = (rng() * 2 - 1) * p.jitter * pitch;
      hw[i] = 0.5 * pitch * cover * (1 + (rng() * 2 - 1) * 0.06);
      const w = noise1(rng, len, 4),
        s1 = noise1(rng, len, Math.max(4, Math.round(len / (pitch * 7)))),
        s2 = noise1(rng, len, Math.max(8, Math.round(len / (pitch * 2.2)))),
        f = noise1(rng, len, Math.max(16, Math.round(len / 1.6)));
      for (let k = 0; k < len; k++) {
        wave[i * len + k] = w[k] * p.wave * pitch;
        // slubs: a few long thick/thin stretches plus short knots
        slub[i * len + k] =
          0.65 * s1[k] + 0.35 * s2[k] * s2[k] * Math.sign(s2[k]);
        fine[i * len + k] = f[k];
      }
    }
    return { base, jit, hw, wave, slub, fine, pitch, N };
  };
  const X = thread(Nx, px, warpPal, p.coverX, S, 0.07),
    Y = thread(Ny, py, weftPal, p.coverY, S, 0.025); // weft quieter: no plaid banding
  const streak = p.streak || 0;
  const heather = p.heather || 0;
  // mean colour: contrast scales every deviation from it (strength 0 => a flat matte cloth of this colour)
  const meanOf = (pal) =>
    pal.reduce(
      (m, c) => [
        m[0] + c[0] / pal.length,
        m[1] + c[1] / pal.length,
        m[2] + c[2] / pal.length,
      ],
      [0, 0, 0],
    );
  const mw = meanOf(warpPal),
    mf = meanOf(weftPal);
  const warpShare =
    p.weave === "twill" ? 0.72 : p.weave === "basket" ? 0.5 : 0.55;
  const mean = mixRgb(mixRgb(mf, mw, warpShare), gap, 0.08);
  const tint = t.tint ? hexF(t.tint) : null;
  const out = new Uint8ClampedArray(S * S * 4);
  const edgeX = 1.1 / Math.max(1, X.hw[0]),
    edgeY = 1.1 / Math.max(1, Y.hw[0]);
  const near = (T, pos, along, len) => {
    // nearest thread to `pos` (across) at `along`; unwrapped index so the tile edge is continuous
    const i0 = Math.floor(pos / T.pitch);
    let best = 9,
      bi = 0,
      bii = 0;
    for (let d = -1; d <= 1; d++) {
      const ii = i0 + d,
        i = ((ii % T.N) + T.N) % T.N;
      const o = i * len + along;
      const c = (ii + 0.5) * T.pitch + T.jit[i] + T.wave[o];
      const u = (pos - c) / (T.hw[i] * (1 + p.slub * T.slub[o]));
      if (Math.abs(u) < Math.abs(best)) {
        best = u;
        bi = i;
        bii = ii;
      }
    }
    return [best, bi, bii];
  };
  const shadeThread = (T, i, along, u, dip, under) => {
    const o = i * S + along,
      b = T.base[i];
    const prof = 1 - 0.3 * kC * u * u; // rounded yarn, symmetric: no directional light
    const tw =
      1 +
      p.twist *
        kC *
        Math.sin((along / (T.pitch * 1.7) + u * 0.6) * Math.PI * 2); // spin twist
    const slubTone = 1 + 0.06 * kC * T.slub[o] + streak * T.slub[o] * kC;
    const fib = 1 + 0.07 * kF * T.fine[o];
    const k = prof * tw * slubTone * fib * (1 - dip) * (under ? 0.72 : 1);
    return [b[0] * k, b[1] * k, b[2] * k];
  };
  const dipK = p.dip * Math.min(1.4, 0.4 + kC * 0.6);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const [u, i, ii] = near(X, x, y, S),
        [v, j, jj] = near(Y, y, x, S);
      const top = warpOnTop(p.weave, i, j);
      // the floating thread sinks where its neighbour cell carries the other thread on top (the interlacing)
      const cy = (jj + 0.5) * py + Y.jit[j] + Y.wave[j * S + x],
        ty = (y - cy) / py;
      const cxx = (ii + 0.5) * px + X.jit[i] + X.wave[i * S + y],
        tx = (x - cxx) / px;
      let c = [gap[0], gap[1], gap[2]];
      const aX = clamp((1 - Math.abs(u)) / (edgeX * 1.6), 0, 1),
        aY = clamp((1 - Math.abs(v)) / (edgeY * 1.6), 0, 1);
      if (top) {
        const nb = warpOnTop(
          p.weave,
          i,
          (((j + (ty > 0 ? 1 : -1)) % Ny) + Ny) % Ny,
        );
        const dip = nb
          ? 0
          : dipK * smooth(clamp((Math.abs(ty) - 0.12) / 0.38, 0, 1));
        if (aY > 0) c = mixRgb(c, shadeThread(Y, j, x, v, 0, true), aY);
        if (aX > 0) c = mixRgb(c, shadeThread(X, i, y, u, dip, false), aX);
      } else {
        const nb = warpOnTop(
          p.weave,
          (((i + (tx > 0 ? 1 : -1)) % Nx) + Nx) % Nx,
          j,
        );
        const dip = !nb
          ? 0
          : dipK * smooth(clamp((Math.abs(tx) - 0.12) / 0.38, 0, 1));
        if (aX > 0) c = mixRgb(c, shadeThread(X, i, y, u, 0, true), aX);
        if (aY > 0) c = mixRgb(c, shadeThread(Y, j, x, v, dip, false), aY);
      }
      // heathered yarn: a few lighter fibres spun in
      if (heather && rng() < heather * 0.05)
        c = mixRgb(
          c,
          [c[0] * 1.45 + 10, c[1] * 1.45 + 10, c[2] * 1.45 + 10],
          0.6 * Math.min(1, kC + 0.3),
        );
      // matte contrast around the cloth's mean colour + fine grain (luma only)
      const g = (rng() + rng() - 1) * 7 * kG;
      let r = mean[0] + (c[0] - mean[0]) * kC + g,
        gg = mean[1] + (c[1] - mean[1]) * kC + g,
        bb = mean[2] + (c[2] - mean[2]) * kC + g;
      if (tint) [r, gg, bb] = tintRgb([r, gg, bb], tint, 0.55);
      const o = (y * S + x) * 4;
      out[o] = r;
      out[o + 1] = gg;
      out[o + 2] = bb;
      out[o + 3] = 255;
    }
  }
  return { S, data: out, Nx, Ny };
}

/** Distress tile (RGBA, mostly transparent): sparse speckles, fine scratches, stray fibres. Wraps at the edges. */
export function textileDistress(t, seed = 1, S = DISTRESS) {
  const p = textileById(t.id);
  if (!p) return null;
  const rng = makeRng(seed, "textile-distress", p.id, S);
  const kStr = clamp(num(t.strength, 0, 1, 0.75) / 0.75, 0, 1.34);
  const kD = mul(t.distress ?? 0.5) * p.kDistress * kStr,
    kF = mul(t.fibre ?? 0.5) * p.kFibre * kStr;
  const area = (S * S) / (DISTRESS * DISTRESS);
  const acc = new Float32Array(S * S * 4); // premultiplied rgb + alpha
  const light = hexF(p.warp[p.warp.length - 1]).map((v) =>
    clamp(v * 1.5 + (p.light ? 18 : 34), 0, 255),
  );
  const dark = hexF(p.gap).map((v) => v * 0.55);
  const plot = (x, y, rgb, a) => {
    // bilinear splat, wrapping
    const x0 = Math.floor(x),
      y0 = Math.floor(y),
      fx = x - x0,
      fy = y - y0;
    for (const [dx, dy, w] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ]) {
      const X = (((x0 + dx) % S) + S) % S,
        Y = (((y0 + dy) % S) + S) % S,
        o = (Y * S + X) * 4,
        k = a * w * (1 - acc[o + 3]);
      acc[o] += rgb[0] * k;
      acc[o + 1] += rgb[1] * k;
      acc[o + 2] += rgb[2] * k;
      acc[o + 3] += k;
    }
  };
  // speckles: tiny lint nubs (mostly light) and a few dark flecks
  const nSpeck = Math.round(70 * kD * area);
  for (let n = 0; n < nSpeck; n++) {
    const x = rng() * S,
      y = rng() * S,
      r = 0.35 + rng() * 0.75,
      isDark = rng() < 0.3,
      a = (isDark ? 0.35 : 0.3) + rng() * 0.35;
    const R = Math.ceil(r + 1);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.8) continue;
        plot(
          x + dx,
          y + dy,
          isDark ? dark : light,
          a * Math.min(1, r + 0.8 - d),
        );
      }
  }
  // fine scratches: thin, short, mostly along the warp (wear follows the threads)
  const nScr = Math.round(10 * kD * area);
  for (let n = 0; n < nScr; n++) {
    let x = rng() * S,
      y = rng() * S,
      ang = rng() < 0.6 ? Math.PI / 2 + (rng() - 0.5) * 0.5 : rng() * Math.PI;
    const L = 10 + rng() * 38,
      a = 0.1 + rng() * 0.18;
    for (let s = 0; s < L; s += 0.5) {
      ang += (rng() - 0.5) * 0.04;
      x += Math.cos(ang) * 0.5;
      y += Math.sin(ang) * 0.5;
      const fade = Math.sin((s / L) * Math.PI);
      plot(x, y, light, a * fade * 0.5);
    }
  }
  // stray fibres: hair-thin curls lying on the surface (the fibre slider)
  const nFib = Math.round(36 * kF * area);
  for (let n = 0; n < nFib; n++) {
    let x = rng() * S,
      y = rng() * S,
      ang = rng() * Math.PI * 2;
    const L = 12 + rng() * 40,
      a = 0.06 + rng() * 0.12,
      bend = (rng() - 0.5) * 0.12;
    for (let s = 0; s < L; s += 0.5) {
      ang += bend + (rng() - 0.5) * 0.08;
      x += Math.cos(ang) * 0.5;
      y += Math.sin(ang) * 0.5;
      plot(x, y, light, a * 0.5);
    }
  }
  const tint = t.tint ? hexF(t.tint) : null;
  const out = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const a = acc[i * 4 + 3];
    if (a <= 0) continue;
    let c = [acc[i * 4] / a, acc[i * 4 + 1] / a, acc[i * 4 + 2] / a];
    if (tint) c = tintRgb(c, tint, 0.55);
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  return { S, data: out };
}

/** Tonal tile (RGBA): soft, organic lighter/darker drifts (no radial gradient, no folds). Drawn scaled x12. */
export function textileTonal(t, seed = 1, S = TONAL) {
  const p = textileById(t.id);
  if (!p) return null;
  const rng = makeRng(seed, "textile-tonal", p.id, S);
  const kT =
    mul(t.tonal ?? 0.5) *
    p.kTonal *
    clamp(num(t.strength, 0, 1, 0.75) / 0.75, 0, 1.34);
  const f = new Float32Array(S * S);
  noise2(rng, S, 4, f, 1);
  noise2(rng, S, 8, f, 0.5);
  noise2(rng, S, 16, f, 0.22);
  const dark = hexF(p.gap).map((v) => v * 0.7),
    light = p.fade
      ? hexF(p.fade)
      : hexF(p.warp[p.warp.length - 1]).map((v) => clamp(v * 1.12 + 6, 0, 255));
  const tint = t.tint ? hexF(t.tint) : null;
  const out = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = f[i] / 1.4;
    let c = v < 0 ? dark : light,
      a =
        v < 0
          ? -v * 0.32 * kT
          : (p.fade ? smooth(clamp((v - 0.2) / 0.7, 0, 1)) * 0.34 : v * 0.22) *
            kT;
    if (tint) c = tintRgb(c, tint, 0.55);
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = Math.round(clamp(a, 0, 0.6) * 255);
  }
  return { S, data: out };
}

/** Box-filter downsample of a seamless RGBA tile by 2 (stays seamless; premultiplied so edges do not darken). */
export function halveTile(src, S) {
  const H = S >> 1,
    out = new Uint8ClampedArray(H * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < H; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const o = ((2 * y + dy) * S + 2 * x + dx) * 4,
          w = src[o + 3];
        r += src[o] * w;
        g += src[o + 1] * w;
        b += src[o + 2] * w;
        a += w;
      }
      const o = (y * H + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = a / 4;
    }
  return out;
}

// ---------------------------------------------------------------- cache (bounded) + tiles
const BAKE_KEYS = [
  "strength",
  "scale",
  "fibre",
  "contrast",
  "grain",
  "distress",
  "tonal",
  "tint",
];
export const textileKey = (t, seed) =>
  [t.id, seed, ...BAKE_KEYS.map((k) => t[k] ?? "")].join("|");
const entries = new Map(); // key -> { threads, distress, tonal, canvases }
export const TEXTILE_CACHE = 3; // ~1.5 MB of pixel data + its canvases per entry
/** Baked pixel data for a textile (pure data; works in Node). LRU-capped; evicted canvases are released. */
export function textileData(t, seed = 1) {
  const key = textileKey(t, seed);
  if (entries.has(key)) {
    const e = entries.get(key);
    entries.delete(key);
    entries.set(key, e);
    return e;
  }
  const e = {
    key,
    threads: textileThreads(t, seed),
    distress: textileDistress(t, seed),
    tonal: textileTonal(t, seed),
    canvases: new Map(),
  };
  if (!e.threads) return null;
  entries.set(key, e);
  while (entries.size > TEXTILE_CACHE) {
    const k = entries.keys().next().value,
      old = entries.get(k);
    for (const c of old.canvases.values())
      if (c && "width" in c) c.width = c.height = 0; // free the backing store
    entries.delete(k);
  }
  return e;
}
export const textileCacheSize = () => entries.size;
export const clearTextileCache = () => entries.clear();
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
/** A canvas of one layer at mip `level` (0 = full, 1 = half, 2 = quarter), made on first use. */
function layerCanvas(e, name, level) {
  const k = `${name}:${level}`;
  if (e.canvases.has(k)) return e.canvases.get(k);
  const src = e[name];
  let data = src.data,
    S = src.S;
  for (let l = 0; l < level && S >= 64; l++) {
    data = halveTile(data, S);
    S >>= 1;
  }
  const cv = newCanvas(S),
    cx = cv?.getContext?.("2d");
  let made = null;
  if (cx && typeof cx.createImageData === "function") {
    const img = cx.createImageData(S, S);
    img.data.set(data);
    cx.putImageData(img, 0, 0);
    made = { cv, S };
  }
  e.canvases.set(k, made);
  return made;
}

// ---------------------------------------------------------------- sampling (pure) for the readability guard
const px4 = (d, S, x, y) => {
  const X = ((Math.floor(x) % S) + S) % S,
    Y = ((Math.floor(y) % S) + S) % S,
    o = (Y * S + X) * 4;
  return [d.data[o], d.data[o + 1], d.data[o + 2], d.data[o + 3] / 255];
};
const over = (c, s, a) => [
  c[0] + (s[0] - c[0]) * a,
  c[1] + (s[1] - c[1]) * a,
  c[2] + (s[2] - c[2]) * a,
];
/** The template background colour at (x, y) of a W x H frame (gradient + overlay; photo => the contrast-model colour). */
function bgAt(comp, x, y, W, H, photoBase) {
  const st = comp.style;
  if (st.bg?.image) return photoBase;
  const a = hexRgb(st.bg.a),
    b = hexRgb(st.bg.kind === "solid" ? st.bg.a : st.bg.b || st.bg.a);
  // render.js paintBackground: linear gradient (0,0) -> (0.3W, H)
  const dx = 0.3 * W,
    dy = H,
    k = clamp((x * dx + y * dy) / (dx * dx + dy * dy), 0, 1);
  let c = mixRgb(a, b, k);
  if (st.overlay?.opacity > 0)
    c = over(c, hexRgb(st.overlay.color), st.overlay.opacity);
  return c;
}
/** Cloth colour drawn at frame point (x, y) with the textile's tiles offset by (ox, oy). */
export function textileColourAt(e, x, y, ox = 0, oy = 0) {
  let c = px4(e.threads, e.threads.S, x + ox, y + oy).slice(0, 3);
  const T = e.tonal,
    tu = (x + ox) / TONAL_SCALE, // paintTextile draws the tonal tile shifted by TONAL_SCALE / 2 (bilinear centre)
    tv = (y + oy) / TONAL_SCALE;
  const t0 = px4(T, T.S, tu, tv);
  c = over(c, t0, t0[3]);
  const d = px4(e.distress, e.distress.S, x + ox, y + oy);
  if (d[3] > 0) c = over(c, d, d[3]);
  return c;
}
export const textileOffset = (comp, tMs, still) => {
  const t = textileOf(comp);
  if (
    !t ||
    still ||
    !(t.move > 0) ||
    comp.motion?.reduceMotion === true ||
    comp.material?.reduce
  )
    return [0, 0];
  const s = ((tMs || 0) / 1000) * t.move * 14; // px per second at 1080 wide: a slow drift
  return [s, s * 0.35];
};

/**
 * Local readability scrim for one text block: samples the drawn cloth (and the template background under a partly
 * transparent cloth) inside `box` [x0, y0, x1, y1] and returns {alpha, rgb} for requiredScrim's 4.5:1 target.
 * extraInk: [{rgb, alpha}] that may sit between the cloth and the text (texture inks toward the text colour).
 */
export function textileScrim(
  comp,
  box,
  textHex,
  { W = 1080, H = 1920, extraInk = [], target = SCRIM_TARGET } = {},
) {
  const t = textileOf(comp);
  if (!t || !/^#[0-9a-f]{6}$/i.test(textHex || ""))
    return { alpha: 0, rgb: [0, 0, 0] };
  const e = textileData(t, comp.material?.seed ?? 1);
  if (!e) return { alpha: 0, rgb: [0, 0, 0] };
  const key = `${e.key}|${box.map(Math.round).join(",")}|${textHex}|${t.opacity}|${t.move > 0 ? 1 : 0}|${JSON.stringify(comp.style.bg)}|${JSON.stringify(comp.style.overlay || null)}|${extraInk.map((i) => i.rgb.join(",") + ":" + i.alpha.toFixed(3)).join(";")}`;
  if (scrimMemo.has(key)) return scrimMemo.get(key);
  const lightText = lum(...hexRgb(textHex)) > 0.4;
  const photoBase = lightText ? [128, 128, 128] : [128, 128, 128];
  const op = t.opacity ?? 1;
  // a moving cloth slides under the text: check several offsets so the scrim never needs to change over time
  const offsets =
    t.move > 0
      ? [
          [0, 0],
          [TILE / 4, 64],
          [TILE / 2, 160],
          [(3 * TILE) / 4, 320],
        ]
      : [[0, 0]];
  const [x0, y0, x1, y1] = box,
    step = Math.max(3, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 6000)));
  const samples = [];
  for (const [ox, oy] of offsets)
    for (let y = y0; y <= y1; y += step)
      for (let x = x0; x <= x1; x += step) {
        let c = over(
          bgAt(comp, x, y, W, H, photoBase),
          textileColourAt(e, x, y, ox, oy),
          op,
        );
        for (const ink of extraInk) c = over(c, ink.rgb, ink.alpha);
        samples.push(c);
      }
  const alpha = requiredScrim(samples, textHex, target);
  const res = { alpha, rgb: lightText ? [0, 0, 0] : [255, 255, 255] };
  scrimMemo.set(key, res);
  if (scrimMemo.size > 48) scrimMemo.delete(scrimMemo.keys().next().value);
  return res;
}
const scrimMemo = new Map();
/** 4.5:1 plus a margin for what the sample model cannot see exactly (bilinear tile filtering, anti-aliasing). */
export const SCRIM_TARGET = 4.8;

/** Contrast of `textHex` over the cloth in `box` after the scrim (95th-percentile worst pixel, like requiredScrim). */
export function textileContrast(
  comp,
  box,
  textHex,
  { W = 1080, H = 1920, scrim = 0 } = {},
) {
  const t = textileOf(comp),
    e = t && textileData(t, comp.material?.seed ?? 1);
  if (!e) return Infinity;
  const tl = lum(...hexRgb(textHex)),
    lightText = tl > 0.4,
    s = lightText ? [0, 0, 0] : [255, 255, 255];
  const rs = [];
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y <= y1; y += 4)
    for (let x = x0; x <= x1; x += 4) {
      const c = over(
        over(
          bgAt(comp, x, y, W, H, [128, 128, 128]),
          textileColourAt(e, x, y),
          t.opacity ?? 1,
        ),
        s,
        scrim,
      );
      rs.push(ratio(tl, lum(...c)));
    }
  rs.sort((a, b) => a - b);
  return rs[Math.floor(rs.length * 0.05)];
}

/**
 * Background colours of a textile composition for the contrast model (fx/palette.js fxBases): the cloth's dark,
 * middle and light pixels (5th / 50th / 95th luminance percentile, tonal extremes included) over each template base.
 */
export function textileBases(comp, templateBases) {
  const t = textileOf(comp),
    e = t && textileData(t, comp.material?.seed ?? 1);
  if (!e) return templateBases;
  if (!e.stats) {
    const d = e.threads.data,
      n = e.threads.S * e.threads.S,
      pick = [];
    for (let i = 0; i < n; i += 37)
      pick.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    pick.sort((a, b) => lum(...a) - lum(...b));
    let tDark = 0,
      tLight = 0,
      cDark = [0, 0, 0],
      cLight = [255, 255, 255];
    const T = e.tonal.data;
    for (let i = 0; i < T.length; i += 4) {
      const a = T[i + 3] / 255,
        c = [T[i], T[i + 1], T[i + 2]];
      if (lum(...c) < lum(...pick[pick.length >> 1])) {
        if (a > tDark) ((tDark = a), (cDark = c));
      } else if (a > tLight) ((tLight = a), (cLight = c));
    }
    const q = (f) =>
      pick[Math.min(pick.length - 1, Math.floor(pick.length * f))];
    e.stats = [
      over(q(0.05), cDark, tDark),
      q(0.5),
      over(q(0.95), cLight, tLight),
    ];
  }
  const op = t.opacity ?? 1;
  return templateBases.flatMap((b) =>
    e.stats.map((s) => ({ rgb: over(b.rgb, s, op) })),
  );
}

// ---------------------------------------------------------------- painting
const levelFor = (ctx) => {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const s = m ? Math.hypot(m.a, m.b) : 1;
  return s < 0.3 ? 2 : s < 0.6 ? 1 : 0;
};
function fillTile(ctx, made, period, ox, oy, W, H, alpha) {
  if (!made || !(alpha > 0)) return 0;
  const pat = ctx.createPattern(made.cv, "repeat");
  if (!pat) return 0;
  const k = period / made.S,
    mx = ((ox % period) + period) % period,
    my = ((oy % period) + period) % period;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "source-over";
  ctx.translate(-mx, -my);
  ctx.scale(k, k);
  ctx.fillStyle = pat;
  ctx.fillRect(mx / k, my / k, W / k, H / k);
  ctx.restore();
  return 1;
}
/** Paint the composition's cloth (call first in the material layer). Returns 1 when anything was painted. */
export function paintTextile(ctx, env) {
  const t = textileOf(env.comp);
  if (!t) return 0;
  if (typeof ctx.createPattern !== "function") return 1;
  const e = textileData(t, env.seed ?? 1);
  if (!e) return 1;
  const lv = levelFor(ctx),
    [ox, oy] = textileOffset(env.comp, env.tMs, env.still),
    op = t.opacity ?? 1;
  fillTile(ctx, layerCanvas(e, "threads", lv), TILE, ox, oy, env.W, env.H, op);
  const tonal = layerCanvas(e, "tonal", 0);
  if (tonal) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    fillTile(
      ctx,
      tonal,
      TONAL * TONAL_SCALE,
      ox + TONAL_SCALE / 2,
      oy + TONAL_SCALE / 2,
      env.W,
      env.H,
      op,
    );
    ctx.restore();
  }
  fillTile(
    ctx,
    layerCanvas(e, "distress", lv),
    DISTRESS,
    ox,
    oy,
    env.W,
    env.H,
    op,
  );
  return 1;
}

/** A feathered rectangle of `rgb` at `alpha`: solid core, soft edges (no shadow/filter: works on every canvas). */
export function featherRect(ctx, [x0, y0, x1, y1], rgb, alpha, F = 48) {
  const c = (a) => `rgba(${rgb.join(",")},${a})`;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = c(alpha);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const lin = (ax, ay, bx, by, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(ax, ay, bx, by);
    g.addColorStop(0, c(alpha));
    g.addColorStop(1, c(0));
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  lin(x0, 0, x0 - F, 0, x0 - F, y0, F, y1 - y0);
  lin(x1, 0, x1 + F, 0, x1, y0, F, y1 - y0);
  lin(0, y0, 0, y0 - F, x0, y0 - F, x1 - x0, F);
  lin(0, y1, 0, y1 + F, x0, y1, x1 - x0, F);
  for (const [cx, cy, rx, ry] of [
    [x0, y0, x0 - F, y0 - F],
    [x1, y0, x1, y0 - F],
    [x0, y1, x0 - F, y1],
    [x1, y1, x1, y1],
  ]) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, F);
    g.addColorStop(0, c(alpha));
    g.addColorStop(1, c(0));
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, F, F);
  }
  ctx.restore();
}

/**
 * Readability guard for a textile composition, drawn just before the text: for each text block (poem rows, the
 * signature) sample the cloth under it and lay a feathered local scrim when the text would fall below 4.5:1.
 * blocks: [{box:[x0,y0,x1,y1], color}]. extraInk: texture inks (see textileScrim). Returns the scrims drawn.
 */
export function paintTextileScrims(ctx, env, blocks, extraInk = []) {
  if (!textileActive(env.comp)) return [];
  const drawn = [];
  for (const b of blocks) {
    const s = textileScrim(env.comp, b.box, b.color, {
      W: env.W,
      H: env.H,
      extraInk,
    });
    if (!(s.alpha > 0)) continue;
    env.fxTrace?.push({
      fx: "textile:scrim",
      layer: "material",
      bbox: [b.box[0] - 110, b.box[1] - 110, b.box[2] + 110, b.box[3] + 110],
      alpha: s.alpha,
      paint: { rgb: s.rgb, a: 1 },
      tf: { tx: 0, ty: 0, sx: 1, sy: 1 },
    });
    // a wide, soft falloff: reads as a pool of shade in the cloth, not as a label
    const F = Math.max(32, Math.min(110, Math.min(b.box[2] - b.box[0], b.box[3] - b.box[1]) * 0.45));
    if (typeof ctx.createLinearGradient === "function") featherRect(ctx, b.box, s.rgb, s.alpha, F);
    drawn.push({ ...b, alpha: s.alpha });
  }
  return drawn;
}

/** A real rendered swatch of a textile (small seamless tiles, putImageData: no pattern, no cache growth). */
export function paintTextileSwatch(
  ctx,
  id,
  w,
  h,
  { seed = 1, settings = {} } = {},
) {
  const t = normalizeTextile({ ...settings, id });
  if (!t || typeof ctx.createImageData !== "function") return false;
  const S = 128,
    th = textileThreads(t, seed, S),
    ds = textileDistress(t, seed, S);
  if (!th) return false;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((y % S) * S + (x % S)) * 4,
        q = (y * w + x) * 4;
      let c = [th.data[o], th.data[o + 1], th.data[o + 2]];
      const a = ds.data[o + 3] / 255;
      if (a > 0) c = over(c, [ds.data[o], ds.data[o + 1], ds.data[o + 2]], a);
      img.data[q] = c[0];
      img.data[q + 1] = c[1];
      img.data[q + 2] = c[2];
      img.data[q + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return true;
}
