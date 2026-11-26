// Text-in behaviours. Each behaviour answers ONE question: for this row of this scene, `localMs` into the scene, what
// is its state? rowState(scene, row, localMs, info) -> {alpha, dy, dx}. Behaviours never touch the text itself (no
// per-code-point effects, no tracking): they only move and fade whole rows, so Tamil shaping is never split.
//
// Invariant (tested): once a behaviour's in-phase is over (localMs >= inEndMs) and before the scene's out-fade, every row
// is in the HOLD state {alpha:1, dy:0, dx:0}: a held frame is exactly the static layout that validateScene checked.
//
// `info`: { intensity (0..1), last (is this the last scene: no out-fade), index (row index among drawn rows) }.
// The four original behaviours below are moved verbatim from drawFrame (same expressions, same evaluation order).

export const HOLD = Object.freeze({ alpha: 1, dy: 0, dx: 0 });
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const FADE_IN_MS = 700;
export const FADE_OUT_MS = 500;

/** Out-fade multiplier shared by every behaviour (1 on the last scene). */
export const fadeOutAt = (scene, localMs, last) =>
  last
    ? 1
    : 1 - clamp01((localMs - (scene.durationMs - FADE_OUT_MS)) / FADE_OUT_MS);

export const BEHAVIOURS = Object.freeze({
  fade: {
    id: "fade",
    label: "Fade",
    inEndMs: () => FADE_IN_MS,
    rowState: (scene, row, localMs, info = {}) => ({
      alpha: ease(localMs / FADE_IN_MS) * fadeOutAt(scene, localMs, info.last),
      dy: 0,
      dx: 0,
    }),
  },
  line: {
    id: "line",
    label: "Line by line",
    inEndMs: (scene, row) => row.line * 450 + 600,
    rowState: (scene, row, localMs, info = {}) => ({
      alpha:
        ease((localMs - row.line * 450) / 600) *
        fadeOutAt(scene, localMs, info.last),
      dy: 0,
      dx: 0,
    }),
  },
  rise: {
    id: "rise",
    label: "Rise",
    inEndMs: (scene, row, info = {}) => (info.index || 0) * 150 + 800,
    rowState: (scene, row, localMs, info = {}) => {
      const p = ease((localMs - (info.index || 0) * 150) / 800);
      return {
        alpha: p * fadeOutAt(scene, localMs, info.last),
        dy: (1 - p) * 40 * (0.4 + (info.intensity || 0)),
        dx: 0,
      };
    },
  },
  none: {
    id: "none",
    label: "None",
    inEndMs: () => 0,
    rowState: (scene, row, localMs, info = {}) => ({
      alpha: fadeOutAt(scene, localMs, info.last),
      dy: 0,
      dx: 0,
    }),
  },
});
export const BEHAVIOUR_IDS = Object.keys(BEHAVIOURS);
/** Unknown ids behave like "fade" (the historical default branch of drawFrame). */
export const behaviourFor = (id) => BEHAVIOURS[id] || BEHAVIOURS.fade;

/** Row state as drawFrame paints it. Stills are always HOLD. */
export function rowState(
  comp,
  scene,
  row,
  localMs,
  { still = false, last = false, index = 0 } = {},
) {
  if (still) return HOLD;
  return behaviourFor(comp.motion?.textIn).rowState(scene, row, localMs, {
    intensity: comp.motion?.intensity,
    last,
    index,
  });
}
