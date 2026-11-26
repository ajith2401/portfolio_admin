// Six distinct template families. Each defines palette, type, placement and motion; not just a recoloured background.
import { VERIFIED_FONT_IDS, FONT_REGISTRY } from "./font-registry.js";
// Fonts come from the registry: FONT_KEYS is the VERIFIED set (templates may only use these); labels cover every entry.
export const FONT_KEYS = VERIFIED_FONT_IDS;
export const FONT_LABELS = Object.fromEntries(FONT_REGISTRY.map((f) => [f.id, f.label]));

export const TEMPLATES = [
  {
    id: "ink-silence", name: "Ink & Silence", mood: "restrained, quiet",
    bg: { kind: "solid", a: "#111214", b: "#1b1c20" },
    style: { font: "noto-serif", sizePx: 64, weight: 500, color: "#ece8df", align: "center", lineHeight: 1.7, widthPct: 100, vAlign: "middle", shadow: false },
    fx: { vignette: 0.55, grain: 0.07, particles: "dust", overlay: { color: "#000000", opacity: 0 } },
    motion: { textIn: "fade", bgMotion: "none" }, signatureColor: "#9a968c",
  },
  {
    id: "paper-ink", name: "Paper & Ink", mood: "classic, literary",
    bg: { kind: "paper", a: "#f3ead7", b: "#e6d8bb" },
    style: { font: "tiro", sizePx: 66, weight: 400, color: "#2b2118", align: "center", lineHeight: 1.75, widthPct: 100, vAlign: "middle", shadow: false },
    fx: { vignette: 0.35, grain: 0.14, particles: "none", overlay: { color: "#000000", opacity: 0 } },
    motion: { textIn: "line", bgMotion: "none" }, signatureColor: "#6b5a43",
  },
  {
    id: "monsoon", name: "Monsoon Memories", mood: "wistful, rain-soaked",
    bg: { kind: "gradient", a: "#27384a", b: "#0f1a26" },
    style: { font: "hind-madurai", sizePx: 62, weight: 500, color: "#e8f0f7", align: "center", lineHeight: 1.65, widthPct: 100, vAlign: "middle", shadow: true },
    fx: { vignette: 0.5, grain: 0.05, particles: "rain", overlay: { color: "#0b1620", opacity: 0.25 } },
    motion: { textIn: "line", bgMotion: "drift" }, signatureColor: "#9fb3c4",
  },
  {
    id: "midnight", name: "Midnight Thoughts", mood: "philosophical, still",
    bg: { kind: "gradient", a: "#1a1f4a", b: "#07081c" },
    style: { font: "noto-serif", sizePx: 62, weight: 500, color: "#e9ebff", align: "center", lineHeight: 1.7, widthPct: 100, vAlign: "middle", shadow: true },
    fx: { vignette: 0.5, grain: 0.04, particles: "stars", overlay: { color: "#000000", opacity: 0 } },
    motion: { textIn: "fade", bgMotion: "zoom" }, signatureColor: "#9ea4d6",
  },
  {
    id: "golden-hour", name: "Golden Hour", mood: "nostalgic, warm",
    bg: { kind: "gradient", a: "#e9a14a", b: "#6a2f1b" },
    style: { font: "anek", sizePx: 64, weight: 600, color: "#fff6e6", align: "center", lineHeight: 1.6, widthPct: 100, vAlign: "middle", shadow: true },
    fx: { vignette: 0.4, grain: 0.06, particles: "light", overlay: { color: "#2a0f05", opacity: 0.18 } },
    motion: { textIn: "rise", bgMotion: "drift" }, signatureColor: "#ffe2b8",
  },
  {
    id: "modern-minimal", name: "Modern Minimal", mood: "clean, contemporary",
    bg: { kind: "gradient", a: "#f6f7f9", b: "#dfe3ea" },
    style: { font: "noto-sans", sizePx: 60, weight: 600, color: "#14171c", align: "left", lineHeight: 1.6, widthPct: 100, vAlign: "middle", shadow: false },
    fx: { vignette: 0.0, grain: 0.02, particles: "none", overlay: { color: "#000000", opacity: 0 }, geometry: true },
    motion: { textIn: "rise", bgMotion: "none" }, signatureColor: "#5a6270",
  },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
