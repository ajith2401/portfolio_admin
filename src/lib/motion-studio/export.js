// Browser-side export. Everything is feature-detected at runtime; nothing assumes a device supports it.
// Every route: ensureFonts (exact faces, Tamil glyphs proven) -> its validator (route-checks.js) -> draw. The route list
// itself lives in formats.js (ROUTES); a test fails if a render*/export* function here is not registered there.
import { drawFrame, compDuration } from "./render.js";
import { ensureFonts, canvasMeasure } from "./font-ready.js";
import { FORMATS } from "./safe-zone.js";
import { fontReviewOf, CANDIDATE_EXPORT_WARNING } from "./font-registry.js";
import { zipStore } from "./zip.js";
import { drawFullPoem, FULL_W } from "./full-poem.js";
import { checkScenes, checkCover, coverScene, checkPoster, checkFull, FULL_NO_FIT, checkQuote, quoteScene, quoteMin, checkCarousel, sceneMin, fontIssues } from "./route-checks.js";
import { materialActive } from "./materials.js";
import { checkWhole } from "./route-checks.js";
import { drawWholeFrame, wholeDuration, wholeFrames } from "./whole-poem.js";
import { createLease } from "./canvas-lease.js";
import { outputSize, presetById } from "./output-size.js";

export const FPS = 30;

/** Thrown when a route refuses to export because the output would not reproduce the source poem exactly. */
export class ExportValidationError extends Error {
  constructor(what, messages) {
    const shown = messages.slice(0, 6).join("; ");
    super(`${what}: ${messages.length} problem(s) found, nothing was exported. ${shown}${messages.length > 6 ? "; …" : ""}`);
    this.name = "ExportValidationError";
    this.messages = messages;
  }
}
// A tiny 16x16 measuring canvas (measureText does not depend on canvas size or transform); not an output canvas.
const probeCtx = () => Object.assign(document.createElement("canvas"), { width: 16, height: 16 }).getContext("2d");
// ---------------------------------------------------------------- NOTHING BLOCKS AN EXPORT
// Every check still runs, but a failed check no longer refuses the export. Instead the route tries, in order, the
// smallest change that fixes it (weaker material -> no material -> simple fade text-in -> a verified body font ->
// a smaller text floor) and keeps a change ONLY if it reduces the problems. Whatever was changed, and anything still
// wrong, is reported as a warning (takeExportWarnings) so it is never silent. Layout and drawing always use the SAME
// adjusted composition and floor, so what was checked is exactly what is drawn.
let pending = [];
const warn = (m) => { if (m && !pending.includes(m)) pending.push(m); };
/** Warnings from the last export(s); clears the list. The UI shows them after a successful export. */
export const takeExportWarnings = () => { const w = pending; pending = []; return w; };
export const SOFT_FLOOR_PX = 16; // the smallest text the auto-fit may use (the user can always set a larger size)
const DEFAULT_BODY_FONT = "noto-serif";
const short = (m) => String(m || "").replace(/\s*\[fr4[^\]]*\]/g, "").replace(/\s*\[[^\]]{40,}\]/g, "").slice(0, 240);
/** Fonts first, but never blocking: if a face cannot be proven, the export continues with the font the browser has. */
const fontsFor = async (comp, { extraText = "", title = "" } = {}) => {
  try { await ensureFonts(comp, { poemText: extraText, title }, { measure: canvasMeasure() }); }
  catch (e) {
    if (e?.name === "AbortError") throw e;
    warn(`Font check: ${short(e?.message || e)} The export continued with the closest font this device has; check the result before posting.`);
  }
};
const count = (v) => (v?.ok ? 0 : Math.max(1, (v?.messages || []).length));
/**
 * Run `check(comp, minSize)` and, while it fails, try the auto-fix ladder. Returns { v, comp, minSize }: the result,
 * composition and floor to DRAW with. Never throws for a failed check.
 */
