// Six distinct template families. Each defines palette, type, placement and motion; not just a recoloured background.
import {
  VERIFIED_FONT_IDS,
  FONT_REGISTRY,
  fontById,
  canBody,
  canTitle,
} from "./font-registry.js";
import { paletteById, assertPalette } from "./palettes.js";
import {
  typePresetById,
  fontHasWeight,
  TYPE_SIZE_MIN,
  TYPE_SIZE_MAX,
  TYPE_WEIGHTS,
} from "./type-presets.js";
import { MATERIAL_IDS, MATERIAL_NONE } from "./materials.js";
import {
  ANIMATION_IDS,
  REJECTED_ANIMATIONS,
  MOTION_PREFS,
} from "./animation.js";
// Fonts come from the registry: FONT_KEYS is the VERIFIED set (templates may only use these); labels cover every entry.
export const FONT_KEYS = VERIFIED_FONT_IDS;
export const FONT_LABELS = Object.fromEntries(
  FONT_REGISTRY.map((f) => [f.id, f.label]),
);

export const TEMPLATES = [
  {
    id: "ink-silence",
    name: "Ink & Silence",
    mood: "restrained, quiet",
    bg: { kind: "solid", a: "#111214", b: "#1b1c20" },
    style: {
      font: "noto-serif",
      sizePx: 64,
      weight: 500,
      color: "#ece8df",
      align: "center",
      lineHeight: 1.7,
      widthPct: 100,
      vAlign: "middle",
      shadow: false,
    },
    fx: {
      vignette: 0.55,
      grain: 0.07,
      particles: "dust",
      overlay: { color: "#000000", opacity: 0 },
    },
    motion: { textIn: "fade", bgMotion: "none" },
    signatureColor: "#9a968c",
  },
  {
    id: "paper-ink",
    name: "Paper & Ink",
    mood: "classic, literary",
    bg: { kind: "paper", a: "#f3ead7", b: "#e6d8bb" },
    style: {
      font: "tiro",
      sizePx: 66,
      weight: 400,
      color: "#2b2118",
      align: "center",
      lineHeight: 1.75,
      widthPct: 100,
      vAlign: "middle",
      shadow: false,
    },
    fx: {
      vignette: 0.35,
      grain: 0.14,
      particles: "none",
      overlay: { color: "#000000", opacity: 0 },
    },
    motion: { textIn: "line", bgMotion: "none" },
    signatureColor: "#6b5a43",
  },
  {
    id: "monsoon",
    name: "Monsoon Memories",
    mood: "wistful, rain-soaked",
    bg: { kind: "gradient", a: "#27384a", b: "#0f1a26" },
    style: {
      font: "hind-madurai",
      sizePx: 62,
      weight: 500,
      color: "#e8f0f7",
      align: "center",
      lineHeight: 1.65,
      widthPct: 100,
      vAlign: "middle",
      shadow: true,
    },
    fx: {
      vignette: 0.5,
      grain: 0.05,
      particles: "rain",
      overlay: { color: "#0b1620", opacity: 0.25 },
    },
    motion: { textIn: "line", bgMotion: "drift" },
    signatureColor: "#9fb3c4",
  },
  {
    id: "midnight",
    name: "Midnight Thoughts",
    mood: "philosophical, still",
    bg: { kind: "gradient", a: "#1a1f4a", b: "#07081c" },
    style: {
      font: "noto-serif",
      sizePx: 62,
      weight: 500,
      color: "#e9ebff",
      align: "center",
      lineHeight: 1.7,
      widthPct: 100,
      vAlign: "middle",
      shadow: true,
    },
    fx: {
      vignette: 0.5,
      grain: 0.04,
      particles: "stars",
      overlay: { color: "#000000", opacity: 0 },
    },
    motion: { textIn: "fade", bgMotion: "zoom" },
    signatureColor: "#9ea4d6",
  },
  {
    id: "golden-hour",
    name: "Golden Hour",
    mood: "nostalgic, warm",
    bg: { kind: "gradient", a: "#e9a14a", b: "#6a2f1b" },
    style: {
      font: "anek",
      sizePx: 64,
      weight: 600,
      color: "#fff6e6",
      align: "center",
      lineHeight: 1.6,
      widthPct: 100,
      vAlign: "middle",
      shadow: true,
    },
    fx: {
      vignette: 0.4,
      grain: 0.06,
      particles: "light",
      overlay: { color: "#2a0f05", opacity: 0.18 },
    },
    motion: { textIn: "rise", bgMotion: "drift" },
    signatureColor: "#ffe2b8",
  },
  {
    id: "modern-minimal",
    name: "Modern Minimal",
    mood: "clean, contemporary",
    bg: { kind: "gradient", a: "#f6f7f9", b: "#dfe3ea" },
    style: {
      font: "noto-sans",
      sizePx: 60,
      weight: 600,
      color: "#14171c",
      align: "left",
      lineHeight: 1.6,
      widthPct: 100,
      vAlign: "middle",
      shadow: false,
    },
    fx: {
      vignette: 0.0,
      grain: 0.02,
      particles: "none",
      overlay: { color: "#000000", opacity: 0 },
      geometry: true,
    },
    motion: { textIn: "rise", bgMotion: "none" },
    signatureColor: "#5a6270",
  },
];
// TEMPLATES above = the six original ("classic") templates, byte-for-byte as before (the golden fixture and every legacy
// project depend on them). P8 adds DESIGN_TEMPLATES below; TEMPLATE_LIBRARY is both, and templateById resolves either.

