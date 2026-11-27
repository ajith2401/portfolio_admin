// Named colour palettes (P8): DATA ONLY. A palette is the colour half of a template: background stops, poem text,
// signature and an accent (the accent is descriptive only; nothing draws it today).
//
// Load-time check (assertPalette, run on every entry below): text, signature and accent must each reach >= 4.5:1 against
// EVERY background colour the material verifier models (fx/palette.js fxBases: stop a, stop b and their midpoint, with
// the colour overlay applied). A palette that fails throws at import, so it can never ship silently.
// Vignette, grain and particles are not part of this model (same as the verifier); keep them modest on light palettes.
//
// needsAestheticReview:true = machine-checked for contrast only. No human design sign-off has been given.
import { hexRgb, lum, ratio } from "./contrast.js";

export const PALETTE_CONTRAST_MIN = 4.5;
const HEX = /^#[0-9a-f]{6}$/;
const BG_KINDS = ["solid", "gradient", "paper"];

const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
/** The background colours text is checked against (mirrors fx/palette.js fxBases for a non-photo background). */
export function paletteBases(p) {
  const a = hexRgb(p.bg.a),
    b = hexRgb(p.bg.kind === "solid" ? p.bg.a : p.bg.b);
  let bases = [a, b, mix(a, b, 0.5)];
  const ov = p.overlay && p.overlay.opacity > 0 ? p.overlay : null;
  if (ov) bases = bases.map((c) => mix(c, hexRgb(ov.color), ov.opacity));
  return bases;
}
/** Worst-case contrast of a colour over a palette's backgrounds. */
export const worstContrast = (p, colour) => {
  const tl = lum(...hexRgb(colour));
  return Math.min(...paletteBases(p).map((b) => ratio(tl, lum(...b))));
};
export const paletteContrast = (p) => ({
  text: worstContrast(p, p.text),
  signature: worstContrast(p, p.signature),
  accent: worstContrast(p, p.accent),
});

/** Throws (with every reason) unless the palette is well-formed and every derived pair reaches 4.5:1. */
export function assertPalette(p) {
  const why = [];
  if (!p || typeof p !== "object") throw new Error("palette: not an object");
  if (typeof p.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(p.id))
    why.push("bad id");
  if (typeof p.label !== "string" || !p.label) why.push("missing label");
  if (
    !p.bg ||
    !BG_KINDS.includes(p.bg.kind) ||
    !HEX.test(p.bg.a) ||
    !HEX.test(p.bg.b)
  )
    why.push("bad background");
  for (const k of ["text", "accent", "signature"])
    if (!HEX.test(p[k] || "")) why.push(`bad ${k} colour`);
  if (
    p.overlay &&
    (!HEX.test(p.overlay.color || "") ||
      !(p.overlay.opacity >= 0 && p.overlay.opacity <= 0.9))
  )
    why.push("bad overlay");
  if (!why.length) {
    const c = paletteContrast(p);
    for (const k of ["text", "signature", "accent"])
      if (!(c[k] >= PALETTE_CONTRAST_MIN))
        why.push(
          `${k} contrast ${c[k].toFixed(2)}:1 is below ${PALETTE_CONTRAST_MIN}:1`,
        );
  }
  if (why.length) throw new Error(`palette ${p.id}: ${why.join("; ")}`);
  return p;
}

const NO_OVERLAY = { color: "#000000", opacity: 0 };
const P = (
  id,
  label,
  family,
  bg,
  text,
  accent,
  signature,
  overlay = NO_OVERLAY,
) => ({
  id,
  label,
  family,
  bg,
  text,
  accent,
  signature,
  overlay,
  needsAestheticReview: true,
});

