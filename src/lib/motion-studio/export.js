// Browser-side export. Everything is feature-detected at runtime; nothing assumes a device supports it.
// Every route: ensureFonts (exact faces, Tamil glyphs proven) -> its validator (route-checks.js) -> draw. The route list
// itself lives in formats.js (ROUTES); a test fails if a render*/export* function here is not registered there.
import { drawFrame, compDuration } from "./render.js";
import { ensureFonts, canvasMeasure } from "./font-ready.js";
import { FORMATS } from "./safe-zone.js";
import { fontReviewOf, CANDIDATE_EXPORT_WARNING } from "./font-registry.js";
import { zipStore } from "./zip.js";
import { drawFullPoem, FULL_W } from "./full-poem.js";
import { checkScenes, checkCover, coverScene, checkPoster, checkFull, FULL_NO_FIT, checkQuote, quoteScene, quoteMin, checkCarousel } from "./route-checks.js";
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
/** Fonts first: nothing may be measured against a fallback face. */
const fontsFor = (comp, { extraText = "", title = "" } = {}) => ensureFonts(comp, { poemText: extraText, title }, { measure: canvasMeasure() });
/** Object results of a route say fontReview:'unreviewed' (+ the warning) whenever a candidate font was used. */
export const fontReviewFor = (comp) => (fontReviewOf(comp) ? { fontReview: fontReviewOf(comp), fontWarning: CANDIDATE_EXPORT_WARNING } : {});
const assertOk = (what, v) => { if (!v.ok) throw new ExportValidationError(what, v.messages); return v; };
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
  assertOk("Reel video", checkScenes(probeCtx(), comp, comp.scenes));
  return encodeMp4(comp, opts);
}
/** Encoder only: callers MUST have run ensureFonts and the route's validator first. */
async function encodeMp4(comp, { preset, ...opts } = {}) {
  const size = sizeFor(comp.format, preset, "video");
  return withCanvas(size.w, size.h, (canvas, ctx) => encodeOn(canvas, ctx, size, comp, opts), true);
}
async function encodeOn(canvas, ctx, size, comp, { onProgress, signal, audioBuffer, assets = {}, bitrate, minSize } = {}) {
  const mb = await import("mediabunny");
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: bitrate || mb.QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  let audio = null;
  if (audioBuffer) { audio = new mb.AudioBufferSource({ codec: "aac", bitrate: mb.QUALITY_MEDIUM }); output.addAudioTrack(audio); }
  await output.start();
  const frames = Math.ceil((compDuration(comp) / 1000) * FPS);
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      drawFrame(ctx, comp, (i / FPS) * 1000, { w: size.w, h: size.h, assets, minSize });
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
  assertOk("Story images", checkScenes(probeCtx(), { ...comp, format }, comp.scenes, { animated: false })); // stills: HOLD
  const size = sizeFor(format, preset), out = [];
  return withCanvas(size.w, size.h, async (c, ctx) => {
    for (let i = 0; i < comp.scenes.length; i++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      ctx.clearRect(0, 0, size.w, size.h);
      drawFrame(ctx, { ...comp, format }, 0, { w: size.w, h: size.h, assets, still: true, scene: comp.scenes[i] });
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
  const { plan: { cards, overflow } } = assertOk("Poster", checkPoster(probeCtx(), comp)); // native layout, native floor
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
  await ensureFonts(comp, { poemText: [poem.title, ...poem.stanzas.flat()].join("\n"), title: poem.title }, { measure: canvasMeasure() });
  const v = checkFull(probeCtx(), comp, poem, { preset, height });
  if (!v.fits) throw new Error(FULL_NO_FIT);
  const { layout } = assertOk("Full-poem poster", v);
  // `output` is a resolution preset id (bundle); `scale` the legacy 1x/2x choice. Layout is always native.
  const want = output != null ? (presetById(output)?.scale ?? sizeFor("full", output).scale) : scale;
  const k = Math.min(want, layout.maxScale);
  return withCanvas(Math.round(FULL_W * k), Math.round(layout.height * k), async (c, ctx) => {
    drawFullPoem(ctx, comp, layout, { assets, scale: k });
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
  const v = assertOk("Quote (excerpt)", checkQuote(probeCtx(), comp, poem, selection, { format }));
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
  const v = assertOk("Animated quote (excerpt)", checkQuote(probeCtx(), comp, poem, selection, { format, animated: true }));
  const blob = await encodeMp4({ ...qc, format: v.format, scenes: [v.scene] }, { ...opts, minSize: quoteMin(v.format) });
  return { blob, excerpt: true, complete: false, coverage: v.coverage, format: v.format, ...fontReviewFor(comp) };
}
/** Feed carousel: title cover + poem cards (poster set) + optional end card, each numbered k/N; every card validated. */
export async function renderCarousel(comp, { type = "image/png", assets = {}, preset, signal } = {}) {
  await fontsFor({ ...comp, format: "poster" }, { extraText: comp.poster?.endText || "" });
  const { plan } = assertOk("Feed carousel", checkCarousel(probeCtx(), comp)); // native layout, native floor
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
  assertOk("Reel cover", checkCover(probeCtx(), comp));
  const size = sizeFor("reel", preset);
  return withCanvas(size.w, size.h, async (c, ctx) => {
    drawFrame(ctx, { ...comp, format: "reel" }, 0, { w: size.w, h: size.h, assets, still: true, scene: sc });
    return toBlob(c, type, 0.94);
  });
}
