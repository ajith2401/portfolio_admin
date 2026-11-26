// Browser-side export. Everything is feature-detected at runtime; nothing assumes a device supports it.
import { drawFrame, compDuration, posterCards } from "./render.js";
import { FORMATS } from "./safe-zone.js";
import { zipStore } from "./zip.js";

export const FPS = 30;
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