export function resolveRoute(what, comp, check, { minSize = null } = {}) {
  let c = comp, ms = minSize, v = check(c, ms);
  if (v.ok) return { v, comp: c, minSize: ms };
  const steps = [];
  if (materialActive(c)) {
    steps.push(["the texture/effect strength was lowered to keep the text readable", (x) => ({ ...x, material: { ...x.material, intensity: Math.round(x.material.intensity * 50) / 100 } })]);
    steps.push(["the texture/effect was left out to keep the text readable", (x) => ({ ...x, material: undefined })]);
  }
  if (c.motion?.textIn && c.motion.textIn !== "fade") steps.push(["the text animation was simplified to a fade", (x) => ({ ...x, motion: { ...x.motion, textIn: "fade" } })]);
  if (fontIssues(c).length) steps.push(["the poem font was replaced with Noto Serif Tamil", (x) => ({ ...x, style: { ...x.style, font: DEFAULT_BODY_FONT, titleFont: null } })]);
  for (const [why, fn] of steps) {
    if (v.ok) break;
    const c2 = fn(c), v2 = check(c2, ms);
    if (count(v2) < count(v)) { c = c2; v = v2; warn(`${what}: ${why}.`); }
  }
  if (!v.ok && ms != null) {
    for (const f of [0.85, 0.7, 0.55, 0.4]) {
      const ms2 = Math.max(SOFT_FLOOR_PX, Math.floor(ms * f));
      if (ms2 >= ms) continue;
      const v2 = check(c, ms2);
      if (count(v2) < count(v)) { v = v2; warn(`${what}: some lines were set smaller (down to ${ms2}px) so every word fits.`); ms = ms2; }
      if (v.ok || ms2 === SOFT_FLOOR_PX) break;
    }
  }
  if (!v.ok) warn(`${what}: exported with ${v.messages.length} issue(s) that could not be fixed automatically — please check: ${v.messages.slice(0, 3).join("; ")}${v.messages.length > 3 ? "; …" : ""}`);
  return { v, comp: c, minSize: ms };
}
/** Object results of a route say fontReview:'unreviewed' (+ the warning) whenever a candidate font was used. */
export const fontReviewFor = (comp) => (fontReviewOf(comp) ? { fontReview: fontReviewOf(comp), fontWarning: CANDIDATE_EXPORT_WARNING } : {});
// Memory guard: every OUTPUT canvas comes from this lease (at most 1 alive) and is released in a finally block.
const lease = createLease((w, h, offscreen) => (offscreen && typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })), { max: 1 });
export const canvasLease = Object.freeze({ live: () => lease.live(), peak: () => lease.peak(), releaseAll: () => lease.releaseAll() });
const withCanvas = async (w, h, fn, offscreen = false) => {
  const c = lease.acquire(w, h, offscreen);
  try {
    return await fn(c, c.getContext("2d"));
  } finally {
    lease.release(c);
  }
};
/**
 * Output size for a preset. The layout and the validator ALWAYS run at the native canvas; only the bitmap is scaled
 * (drawFrame applies one uniform scale = w / native w). An unknown preset or one below the floor is refused.
 */
const sizeFor = (format, preset, kind = "image") => {
  const s = outputSize(format, preset ?? "native", { kind });
  if (!s.ok) throw new ExportValidationError("Output size", [s.reason]);
  return s;
};
const tick = () => new Promise((r) => setTimeout(r));

/**
 * Report what this browser can actually encode. A VideoEncoder existing is NOT enough: we ask the encoder whether the
 * exact H.264 config (size, bitrate, framerate) and AAC config are supported, then prove it with a real 1-frame encode.
 */
export async function detectCapabilities() {
  const caps = { webCodecs: typeof VideoEncoder !== "undefined", mp4: false, avc: false, aac: false, avcString: null, reason: null, probe: null };
  if (!caps.webCodecs) { caps.reason = "This browser has no WebCodecs video encoder, so it cannot write an MP4."; return caps; }
  try {
    const mb = await import("mediabunny");
    const fmt = new mb.Mp4OutputFormat();
    const v = await mb.getFirstEncodableVideoCodec(fmt.getSupportedVideoCodecs().filter((c) => c === "avc"), { width: 1080, height: 1920, bitrate: 6_000_000 });
    caps.avc = v === "avc";
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec, width: 1080, height: 1920, bitrate: 6_000_000, framerate: FPS });
        if (r.supported) { caps.avcString = codec; break; }
      } catch {}
    }
    caps.aac = !!(await mb.getFirstEncodableAudioCodec(fmt.getSupportedAudioCodecs().filter((c) => c === "aac"), { numberOfChannels: 1, sampleRate: 44100 }));
    caps.mp4 = caps.avc && !!caps.avcString;
    if (!caps.mp4) caps.reason = "This device cannot encode H.264 at 1080×1920. You can still export the scenes as an image sequence (ZIP) and assemble them in any video app.";
  } catch (e) { caps.reason = `Export engine failed to load: ${e?.message || e}`; }
  return caps;
}