// ---------------------------------------------------------------- P8: 6 families x 3 variants (DATA ONLY)
// Each variant = a palette (palettes.js) + a body type preset (type-presets.js) + an optional material preset
// (materials.js) + a text-in behaviour from the animation library (animation.js) + a motion feel. assertTemplate runs at
// import on every entry: verified body font only, a weight the font has, size >= the strictest route floor, text and
// signature >= 4.5:1 on the palette, and known material / animation / motion ids. A failing entry throws (never ships).
// needsAestheticReview:true = machine-checked only; NO human design sign-off has been given.
export const FAMILIES = Object.freeze(
  [
    { id: "ink-silence", label: "Ink & Silence" },
    { id: "paper-ink", label: "Paper & Ink" },
    { id: "monsoon", label: "Monsoon Memories" },
    { id: "midnight", label: "Midnight Thoughts" },
    { id: "golden-hour", label: "Golden Hour" },
    { id: "modern-minimal", label: "Modern Minimal" },
  ].map((f) => Object.freeze(f)),
);
const FAMILY_IDS = FAMILIES.map((f) => f.id);
/** Family of any template: P8 entries carry it; each classic template is the original of the family with its id. */
export const familyOf = (t) =>
  t && FAMILY_IDS.includes(t.family)
    ? t.family
    : t && FAMILY_IDS.includes(t.id)
      ? t.id
      : null;
export const familyLabel = (id) =>
  FAMILIES.find((f) => f.id === id)?.label || "";
export const PENDING_REVIEW_LABEL = "Pending design review";

// Lists below mirror composition.js (which imports this file, so they cannot be imported from there).
const BG_MOTION = ["none", "zoom", "drift"];
const PARTICLES = ["none", "dust", "rain", "stars", "light"];
const VALIGN = ["top", "middle", "bottom"];

