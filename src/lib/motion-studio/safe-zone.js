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
export const FORMATS = Object.freeze({
  reel: { w: 1080, h: 1920, safe: SAFE },
  story: { w: 1080, h: 1920, safe: SAFE },
  poster: { w: 1080, h: 1350, safe: POSTER_SAFE },
});
/** Smallest text size (px, on the 1080-wide canvas) the Studio will ever render. Reel/Story scenes are SPLIT to fit, never shrunk below it. */
export const MIN_TEXT_PX = Object.freeze({ reel: 40, story: 40, poster: 46 });
export const FIT_ACTION_LABEL = "Fit scenes to 40px";
