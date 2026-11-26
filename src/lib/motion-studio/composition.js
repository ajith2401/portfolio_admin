// Composition: the serialisable description of a Reel / Story / Poster. Never contains the poem document itself
// (only the text lines chosen for each scene) and never any HTML. normalizeComposition() is the single gate used
// by the API and the client: it whitelists fields, clamps numbers and rejects anything else.
import { FONT_KEYS, templateById } from "./templates.js";
import { sceneDuration, MIN_SCENE_MS, MAX_SCENE_MS } from "./scenes.js";

export const FORMAT_KEYS = ["reel", "story", "poster"];
export const TEXT_IN = ["fade", "line", "rise", "none"];
export const BG_MOTION = ["none", "zoom", "drift"];
export const PARTICLES = ["none", "dust", "rain", "stars", "light"];
export const ALIGN = ["left", "center", "right"];
export const VALIGN = ["top", "middle", "bottom"];
export const BG_KINDS = ["solid", "gradient", "paper"];
export const MAX_SCENES = 60;
export const MAX_LINES = 12;
export const MAX_LINE_CHARS = 400;

const hex = (v, d) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, max, d = "") => (typeof v === "string" ? v.slice(0, max) : d);

export function defaultComposition({ format = "reel", templateId = "ink-silence", scenes = [], signature = "Ajithkumar R." } = {}) {
  const t = templateById(templateId);
  return normalizeComposition({
    format, templateId: t.id, scenes,
    style: { ...t.style, bg: t.bg, overlay: t.fx.overlay, vignette: t.fx.vignette, grain: t.fx.grain, particles: t.fx.particles, geometry: !!t.fx.geometry },
    motion: { ...t.motion, intensity: 0.5 },
    branding: { show: true, signature, watermark: false, color: t.signatureColor },
    audio: { source: "none", volume: 1, fadeInMs: 0, fadeOutMs: 800 },
    export: { quality: "standard" },
  });
}

export function normalizeComposition(input) {
  const c = input && typeof input === "object" ? input : {};
  const t = templateById(c.templateId);
  const s = c.style || {}, bg = s.bg || {}, ov = s.overlay || {}, m = c.motion || {}, b = c.branding || {}, a = c.audio || {};
  const scenes = (Array.isArray(c.scenes) ? c.scenes : []).slice(0, MAX_SCENES).map((sc, i) => {
    const lines = (Array.isArray(sc?.lines) ? sc.lines : []).slice(0, MAX_LINES).map((l) => str(l, MAX_LINE_CHARS)).filter((l) => l.trim() !== "");
    return {
      id: str(sc?.id, 40, `s${i}`) || `s${i}`,
      kind: oneOf(sc?.kind, ["title", "stanza"], "stanza"),
      lines,
      durationMs: Math.round(num(sc?.durationMs, MIN_SCENE_MS, MAX_SCENE_MS, sceneDuration(lines))),
    };
  }).filter((sc) => sc.lines.length > 0);
  return {
    v: 1,
    format: oneOf(c.format, FORMAT_KEYS, "reel"),
    templateId: t.id,
    scenes,
    style: {
      font: oneOf(s.font, FONT_KEYS, t.style.font),
      sizePx: Math.round(num(s.sizePx, 28, 140, t.style.sizePx)),
      weight: oneOf(Number(s.weight), [400, 500, 600, 700], t.style.weight),
      color: hex(s.color, t.style.color),
      align: oneOf(s.align, ALIGN, t.style.align),
      lineHeight: num(s.lineHeight, 1.2, 2.4, t.style.lineHeight),
      widthPct: Math.round(num(s.widthPct, 50, 100, 100)),
      vAlign: oneOf(s.vAlign, VALIGN, "middle"),
      shadow: !!s.shadow,
      bg: { kind: oneOf(bg.kind, BG_KINDS, t.bg.kind), a: hex(bg.a, t.bg.a), b: hex(bg.b, t.bg.b) },
      overlay: { color: hex(ov.color, "#000000"), opacity: num(ov.opacity, 0, 0.9, 0) },
      vignette: num(s.vignette, 0, 1, t.fx.vignette),
      grain: num(s.grain, 0, 0.4, t.fx.grain),
      particles: oneOf(s.particles, PARTICLES, t.fx.particles),
      geometry: !!s.geometry,
    },
    motion: { textIn: oneOf(m.textIn, TEXT_IN, t.motion.textIn), bgMotion: oneOf(m.bgMotion, BG_MOTION, t.motion.bgMotion), intensity: num(m.intensity, 0, 1, 0.5) },
    branding: { show: b.show !== false, signature: str(b.signature, 60, "Ajithkumar R."), watermark: !!b.watermark, color: hex(b.color, t.signatureColor) },
    audio: { source: oneOf(a.source, ["none", "upload", "record"], "none"), volume: num(a.volume, 0, 1, 1), fadeInMs: Math.round(num(a.fadeInMs, 0, 5000, 0)), fadeOutMs: Math.round(num(a.fadeOutMs, 0, 5000, 800)) },
    export: { quality: oneOf(c.export?.quality, ["draft", "standard", "high"], "standard") },
  };
}
