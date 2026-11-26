// WCAG contrast helpers + the readability guard that decides how much scrim a photo background needs.
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/**
 * Minimum overlay opacity (0..0.9) so text of colour `textHex` has >= `target` contrast against the WORST sampled
 * background pixel after a scrim is applied. `samples` = array of [r,g,b] taken from the text zone.
 * The scrim is black for light text and white for dark text.
 */
export function requiredScrim(samples, textHex, target = 4.5) {
  if (!samples.length) return 0;
  const t = hexRgb(textHex), tl = lum(...t), lightText = tl > 0.4;
  const scrim = lightText ? [0, 0, 0] : [255, 255, 255];
  const lums = samples.map((s) => lum(...s)).sort((a, b) => a - b);
  const worst = lightText ? lums[Math.floor(lums.length * 0.95)] : lums[Math.floor(lums.length * 0.05)];
  const rgbs = samples.slice().sort((a, b) => lum(...a) - lum(...b));
  const w = lightText ? rgbs[Math.floor(rgbs.length * 0.95)] : rgbs[Math.floor(rgbs.length * 0.05)];
  if (ratio(tl, worst) >= target) return 0;
  for (let o = 0.05; o <= 0.9001; o += 0.025) {
    const m = w.map((c, i) => c * (1 - o) + scrim[i] * o);
    if (ratio(tl, lum(...m)) >= target) return Math.round(o * 1000) / 1000;
  }
  return 0.9;
}
