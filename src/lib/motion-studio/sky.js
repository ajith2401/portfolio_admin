// Sky & Celestial collection: painted night and day skies that work with every template family. A sky replaces the
// template's gradient background (never a photo background) and is stored on comp.material.sky = {id, ...choices}.
// When it is absent, nothing here runs, so older projects render exactly as before.
//
// The layers are drawn in the existing Canvas 2D renderer, back to front:
//   gradient -> nebula / Milky Way -> horizon glow -> distant stars    (baked once into one cached canvas)
//   -> aurora (cached low-res curtains, moved and faded each frame; no per-frame blur)
//   -> mid stars (some twinkle) -> bright stars (glow + 4-point sparkle) -> constellation lines
//   -> moon or sun (cached sprite) -> meteors -> clouds (cached puff sprites, slow parallax drift) -> hills.
// Everything is seeded (skyRng / value noise below) and driven only by the explicit frame time, so preview and export
// draw the same picture at the same timestamp. There is no Math.random and no clock anywhere in this file.
// Readability: bright stars, meteors, the moon and the sun keep out of the text area. The poem keeps its own size,
// text and colour; when the sky under it is too light for it, a soft local shade is laid under the words.
import { hexRgb, lum, ratio } from "./contrast.js";
import { featherRect } from "./textiles.js";

export const SKY_NONE = "none";
export const SKY_COLLECTION = "Sky & Celestial";

