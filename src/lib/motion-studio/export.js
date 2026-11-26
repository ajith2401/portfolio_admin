// Browser-side export. Everything is feature-detected at runtime; nothing assumes a device supports it.
import { drawFrame, compDuration } from "./render.js";
import { FORMATS } from "./safe-zone.js";

const FPS = 30;
const QUALITY = { draft: "low", standard: "medium", high: "high" };

/** Report what this browser can actually do. Used by the UI to enable/disable Reel export honestly. */
export async function detectCapabilities() {
  const caps = { webCodecs: typeof VideoEncoder !== "undefined", canvas: typeof document !== "undefined", mp4: false, avc: false, aac: false, reason: null };
  if (!caps.webCodecs) { caps.reason = "This browser has no WebCodecs video encoder, so MP4 export is unavailable. Use Poster (PNG) or a current Chrome/Safari."; return caps; }
  try {
    const mb = await import("mediabunny");
    const fmt = new mb.Mp4OutputFormat();
    const v = await mb.getFirstEncodableVideoCodec(fmt.getSupportedVideoCodecs().filter((c) => c === "avc"), { width: 1080, height: 1920 });
    caps.avc = v === "avc"; caps.mp4 = caps.avc;
    caps.aac = !!(await mb.getFirstEncodableAudioCodec(fmt.getSupportedAudioCodecs().filter((c) => c === "aac")));
    if (!caps.avc) caps.reason = "This device cannot encode H.264 at 1080×1920, so a Reel MP4 cannot be produced here.";
  } catch (e) { caps.reason = `Export engine failed to load: ${e?.message || e}`; }
  return caps;
}

/** Render the composition to an H.264 MP4 Blob. onProgress(0..1). signal aborts cleanly. */
export async function exportMp4(comp, { onProgress, signal, audioBuffer } = {}) {
  const mb = await import("mediabunny");
  const fmt = FORMATS[comp.format];
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(fmt.w, fmt.h) : Object.assign(document.createElement("canvas"), { width: fmt.w, height: fmt.h });
  const ctx = canvas.getContext("2d");
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: mb.QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  let audio = null;
  if (audioBuffer) { audio = new mb.AudioBufferSource({ codec: "aac", bitrate: mb.QUALITY_MEDIUM }); output.addAudioTrack(audio); }
  await output.start();
  const total = compDuration(comp), frames = Math.ceil((total / 1000) * FPS);
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      drawFrame(ctx, comp, (i / FPS) * 1000, { w: fmt.w, h: fmt.h });
      await video.add(i / FPS, 1 / FPS);
      if (i % 10 === 0) { onProgress?.(i / frames); await new Promise((r) => setTimeout(r)); }
    }
    if (audio && audioBuffer) await audio.add(audioBuffer);
    await output.finalize();
  } catch (e) { try { await output.cancel(); } catch {} throw e; }
  onProgress?.(1);
  return new Blob([output.target.buffer], { type: "video/mp4" });
}

export async function exportPng(comp) {
  const fmt = FORMATS.poster;
  const c = Object.assign(document.createElement("canvas"), { width: fmt.w, height: fmt.h });
  drawFrame(c.getContext("2d"), { ...comp, format: "poster" }, 0, { w: fmt.w, h: fmt.h });
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png"));
}