/** Throws (with every reason) unless a P8 template is complete and passes every data check. */
export function assertTemplate(t) {
  const why = [];
  if (!t || typeof t !== "object") throw new Error("template: not an object");
  if (typeof t.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(t.id))
    why.push("bad id");
  if (typeof t.name !== "string" || !t.name) why.push("missing name");
  if (!FAMILY_IDS.includes(t.family)) why.push(`unknown family ${t.family}`);
  const st = t.style || {},
    fx = t.fx || {},
    mo = t.motion || {};
  const f = fontById(st.font);
  if (!f) why.push(`unknown font ${st.font}`);
  else {
    if (f.verified !== true)
      why.push(
        `font ${st.font} is not verified (candidate fonts are not allowed in templates)`,
      );
    if (f.loadable !== true) why.push(`font ${st.font} cannot be loaded`);
    if (!canBody(st.font))
      why.push(`font ${st.font} is display-only and cannot set poem text`);
  }
  if (st.titleFont != null) {
    const tf = fontById(st.titleFont);
    if (!tf || tf.verified !== true || !canTitle(st.titleFont))
      why.push(`title font ${st.titleFont} is not a verified title font`);
  }
  if (!TYPE_WEIGHTS.includes(st.weight) || !fontHasWeight(st.font, st.weight))
    why.push(`weight ${st.weight} is not available in ${st.font}`);
  if (!(
    Number.isInteger(st.sizePx) &&
    st.sizePx >= TYPE_SIZE_MIN &&
    st.sizePx <= TYPE_SIZE_MAX
  ))
    why.push(
      `sizePx ${st.sizePx} is below the ${TYPE_SIZE_MIN}px floor or above ${TYPE_SIZE_MAX}`,
    );
  if (!(st.lineHeight >= 1.2 && st.lineHeight <= 2.4))
    why.push("bad lineHeight");
  if (
    !["left", "center", "right"].includes(st.align) ||
    !VALIGN.includes(st.vAlign)
  )
    why.push("bad alignment");
  if (st.letterSpacing != null && st.letterSpacing !== 0)
    why.push("letterSpacing must be 0 for Tamil");
  const tp = typePresetById(t.typePreset);
  if (!tp || tp.role !== "body")
    why.push(`unknown body type preset ${t.typePreset}`);
  const pal = paletteById(t.palette);
  if (!pal) why.push(`unknown palette ${t.palette}`);
  else {
    // contrast of what the template actually draws (its own colours, background and overlay) - not just the palette's
    try {
      assertPalette({
        id: t.id,
        label: t.name,
        bg: t.bg,
        text: st.color,
        signature: t.signatureColor,
        accent: pal.accent,
        overlay: fx.overlay,
      });
    } catch (e) {
      why.push(e.message);
    }
  }
  if (
    t.material != null &&
    (!MATERIAL_IDS.includes(t.material) || t.material === MATERIAL_NONE)
  )
    why.push(`unknown material ${t.material}`);
  if (!ANIMATION_IDS.includes(mo.textIn) || mo.textIn in REJECTED_ANIMATIONS)
    why.push(`unknown animation ${mo.textIn}`);
  if (!BG_MOTION.includes(mo.bgMotion))
    why.push(`unknown background motion ${mo.bgMotion}`);
  if (mo.pref != null && !MOTION_PREFS.includes(mo.pref))
    why.push(`unknown motion feel ${mo.pref}`);
  if (
    !PARTICLES.includes(fx.particles) ||
    !(fx.vignette >= 0 && fx.vignette <= 1) ||
    !(fx.grain >= 0 && fx.grain <= 0.4)
  )
    why.push("bad fx");
  if (t.needsAestheticReview !== true)
    why.push("needsAestheticReview must be true until a human design review");
  if (why.length) throw new Error(`template ${t.id}: ${why.join("; ")}`);
  return t;
}

/** Builds a complete template (same shape as a classic one) from palette + type preset + look. */
export function buildTemplate({
  id,
  name,
  mood,
  family,
  palette,
  type,
  material = null,
  textIn,
  bgMotion = "none",
  pref = "normal",
  fx = {},
  shadow = false,
  widthPct = 100,
}) {
  const p = paletteById(palette),
    tp = typePresetById(type);
  if (!p) throw new Error(`template ${id}: unknown palette ${palette}`);
  if (!tp) throw new Error(`template ${id}: unknown type preset ${type}`);
  return {
    id,
    name,
    mood,
    family,
    palette,
    typePreset: type,
    bg: { kind: p.bg.kind, a: p.bg.a, b: p.bg.b },
    style: {
      font: tp.font,
      ...(tp.title.font && tp.title.font !== tp.font
        ? { titleFont: tp.title.font }
        : {}),
      sizePx: tp.sizePx,
      weight: tp.weight,
      color: p.text,
      align: tp.align,
      lineHeight: tp.lineHeight,
      widthPct,
      vAlign: "middle",
      shadow,
    },
    fx: {
      vignette: 0,
      grain: 0.04,
      particles: "none",
      ...fx,
      overlay: { ...p.overlay },
    },
    motion: { textIn, bgMotion, pref },
    signatureColor: p.signature,
    ...(material ? { material } : {}),
    needsAestheticReview: true,
  };
}

