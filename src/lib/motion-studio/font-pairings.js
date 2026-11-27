// User-facing typography pairings (typography spec 4). DATA + one pure apply function.
// A pairing names a body font and an optional title font from the core + approved tiers only, a weight that the body
// font really has, a line height and an alignment. Applying one changes ONLY those style fields: never the poem text,
// the scenes, the background, the material or the elements. At most two Tamil families per composition (body + title).
import {
  fontById,
  canBody,
  canTitle,
  fontHasWeight,
  fontLabel,
} from "./font-registry.js";

const P = (
  id,
  label,
  mood,
  font,
  titleFont,
  weight,
  lineHeight,
  align = "center",
) =>
  Object.freeze({
    id,
    label,
    mood,
    font,
    titleFont,
    weight,
    lineHeight,
    align,
  });

export const FONT_PAIRINGS = Object.freeze([
  P(
    "personal-hand",
    "Personal handwriting",
    "intimate, diary",
    "kavivanar",
    null,
    400,
    1.7,
  ),
  P(
    "flowing-calligraphy",
    "Flowing calligraphy",
    "lyrical, romantic",
    "arima",
    null,
    500,
    1.65,
  ),
  P(
    "literary-manuscript",
    "Literary manuscript",
    "classical, serious",
    "korkai",
    "noto-serif",
    400,
    1.75,
  ),
  P(
    "minimal",
    "Minimal",
    "modern, quiet",
    "mukta-malar",
    "catamaran",
    400,
    1.6,
  ),
  P(
    "vintage-print",
    "Vintage print",
    "old book, archival",
    "tiro",
    null,
    400,
    1.7,
  ),
  P(
    "panai-serif",
    "Panai title + Noto Serif",
    "editorial poster",
    "noto-serif",
    "panai",
    400,
    1.7,
  ),
  P(
    "arima-hind",
    "Arima title + Hind Madurai",
    "warm, friendly",
    "hind-madurai",
    "arima",
    400,
    1.6,
  ),
  P(
    "kavivanar-sans",
    "Kavivanar + Noto Sans",
    "handwritten verse, clean title",
    "kavivanar",
    "noto-sans",
    400,
    1.7,
  ),
  P(
    "baloo-mukta",
    "Baloo title + Mukta Malar",
    "playful, rounded",
    "mukta-malar",
    "baloo-thambi-2",
    400,
    1.6,
  ),
  P(
    "korkai-sans",
    "Korkai + Noto Sans",
    "literary body, modern title",
    "korkai",
    "noto-sans",
    400,
    1.75,
  ),
  P(
    "oi-catamaran",
    "Oi title + Catamaran",
    "bold headline",
    "catamaran",
    "oi",
    400,
    1.6,
  ),
  P(
    "neythal-hand",
    "Neythal handwriting",
    "letter, personal note",
    "neythal",
    null,
    400,
    1.75,
  ),
  P(
    "pavanam-clean",
    "Pavanam clean",
    "light, airy",
    "pavanam",
    null,
    400,
    1.65,
  ),
  P(
    "catamaran-editorial",
    "Catamaran editorial",
    "magazine, left-aligned",
    "catamaran",
    "catamaran",
    500,
    1.6,
    "left",
  ),
]);

/** Throws unless the pairing uses approved/core fonts in a legal role, a real weight, and <= 2 Tamil families. */
export function assertPairing(p) {
  const why = [];
  const f = fontById(p.font);
  if (!f || f.verified !== true || f.loadable !== true)
    why.push(`body font ${p.font} is not approved`);
  else if (!canBody(p.font)) why.push(`${p.font} cannot set poem text`);
  if (p.titleFont != null) {
    const t = fontById(p.titleFont);
    if (!t || t.verified !== true || t.loadable !== true)
      why.push(`title font ${p.titleFont} is not approved`);
    else if (!canTitle(p.titleFont))
      why.push(`${p.titleFont} cannot be a title font`);
  }
  if (!fontHasWeight(p.font, p.weight))
    why.push(`weight ${p.weight} is not available in ${p.font}`);
  if (![400, 500, 600, 700].includes(p.weight))
    why.push("weight outside the composition whitelist");
  if (!(p.lineHeight >= 1.2 && p.lineHeight <= 2.4))
    why.push("line height out of range");
  if (!["left", "center", "right"].includes(p.align)) why.push("bad align");
  if (new Set([p.font, p.titleFont].filter(Boolean)).size > 2)
    why.push("more than two families");
  if (why.length) throw new Error(`font pairing ${p.id}: ${why.join("; ")}`);
  return p;
}
FONT_PAIRINGS.forEach(assertPairing);

export const pairingById = (id) =>
  FONT_PAIRINGS.find((p) => p.id === id) || null;
export const pairingTitle = (p) =>
  p.titleFont && p.titleFont !== p.font
    ? `${fontLabel(p.titleFont)} + ${fontLabel(p.font)}`
    : fontLabel(p.font);

/** Pure: returns a new composition with only the pairing's style fields changed. */
export function applyPairing(comp, id) {
  const p = pairingById(id);
  if (!p) return comp;
  const style = {
    ...comp.style,
    font: p.font,
    weight: p.weight,
    lineHeight: p.lineHeight,
    align: p.align,
  };
  if (p.titleFont && p.titleFont !== p.font) style.titleFont = p.titleFont;
  else delete style.titleFont;
  const out = { ...comp, style };
  delete out.notices;
  return out;
}

/** The pairing that matches the composition's current fonts, if any (for the selected state). */
export const currentPairing = (st) =>
  FONT_PAIRINGS.find(
    (p) =>
      p.font === st?.font &&
      (p.titleFont && p.titleFont !== p.font ? p.titleFont : null) ===
        (st?.titleFont || null) &&
      p.weight === st?.weight,
  )?.id || null;