export const PALETTES = Object.freeze(
  [
    // Ink & Silence: near-black, ivory ink
    P(
      "sumi-night",
      "Sumi night",
      "ink-silence",
      { kind: "solid", a: "#121316", b: "#121316" },
      "#efebe3",
      "#c9b99a",
      "#a8a49a",
    ),
    P(
      "charcoal-wash",
      "Charcoal wash",
      "ink-silence",
      { kind: "gradient", a: "#1f2024", b: "#0d0e10" },
      "#f2efe8",
      "#d4c4a4",
      "#b3ada2",
    ),
    P(
      "ash-quiet",
      "Ash quiet",
      "ink-silence",
      { kind: "gradient", a: "#2a2a2c", b: "#161617" },
      "#f4f1ea",
      "#d9cdb5",
      "#bdb7ab",
    ),
    // Paper & Ink: warm paper, brown-black ink
    P(
      "cream-folio",
      "Cream folio",
      "paper-ink",
      { kind: "paper", a: "#f5eedd", b: "#eadfc6" },
      "#2a2017",
      "#7a4a1e",
      "#5e4d38",
    ),
    P(
      "aged-letter",
      "Aged letter",
      "paper-ink",
      { kind: "paper", a: "#efe2c4", b: "#dcc7a0" },
      "#2b1d10",
      "#6b3410",
      "#4f3a20",
    ),
    P(
      "linen-page",
      "Linen page",
      "paper-ink",
      { kind: "gradient", a: "#f4f1ea", b: "#e6e0d3" },
      "#23201b",
      "#6a4b2a",
      "#55504a",
    ),
    // Monsoon Memories: rain blues and teals
    P(
      "rain-window",
      "Rain window",
      "monsoon",
      { kind: "gradient", a: "#2d4256", b: "#121e2b" },
      "#eaf2f8",
      "#bcd7f0",
      "#a9bccd",
      { color: "#0b1620", opacity: 0.2 },
    ),
    P(
      "wet-slate",
      "Wet slate",
      "monsoon",
      { kind: "gradient", a: "#34414a", b: "#1a2228" },
      "#eef3f5",
      "#c3d6df",
      "#b0bec6",
    ),
    P(
      "teal-downpour",
      "Teal downpour",
      "monsoon",
      { kind: "gradient", a: "#1f4747", b: "#0c2222" },
      "#e6f5f2",
      "#a9e0d6",
      "#a3c9c2",
    ),
    // Midnight Thoughts: indigo and violet nights
    P(
      "indigo-hour",
      "Indigo hour",
      "midnight",
      { kind: "gradient", a: "#1d2352", b: "#080a20" },
      "#eceeff",
      "#c3c8ff",
      "#a9aee0",
    ),
    P(
      "velvet-dark",
      "Velvet dark",
      "midnight",
      { kind: "gradient", a: "#2a1a3d", b: "#0e0816" },
      "#f1eaff",
      "#d6c4f2",
      "#b9a8d6",
    ),
    P(
      "starless",
      "Starless",
      "midnight",
      { kind: "solid", a: "#0b0d14", b: "#0b0d14" },
      "#e4e7f2",
      "#b8c0e0",
      "#9aa0b5",
    ),
    // Golden Hour: amber, saffron, ember
    P(
      "amber-dusk",
      "Amber dusk",
      "golden-hour",
      { kind: "gradient", a: "#a4521f", b: "#4a1f10" },
      "#fff7ea",
      "#ffe0b0",
      "#ffe6c2",
      { color: "#2a0f05", opacity: 0.3 },
    ),
    P(
      "saffron-light",
      "Saffron light",
      "golden-hour",
      { kind: "gradient", a: "#fbe9c6", b: "#f3cf98" },
      "#3b1f08",
      "#6e3206",
      "#5c3410",
    ),
    P(
      "ember-glow",
      "Ember glow",
      "golden-hour",
      { kind: "gradient", a: "#7a2e14", b: "#2b0e06" },
      "#fff1e0",
      "#ffd2a6",
      "#f3c9a0",
    ),
    // Modern Minimal: neutral, flat
    P(
      "porcelain",
      "Porcelain",
      "modern-minimal",
      { kind: "solid", a: "#fafafa", b: "#fafafa" },
      "#15181d",
      "#2f5bd3",
      "#4f5663",
    ),
    P(
      "graphite",
      "Graphite",
      "modern-minimal",
      { kind: "solid", a: "#1e2126", b: "#1e2126" },
      "#f3f4f6",
      "#9cc2ff",
      "#a7adb7",
    ),
    P(
      "mist-blue",
      "Mist blue",
      "modern-minimal",
      { kind: "gradient", a: "#eef2f7", b: "#dde4ee" },
      "#172030",
      "#24508f",
      "#47546a",
    ),
  ].map((p) =>
    Object.freeze({
      ...p,
      bg: Object.freeze({ ...p.bg }),
      overlay: Object.freeze({ ...p.overlay }),
    }),
  ),
);
for (const p of PALETTES) assertPalette(p);
if (new Set(PALETTES.map((p) => p.id)).size !== PALETTES.length)
  throw new Error("palettes: duplicate id");

export const paletteById = (id) => PALETTES.find((p) => p.id === id) || null;