const deepFreeze = (o) => {
  for (const v of Object.values(o))
    if (v && typeof v === "object") deepFreeze(v);
  return Object.freeze(o);
};
export const DESIGN_TEMPLATES = Object.freeze(
  [
    // Ink & Silence
    {
      id: "ink-silence-1",
      name: "Sumi Night",
      mood: "spare, ink on black",
      family: "ink-silence",
      palette: "sumi-night",
      type: "serif-quiet",
      material: "dust",
      textIn: "soft-fade",
      pref: "calm",
      fx: { vignette: 0.5, grain: 0.05 },
    },
    {
      id: "ink-silence-2",
      name: "Charcoal Wash",
      mood: "brushed, meditative",
      family: "ink-silence",
      palette: "charcoal-wash",
      type: "tiro-literary",
      material: "ink-wash",
      textIn: "line-reveal",
      pref: "calm",
      fx: { vignette: 0.45, grain: 0.06, particles: "dust" },
    },
    {
      id: "ink-silence-3",
      name: "Ash Quiet",
      mood: "hushed, grey, word by word",
      family: "ink-silence",
      palette: "ash-quiet",
      type: "serif-classic",
      material: "charcoal",
      textIn: "word-reveal",
      fx: { vignette: 0.4, grain: 0.05 },
    },
    // Paper & Ink
    {
      id: "paper-ink-1",
      name: "Cream Folio",
      mood: "bookish, warm paper",
      family: "paper-ink",
      palette: "cream-folio",
      type: "tiro-literary",
      material: "paper",
      textIn: "line-reveal",
      pref: "calm",
      fx: { vignette: 0.2, grain: 0.1 },
    },
    {
      id: "paper-ink-2",
      name: "Aged Letter",
      mood: "old letter, stanza by stanza",
      family: "paper-ink",
      palette: "aged-letter",
      type: "tiro-large",
      material: "aged-paper",
      textIn: "stanza-reveal",
      pref: "calm",
      fx: { vignette: 0.25, grain: 0.12 },
    },
    {
      id: "paper-ink-3",
      name: "Linen Page",
      mood: "woven page, left aligned",
      family: "paper-ink",
      palette: "linen-page",
      type: "serif-left",
      material: "linen",
      textIn: "word-reveal",
      fx: { vignette: 0.12, grain: 0.06 },
    },
    // Monsoon Memories
    {
      id: "monsoon-1",
      name: "Rain Window",
      mood: "rain on glass, wistful",
      family: "monsoon",
      palette: "rain-window",
      type: "hind-soft",
      material: "rain-glass",
      textIn: "line-reveal",
      bgMotion: "drift",
      fx: { vignette: 0.45, grain: 0.04, particles: "rain" },
      shadow: true,
    },
    {
      id: "monsoon-2",
      name: "Wet Slate",
      mood: "grey rain, slow rise",
      family: "monsoon",
      palette: "wet-slate",
      type: "hind-medium",
      material: "film",
      textIn: "gentle-rise",
      bgMotion: "drift",
      pref: "calm",
      fx: { vignette: 0.4, grain: 0.05 },
      shadow: true,
    },
    {
      id: "monsoon-3",
      name: "Teal Downpour",
      mood: "heavy rain, stanza by stanza",
      family: "monsoon",
      palette: "teal-downpour",
      type: "anek-light",
      textIn: "stanza-reveal",
      fx: { vignette: 0.45, grain: 0.04, particles: "rain" },
    },
    // Midnight Thoughts
    {
      id: "midnight-1",
      name: "Indigo Hour",
      mood: "starlit, slow zoom",
      family: "midnight",
      palette: "indigo-hour",
      type: "serif-quiet",
      material: "night-grain",
      textIn: "slow-zoom",
      pref: "calm",
      fx: { vignette: 0.5, grain: 0.04, particles: "stars" },
      shadow: true,
    },
    {
      id: "midnight-2",
      name: "Velvet Dark",
      mood: "violet night, soft glow",
      family: "midnight",
      palette: "velvet-dark",
      type: "serif-firm",
      material: "soft-glow",
      textIn: "soft-fade",
      bgMotion: "zoom",
      pref: "calm",
      fx: { vignette: 0.5, grain: 0.03, particles: "stars" },
    },
    {
      id: "midnight-3",
      name: "Starless",
      mood: "black sky, lines that fade away",
      family: "midnight",
      palette: "starless",
      type: "sans-center",
      material: "night-grain",
      textIn: "line-fade-out",
      fx: { vignette: 0.35, grain: 0.04 },
    },
    // Golden Hour
    {
      id: "golden-hour-1",
      name: "Amber Dusk",
      mood: "low sun, warm haze",
      family: "golden-hour",
      palette: "amber-dusk",
      type: "anek-warm",
      material: "golden-haze",
      textIn: "gentle-rise",
      bgMotion: "drift",
      fx: { vignette: 0.4, grain: 0.05, particles: "light" },
      shadow: true,
    },
    {
      id: "golden-hour-2",
      name: "Saffron Light",
      mood: "bright, morning gold",
      family: "golden-hour",
      palette: "saffron-light",
      type: "anek-light",
      material: "golden-haze",
      textIn: "word-reveal",
      pref: "expressive",
      fx: { vignette: 0.15, grain: 0.04 },
    },
    {
      id: "golden-hour-3",
      name: "Ember Glow",
      mood: "embers, film warmth",
      family: "golden-hour",
      palette: "ember-glow",
      type: "anek-strong",
      material: "film",
      textIn: "rise",
      bgMotion: "drift",
      pref: "expressive",
      fx: { vignette: 0.45, grain: 0.06, particles: "light" },
      shadow: true,
    },
    // Modern Minimal
    {
      id: "modern-minimal-1",
      name: "Porcelain",
      mood: "white, crisp, word by word",
      family: "modern-minimal",
      palette: "porcelain",
      type: "sans-clean",
      material: "clean",
      textIn: "word-reveal",
      fx: { grain: 0.02, geometry: true },
    },
    {
      id: "modern-minimal-2",
      name: "Graphite",
      mood: "dark, flat, bold",
      family: "modern-minimal",
      palette: "graphite",
      type: "sans-bold",
      textIn: "line-reveal",
      fx: { grain: 0.02, geometry: true },
    },
    {
      id: "modern-minimal-3",
      name: "Mist Blue",
      mood: "pale blue, calm",
      family: "modern-minimal",
      palette: "mist-blue",
      type: "sans-regular",
      material: "clean",
      textIn: "fade",
      pref: "calm",
      fx: { grain: 0.02 },
    },
  ].map((spec) => deepFreeze(assertTemplate(buildTemplate(spec)))),
);

/** Every template the Studio offers: the six classics first (unchanged), then the P8 families. */
export const TEMPLATE_LIBRARY = Object.freeze([
  ...TEMPLATES,
  ...DESIGN_TEMPLATES,
]);
{
  const ids = TEMPLATE_LIBRARY.map((t) => t.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("templates: duplicate id");
  const names = TEMPLATE_LIBRARY.map((t) => t.name.toLowerCase());
  if (new Set(names).size !== names.length)
    throw new Error("templates: duplicate name");
}
/** Templates grouped by family, in FAMILIES order (classic first inside each family). */
export const groupByFamily = (list) =>
  FAMILIES.map((f) => ({
    ...f,
    templates: list.filter((t) => familyOf(t) === f.id),
  })).filter((g) => g.templates.length);

export const templateById = (id) =>
  TEMPLATE_LIBRARY.find((t) => t.id === id) || TEMPLATES[0];
