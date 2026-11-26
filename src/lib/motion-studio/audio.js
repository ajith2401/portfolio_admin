// Audio: decode an uploaded/recorded clip, trim + fade + volume it into an AudioBuffer sized to the video.
// The AudioBuffer is what gets AAC-encoded into the MP4. Nothing is uploaded to the server.
export const MAX_AUDIO_BYTES = 40 * 1048576;

export async function decodeAudio(blob) {
  if (blob.size > MAX_AUDIO_BYTES) throw new Error("That audio file is over 40 MB.");
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("This browser cannot decode audio.");
  const ctx = new Ctx();
  try {
    const buf = await blob.arrayBuffer();
    return await new Promise((res, rej) => ctx.decodeAudioData(buf, res, () => rej(new Error("This audio format cannot be decoded here. Try MP3, M4A/AAC, WAV or a recording made in this page."))));
  } finally { ctx.close?.(); }
}

/** Returns an AudioBuffer of exactly `videoMs` (silence-padded or cut) with trim/volume/fades applied. */
export function shapeAudio(src, { trimStartMs = 0, trimEndMs = 0, volume = 1, fadeInMs = 0, fadeOutMs = 800 }, videoMs) {
  const sr = src.sampleRate, ch = src.numberOfChannels;
  const start = Math.min(src.length, Math.floor((trimStartMs / 1000) * sr));
  const end = trimEndMs > 0 ? Math.min(src.length, Math.floor((trimEndMs / 1000) * sr)) : src.length;
  const clip = Math.max(0, end - start), outLen = Math.max(1, Math.round((videoMs / 1000) * sr));
  const Ctx = window.AudioBuffer;
  const out = new Ctx({ length: outLen, numberOfChannels: ch, sampleRate: sr });
  const used = Math.min(clip, outLen), fi = Math.floor((fadeInMs / 1000) * sr), fo = Math.floor((fadeOutMs / 1000) * sr);
  for (let c = 0; c < ch; c++) {
    const s = src.getChannelData(c), d = out.getChannelData(c);
    for (let i = 0; i < used; i++) {
      let g = volume;
      if (fi && i < fi) g *= i / fi;
      const fromEnd = used - i; if (fo && fromEnd < fo) g *= fromEnd / fo;
      d[i] = s[start + i] * g;
    }
  }
  return out;
}

export function recordingSupport() {
  if (typeof window === "undefined") return { ok: false, reason: "Not in a browser." };
  if (!window.isSecureContext) return { ok: false, reason: "Recording needs HTTPS. Open this page over https://." };
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return { ok: false, reason: "This browser cannot record audio. Upload a recording instead." };
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return { ok: true, mime: types.find((t) => MediaRecorder.isTypeSupported(t)) || "" };
}

/** Start recording. Returns { stop(): Promise<Blob>, cancel() }. Always releases the microphone. */
export async function startRecording() {
  const sup = recordingSupport(); if (!sup.ok) throw new Error(sup.reason);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); }
  catch (e) {
    if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw new Error("Microphone permission was denied. Allow it in your browser's site settings, or upload an audio file instead.");
    if (e?.name === "NotFoundError") throw new Error("No microphone was found on this device.");
    throw new Error(`Could not start the microphone: ${e?.message || e}`);
  }
  const rec = new MediaRecorder(stream, sup.mime ? { mimeType: sup.mime } : undefined), chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  rec.start(1000);
  return {
    stop: () => new Promise((res) => { rec.onstop = () => { release(); res(new Blob(chunks, { type: rec.mimeType || sup.mime || "audio/webm" })); }; rec.state !== "inactive" ? rec.stop() : res(new Blob(chunks)); }),
    cancel: () => { try { rec.state !== "inactive" && rec.stop(); } catch {} release(); },
  };
}