/** Render to H.264 (+AAC if audioBuffer) MP4. Frames are produced and encoded one at a time (bounded memory except the final buffer). */
export async function exportMp4(comp, opts = {}) {
  await fontsFor(comp);
  const r = resolveRoute("Video", comp, (c, ms) => checkScenes(probeCtx(), c, c.scenes, { minSize: ms }), { minSize: sceneMin(comp.format, comp) });
  return encodeMp4(r.comp, { ...opts, minSize: r.minSize });
}
/** Encoder only: callers MUST have run ensureFonts and the route's validator first. */
async function encodeMp4(comp, { preset, ...opts } = {}) {
  const size = sizeFor(comp.format, preset, "video");
  return withCanvas(size.w, size.h, (canvas, ctx) => encodeOn(canvas, ctx, size, comp, opts), true);
}
async function encodeOn(canvas, ctx, size, comp, { assets = {}, minSize, ...opts } = {}) {
  const frames = Math.ceil((compDuration(comp) / 1000) * FPS);
  return encodeFrames(canvas, frames, (i) => drawFrame(ctx, comp, (i / FPS) * 1000, { w: size.w, h: size.h, assets, minSize }), opts);
}
/** The encoder loop shared by every video route: draw(i) paints frame i, then it is encoded at i/FPS. */
async function encodeFrames(canvas, frames, draw, { onProgress, signal, audioBuffer, bitrate } = {}) {
  const mb = await import("mediabunny");
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: bitrate || mb.QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  let audio = null;
  if (audioBuffer) { audio = new mb.AudioBufferSource({ codec: "aac", bitrate: mb.QUALITY_MEDIUM }); output.addAudioTrack(audio); }
  await output.start();
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      draw(i);
      await video.add(i / FPS, 1 / FPS);
      if (i % 6 === 0) { onProgress?.(i / frames); await tick(); } // yield so the editor stays responsive
    }
    if (audio) await audio.add(audioBuffer);
    await output.finalize();
  } catch (e) { try { await output.cancel(); } catch {} throw e; }
  onProgress?.(1);
  const blob = new Blob([output.target.buffer], { type: "video/mp4" });
  output.target.buffer = null;
  return blob;
}

const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(`${type} encode failed`))), type, q));
const blobBytes = async (b) => new Uint8Array(await b.arrayBuffer());

/** One still frame per scene (Story sequence). */
export async function renderSceneStills(comp, { format = "story", type = "image/png", assets = {}, signal, onProgress, preset } = {}) {
  await fontsFor({ ...comp, format });
  const r = resolveRoute("Story images", { ...comp, format }, (c, ms) => checkScenes(probeCtx(), c, c.scenes, { animated: false, minSize: ms }), { minSize: sceneMin(format, comp) }); // stills: HOLD
  comp = r.comp;
  const size = sizeFor(format, preset), out = [];
  return withCanvas(size.w, size.h, async (c, ctx) => {
    for (let i = 0; i < comp.scenes.length; i++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      ctx.clearRect(0, 0, size.w, size.h);
      drawFrame(ctx, { ...comp, format }, 0, { w: size.w, h: size.h, assets, still: true, scene: comp.scenes[i], minSize: r.minSize });
      out.push(await toBlob(c, type, 0.92));
      onProgress?.((i + 1) / comp.scenes.length); await tick();
    }
    return out;
  });
}

/** Poster cards (never shrinks text below a legible floor; reports overflow instead). */
export async function renderPosters(comp, { type = "image/png", assets = {}, scale = 1, preset, signal } = {}) {
  // fonts BEFORE the cards are packed: packing measures text (this used to measure first, against a possible fallback)
  await fontsFor({ ...comp, format: "poster" });
  const fmt = FORMATS.poster;
  const size = preset != null ? sizeFor("poster", preset) : { w: Math.round(fmt.w * scale), h: Math.round(fmt.h * scale) };
  const r = resolveRoute("Poster", comp, (c) => checkPoster(probeCtx(), c)); // native layout, native floor
  comp = r.comp;
  const { plan: { cards, overflow } } = r.v;
  return withCanvas(size.w, size.h, async (c, ctx) => {
    const blobs = [];
    for (const card of cards) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      ctx.clearRect(0, 0, c.width, c.height);
      drawFrame(ctx, { ...comp, format: "poster" }, 0, { w: c.width, h: c.height, assets, still: true, scene: { kind: "stanza", lines: card.lines, durationMs: 1, id: "p" }, minSize: 46 });
      blobs.push(await toBlob(c, type, 0.94)); await tick();
    }
    return { blobs, overflow, width: c.width, height: c.height, ...fontReviewFor(comp) };
  });
}

export async function zipBlobs(blobs, stem, ext) {
  const files = [];
  for (let i = 0; i < blobs.length; i++) files.push({ name: `${stem}-${String(i + 1).padStart(2, "0")}.${ext}`, data: await blobBytes(blobs[i]) });
  return new Blob([zipStore(files)], { type: "application/zip" });
}

