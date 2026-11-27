// Whole-Poem Video ("One Page Reel"): the ENTIRE poem on ONE 1080×1920 screen, held still for the whole video while
// the background (gradient drift/zoom, particles, textures, film grain, materials) animates. It is a composition MODE
// (comp.whole.on), not a second editor: the same style, palette, fonts, material and branding drive both modes, and the
// Scene-by-Scene mode is untouched. Layout reuses the Full-Poem Poster engine (full-poem.js) at the STANDARD 9:16
// height only — never the extended canvas, so the output is always a normal Reel. Nothing here edits the poem text.
import {
  layoutFullPoem,
  drawFullPoem,
  FULL_STD_H,
  MIN_READABLE,
  PRESETS,
  wholeWritingPlan,
} from "./full-poem.js";
import { writingOn, writingOf, recommendSeconds } from "./writing.js";

export const WHOLE_DURATIONS_S = Object.freeze([10, 15, 20, 30, 45, 60]);
export const WHOLE_DEFAULT_MS = 30_000;
export const WHOLE_MIN_MS = 5_000;
export const WHOLE_MAX_MS = 120_000; // 3600 frames at 30fps: export time and file size stay practical on a phone
export const WHOLE_FADE_MS = 1_200;
export const WHOLE_SIZE_MIN = 28,
  WHOLE_SIZE_MAX = 96;
/** The smallest size the automatic fit may go to (with a visible warning). Below it the poem needs Scene-by-Scene. */
export const WHOLE_HARD_FLOOR = 32;
export const WHOLE_MOTION = Object.freeze({
  static: 0,
  calm: 0.55,
  normal: 1,
  expressive: 1.7,
});
export const WHOLE_MOTION_LABELS = Object.freeze({
  static: "Static",
  calm: "Calm",
  normal: "Normal",
  expressive: "Expressive",
});
export const WHOLE_FADES = Object.freeze(["none", "in", "inout"]);

/** Animated backgrounds: each one is a (background motion, particle layer) pair from the existing renderer. */
export const BACKDROPS = Object.freeze([
  {
    id: "still",
    label: "Still",
    group: "Calm",
    bgMotion: "none",
    particles: "none",
  },
  {
    id: "drift",
    label: "Slow drift",
    group: "Calm",
    bgMotion: "drift",
    particles: "none",
  },
  {
    id: "breathe",
    label: "Gentle zoom",
    group: "Calm",
    bgMotion: "zoom",
    particles: "none",
  },
  {
    id: "dust",
    label: "Floating dust",
    group: "Atmosphere",
    bgMotion: "drift",
    particles: "dust",
  },
  {
    id: "mist",
    label: "Drifting mist",
    group: "Atmosphere",
    bgMotion: "drift",
    particles: "mist",
  },
  {
    id: "bokeh",
    label: "Soft bokeh",
    group: "Atmosphere",
    bgMotion: "zoom",
    particles: "bokeh",
  },
  {
    id: "snow",
    label: "Soft snow",
    group: "Atmosphere",
    bgMotion: "none",
    particles: "snow",
  },
  {
    id: "rain",
    label: "Falling rain",
    group: "Rain & water",
    bgMotion: "drift",
    particles: "rain",
  },
  {
    id: "ripple",
    label: "Water ripple",
    group: "Rain & water",
    bgMotion: "none",
    particles: "ripple",
  },
  {
    id: "light",
    label: "Golden motes",
    group: "Light",
    bgMotion: "zoom",
    particles: "light",
  },
  {
    id: "leak",
    label: "Light leak",
    group: "Light",
    bgMotion: "drift",
    particles: "leak",
  },
  {
    id: "sweep",
    label: "Light sweep",
    group: "Light",
    bgMotion: "none",
    particles: "sweep",
  },
  {
    id: "stars",
    label: "Starfield",
    group: "Light",
    bgMotion: "zoom",
    particles: "stars",
  },
]);
export const backdropOf = (comp) =>
  BACKDROPS.find(
    (b) =>
      b.bgMotion === comp?.motion?.bgMotion &&
      b.particles === comp?.style?.particles,
  )?.id || null;
export const applyBackdrop = (c, id) => {
  const b = BACKDROPS.find((x) => x.id === id);
  if (!b) return c;
  c.motion.bgMotion = b.bgMotion;
  c.style.particles = b.particles;
  return c;
};

const num = (v, lo, hi, d) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
/** Stored only when the project uses the mode, so legacy projects normalise unchanged. */
export function normalizeWhole(w) {
  if (!w || typeof w !== "object") return undefined;
  return {
    on: w.on === true,
    durationMs:
      Math.round(
        num(w.durationMs, WHOLE_MIN_MS, WHOLE_MAX_MS, WHOLE_DEFAULT_MS) / 100,
      ) * 100,
    preset: Object.hasOwn(PRESETS, w.preset) ? w.preset : "balanced",
    motion: Object.hasOwn(WHOLE_MOTION, w.motion) ? w.motion : "calm",
    fade: WHOLE_FADES.includes(w.fade) ? w.fade : "none",
    size:
      w.size == null
        ? null
        : Math.round(num(w.size, WHOLE_SIZE_MIN, WHOLE_SIZE_MAX, null)),
    lh: w.lh == null ? null : Math.round(num(w.lh, 1.2, 2.6, null) * 20) / 20,
  };
}
export const isWhole = (comp) => comp?.whole?.on === true;
export const wholeDuration = (comp) =>
  comp?.whole?.durationMs || WHOLE_DEFAULT_MS;
