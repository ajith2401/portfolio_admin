// Output resolution presets and export size/time ESTIMATES. Pure: no DOM, no clock, no randomness.
//
// A preset scales ONLY the final bitmap / encoder size. Layout, wrapping, text bounds and every validator always run at
// the NATIVE canvas (1080 wide): drawFrame / drawFullPoem receive the native layout and apply one uniform scale, so the
// drawn geometry is identical across presets up to the scale factor. Minimum text sizes are checked at native, and a
// preset can never lower them (there is no preset parameter on any validator).
import { FORMATS, MIN_TEXT_PX } from "./safe-zone.js";
import { FULL_W } from "./full-poem.js";

/** Smallest output scale the Studio will write (a draft). Anything below is refused, never silently clamped. */
export const MIN_SCALE = 0.5;
/** Longest output edge for an image, and for H.264 video (1080x1920 is the verified encoder size). */
export const MAX_IMAGE_EDGE = 4096;
export const MAX_VIDEO_EDGE = 1920;

export const RES_PRESETS = Object.freeze([
  { id: "native", scale: 1, label: "1× native (1080 wide)" },
  { id: "hq", scale: 1.5, label: "1.5× large (images only)", imagesOnly: true },
  { id: "medium", scale: 0.75, label: "0.75× smaller" },
  { id: "draft", scale: 0.5, label: "0.5× draft", draft: true },
]);
export const DEFAULT_PRESET = "native";
export const presetById = (id) => RES_PRESETS.find((p) => p.id === id) || null;

const nativeOf = (format, height) => {
  if (format === "full")
    return {
      w: FULL_W,
      h: Number.isFinite(height) && height > 0 ? height : 1920,
    };
  const f = FORMATS[format];
  return f ? { w: f.w, h: f.h } : null;
};
const even = (n) => (n % 2 ? n + 1 : n);

/**
 * Output size for `format` at `preset` (a preset id; numbers and ad-hoc objects are refused so a caller cannot invent a
 * scale below the floor). kind: "video" rounds to even sizes and enforces the video edge cap; "image"/"set" the image cap.
 * Returns { ok, w, h, scale, nativeW, nativeH, minTextPx (native, what the validator enforces), reason? }.
 */
export function outputSize(
  format,
  preset = DEFAULT_PRESET,
  { kind = "image", height } = {},
) {
  const native = nativeOf(format, height);
  if (!native) return { ok: false, reason: `Unknown format "${format}".` };
  const p = typeof preset === "string" ? presetById(preset) : null;
  const base = {
    nativeW: native.w,
    nativeH: native.h,
    minTextPx: MIN_TEXT_PX[format] ?? MIN_TEXT_PX.reel,
  };
  if (!p)
    return {
      ok: false,
      ...base,
      reason: `Unknown output size "${typeof preset === "object" ? JSON.stringify(preset) : preset}". Choose one of: ${RES_PRESETS.map((x) => x.id).join(", ")}.`,
    };
  if (!(p.scale >= MIN_SCALE))
    return {
      ok: false,
      ...base,
      reason: `Output scale ${p.scale}× is below the ${MIN_SCALE}× floor.`,
    };
  const video = kind === "video";
  if (video && p.imagesOnly)
    return {
      ok: false,
      ...base,
      preset: p.id,
      reason: `${p.label} is for images only; video is written at most ${MAX_VIDEO_EDGE}px on its long edge.`,
    };
  let w = Math.round(native.w * p.scale),
    h = Math.round(native.h * p.scale);
  if (video) {
    w = even(w);
    h = even(h);
  }
  const cap = video ? MAX_VIDEO_EDGE : MAX_IMAGE_EDGE;
  if (Math.max(w, h) > cap)
    return {
      ok: false,
      ...base,
      preset: p.id,
      reason: `${p.label} would be ${w}×${h}, above the ${cap}px limit for this output.`,
    };
  return {
    ok: true,
    ...base,
    preset: p.id,
    scale: p.scale,
    w,
    h,
    draft: !!p.draft,
  };
}

// ---------------------------------------------------------------- estimates (conservative heuristics, never a promise)
export const ESTIMATE_LABEL =
  "Estimate only: actual size and time depend on the device, the background and the encoder.";
export const WARN_BYTES = 100 * 1024 * 1024;
export const WARN_SECONDS = 5 * 60;
const FPS = 30;
// H.264 at 1080x1920: ~3..14 Mbit/s for poem text over a background; scales with pixel count.
const VIDEO_BPS_LOW = 3_000_000,
  VIDEO_BPS_HIGH = 14_000_000;
// encode speed: conservative 6 fps (slow phone) .. 45 fps (desktop) at native size
const ENC_FPS_SLOW = 6;
// PNG bytes per pixel: flat colour ~0.15, grain/photo ~3.2
const PNG_BPP_LOW = 0.15,
  PNG_BPP_HIGH = 3.2;