/**
 * Full-Poem Vertical Poster: ONE image with the whole poem. Refuses (throws) instead of clipping when the layout does
 * not fit, and verifies after layout that every line is present before drawing.
 */
export async function renderFullPoem(comp, poem, { preset = "balanced", height = "standard", type = "image/png", scale = 1, assets = {}, output } = {}) {
  // fonts first: layout measures text, so it must never run against a fallback face
  await fontsFor(comp, { extraText: [poem.title, ...poem.stanzas.flat()].join("\n"), title: poem.title });
  let v = checkFull(probeCtx(), comp, poem, { preset, height });
  // does not fit: try the taller canvas, then the compact layout, before anything else (never clip)
  for (const [h2, p2, why] of [["extended", preset, "the taller (extended) canvas was used so the whole poem fits"], ["extended", "compact", "the compact layout on the taller canvas was used so the whole poem fits"]]) {
    if (v.fits) break;
    const v2 = checkFull(probeCtx(), comp, poem, { preset: p2, height: h2 });
    if (v2.fits) { v = v2; preset = p2; height = h2; warn(`Full-poem poster: ${why}.`); }
  }
  if (!v.fits) throw new Error(FULL_NO_FIT);
  const r = resolveRoute("Full-poem poster", comp, (c) => (c === comp ? v : checkFull(probeCtx(), c, poem, { preset, height })));
  comp = r.comp;
  const { layout } = r.v;
  // `output` is a resolution preset id (bundle); `scale` the legacy 1x/2x choice. Layout is always native.
  const want = output != null ? (presetById(output)?.scale ?? sizeFor("full", output).scale) : scale;
  const k = Math.min(want, layout.maxScale);
  return withCanvas(Math.round(FULL_W * k), Math.round(layout.height * k), async (c, ctx) => {
    // `assets` may be a function of the layout height: an auto-chosen taller canvas gets a background baked to fit it
    drawFullPoem(ctx, comp, layout, { assets: typeof assets === "function" ? assets(layout.height) || {} : assets, scale: k });
    return { blob: await toBlob(c, type, 0.94), layout, scale: k, width: c.width, height: c.height, ...fontReviewFor(comp) };
  });
}

/**
 * Quote (EXCERPT) image: only the selected source lines, at the quote floor, in any format. The result says so:
 * excerpt:true, complete:false, coverage {selected, total, partial:true}. It is never presented as the whole poem.
 */
export async function renderQuote(comp, poem, selection, { format = "poster", type = "image/png", assets = {}, preset } = {}) {
  const scene = quoteScene(poem, selection);
  const qc = { ...comp, format, scenes: scene ? [scene] : [] };
  await fontsFor(qc, { extraText: scene ? scene.lines.join("\n") : "" });
  const r = resolveRoute("Quote", comp, (c) => checkQuote(probeCtx(), c, poem, selection, { format }));
  if (!r.v.scene) throw new ExportValidationError("Quote (excerpt)", r.v.messages);
  comp = r.comp; const v = r.v;
  const size = sizeFor(v.format, preset);
  return withCanvas(size.w, size.h, async (c, ctx) => {
    drawFrame(ctx, { ...qc, format: v.format }, 0, { w: size.w, h: size.h, assets, still: true, scene: v.scene, minSize: quoteMin(v.format) });
    return { blob: await toBlob(c, type, 0.94), excerpt: true, complete: false, coverage: v.coverage, format: v.format, width: size.w, height: size.h, ...fontReviewFor(comp) };
  });
}
/** Animated quote (EXCERPT): the selected lines as one short MP4 scene (text-in, then hold). Same labelling as renderQuote. */
export async function exportQuoteMp4(comp, poem, selection, { format = "reel", ...opts } = {}) {
  const scene = quoteScene(poem, selection);
  const qc = { ...comp, format, scenes: scene ? [scene] : [] };
  await fontsFor(qc, { extraText: scene ? scene.lines.join("\n") : "" });
  const r = resolveRoute("Animated quote", comp, (c) => checkQuote(probeCtx(), c, poem, selection, { format, animated: true }));
  if (!r.v.scene) throw new ExportValidationError("Animated quote (excerpt)", r.v.messages);
  const v = r.v;
  const blob = await encodeMp4({ ...r.comp, format: v.format, scenes: [v.scene] }, { ...opts, minSize: quoteMin(v.format) });
  return { blob, excerpt: true, complete: false, coverage: v.coverage, format: v.format, ...fontReviewFor(comp) };
}
/** Feed carousel: title cover + poem cards (poster set) + optional end card, each numbered k/N; every card validated. */
export async function renderCarousel(comp, { type = "image/png", assets = {}, preset, signal } = {}) {
  await fontsFor({ ...comp, format: "poster" }, { extraText: comp.poster?.endText || "" });
  const r = resolveRoute("Feed carousel", comp, (c) => checkCarousel(probeCtx(), c)); // native layout, native floor
  comp = r.comp;
  const { plan } = r.v;
  const size = sizeFor("poster", preset);
  const pc = { ...comp, format: "poster" };
  return withCanvas(size.w, size.h, async (c, ctx) => {
    const blobs = [];
    for (const card of plan.cards) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      ctx.clearRect(0, 0, c.width, c.height);
      drawFrame(ctx, pc, 0, { w: c.width, h: c.height, assets, still: true, scene: card.scene, minSize: 46, pageLabel: card.page });
      blobs.push(await toBlob(c, type, 0.94)); await tick();
    }
    return { blobs, pages: plan.cards.map((cd) => ({ role: cd.role, page: cd.page })), width: c.width, height: c.height, ...fontReviewFor(comp) };
  });
}
/** Reel cover: the title card (or first scene) as a still 1080×1920 image. Distinct from the full-poem poster. */
export async function renderReelCover(comp, { type = "image/png", assets = {}, preset } = {}) {
  const sc = coverScene(comp);
  if (!sc) throw new Error("There are no scenes to make a cover from.");
  await fontsFor({ ...comp, format: "reel" });
  const r = resolveRoute("Reel cover", comp, (c, ms) => checkCover(probeCtx(), c, { minSize: ms }), { minSize: sceneMin("reel", comp) });
  comp = r.comp;
  const size = sizeFor("reel", preset);
  return withCanvas(size.w, size.h, async (c, ctx) => {
    drawFrame(ctx, { ...comp, format: "reel" }, 0, { w: size.w, h: size.h, assets, still: true, scene: coverScene(comp) || sc, minSize: r.minSize });
    return toBlob(c, type, 0.94);
  });
}

