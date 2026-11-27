// Conservative Instagram UI safe zone (Meta's approximate guidance: ~14% top, ~35% bottom, ~6% sides).
// A layout guide, not a guarantee for every organic Instagram surface.
export const SAFE = Object.freeze({ top: 0.14, bottom: 0.35, side: 0.06 });
export function safeRect(width, height, safe = SAFE) {
  const x = Math.round(width * safe.side);
  const y = Math.round(height * safe.top);
  return { x, y, w: width - 2 * x, h: Math.round(height * (1 - safe.top - safe.bottom)) };
}
/** Posters (4:5) have no UI overlay; keep a plain margin. */
export const POSTER_SAFE = Object.freeze({ top: 0.08, bottom: 0.1, side: 0.09 });
/** Square (1:1) feed video/image: no UI overlay, a slightly wider margin than the 4:5 poster's sides. */
export const SQUARE_SAFE = Object.freeze({ top: 0.08, bottom: 0.12, side: 0.08 });
export const FORMATS = Object.freeze({
  reel: { w: 1080, h: 1920, safe: SAFE },
  story: { w: 1080, h: 1920, safe: SAFE },
  poster: { w: 1080, h: 1350, safe: POSTER_SAFE },
  square: { w: 1080, h: 1080, safe: SQUARE_SAFE },
});
// ---------------------------------------------------------------- font-size model
// THE UNIT: every font size in a composition (style.sizePx, whole.size, full.size) is a LOGICAL pixel on the
// 1080-px-wide output canvas, the same unit the exported PNG/MP4 is drawn in. The editor preview draws the same
// composition scaled by (preview width / 1080) through the canvas transform, so preview and export always agree.
// Shown full-screen on a typical ~390-pt-wide phone, 1 logical px ≈ 0.36 pt (40 px ≈ 14 pt, 46 px ≈ 17 pt).
/** Technical bounds only (no readability rule): anything finite and positive is clamped into this range. */
export const TEXT_PX_MIN = 8,
  TEXT_PX_MAX = 140;
export const SIZE_PRESETS = Object.freeze([14, 16, 18, 20, 22, 24, 28, 30, 32, 36, 40, 48, 56, 64]);
/** A font size from any input: finite and > 0 is rounded and clamped to the technical bounds; anything else => fallback. */
export function textPx(v, fallback = null) {
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(TEXT_PX_MAX, Math.max(TEXT_PX_MIN, Math.round(n)));
}
/** On-phone size of a logical px value when the 1080-wide frame fills a ~390-pt phone screen. */
export const phonePt = (px) => Math.round(((px * 390) / 1080) * 10) / 10;
/**
 * RECOMMENDED sizes per format (advisory). The automatic fit may shrink a LARGER chosen size down to these, but a size
 * the author chose below them is used as chosen: it is never raised and never blocks export (see shrinkFloor).
 */
export const MIN_TEXT_PX = Object.freeze({ reel: 40, story: 40, poster: 46, square: 44 });
/** Recommended quote sizes (a quote is read at a glance). Advisory in the same way. */
export const QUOTE_MIN_PX = Object.freeze({ reel: 52, story: 52, poster: 56, square: 52 });
/**
 * The smallest size the automatic shrink-to-fit may reach for text that starts at `start` px: the recommended size, or
 * the author's own smaller size. Never raises a chosen size, never goes below the technical minimum.
 */
export const shrinkFloor = (recommended, start) =>
  Math.max(TEXT_PX_MIN, Math.min(Number(recommended) || TEXT_PX_MIN, Math.round(Number(start) || TEXT_PX_MIN)));
/** Non-blocking readability advice for a logical size in a format. */
export function sizeAdvice(px, format = "reel") {
  const rec = MIN_TEXT_PX[format] ?? MIN_TEXT_PX.reel;
  const pt = phonePt(px);
  if (px >= rec + 6) return { level: "comfortable", pt, text: "Comfortable size for most phone displays." };
  if (px >= rec) return { level: "compact", pt, text: "Compact typography." };
  if (px >= 28) return { level: "small", pt, text: "Small text — inspect the full-screen preview." };
  return { level: "tiny", pt, text: "Very small text — it may be difficult to read in a phone Reel or post. It will still export at this size." };
}
export const FIT_ACTION_LABEL = "Fit scenes";
