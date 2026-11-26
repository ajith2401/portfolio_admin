// Browser-side export. Everything is feature-detected at runtime; nothing assumes a device supports it.
import { drawFrame, compDuration, posterCards, validateScenes } from "./render.js";
import { ensureFonts, canvasMeasure } from "./font-ready.js";
import { FORMATS, MIN_TEXT_PX } from "./safe-zone.js";
import { zipStore } from "./zip.js";
import { layoutFullPoem, drawFullPoem, validateFullPoem, FULL_W } from "./full-poem.js";

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
const probeCtx = () => mkCanvas(16, 16).getContext("2d");
/** Fonts ready (exact faces, Tamil glyphs proven) → THEN every scene this route will draw is validated against its source. */
async function prepare(comp, scenes, what, { minSize = MIN_TEXT_PX[comp.format] ?? MIN_TEXT_PX.reel, extraText = "", title = "" } = {}) {
  await ensureFonts(comp, { poemText: extraText, title }, { measure: canvasMeasure() });
  const v = validateScenes(probeCtx(), comp, scenes, { minSize });
  if (!v.ok) throw new ExportValidationError(what, v.messages);
}
const mkCanvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
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
export async function exportMp4(comp, { onProgress, signal, audioBuffer, assets = {}, bitrate } = {}) {
  await prepare(comp, comp.scenes, "Reel video");
  const mb = await import("mediabunny");
  const fmt = FORMATS[comp.format];
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(fmt.w, fmt.h) : mkCanvas(fmt.w, fmt.h);
  const ctx = canvas.getContext("2d");
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
      drawFrame(ctx, comp, (i / FPS) * 1000, { w: fmt.w, h: fmt.h, assets });
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
export async function renderSceneStills(comp, { format = "story", type = "image/png", assets = {}, signal, onProgress } = {}) {
  await prepare({ ...comp, format }, comp.scenes, "Story images");
  const fmt = FORMATS[format], out = [];
  const c = mkCanvas(fmt.w, fmt.h), ctx = c.getContext("2d");
  for (let i = 0; i < comp.scenes.length; i++) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    ctx.clearRect(0, 0, fmt.w, fmt.h);
    drawFrame(ctx, { ...comp, format }, 0, { w: fmt.w, h: fmt.h, assets, still: true, scene: comp.scenes[i] });
    out.push(await toBlob(c, type, 0.92));
    onProgress?.((i + 1) / comp.scenes.length); await tick();
  }
  return out;
}

/** Poster cards (never shrinks text below a legible floor; reports overflow instead). */
export async function renderPosters(comp, { type = "image/png", assets = {}, scale = 1 } = {}) {
  const fmt = FORMATS.poster, c = mkCanvas(Math.round(fmt.w * scale), Math.round(fmt.h * scale)), ctx = c.getContext("2d");
  const { cards, overflow } = posterCards(ctx, comp);
  const pc = { ...comp, format: "poster" };
  const ids = comp.poster.sceneIds, chosen = comp.scenes.filter((s) => s.kind !== "title" && (!ids.length || ids.includes(s.id)));
  const cardScenes = cards.map((card, i) => ({ kind: "stanza", lines: card.lines, durationMs: 1, id: `p${i}` }));
  await prepare(pc, cardScenes, "Poster", { minSize: 46 });
  const want = chosen.flatMap((s) => s.lines), got = cards.flatMap((cd) => cd.lines).filter((l) => l !== "");
  if (want.length !== got.length || want.some((l, i) => l !== got[i])) throw new ExportValidationError("Poster", ["the poster cards do not contain every selected line, in order"]);
  const blobs = [];
  for (const card of cards) {
    ctx.clearRect(0, 0, c.width, c.height);
    drawFrame(ctx, { ...comp, format: "poster" }, 0, { w: c.width, h: c.height, assets, still: true, scene: { kind: "stanza", lines: card.lines, durationMs: 1, id: "p" }, minSize: 46 });
    blobs.push(await toBlob(c, type, 0.94)); await tick();
  }
  return { blobs, overflow };
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
export async function renderFullPoem(comp, poem, { preset = "balanced", height = "standard", type = "image/png", scale = 1, assets = {} } = {}) {
  // fonts first: layout measures text, so it must never run against a fallback face
  await ensureFonts(comp, { poemText: [poem.title, ...poem.stanzas.flat()].join("\n"), title: poem.title }, { measure: canvasMeasure() });
  const probe = mkCanvas(FULL_W, 100), pctx = probe.getContext("2d");
  const layout = layoutFullPoem(pctx, comp, poem, { preset, height });
  if (!layout.fits) throw new Error("This poem does not fit this canvas at a readable size. Choose the extended-height poster or a more compact layout.");
  const v = validateFullPoem(poem, layout);
  if (!v.ok) throw new ExportValidationError("Full-poem poster", v.messages);
  const k = Math.min(scale, layout.maxScale);
  const c = mkCanvas(Math.round(FULL_W * k), Math.round(layout.height * k)), ctx = c.getContext("2d");
  drawFullPoem(ctx, comp, layout, { assets, scale: k });
  return { blob: await toBlob(c, type, 0.94), layout, scale: k, width: c.width, height: c.height };
}

/** Reel cover: the title card (or first scene) as a still 1080×1920 image. Distinct from the full-poem poster. */
export async function renderReelCover(comp, { type = "image/png", assets = {} } = {}) {
  const sc = comp.scenes.find((x) => x.kind === "title") || comp.scenes[0];
  if (!sc) throw new Error("There are no scenes to make a cover from.");
  await prepare({ ...comp, format: "reel" }, [sc], "Reel cover");
  const fmt = FORMATS.reel, c = mkCanvas(fmt.w, fmt.h), ctx = c.getContext("2d");
  drawFrame(ctx, { ...comp, format: "reel" }, 0, { w: fmt.w, h: fmt.h, assets, still: true, scene: sc });
  return toBlob(c, type, 0.94);
}