// ---------------------------------------------------------------- Whole-Poem Video (whole-poem.js)
const wholeText = (poem) => [poem.title, ...poem.stanzas.flat()].join("\n");
/** Resolve the Whole-Poem layout for export: fonts first, then the checker + auto-fix ladder. Refuses only when the
 * poem cannot be shown legibly on one screen at all (it then says why and points at Scene-by-Scene). */
async function wholePlan(comp, poem) {
  await fontsFor(comp, { extraText: wholeText(poem), title: poem.title });
  const r = resolveRoute("Whole-Poem Video", comp, (c) => checkWhole(probeCtx(), c, poem));
  if (!r.v.fits) throw new ExportValidationError("Whole-Poem Video", r.v.messages);
  (r.v.warnings || []).forEach((m) => warn(`Whole-Poem Video: ${m}`));
  return r;
}
/**
 * Whole-Poem Video MP4: the complete poem, still, on one 1080×1920 screen for exactly comp.whole.durationMs
 * (frames = round(seconds × 30)), with the background animating. Returns { blob, frames, durationMs, layout }.
 */
export async function exportWholeMp4(comp, poem, { preset, assets = {}, ...opts } = {}) {
  const r = await wholePlan(comp, poem);
  const c = r.comp, layout = r.v.layout, ms = wholeDuration(c), frames = wholeFrames(ms, FPS);
  const size = sizeFor("reel", preset, "video");
  const k = size.w / FULL_W;
  const blob = await withCanvas(size.w, size.h, (canvas, ctx) =>
    encodeFrames(canvas, frames, (i) => drawWholeFrame(ctx, c, layout, (i / FPS) * 1000, { assets, scale: k }), opts), true);
  return { blob, frames, durationMs: Math.round((frames / FPS) * 1000), layout, size: layout.size, ...fontReviewFor(c) };
}
/** The Whole-Poem screen as a still PNG/JPEG (Reel cover / Story image of the same composition, first frame). */
export async function renderWholeCover(comp, poem, { type = "image/png", assets = {}, preset } = {}) {
  const r = await wholePlan(comp, poem);
  const size = sizeFor("reel", preset);
  const k = size.w / FULL_W;
  return withCanvas(size.w, size.h, async (c, ctx) => {
    drawWholeFrame(ctx, r.comp, r.v.layout, 0, { assets, scale: k, still: true });
    return { blob: await toBlob(c, type, 0.94), width: size.w, height: size.h, layout: r.v.layout, ...fontReviewFor(r.comp) };
  });
}