const IMAGE_SECONDS = 0.9; // per native card, conservative (fonts ready, toBlob on a slow phone)

/**
 * estimateExport(comp, route, preset, { cards, height }) -> { estimate:true, label, bytesLow, bytesHigh, seconds,
 * framesOrCards, unit, warnings }. `cards` is the number of images a set route draws (from route.scenesFor); `height`
 * is the full-poem canvas height. Monotonic in duration, card count and preset scale.
 */
export function estimateExport(
  comp,
  route,
  preset = DEFAULT_PRESET,
  { cards, height } = {},
) {
  const kind = route?.kind || "image";
  const format =
    route?.format === "any"
      ? kind === "video"
        ? "reel"
        : "poster"
      : route?.format;
  const size = outputSize(format, preset, { kind, height });
  const warnings = [];
  if (!size.ok)
    return {
      estimate: true,
      label: ESTIMATE_LABEL,
      ok: false,
      bytesLow: 0,
      bytesHigh: 0,
      seconds: 0,
      framesOrCards: 0,
      unit: kind === "video" ? "frames" : "images",
      warnings: [size.reason],
    };
  const px = size.w * size.h,
    pxRatio = px / (size.nativeW * size.nativeH);
  let bytesLow, bytesHigh, seconds, n, unit;
  if (kind === "video") {
    const ms = route?.excerpt
      ? 6000
      : (comp?.scenes || []).reduce((t, s) => t + (s.durationMs || 0), 0);
    const secs = ms / 1000;
    n = Math.ceil(secs * FPS);
    unit = "frames";
    bytesLow = Math.round((secs * VIDEO_BPS_LOW * pxRatio) / 8);
    bytesHigh = Math.round(
      (secs * VIDEO_BPS_HIGH * Math.max(pxRatio, 0.25)) / 8,
    );
    seconds = Math.ceil((n / ENC_FPS_SLOW) * Math.max(pxRatio, 0.25)) + 2;
  } else {
    n = Math.max(
      1,
      Number.isFinite(cards)
        ? cards
        : kind === "set"
          ? (comp?.scenes || []).length
          : 1,
    );
    unit = "images";
    bytesLow = Math.round(n * px * PNG_BPP_LOW);
    bytesHigh = Math.round(n * px * PNG_BPP_HIGH);
    seconds = Math.ceil(n * IMAGE_SECONDS * Math.max(pxRatio, 0.25)) + 1;
  }
  if (bytesHigh > WARN_BYTES)
    warnings.push(`This may be larger than ${WARN_BYTES / 1048576} MB.`);
  if (seconds > WARN_SECONDS)
    warnings.push(
      `This may take more than ${WARN_SECONDS / 60} minutes on a slow device.`,
    );
  return {
    estimate: true,
    label: ESTIMATE_LABEL,
    ok: true,
    bytesLow,
    bytesHigh,
    seconds,
    framesOrCards: n,
    unit,
    w: size.w,
    h: size.h,
    warnings,
  };
}

/** Sum of route estimates for a bundle (plus the same thresholds on the total). */
export function estimateBundle(list) {
  const ok = list.filter((e) => e.ok);
  const bytesLow = ok.reduce((n, e) => n + e.bytesLow, 0),
    bytesHigh = ok.reduce((n, e) => n + e.bytesHigh, 0),
    seconds = ok.reduce((n, e) => n + e.seconds, 0);
  const warnings = [...new Set(list.flatMap((e) => e.warnings))];
  if (bytesHigh > WARN_BYTES && !warnings.some((w) => w.includes("MB")))
    warnings.push(`The bundle may be larger than ${WARN_BYTES / 1048576} MB.`);
  if (seconds > WARN_SECONDS && !warnings.some((w) => w.includes("minutes")))
    warnings.push(
      `The bundle may take more than ${WARN_SECONDS / 60} minutes on a slow device.`,
    );
  return {
    estimate: true,
    label: ESTIMATE_LABEL,
    bytesLow,
    bytesHigh,
    seconds,
    routes: list.length,
    warnings,
  };
}

/** Low-memory hint from navigator fields (injected). A SUGGESTION only: it never changes the chosen preset. */
export function lowMemoryHint(nav) {
  const mem = Number(nav?.deviceMemory),
    cores = Number(nav?.hardwareConcurrency);
  const low =
    (Number.isFinite(mem) && mem > 0 && mem <= 2) ||
    (Number.isFinite(cores) && cores > 0 && cores <= 2);
  return low
    ? {
        low: true,
        suggest: "draft",
        message:
          "This device reports little memory or few CPU cores: a smaller output size (0.75× or 0.5× draft) is less likely to fail. Suggestion only.",
      }
    : { low: false };
}

const MB = 1048576;
export const fmtBytes = (n) =>
  n >= MB
    ? `${(n / MB).toFixed(n >= 10 * MB ? 0 : 1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
export const fmtSeconds = (s) =>
  s >= 60
    ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim()
    : `${s} s`;