// ---------------------------------------------------------------- deterministic randomness
const hashStr = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};
/** Seeded PRNG (mulberry32). The same seed and keys give the same sequence on every device. */
export function skyRng(seed, ...keys) {
  let a = ((Number(seed) >>> 0) ^ hashStr(keys.join("|"))) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 2-D value noise in [0,1] on an integer lattice hashed from the seed (smooth, never tiles). */
export function valueNoise(seed) {
  const s0 = Math.imul(Number(seed) | 0, 1442695041);
  const h = (ix, iy) => {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + s0) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      u = sm(x - ix),
      v = sm(y - iy);
    const a = h(ix, iy),
      b = h(ix + 1, iy),
      c = h(ix, iy + 1),
      d = h(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const fbm = (n, x, y, oct = 4) => {
  let s = 0,
    a = 0.5,
    f = 1,
    t = 0;
  for (let i = 0; i < oct; i++) {
    s += a * n(x * f, y * f);
    t += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / t;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
const css = (rgb, a = 1) =>
  `rgba(${rgb.map((v) => Math.round(v)).join(",")},${clamp(a, 0, 1).toFixed(4)})`;

// ---------------------------------------------------------------- palettes
// Night palettes are the collection's seven named palettes (dark zenith -> lighter horizon). Day palettes follow the
// same four-stop shape: zenith, upper sky, lower sky, horizon.
export const SKY_PALETTES = Object.freeze([
  {
    id: "midnight-indigo",
    label: "Midnight Indigo",
    stops: ["#050B1E", "#0A1633", "#13244B", "#25345D"],
  },
  {
    id: "violet-nebula",
    label: "Violet Nebula",
    stops: ["#100B25", "#26163F", "#4A2868", "#80538B"],
  },
  {
    id: "moonlit-silver",
    label: "Moonlit Silver",
    stops: ["#0B172D", "#182944", "#314563", "#8090A8"],
  },
  {
    id: "aurora-night",
    label: "Aurora Night",
    stops: ["#061829", "#0B3547", "#17696E", "#574F88"],
  },
  {
    id: "romantic-twilight",
    label: "Romantic Twilight",
    stops: ["#25172F", "#49304F", "#80536C", "#C17F94"],
  },
  {
    id: "deep-cosmic-blue",
    label: "Deep Cosmic Blue",
    stops: ["#050C20", "#111F45", "#252B66", "#514B86"],
  },
  {
    id: "soft-lavender-sky",
    label: "Soft Lavender Sky",
    stops: ["#17172D", "#39365D", "#746E9C", "#AAA0BE"],
  },
  {
    id: "clear-day",
    label: "Clear Day",
    stops: ["#1D5BB8", "#3A7FD3", "#7FB5E6", "#CFE6F6"],
    day: true,
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    stops: ["#2A3C6B", "#6F6590", "#D9906A", "#F6CB8E"],
    day: true,
  },
  {
    id: "pastel-dawn",
    label: "Pastel Dawn",
    stops: ["#56689F", "#9E93C2", "#E8B2BC", "#F8DCC4"],
    day: true,
  },
  {
    id: "blue-hour",
    label: "Blue Hour",
    stops: ["#0C183A", "#22386F", "#5170A6", "#B097B6"],
  },
]);
export const SKY_PALETTE_IDS = Object.freeze(SKY_PALETTES.map((p) => p.id));
export const paletteById = (id) =>
  SKY_PALETTES.find((p) => p.id === id) || null;
/** Gradient stop positions, zenith (top) to horizon (bottom). */
const STOP_AT = [0, 0.38, 0.72, 1];

// ---------------------------------------------------------------- quick choices
export const SKY_QUICK = Object.freeze({
  stars: Object.freeze(["off", "subtle", "medium", "dense"]),
  clouds: Object.freeze(["none", "soft", "dramatic"]),
  motion: Object.freeze(["static", "calm", "cinematic"]),
  glow: Object.freeze(["subtle", "medium"]),
});
const Q_STARS = { off: 0, subtle: 0.32, medium: 0.62, dense: 1 };
const Q_CLOUDS = { none: [0, 0], soft: [0.45, 0.42], dramatic: [0.9, 0.72] };
const Q_MOTION = { static: 0, calm: 0.5, cinematic: 1 };
const Q_GLOW = { subtle: 0.55, medium: 1 };

/** Advanced settings: [min, max, integer?]. A stored value overrides what the preset and quick choices give. */
export const SKY_RANGES = Object.freeze({
  density: [0, 1],
  sizeVar: [0, 1],
  brightness: [0, 1],
  twinkle: [0, 1],
  twinkleSpeed: [0, 1],
  bright: [0, 40, true],
  meteors: [0, 1],
  meteorSpeed: [0, 1],
  meteorTrail: [0, 1],
  meteorGlow: [0, 1],
  moonSize: [0, 1],
  moonX: [0, 1],
  moonY: [0, 1],
  moonGlow: [0, 1],
  cloudDensity: [0, 1],
  cloudOpacity: [0, 1],
  cloudSpeed: [0, 1],
  aurora: [0, 1],
  nebula: [0, 1],
  drift: [0, 1],
});
export const SKY_ENUMS = Object.freeze({
  moon: Object.freeze(["none", "crescent", "half", "full"]),
  horizon: Object.freeze(["none", "glow", "hills"]),
  auroraColor: Object.freeze(["green", "teal", "violet", "rose"]),
  palette: SKY_PALETTE_IDS,
});

// ---------------------------------------------------------------- presets
// q: the preset's quick choices. a: everything else. Values not listed fall back to BASE.
const BASE = Object.freeze({
  sizeVar: 0.5,
  brightness: 0.75,
  twinkle: 0.5,
  twinkleSpeed: 0.4,
  bright: 12,
  constellations: false,
  meteors: 0,
  meteorSpeed: 0.5,
  meteorTrail: 0.6,
  meteorGlow: 0.8,
  moon: "none",
  moonSize: 0.45,
  moonX: 0.78,
  moonY: 0.075,
  moonGlow: 0.6,
  cloudSpeed: 0.35,
  aurora: 0,
  auroraColor: "green",
  nebula: 0,
  nebulaShape: "clouds",
  drift: 0.3,
  horizon: "none",
  horizonGlow: [120, 140, 210],
  cloudTint: "moon",
  cloudBand: "all",
  sun: false,
  sunX: 0.24,
  sunY: 0.08,
  haze: 0,
});
export const SKY_PRESETS = Object.freeze(
  [
    {
      id: "velvet-midnight",
      label: "Velvet Midnight",
      kind: "night",
      palette: "midnight-indigo",
      blurb: "Deep indigo, a dense quiet starfield",
      q: { stars: "dense", clouds: "none", motion: "calm", glow: "subtle" },
      a: {
        nebula: 0.18,
        nebulaShape: "clouds",
        bright: 14,
        twinkle: 0.45,
        meteors: 0.12,
      },
    },
    {
      id: "moonlit-clouds",
      label: "Moonlit Clouds",
      kind: "night",
      palette: "moonlit-silver",
      blurb: "A full moon behind drifting silver clouds",
      q: {
        stars: "medium",
        clouds: "dramatic",
        motion: "calm",
        glow: "medium",
      },
      a: {
        moon: "full",
        moonSize: 0.55,
        moonGlow: 0.75,
        bright: 8,
        cloudTint: "moon",
        cloudBand: "all",
      },
    },
    {
      id: "indigo-milky-way",
      label: "Indigo Milky Way",
      kind: "night",
      palette: "deep-cosmic-blue",
      blurb: "The galactic band over dark hills",
      q: { stars: "dense", clouds: "none", motion: "calm", glow: "medium" },
      a: {
        nebula: 0.85,
        nebulaShape: "band",
        bright: 18,
        horizon: "hills",
        horizonGlow: [110, 110, 190],
        twinkle: 0.4,
      },
    },
    {
      id: "violet-dream",
      label: "Violet Dream",
      kind: "night",
      palette: "violet-nebula",
      blurb: "Soft violet and rose nebula clouds",
      q: { stars: "medium", clouds: "none", motion: "calm", glow: "medium" },
      a: {
        nebula: 0.75,
        nebulaShape: "clouds",
        moon: "crescent",
        moonSize: 0.3,
        moonX: 0.2,
        bright: 10,
      },
    },
    {
      id: "aurora-veil",
      label: "Aurora Veil",
      kind: "night",
      palette: "aurora-night",
      blurb: "Green-teal northern lights over the hills",
      q: {
        stars: "medium",
        clouds: "none",
        motion: "cinematic",
        glow: "medium",
      },
      a: {
        aurora: 0.8,
        auroraColor: "green",
        horizon: "hills",
        horizonGlow: [60, 150, 140],
        bright: 10,
      },
    },
    {
      id: "meteor-shower",
      label: "Meteor Shower",
      kind: "night",
      palette: "deep-cosmic-blue",
      blurb: "Frequent shooting stars across a dark sky",
      q: {
        stars: "dense",
        clouds: "none",
        motion: "cinematic",
        glow: "medium",
      },
      a: {
        meteors: 0.85,
        meteorSpeed: 0.6,
        nebula: 0.25,
        nebulaShape: "band",
        bright: 14,
      },
    },
    {
      id: "lavender-twilight",
      label: "Lavender Twilight",
      kind: "night",
      palette: "soft-lavender-sky",
      blurb: "First stars over a warm lavender horizon",
      q: { stars: "subtle", clouds: "soft", motion: "calm", glow: "medium" },
      a: {
        moon: "crescent",
        moonSize: 0.35,
        horizon: "glow",
        horizonGlow: [255, 178, 150],
        cloudTint: "rose",
        cloudBand: "low",
        bright: 6,
      },
    },
    {
      id: "silver-moonlight",
      label: "Silver Moonlight",
      kind: "night",
      palette: "moonlit-silver",
      blurb: "A large glowing moon, a few bright stars",
      q: { stars: "subtle", clouds: "soft", motion: "calm", glow: "medium" },
      a: {
        moon: "full",
        moonSize: 0.85,
        moonGlow: 0.9,
        moonX: 0.7,
        bright: 6,
        cloudBand: "low",
        cloudTint: "moon",
      },
    },
    {
      id: "cloud-cathedral",
      label: "Cloud Cathedral",
      kind: "night",
      palette: "romantic-twilight",
      blurb: "Towering lit clouds in a rose twilight",
      q: {
        stars: "subtle",
        clouds: "dramatic",
        motion: "calm",
        glow: "medium",
      },
      a: {
        cloudTint: "rose",
        cloudBand: "all",
        horizon: "glow",
        horizonGlow: [255, 170, 170],
        moon: "half",
        moonSize: 0.35,
        bright: 5,
      },
    },
    {
      id: "starlit-horizon",
      label: "Starlit Horizon",
      kind: "night",
      palette: "midnight-indigo",
      blurb: "Constellations above a glowing horizon",
      q: { stars: "medium", clouds: "none", motion: "calm", glow: "medium" },
      a: {
        horizon: "hills",
        horizonGlow: [90, 120, 200],
        constellations: true,
        bright: 16,
        meteors: 0.2,
      },
    },
    {
      id: "blue-hour",
      label: "Blue Hour",
      kind: "day",
      palette: "blue-hour",
      blurb: "Dusk blue with the first faint stars",
      q: { stars: "subtle", clouds: "soft", motion: "calm", glow: "subtle" },
      a: {
        moon: "crescent",
        moonSize: 0.3,
        horizon: "glow",
        horizonGlow: [240, 180, 190],
        cloudTint: "rose",
        cloudBand: "low",
        bright: 4,
      },
    },
    {
      id: "clear-blue-day",
      label: "Clear Blue Day",
      kind: "day",
      palette: "clear-day",
      blurb: "Bright blue, a soft sun and thin clouds",
      q: { stars: "off", clouds: "soft", motion: "calm", glow: "medium" },
      a: {
        sun: true,
        sunX: 0.8,
        sunY: 0.07,
        haze: 0.35,
        cloudTint: "day",
        cloudBand: "all",
      },
    },
    {
      id: "cotton-cumulus",
      label: "Cotton Cumulus",
      kind: "day",
      palette: "clear-day",
      blurb: "Big white cumulus drifting across blue",
      q: { stars: "off", clouds: "dramatic", motion: "calm", glow: "subtle" },
      a: {
        sun: true,
        sunX: 0.18,
        sunY: 0.06,
        haze: 0.25,
        cloudTint: "day",
        cloudBand: "all",
        cloudSpeed: 0.45,
      },
    },
    {
      id: "golden-hour",
      label: "Golden Hour",
      kind: "day",
      palette: "golden-hour",
      blurb: "A low warm sun and amber clouds",
      q: { stars: "off", clouds: "soft", motion: "calm", glow: "medium" },
      a: {
        sun: true,
        sunX: 0.72,
        sunY: 0.83,
        haze: 0.4,
        horizon: "glow",
        horizonGlow: [255, 190, 120],
        cloudTint: "warm",
        cloudBand: "all",
      },
    },
    {
      id: "pastel-dawn",
      label: "Pastel Dawn",
      kind: "day",
      palette: "pastel-dawn",
      blurb: "Lavender to peach morning light",
      q: { stars: "off", clouds: "soft", motion: "calm", glow: "subtle" },
      a: {
        sun: true,
        sunX: 0.3,
        sunY: 0.86,
        haze: 0.45,
        horizon: "glow",
        horizonGlow: [255, 214, 190],
        cloudTint: "warm",
        cloudBand: "low",
      },
    },
  ].map((p) =>
    Object.freeze({
      ...p,
      q: Object.freeze(p.q),
      a: Object.freeze({ ...BASE, ...p.a }),
    }),
  ),
);
export const SKY_IDS = Object.freeze(SKY_PRESETS.map((p) => p.id));
export const NIGHT_SKIES = Object.freeze(
  SKY_PRESETS.filter((p) => p.kind === "night").map((p) => p.id),
);
export const DAY_SKIES = Object.freeze(
  SKY_PRESETS.filter((p) => p.kind === "day").map((p) => p.id),
);
export const skyById = (id) => SKY_PRESETS.find((p) => p.id === id) || null;

// ---------------------------------------------------------------- storage
/**
 * Whitelist + clamp a stored sky. Unknown ids give null (no sky, never some other look). Only the keys that were set
 * are kept, so the preset keeps deciding everything the author did not touch. Idempotent.
 */
export function normalizeSky(s) {
  if (!s || typeof s !== "object") return null;
  const p = skyById(s.id);
  if (!p) return null;
  const o = { id: p.id };
  for (const [k, vals] of Object.entries(SKY_QUICK))
    if (vals.includes(s[k])) o[k] = s[k];
  for (const [k, [lo, hi, int]] of Object.entries(SKY_RANGES)) {
    if (s[k] == null || s[k] === "" || typeof s[k] === "boolean") continue;
    const n = Number(s[k]);
    if (!Number.isFinite(n)) continue;
    const v = clamp(n, lo, hi);
    o[k] = int ? Math.round(v) : Math.round(v * 100) / 100;
  }
  for (const [k, vals] of Object.entries(SKY_ENUMS))
    if (vals.includes(s[k])) o[k] = s[k];
  if (typeof s.constellations === "boolean")
    o.constellations = s.constellations;
  return o;
}

/** The full drawing settings of a stored sky: preset defaults, then quick choices, then advanced overrides. */
export function resolveSky(stored) {
  const s = normalizeSky(stored);
  if (!s) return null;
  const p = skyById(s.id);
  const q = { ...p.q };
  for (const k of Object.keys(SKY_QUICK)) if (s[k]) q[k] = s[k];
  const cfg = { ...p.a, id: p.id, kind: p.kind, palette: p.palette, q };
  cfg.density = Q_STARS[q.stars];
  [cfg.cloudDensity, cfg.cloudOpacity] = Q_CLOUDS[q.clouds];
  cfg.motionK = Q_MOTION[q.motion];
  cfg.glowK = Q_GLOW[q.glow];
  for (const k of [
    ...Object.keys(SKY_RANGES),
    ...Object.keys(SKY_ENUMS),
    "constellations",
  ])
    if (s[k] !== undefined) cfg[k] = s[k];
  return cfg;
}
const resolveMemo = new Map();
/** The resolved sky of a composition, or null. A photo background always wins over a sky. */
export function skyOf(comp) {
  const s = comp?.material?.sky;
  if (!s || !s.id || comp?.style?.bg?.image) return null;
  const key = JSON.stringify(s);
  if (resolveMemo.has(key)) return resolveMemo.get(key);
  const cfg = resolveSky(s);
  resolveMemo.set(key, cfg);
  if (resolveMemo.size > 64)
    resolveMemo.delete(resolveMemo.keys().next().value);
  return cfg;
}
export const skyActive = (comp) => skyOf(comp) != null;
/** True when the sky is drawn as one still frame (Static motion, reduce motion, reduce effects, or a still export). */
export const skyFrozen = (comp, still = false) => {
  const cfg = skyOf(comp);
  return (
    !cfg ||
    still ||
    !(cfg.motionK > 0) ||
    comp.motion?.reduceMotion === true ||
    comp.material?.reduce === true
  );
};

// ---------------------------------------------------------------- geometry
/** The area the poem can occupy: [x0,y0,x1,y1]. Bright stars, meteors, moon and sun stay out of it. */
export function keepOut(rect, W, H, pad = 24) {
  const r =
    rect && rect.w > 0
      ? rect
      : { x: W * 0.06, y: H * 0.14, w: W * 0.88, h: H * 0.51 };
  return [r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad];
}
const inBox = (x, y, b, m = 0) =>
  x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m;
const boxHit = (a, b) =>
  a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
/** Put a circle (cx,cy,r) outside the keep-out box: above it, else below it, else shrink it into the larger band. */
export function placeOutside(cx, cy, r, ko, W, H, m = 8) {
  if (!ko || !boxHit([cx - r, cy - r, cx + r, cy + r], ko))
    return { cx, cy, r };
  const top = ko[1] - m,
    bottom = H - (ko[3] + m);
  if (top >= 2 * r) return { cx, cy: Math.min(cy, top - r), r };
  if (bottom >= 2 * r) return { cx, cy: Math.max(cy, ko[3] + m + r), r };
  const band = Math.max(top, bottom),
    r2 = Math.max(4, band / 2);
  return { cx, cy: top >= bottom ? top - r2 : ko[3] + m + r2, r: r2 };
}

/** Sky colour of the plain gradient at height y (pure; used by the contrast model). */
export function gradientAt(cfg, y, H) {
  const st = (paletteById(cfg.palette) || SKY_PALETTES[0]).stops.map(hexRgb),
    f = clamp(y / Math.max(1, H), 0, 1);
  for (let i = 1; i < STOP_AT.length; i++)
    if (f <= STOP_AT[i])
      return mix(
        st[i - 1],
        st[i],
        (f - STOP_AT[i - 1]) / (STOP_AT[i] - STOP_AT[i - 1]),
      );
  return st[3];
}

// ---------------------------------------------------------------- stars
const STAR_TINTS = [
  [[170, 192, 255], 0.12],
  [[208, 218, 255], 0.25],
  [[255, 255, 255], 0.38],
  [[255, 243, 224], 0.16],
  [[255, 214, 172], 0.09],
];
const tint = (r) => {
  let u = r();
  for (const [c, w] of STAR_TINTS) if ((u -= w) <= 0) return c;
  return STAR_TINTS[2][0];
};
const gauss = (r) => (r() + r() + r() - 1.5) / 1.5;
const starMemo = new Map();
/**
 * The seeded star field of a sky at W×H: {far, mid, bright}. Each star {x, y, r, a, c, tw, ph, sp}. Positions depend
 * only on the seed, the preset and the star settings, so a star never jumps between frames or between exports.
 */
export function starField(cfg, seed, W, H) {
  const key = `${cfg.id}|${seed}|${W}x${H}|${cfg.density}|${cfg.sizeVar}|${cfg.brightness}|${cfg.bright}|${cfg.twinkle}|${cfg.nebulaShape}|${cfg.nebula > 0}`;
  if (starMemo.has(key)) return starMemo.get(key);
  const r = skyRng(seed, "stars", cfg.id),
    area = (W * H) / (1080 * 1920),
    u = W / 1080;
  const d = cfg.density,
    sv = cfg.sizeVar,
    br = 0.45 + 0.55 * cfg.brightness;
  const nFar = Math.round(1600 * d * area),
    nMid = Math.round(240 * d * area);
  const nBright =
    d > 0 ? Math.round(cfg.bright * (0.35 + 0.65 * d) * Math.sqrt(area)) : 0;
  const band = cfg.nebulaShape === "band" && cfg.nebula > 0;
  const place = (bandShare) => {
    if (band && r() < bandShare) {
      // along the galactic band: lower-left to upper-right, gaussian across it
      const s = r(),
        off = gauss(r) * 0.11;
      return [
        clamp((-0.05 + 1.1 * s - off * 0.6) * W, 0, W),
        clamp((0.62 - 0.6 * s - off) * H, 0, H),
      ];
    }
    return [r() * W, Math.pow(r(), 1.25) * H]; // a little denser toward the zenith
  };
  const far = [],
    mid = [],
    bright = [];
  for (let i = 0; i < nFar; i++) {
    const [x, y] = place(0.45);
    far.push({
      x,
      y,
      // a floor in on-canvas px keeps the far layer a visible dust of pinpricks on small previews and thumbnails
      r: Math.max(0.55, (0.45 + 0.6 * r() * (0.6 + sv)) * u),
      a: (0.32 + 0.55 * r()) * br,
      c: tint(r),
    });
  }
  for (let i = 0; i < nMid; i++) {
    const [x, y] = place(0.3);
    mid.push({
      x,
      y,
      r: Math.max(0.7, (0.85 + 0.8 * r() * (0.5 + sv)) * u),
      a: (0.45 + 0.4 * r()) * br,
      c: tint(r),
      tw: r() < 0.25 + 0.6 * cfg.twinkle, // not every star twinkles
      ph: r() * Math.PI * 2,
      sp: 0.6 + 1.8 * r(),
    });
  }
  for (let i = 0; i < nBright; i++) {
    const [x, y] = place(0.2);
    bright.push({
      x,
      y,
      r: (1.5 + 1.1 * r() * (0.5 + sv)) * u,
      a: (0.75 + 0.25 * r()) * br,
      c: tint(r),
      tw: true,
      ph: r() * Math.PI * 2,
      sp: 0.4 + 1.1 * r(),
    });
  }
  const out = { far, mid, bright };
  starMemo.set(key, out);
  if (starMemo.size > 12) starMemo.delete(starMemo.keys().next().value);
  return out;
}
/** Twinkle factor (0..1] of a star at time t (seconds). t is the frame time: the same t gives the same value. */
export const twinkleAt = (s, cfg, t) =>
  !s.tw || !(cfg.twinkle > 0)
    ? 1
    : 1 -
      cfg.twinkle *
        0.7 *
        (0.5 +
          0.5 * Math.sin(t * s.sp * (0.5 + 2.2 * cfg.twinkleSpeed) + s.ph));

// ---------------------------------------------------------------- meteors
const METEOR_PAD = 36;
/**
 * The meteors visible at time t (seconds), from a seeded schedule: time is cut into slots, and each slot's own seed
 * decides whether it holds a meteor, when, where and how long. Every path is kept clear of the text box `ko`.
 * Returns [{x0,y0,x1,y1, p (0..1 progress), a (alpha), len}]. `still` gives one deliberate frozen meteor (or none).
 */
export function meteorsAt(cfg, seed, t, W, H, ko, still = false) {
  if (!(cfg.meteors > 0)) return [];
  const P = 14 - 11.5 * cfg.meteors,
    life = 1.5 - 0.95 * cfg.meteorSpeed,
    out = [];
  const make = (r, p) => {
    const ang = (0.42 + 0.5 * r()) * (r() < 0.5 ? 1 : -1),
      len = W * (0.2 + 0.22 * r());
    const dx = Math.cos(ang) * len * Math.sign(ang || 1),
      dy = Math.abs(Math.sin(ang)) * len;
    for (let k = 0; k < 6; k++) {
      const x0 = r() * W,
        y0 = r() * H * 0.97;
      const x1 = x0 + dx,
        y1 = y0 + dy;
      if (x1 < 0 || x1 > W || y1 > H * 0.98) continue;
      const bb = [
        Math.min(x0, x1) - METEOR_PAD,
        Math.min(y0, y1) - METEOR_PAD,
        Math.max(x0, x1) + METEOR_PAD,
        Math.max(y0, y1) + METEOR_PAD,
      ];
      if (ko && boxHit(bb, ko)) continue;
      return {
        x0,
        y0,
        x1,
        y1,
        p,
        len,
        a: Math.sin(Math.PI * p) * (0.35 + 0.65 * cfg.meteorGlow),
      };
    }
    return null;
  };
  if (still) {
    if (cfg.meteors < 0.5) return [];
    const m = make(skyRng(seed, "meteor", "still"), 0.55);
    return m ? [m] : [];
  }
  for (let i = Math.floor((t - life) / P); i <= Math.floor(t / P); i++) {
    if (i < 0) continue;
    const r = skyRng(seed, "meteor", i);
    if (r() > 0.4 + 0.6 * cfg.meteors) continue;
    const s = i * P + r() * P * 0.8;
    if (t < s || t > s + life) continue;
    const m = make(r, (t - s) / life);
    if (m) out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- canvases + caches
const makeCanvas = (w, h) => {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
};
// two bounded caches: full-size layers (a few MB each) and small ones (thumbnails, sprites)
const big = new Map(),
  small = new Map();
const BIG_CAP = 3,
  SMALL_CAP = 40;
function cached(key, bytes, make) {
  const m = bytes > 400000 ? big : small,
    cap = m === big ? BIG_CAP : SMALL_CAP;
  if (m.has(key)) {
    const v = m.get(key);
    m.delete(key);
    m.set(key, v);
    return v;
  }
  const v = make();
  if (!v) return null;
  m.set(key, v);
  while (m.size > cap) m.delete(m.keys().next().value);
  return v;
}
export const skyCacheSize = () => big.size + small.size;
export const clearSkyCache = () => {
  big.clear();
  small.clear();
  starMemo.clear();
};

function paintGradient(g, cfg, W, H) {
  const st = (paletteById(cfg.palette) || SKY_PALETTES[0]).stops;
  const lg = g.createLinearGradient(0, 0, 0, H);
  st.forEach((c, i) => lg.addColorStop(STOP_AT[i], c));
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
}
const NEB_TINTS = {
  "midnight-indigo": [
    [70, 90, 170],
    [120, 100, 180],
  ],
  "violet-nebula": [
    [150, 80, 190],
    [210, 120, 160],
  ],
  "deep-cosmic-blue": [
    [90, 100, 200],
    [160, 120, 200],
  ],
  "aurora-night": [
    [60, 140, 150],
    [110, 90, 170],
  ],
  "romantic-twilight": [
    [200, 120, 150],
    [150, 90, 160],
  ],
  "moonlit-silver": [
    [120, 140, 180],
    [150, 160, 200],
  ],
  "soft-lavender-sky": [
    [170, 150, 210],
    [210, 170, 200],
  ],
  "blue-hour": [
    [110, 130, 200],
    [190, 150, 190],
  ],
};
/** Nebula clouds or the Milky Way band, drawn at 1/6 resolution and scaled up smoothly (low frequency, never tiled). */
function paintNebula(g, cfg, seed, W, H) {
  if (!(cfg.nebula > 0)) return;
  const L = 6,
    w = Math.max(8, Math.round(W / L)),
    h = Math.max(8, Math.round(H / L)),
    cv = makeCanvas(w, h);
  if (!cv) return;
  const c = cv.getContext("2d"),
    img = c.createImageData(w, h),
    D = img.data;
  const n1 = valueNoise(seed * 7 + 11),
    n2 = valueNoise(seed * 13 + 5),
    n3 = valueNoise(seed * 3 + 29);
  const [ta, tb] = NEB_TINTS[cfg.palette] || NEB_TINTS["midnight-indigo"];
  const band = cfg.nebulaShape === "band";
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h;
      let a, col;
      if (band) {
        // distance to the line from (-0.05, 0.62) to (1.05, 0.02) in unit space, aspect-corrected
        const s = clamp((u + 0.05) / 1.1, 0, 1),
          cy = 0.62 - 0.6 * s,
          dd = (v - cy) * (H / W);
        const wv = 0.1 + 0.05 * fbm(n3, u * 3, v * 3);
        const core = Math.exp(-((dd / wv) ** 2));
        const lane =
          smooth(0.52, 0.7, fbm(n2, u * 9, v * 9)) *
          Math.exp(-((dd / (wv * 0.35)) ** 2));
        a = core * (0.45 + 0.55 * fbm(n1, u * 5, v * 5)) * (1 - 0.75 * lane);
        col = mix(
          mix(ta, [235, 225, 210], 0.5 * core),
          tb,
          fbm(n3, u * 2 + 3, v * 2),
        );
      } else {
        const f = fbm(n1, u * 2.4, v * 2.4 * (H / W));
        a = smooth(0.42, 0.82, f) * (0.6 + 0.4 * fbm(n2, u * 7, v * 7));
        col = mix(ta, tb, smooth(0.3, 0.7, fbm(n3, u * 1.6, v * 1.6)));
      }
      const i = (y * w + x) * 4;
      D[i] = col[0];
      D[i + 1] = col[1];
      D[i + 2] = col[2];
      D[i + 3] = Math.round(
        clamp(a * cfg.nebula * (band ? 0.62 : 0.5), 0, 1) * 255,
      );
    }
  c.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
  g.drawImage(cv, 0, 0, W, H);
  g.restore();
}
function paintHorizonGlow(g, cfg, W, H) {
  if (cfg.horizon === "none" && !(cfg.haze > 0)) return;
  if (cfg.horizon !== "none") {
    const lg = g.createLinearGradient(0, H, 0, H * 0.62);
    lg.addColorStop(0, css(cfg.horizonGlow, 0.42 * cfg.glowK));
    lg.addColorStop(1, css(cfg.horizonGlow, 0));
    g.fillStyle = lg;
    g.fillRect(0, H * 0.62, W, H * 0.38);
  }
  if (cfg.haze > 0) {
    const lg = g.createLinearGradient(0, H, 0, H * 0.55);
    lg.addColorStop(0, css([255, 250, 240], 0.45 * cfg.haze));
    lg.addColorStop(1, css([255, 250, 240], 0));
    g.fillStyle = lg;
    g.fillRect(0, H * 0.55, W, H * 0.45);
  }
}
function dot(g, s, a) {
  g.fillStyle = css(s.c, a);
  if (s.r < 0.8) g.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
  else {
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    g.fill();
  }
}
/** Gradient + nebula + horizon glow + distant stars: one canvas per sky look and size. */
function baseLayer(cfg, seed, W, H) {
  const key = `base|${cfg.id}|${cfg.palette}|${seed}|${W}x${H}|${cfg.nebula}|${cfg.nebulaShape}|${cfg.horizon}|${cfg.glowK}|${cfg.haze}|${cfg.density}|${cfg.sizeVar}|${cfg.brightness}`;
  return cached(key, W * H * 4, () => {
    const cv = makeCanvas(W, H);
    if (!cv) return null;
    const g = cv.getContext("2d");
    paintGradient(g, cfg, W, H);
    paintNebula(g, cfg, seed, W, H);
    paintHorizonGlow(g, cfg, W, H);
    for (const s of starField(cfg, seed, W, H).far) dot(g, s, s.a);
    return cv;
  });
}
const AURORA = {
  green: [
    [80, 245, 165],
    [120, 95, 210],
  ],
  teal: [
    [70, 225, 225],
    [90, 120, 230],
  ],
  violet: [
    [175, 120, 255],
    [95, 70, 200],
  ],
  rose: [
    [255, 125, 185],
    [150, 85, 210],
  ],
};
/** Aurora curtains baked at 1/3 resolution: a wavy lower edge, vertical rays, fading upward into the second colour. */
function auroraLayer(cfg, seed, W, H) {
  const w = Math.max(8, Math.round(W / 3)),
    h = Math.max(8, Math.round((H * 0.56) / 3));
  return cached(
    `aurora|${cfg.auroraColor}|${seed}|${w}x${h}`,
    w * h * 4,
    () => {
      const cv = makeCanvas(w, h);
      if (!cv) return null;
      const c = cv.getContext("2d"),
        img = c.createImageData(w, h),
        D = img.data;
      const n1 = valueNoise(seed * 5 + 3),
        n2 = valueNoise(seed * 11 + 17);
      const [lo, hi] = AURORA[cfg.auroraColor] || AURORA.green;
      for (let x = 0; x < w; x++) {
        const u = x / w,
          edge = h * (0.55 + 0.25 * (fbm(n1, u * 2.6, 0.3) - 0.5) * 2);
        const rays = 0.3 + 0.7 * fbm(n2, u * 14, 0.7, 3),
          reach = h * (0.35 + 0.3 * fbm(n1, u * 4, 4.1));
        const side = smooth(0, 0.12, u) * smooth(0, 0.12, 1 - u);
        for (let y = 0; y < h; y++) {
          const up = edge - y;
          const v =
            up >= 0
              ? Math.exp(-up / reach)
              : Math.max(
                  Math.exp(-((up / (h * 0.06)) ** 2)),
                  0.5 * Math.exp(up / (h * 0.22)), // soft glow below the curtain, so its edge never reads as a ridge
                );
          const top = smooth(0, 0.3, y / h) * smooth(0, 0.2, 1 - y / h); // fade before both layer edges (no hard bands)
          const a = v * rays * side * top,
            col = mix(lo, hi, clamp(up / (reach * 1.6), 0, 1));
          const i = (y * w + x) * 4;
          D[i] = col[0];
          D[i + 1] = col[1];
          D[i + 2] = col[2];
          D[i + 3] = Math.round(clamp(a, 0, 1) * 255);
        }
      }
      c.putImageData(img, 0, 0);
      return cv;
    },
  );
}
/** Soft radial glow sprite for bright stars (per tint) and a 4-point sparkle sprite. */
function glowSprite(c) {
  return cached(`glow|${c.join(",")}`, 64 * 64 * 4, () => {
    const cv = makeCanvas(64, 64);
    if (!cv) return null;
    const g = cv.getContext("2d"),
      rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, css([255, 255, 255], 1));
    rg.addColorStop(0.12, css(c, 0.85));
    rg.addColorStop(0.4, css(c, 0.18));
    rg.addColorStop(1, css(c, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    return cv;
  });
}
function sparkleSprite() {
  return cached("sparkle", 128 * 128 * 4, () => {
    const cv = makeCanvas(128, 128);
    if (!cv) return null;
    const g = cv.getContext("2d");
    const spike = (len, wid, a) => {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const lg = g.createLinearGradient(
          64 - dx * len,
          64 - dy * len,
          64 + dx * len,
          64 + dy * len,
        );
        lg.addColorStop(0, css([255, 255, 255], 0));
        lg.addColorStop(0.5, css([255, 255, 255], a));
        lg.addColorStop(1, css([255, 255, 255], 0));
        g.fillStyle = lg;
        if (dx) g.fillRect(64 - len, 64 - wid / 2, len * 2, wid);
        else g.fillRect(64 - wid / 2, 64 - len, wid, len * 2);
      }
    };
    spike(62, 2.2, 0.95);
    spike(40, 5, 0.25);
    g.save();
    g.translate(64, 64);
    g.rotate(Math.PI / 4);
    g.translate(-64, -64);
    spike(22, 1.4, 0.45);
    g.restore();
    return cv;
  });
}
const MOON_LIGHT = [244, 240, 228];
/** Moon sprite: glow, disc with soft maria, and the phase cut so the sky shows through the dark side. */
function moonSprite(cfg, seed, R) {
  const S = Math.ceil(R * 9);
  return cached(
    `moon|${cfg.moon}|${Math.round(R)}|${seed}|${cfg.moonGlow}|${cfg.glowK}`,
    S * S * 4,
    () => {
      const cv = makeCanvas(S, S);
      if (!cv) return null;
      const g = cv.getContext("2d"),
        c = S / 2,
        r = skyRng(seed, "moon");
      const glow = g.createRadialGradient(c, c, R * 0.9, c, c, R * 4.4);
      glow.addColorStop(
        0,
        css([225, 230, 245], 0.42 * cfg.moonGlow * cfg.glowK),
      );
      glow.addColorStop(
        0.35,
        css([200, 210, 240], 0.12 * cfg.moonGlow * cfg.glowK),
      );
      glow.addColorStop(1, css([200, 210, 240], 0));
      g.fillStyle = glow;
      g.fillRect(0, 0, S, S);
      const disc = makeCanvas(S, S),
        d = disc.getContext("2d");
      const dg = d.createRadialGradient(
        c - R * 0.3,
        c - R * 0.3,
        R * 0.1,
        c,
        c,
        R,
      );
      dg.addColorStop(0, css([255, 253, 245]));
      dg.addColorStop(1, css([214, 212, 204]));
      d.fillStyle = dg;
      d.beginPath();
      d.arc(c, c, R, 0, Math.PI * 2);
      d.fill();
      d.globalCompositeOperation = "source-atop";
      for (let i = 0; i < 6; i++) {
        const mx = c + (r() - 0.5) * R * 1.2,
          my = c + (r() - 0.5) * R * 1.2,
          mr = R * (0.12 + 0.22 * r());
        const mg = d.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, css([150, 150, 160], 0.22));
        mg.addColorStop(1, css([150, 150, 160], 0));
        d.fillStyle = mg;
        d.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
      d.globalCompositeOperation = "destination-out";
      if (cfg.moon === "crescent") {
        d.beginPath();
        d.arc(c - R * 0.55, c - R * 0.12, R * 0.96, 0, Math.PI * 2);
        d.fill();
      } else if (cfg.moon === "half") d.fillRect(0, 0, c, S);
      g.drawImage(disc, 0, 0);
      return cv;
    },
  );
}
function sunSprite(cfg, R) {
  const S = Math.ceil(R * 14);
  const warm = cfg.palette === "golden-hour" || cfg.palette === "pastel-dawn";
  return cached(`sun|${Math.round(R)}|${warm}|${cfg.glowK}`, S * S * 4, () => {
    const cv = makeCanvas(S, S);
    if (!cv) return null;
    const g = cv.getContext("2d"),
      c = S / 2,
      core = warm ? [255, 236, 200] : [255, 252, 238];
    const halo = g.createRadialGradient(c, c, R * 0.8, c, c, c);
    halo.addColorStop(
      0,
      css(warm ? [255, 214, 160] : [255, 250, 230], 0.6 * cfg.glowK),
    );
    halo.addColorStop(
      0.25,
      css(warm ? [255, 190, 130] : [240, 248, 255], 0.2 * cfg.glowK),
    );
    halo.addColorStop(1, css([255, 255, 255], 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, S, S);
    g.fillStyle = css(core);
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();
    return cv;
  });
}
const CLOUD_TINTS = {
  moon: [
    [38, 50, 78],
    [150, 165, 196],
  ],
  day: [
    [190, 202, 222],
    [255, 255, 255],
  ],
  warm: [
    [156, 104, 122],
    [255, 214, 178],
  ],
  rose: [
    [74, 48, 78],
    [214, 156, 176],
  ],
};
/** One cloud: overlapping soft puffs, a shaded base and a lit top. */
function cloudSprite(cfg, seed, i, w, h) {
  return cached(
    `cloud|${cfg.cloudTint}|${seed}|${i}|${Math.round(w)}x${Math.round(h)}`,
    w * h * 4,
    () => {
      const cv = makeCanvas(w, h);
      if (!cv) return null;
      const g = cv.getContext("2d"),
        r = skyRng(seed, "cloud", i),
        [shade, light] = CLOUD_TINTS[cfg.cloudTint] || CLOUD_TINTS.moon;
      const puffs = [],
        n = 9 + Math.floor(r() * 9);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n,
          px = w * (0.1 + 0.8 * u + (r() - 0.5) * 0.08);
        const hump = Math.sin(Math.PI * u),
          pr = h * (0.18 + 0.2 * hump + 0.1 * r());
        puffs.push([px, h * 0.72 - hump * h * 0.28 * (0.6 + 0.6 * r()), pr]);
      }
      const pass = (col, a, dy, kr) => {
        for (const [px, py, pr] of puffs) {
          const rg = g.createRadialGradient(
            px,
            py + dy,
            0,
            px,
            py + dy,
            pr * kr,
          );
          rg.addColorStop(0, css(col, a));
          rg.addColorStop(0.6, css(col, a * 0.55));
          rg.addColorStop(1, css(col, 0));
          g.fillStyle = rg;
          g.fillRect(px - pr * kr, py + dy - pr * kr, pr * kr * 2, pr * kr * 2);
        }
      };
      pass(shade, 0.55, h * 0.06, 1.1);
      pass(light, 0.5, -h * 0.05, 0.85);
      return cv;
    },
  );
}
/** Seeded cloud placements: [{i, layer, x, y, w, h, speed, alpha}]. */
export function cloudField(cfg, seed, W, H) {
  if (!(cfg.cloudDensity > 0) || !(cfg.cloudOpacity > 0)) return [];
  const r = skyRng(seed, "clouds", cfg.id),
    out = [];
  const layers = [
    [0.55, 0.45],
    [0.8, 0.7],
    [1.15, 1],
  ];
  let i = 0;
  layers.forEach(([sc, sp], layer) => {
    const n = Math.round(cfg.cloudDensity * (layer === 2 ? 2 : 3) + r() * 0.8);
    for (let k = 0; k < n; k++) {
      const w = W * (0.42 + 0.35 * r()) * sc,
        h = w * (0.3 + 0.12 * r());
      let y;
      if (cfg.cloudBand === "low") y = H * (0.62 + 0.3 * r());
      else if (cfg.cloudBand === "top") y = H * (0.02 + 0.16 * r());
      else y = H * (0.02 + 0.9 * r());
      out.push({
        i: i++,
        layer,
        x: r() * (W + w) - w,
        y: y - h / 2,
        w,
        h,
        speed: sp,
        alpha: cfg.cloudOpacity * (0.5 + 0.22 * layer),
      });
    }
  });
  return out;
}
/** Hill silhouettes along the bottom (two ridges), drawn over stars and clouds. */
function hillsLayer(cfg, seed, W, H) {
  const top = Math.round(H * 0.8),
    h = H - top;
  return cached(`hills|${cfg.palette}|${seed}|${W}x${H}`, W * h * 4, () => {
    const cv = makeCanvas(W, h);
    if (!cv) return null;
    const g = cv.getContext("2d"),
      n = valueNoise(seed * 17 + 9),
      st = (paletteById(cfg.palette) || SKY_PALETTES[0]).stops.map(hexRgb);
    const ridge = (base, amp, fq, col, off) => {
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= W; x += 6)
        g.lineTo(
          x,
          base + amp * (fbm(n, (x / W) * fq + off, off, 3) - 0.5) * 2,
        );
      g.lineTo(W, h);
      g.closePath();
      g.fillStyle = css(col);
      g.fill();
    };
    ridge(h * 0.55, h * 0.3, 2.2, mix(st[0], st[2], 0.35), 1.7);
    ridge(h * 0.78, h * 0.18, 3.4, mix(st[0], [0, 0, 0], 0.45), 5.3);
    return cv;
  });
}

// ---------------------------------------------------------------- paint
/**
 * Paint the sky of `comp` over the whole W×H canvas at frame time tMs.
 * opts: {rect: the text area ({x,y,w,h}), still: draw the deliberate still frame}. Returns 1 when painted.
 */
export function paintSky(ctx, comp, W, H, tMs, { rect, still = false } = {}) {
  const cfg = skyOf(comp);
  if (!cfg) return 0;
  const seed = comp.material?.seed ?? 1,
    frozen = skyFrozen(comp, still);
  const t = frozen ? 0 : Math.max(0, Number(tMs) || 0) / 1000,
    mk = frozen ? 0 : cfg.motionK;
  const ko = keepOut(rect, W, H),
    u = W / 1080;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  const base = baseLayer(cfg, seed, W, H);
  const field = starField(cfg, seed, W, H);
  if (base) ctx.drawImage(base, 0, 0, W, H);
  else {
    paintGradient(ctx, cfg, W, H);
    paintHorizonGlow(ctx, cfg, W, H);
    for (const s of field.far) dot(ctx, s, s.a);
  }
  // aurora: two copies of one cached curtain, swaying against each other
  if (cfg.aurora > 0) {
    const av = auroraLayer(cfg, seed, W, H);
    if (av) {
      const tt = t * (0.35 + 0.65 * mk);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(
        cfg.aurora * (0.62 + 0.2 * Math.sin(tt * 0.55 + 1.3)),
        0,
        1,
      );
      ctx.drawImage(
        av,
        -W * 0.08 + Math.sin(tt * 0.09) * W * 0.05,
        H * 0.03,
        W * 1.16,
        H * 0.56,
      );
      ctx.globalAlpha = clamp(
        cfg.aurora * (0.32 + 0.18 * Math.sin(tt * 0.41 + 4.1)),
        0,
        1,
      );
      ctx.drawImage(
        av,
        W * 1.1 + Math.sin(tt * 0.07 + 2) * W * 0.06,
        H * 0.06,
        -W * 1.2,
        H * 0.5,
      );
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }
  // stars drift slowly (parallax: bright stars a little faster than mid ones); far stars stay put in the base canvas
  const drift = (k) => (-t * (3 + 9 * cfg.drift) * k * mk * u) % W;
  const wrapX = (x, dx) => (((x + dx) % W) + W) % W;
  const tw = t * (0.5 + 0.5 * mk);
  const dm = drift(0.6);
  for (const s of field.mid) {
    const x = wrapX(s.x, dm),
      dim = inBox(x, s.y, ko) ? 0.55 : 1;
    dot(ctx, { ...s, x }, s.a * twinkleAt(s, cfg, tw) * dim);
  }
  const db = drift(1),
    glowOk = [];
  const sp = sparkleSprite();
  for (const s of field.bright) {
    const x = wrapX(s.x, db),
      k = twinkleAt(s, cfg, tw);
    // never a bright star behind the poem: inside the text area it is drawn as a plain mid star
    if (inBox(x, s.y, ko, s.r * 10)) {
      dot(ctx, { ...s, x, r: s.r * 0.6 }, s.a * 0.5 * k);
      continue;
    }
    glowOk.push({ ...s, x });
    const gs = glowSprite(s.c),
      R = s.r * 7 * (0.6 + 0.4 * cfg.glowK);
    ctx.globalCompositeOperation = "lighter";
    if (gs) {
      ctx.globalAlpha = clamp(s.a * k * 0.9, 0, 1);
      ctx.drawImage(gs, x - R, s.y - R, R * 2, R * 2);
    } else dot(ctx, { ...s, x }, s.a * k);
    if (sp) {
      const L = s.r * (9 + 8 * cfg.glowK) * (0.55 + 0.45 * k);
      ctx.globalAlpha = clamp(s.a * k * (0.45 + 0.4 * cfg.glowK), 0, 1);
      ctx.drawImage(sp, x - L, s.y - L, L * 2, L * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  if (cfg.constellations && glowOk.length > 3) {
    const pts = glowOk.slice().sort((a, b) => a.x - b.x);
    ctx.strokeStyle = css([200, 215, 255], 0.16 * (0.6 + 0.4 * cfg.glowK));
    ctx.lineWidth = Math.max(1, 1.1 * u);
    for (let g0 = 0; g0 + 2 < pts.length; g0 += 4) {
      const grp = pts.slice(g0, g0 + 4);
      ctx.beginPath();
      ctx.moveTo(grp[0].x, grp[0].y);
      for (let k = 1; k < grp.length; k++) {
        const a = grp[k - 1],
          b = grp[k];
        if (
          Math.hypot(b.x - a.x, b.y - a.y) > W * 0.35 ||
          boxHit(
            [
              Math.min(a.x, b.x),
              Math.min(a.y, b.y),
              Math.max(a.x, b.x),
              Math.max(a.y, b.y),
            ],
            ko,
          )
        )
          ctx.moveTo(b.x, b.y);
        else ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }
  if (cfg.moon !== "none") {
    const R0 = (0.035 + 0.05 * cfg.moonSize) * W,
      pl = placeOutside(
        cfg.moonX * W,
        Math.max(R0 * 1.3, cfg.moonY * H),
        R0 * 1.25,
        ko,
        W,
        H,
      );
    const R = pl.r / 1.25,
      ms = moonSprite(cfg, seed, R);
    if (ms) ctx.drawImage(ms, pl.cx - ms.width / 2, pl.cy - ms.height / 2);
    else {
      ctx.fillStyle = css(MOON_LIGHT);
      ctx.beginPath();
      ctx.arc(pl.cx, pl.cy, R, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (cfg.sun) {
    const R0 = 0.045 * W,
      pl = placeOutside(
        cfg.sunX * W,
        Math.max(R0 * 1.5, cfg.sunY * H),
        R0 * 1.4,
        ko,
        W,
        H,
      );
    const ss = sunSprite(cfg, pl.r / 1.4);
    if (ss) ctx.drawImage(ss, pl.cx - ss.width / 2, pl.cy - ss.height / 2);
  }
  // shooting stars: a fading trail behind a bright head, always clear of the text area
  for (const m of meteorsAt(cfg, seed, t, W, H, ko, frozen)) {
    const hx = m.x0 + (m.x1 - m.x0) * m.p,
      hy = m.y0 + (m.y1 - m.y0) * m.p;
    const tl = (0.15 + 0.35 * cfg.meteorTrail) * Math.min(1, m.p * 2.2),
      tx = hx - (m.x1 - m.x0) * tl,
      ty = hy - (m.y1 - m.y0) * tl;
    const lg = ctx.createLinearGradient(tx, ty, hx, hy);
    lg.addColorStop(0, css([200, 220, 255], 0));
    lg.addColorStop(1, css([255, 255, 255], m.a));
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2.4 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    const gs = glowSprite([210, 225, 255]);
    if (gs) {
      ctx.globalAlpha = clamp(m.a, 0, 1);
      ctx.drawImage(gs, hx - 14 * u, hy - 14 * u, 28 * u, 28 * u);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  for (const c of cloudField(cfg, seed, W, H)) {
    const sp2 = cloudSprite(cfg, seed, c.i, Math.round(c.w), Math.round(c.h));
    if (!sp2) continue;
    const span = W + c.w,
      x =
        ((((c.x + c.w + t * (4 + 16 * cfg.cloudSpeed) * c.speed * mk * u) %
          span) +
          span) %
          span) -
        c.w;
    ctx.globalAlpha = clamp(c.alpha, 0, 1);
    ctx.drawImage(sp2, x, c.y, c.w, c.h);
  }
  ctx.globalAlpha = 1;
  if (cfg.horizon === "hills") {
    const hl = hillsLayer(cfg, seed, W, H);
    if (hl) ctx.drawImage(hl, 0, Math.round(H * 0.8));
  }
  ctx.restore();
  return 1;
}

// ---------------------------------------------------------------- readability
/** Colours that can sit under text in this sky (plain gradient, then with each glowing layer at its strongest). */
function overlayColours(cfg) {
  const out = [];
  if (cfg.nebula > 0)
    out.push([
      (NEB_TINTS[cfg.palette] || NEB_TINTS["midnight-indigo"])[1],
      cfg.nebula * 0.5,
    ]);
  if (cfg.aurora > 0)
    out.push([(AURORA[cfg.auroraColor] || AURORA.green)[0], cfg.aurora * 0.55]);
  if (cfg.cloudDensity > 0)
    out.push([
      (CLOUD_TINTS[cfg.cloudTint] || CLOUD_TINTS.moon)[1],
      cfg.cloudOpacity * 0.72,
    ]);
  if (cfg.haze > 0) out.push([[255, 250, 240], cfg.haze * 0.3]);
  return out;
}
/** Contrast-model base colours of a sky composition (fx/palette.js fxBases). */
export function skyBases(comp) {
  const cfg = skyOf(comp);
  if (!cfg) return null;
  const st = (paletteById(cfg.palette) || SKY_PALETTES[0]).stops.map(hexRgb);
  const ov = overlayColours(cfg);
  return [
    ...st,
    ...st.map((c) => ov.reduce((m, [col, a]) => mix(m, col, a), c)),
  ];
}
const scrimMemo = new Map();
export const SKY_SCRIM_TARGET = 4.8;
/**
 * The local shade a text block needs on this sky: samples the sky under `box` (the gradient at each height, and the
 * same with every glowing layer at its strongest) and asks for the lightest scrim that keeps 4.5:1 (+ margin).
 */
export function skyScrim(
  comp,
  box,
  textHex,
  { H = 1920, target = SKY_SCRIM_TARGET } = {},
) {
  const cfg = skyOf(comp);
  if (!cfg || !/^#[0-9a-f]{6}$/i.test(textHex || ""))
    return { alpha: 0, rgb: [0, 0, 0] };
  const key = `${JSON.stringify(comp.material.sky)}|${box.map(Math.round).join(",")}|${textHex}|${H}|${JSON.stringify(comp.style?.overlay || null)}`;
  if (scrimMemo.has(key)) return scrimMemo.get(key);
  const ov = overlayColours(cfg),
    o = comp.style?.overlay;
  const lay = (c) => (o?.opacity > 0 ? mix(c, hexRgb(o.color), o.opacity) : c);
  const samples = [];
  for (let i = 0; i <= 16; i++) {
    const c = gradientAt(cfg, box[1] + ((box[3] - box[1]) * i) / 16, H);
    samples.push(lay(c), lay(ov.reduce((m, [col, a]) => mix(m, col, a), c)));
  }
  // try a dark and a light shade and keep the one that needs less opacity: mid-grey text (an author line) on a
  // night sky gets a soft dark shade, never a white pill; a tie keeps the shade that matches the sky's brightness
  const tl = lum(...hexRgb(textHex));
  const skyL = samples.reduce((m, c) => m + lum(...c), 0) / samples.length;
  const need = (scrim) => {
    // worst sample = the one closest in luminance to the text
    const w = samples.reduce((b, c) =>
      ratio(tl, lum(...c)) < ratio(tl, lum(...b)) ? c : b,
    );
    if (ratio(tl, lum(...w)) >= target) return 0;
    for (let o = 0.05; o <= 0.9001; o += 0.025) {
      const m = w.map((c, i) => c * (1 - o) + scrim[i] * o);
      if (ratio(tl, lum(...m)) >= target) return Math.round(o * 1000) / 1000;
    }
    return 0.9;
  };
  const dark = need([0, 0, 0]),
    pale = need([255, 255, 255]);
  const useDark = dark < pale || (dark === pale && skyL < 0.3);
  const res = {
    alpha: useDark ? dark : pale,
    rgb: useDark ? [0, 0, 0] : [255, 255, 255],
  };
  scrimMemo.set(key, res);
  if (scrimMemo.size > 48) scrimMemo.delete(scrimMemo.keys().next().value);
  return res;
}
/** Draw the readability shade under each text block on a sky. blocks: [{box:[x0,y0,x1,y1], color}]. */
export function paintSkyScrims(ctx, env, blocks) {
  if (!skyActive(env.comp)) return [];
  const drawn = [];
  for (const b of blocks) {
    const s = skyScrim(env.comp, b.box, b.color, { H: env.H });
    if (!(s.alpha > 0)) continue;
    const F = Math.max(
      32,
      Math.min(120, Math.min(b.box[2] - b.box[0], b.box[3] - b.box[1]) * 0.5),
    );
    if (typeof ctx.createLinearGradient === "function")
      featherRect(ctx, b.box, s.rgb, s.alpha, F);
    drawn.push({ ...b, alpha: s.alpha });
  }
  return drawn;
}
/** Advice for the panel: a dark text colour on a dark sky (or light on a bright day sky) reads poorly. */
export function skyTextAdvice(comp) {
  const cfg = skyOf(comp);
  if (!cfg || !/^#[0-9a-f]{6}$/i.test(comp.style?.color || "")) return null;
  const s = skyScrim(
    comp,
    [0, 1920 * 0.14, 1080, 1920 * 0.65],
    comp.style.color,
    { H: 1920 },
  );
  if (s.alpha < 0.45) return null;
  const light = lum(...hexRgb(comp.style.color)) > 0.4;
  return light
    ? "This bright sky needs a strong shade behind light text. A dark text colour reads better on it."
    : "Dark text on a night sky needs a strong light shade behind it. Ivory, white or silver text reads better here.";
}

/** A real rendered thumbnail of a preset (no text; the whole card is sky). */
export function paintSkySwatch(ctx, id, w, h, { seed = 1, t = 0 } = {}) {
  const comp = {
    material: { seed, sky: { id } },
    style: { bg: {} },
    motion: {},
  };
  return paintSky(ctx, comp, w, h, t, { rect: { x: 0, y: 0, w: 0, h: 0 } });
}