/** Frame count for a duration at fps. 30 s at 30 fps = exactly 900 frames (frame i is shown at i/fps). */
export const wholeFrames = (ms, fps) =>
  Math.max(1, Math.round((ms / 1000) * fps));
export const motionK = (comp) =>
  comp?.motion?.reduceMotion === true
    ? 0
    : (WHOLE_MOTION[comp?.whole?.motion] ?? WHOLE_MOTION.calm);

/** The text floor: 40 px normally; an author who deliberately set a smaller size gets that size (their choice). */
export const wholeFloor = (comp) =>
  Math.min(MIN_READABLE, comp?.whole?.size ?? MIN_READABLE);

/**
 * Lay the poem out on the 1080×1920 screen. Tries the chosen layout; if it does not fit, the compact layout; then
 * smaller text down to WHOLE_HARD_FLOOR. Every adjustment is returned in `notes` (never silent). fits:false means the
 * poem cannot be shown legibly on one screen: the caller must offer Scene-by-Scene, never crop or drop lines.
 */
export function layoutWhole(ctx, comp, poem) {
  const w = comp.whole || {};
  const tune = {};
  if (w.size != null) tune.size = w.size;
  if (w.lh != null) tune.lh = w.lh;
  const floor = wholeFloor(comp);
  const notes = [];
  const want = w.preset || "balanced";
  let layout = layoutFullPoem(ctx, comp, poem, {
    preset: want,
    height: "standard",
    tune,
    min: floor,
  });
  if (!layout.fits && want !== "compact") {
    const c = layoutFullPoem(ctx, comp, poem, {
      preset: "compact",
      height: "standard",
      tune: w.lh != null ? { lh: Math.min(w.lh, PRESETS.compact.lh) } : null,
      min: floor,
    });
    if (c.fits) {
      layout = c;
      notes.push(
        `The ${PRESETS[want].label} layout did not fit on one screen, so the Compact layout is used.`,
      );
    }
  }
  if (!layout.fits && floor > WHOLE_HARD_FLOOR) {
    const s = layoutFullPoem(ctx, comp, poem, {
      preset: "compact",
      height: "standard",
      min: WHOLE_HARD_FLOOR,
    });
    if (s.fits) {
      layout = s;
      notes.push(
        `To fit the whole poem on one screen the text is ${s.size}px — below the ${MIN_READABLE}px readable size. Consider Scene-by-Scene for this poem.`,
      );
    }
  }
  if (
    layout.fits &&
    layout.shrunk &&
    !notes.length &&
    w.size != null &&
    layout.size < w.size
  )
    notes.push(
      `Your ${w.size}px text was reduced to ${layout.size}px so every line fits.`,
    );
  const lines = poem.stanzas.reduce((n, s) => n + s.length, 0);
  return {
    layout,
    fits: !!layout.fits,
    notes,
    size: layout.size,
    lines,
    stanzas: poem.stanzas.length,
    reason: layout.fits
      ? null
      : `This poem (${lines} lines in ${poem.stanzas.length} stanza${poem.stanzas.length === 1 ? "" : "s"}) needs about ${layout.neededAtMinimum || "?"}px of height even at ${layout.size}px text, but a Reel screen is ${FULL_STD_H}px tall. Nothing was cut: use Scene-by-Scene, or a Full-Poem Poster (taller image).`,
  };
}

/** Background clock: eased there-and-back over the video, so the last frame meets the first (seamless loop). */
export const loopBgMs = (tMs, total) =>
  ((1 - Math.cos((2 * Math.PI * tMs) / Math.max(1, total))) / 2) * total;
/** Opening / closing fade of the (still) poem. "none" = fully visible on every frame, including the first. */
export function textAlphaAt(comp, tMs, total) {
  const f = comp?.whole?.fade || "none";
  if (f === "none") return 1;
  const d = Math.min(WHOLE_FADE_MS, total / 4);
  let a = Math.min(1, tMs / d);
  if (f === "inout") a = Math.min(a, Math.max(0, (total - tMs) / d));
  return a;
}
/** One video frame at time tMs. `still:true` draws the poster look (cover, verifier). */
export function drawWholeFrame(
  ctx,
  comp,
  layout,
  tMs,
  {
    assets = {},
    scale = 1,
    still = false,
    fxTrace = null,
    fxReport = null,
  } = {},
) {
  const total = wholeDuration(comp);
  const k = motionK(comp);
  const anim = still
    ? null
    : {
        bgMs: k > 0 ? loopBgMs(tMs, total) : 0,
        fxMs: k > 0 ? tMs : 0,
        total,
        motionK: k,
        textAlpha: textAlphaAt(comp, tMs, total),
        writing: writingOn(comp) ? writingOf(comp) : null,
        writeMs: tMs,
      };
  drawFullPoem(ctx, comp, layout, { assets, scale, fxTrace, fxReport, anim });
}

/**
 * Does the chosen writing animation finish inside the video and still hold the completed poem for the final hold?
 * Never accelerated, shrunk, cut or split to make it fit: when it does not, the caller shows the estimate and
 * recommends a longer duration (and blocks the export until the author chooses).
 */
export function wholeWritingFit(ctx, comp, layout) {
  if (!writingOn(comp) || !layout) return { on: false, fits: true };
  const plan = wholeWritingPlan(ctx, comp, layout, comp.motion.writing);
  const total = wholeDuration(comp);
  return {
    on: true,
    fits: plan.total <= total,
    needMs: plan.total,
    writeEndMs: plan.writeEnd,
    totalMs: total,
    recommendS: recommendSeconds(plan, [...WHOLE_DURATIONS_S, 90, 120].filter((x) => x * 1000 <= WHOLE_MAX_MS)),
  };
}
