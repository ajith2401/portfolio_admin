// Material presets: data only, composed from the built-in procedural effects (fx/effects.js).
// comp.material = { id, intensity 0..1, reduce, seed }. Absent (every legacy project and every new default) or id
// "none" => no effect runs at all and drawFrame is byte-identical to before (golden fixture).
// "Reduce effects" forces the effective intensity to 0: nothing is drawn, preview and export alike.
import { effectById, SURFACE_CAP } from "./fx/registry.js";
import "./fx/effects.js";

export const MATERIAL_NONE = "none";
export const MATERIALS = Object.freeze(
  [
    {
      id: "clean",
      label: "Clean",
      layers: [{ fx: "gradient-overlay", params: { strength: 0.35 } }],
    },
    {
      id: "paper",
      label: "Paper",
      layers: [
        { fx: "paper-mottle" },
        { fx: "paper-fibre" },
        { fx: "fine-noise" },
      ],
    },
    {
      id: "aged-paper",
      label: "Aged paper",
      layers: [
        { fx: "paper-mottle", params: { count: 12, size: 1.2 } },
        { fx: "paper-fibre", params: { count: 340 } },
        { fx: "ink-bleed", params: { strength: 0.55 } },
        { fx: "film-grain" },
      ],
    },
    {
      id: "ink-wash",
      label: "Ink wash",
      layers: [
        { fx: "paper-mottle", params: { count: 6, size: 1.5 } },
        { fx: "ink-bleed", params: { strength: 0.8 } },
      ],
    },
    {
      id: "rain-glass",
      label: "Rain on glass",
      layers: [
        { fx: "gradient-overlay" },
        { fx: "bokeh", params: { color: "#bcd7f0", count: 10 } },
        { fx: "rain-streak" },
      ],
    },
    {
      id: "film",
      label: "Film",
      layers: [
        { fx: "ink-bleed", params: { strength: 0.35 } },
        { fx: "light-leak" },
        { fx: "film-grain" },
      ],
    },
    {
      id: "dust",
      label: "Dust",
      layers: [{ fx: "dust", params: { count: 90 } }, { fx: "fine-noise" }],
    },
    {
      id: "soft-glow",
      label: "Soft glow",
      layers: [{ fx: "soft-glow" }, { fx: "bokeh", params: { count: 6 } }],
    },
    {
      id: "charcoal",
      label: "Charcoal",
      layers: [
        { fx: "paper-fibre", params: { count: 420 } },
        { fx: "ink-bleed", params: { strength: 0.7 } },
        { fx: "film-grain" },
      ],
    },
    {
      id: "linen",
      label: "Linen",
      layers: [
        { fx: "paper-fibre", params: { count: 520, weave: true } },
        { fx: "fine-noise" },
      ],
    },
    {
      id: "night-grain",
      label: "Night grain",
      layers: [
        { fx: "gradient-overlay", params: { strength: 0.55 } },
        { fx: "film-grain" },
      ],
    },
    {
      id: "golden-haze",
      label: "Golden haze",
      layers: [
        { fx: "light-leak", params: { color: "#ffb35c" } },
        { fx: "soft-glow", params: { color: "#ffd59a" } },
        { fx: "dust", params: { color: "#ffe2b0", count: 40 } },
      ],
    },
  ].map((m) =>
    Object.freeze({
      ...m,
      layers: Object.freeze(
        m.layers.map((l) =>
          Object.freeze({
            fx: l.fx,
            params: Object.freeze({ ...(l.params || {}) }),
          }),
        ),
      ),
    }),
  ),
);
export const MATERIAL_IDS = Object.freeze([
  MATERIAL_NONE,
  ...MATERIALS.map((m) => m.id),
]);
export const materialById = (id) => MATERIALS.find((m) => m.id === id) || null;
export const DEFAULT_INTENSITY = 0.6;

/** Combined worst-case opacity over the text of a preset's surface effects (each draws non-overlapping dots). */
export const surfaceOpacity = (m) =>
  1 -
  m.layers
    .map((l) => effectById(l.fx))
    .filter((d) => d?.layer === "surface")
    .reduce((q, d) => q * (1 - d.maxAlpha), 1);

/** Data integrity, checked once at load: every layer names a real effect; surface budget within the cap. */
for (const m of MATERIALS) {
  for (const l of m.layers)
    if (!effectById(l.fx))
      throw new Error(`material ${m.id}: unknown effect ${l.fx}`);
  if (surfaceOpacity(m) > SURFACE_CAP + 1e-9)
    throw new Error(
      `material ${m.id}: over-text opacity exceeds ${SURFACE_CAP}`,
    );
}

const num = (v, lo, hi, d) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
/** Whitelist + clamp. Unknown ids fall back to "none" (never to some other look). */
export function normalizeMaterial(m) {
  const o = m && typeof m === "object" ? m : {};
  return {
    id: MATERIAL_IDS.includes(o.id) ? o.id : MATERIAL_NONE,
    intensity:
      Math.round(num(o.intensity, 0, 1, DEFAULT_INTENSITY) * 100) / 100,
    reduce: o.reduce === true,
    seed: Math.trunc(num(o.seed, 0, 2147483647, 1)),
  };
}

/** Effective intensity after the reduce-effects preference: 0 means nothing is drawn. */
export const effectiveIntensity = (comp) => {
  const m = comp?.material;
  if (!m || m.id === MATERIAL_NONE || m.reduce) return 0;
  return num(m.intensity, 0, 1, 0);
};

/** The ordered effect plan drawFrame runs for a composition ([] = no material). */
export function materialPlan(comp) {
  const k = effectiveIntensity(comp);
  if (k <= 0) return [];
  const preset = materialById(comp.material.id);
  if (!preset) return [];
  return preset.layers
    .map((l, index) => ({ def: effectById(l.fx), params: l.params, index }))
    .filter((e) => e.def);
}
export const materialActive = (comp) => materialPlan(comp).length > 0;
