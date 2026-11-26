// Bakes a custom background image once (crop/zoom/position + brightness/contrast/blur) into an offscreen canvas.
// Pixel ops are done manually: CanvasRenderingContext2D.filter is not available in every Safari. The baked canvas is
// reused for every frame, so a 1080x1920 background costs one decode + one pass, not one per frame.
import { requiredScrim } from "./contrast.js";

const mk = (w, h) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));

/** Largest decoded size we will ever hold: caps memory on phones regardless of the upload's pixel size. */
export const MAX_DECODE = 2048;

export function bakeBackground(img, p, W, H) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const out = mk(W, H), ctx = out.getContext("2d", { willReadFrequently: true });
  const cover = Math.max(W / iw, H / ih) * p.zoom;
  const dw = iw * cover, dh = ih * cover;
  ctx.drawImage(img, (W - dw) * p.x, (H - dh) * p.y, dw, dh);
  if (p.blur > 0) { // cheap box-ish blur by down/up scaling; deterministic and works everywhere
    const f = Math.max(1, Math.round(p.blur / 2));
    const s = mk(Math.max(1, Math.round(W / (f * 2))), Math.max(1, Math.round(H / (f * 2)))), sx = s.getContext("2d");
    sx.imageSmoothingQuality = "high"; sx.drawImage(out, 0, 0, s.width, s.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(s, 0, 0, W, H);
  }
  if (p.brightness !== 0 || p.contrast !== 0) {
    const d = ctx.getImageData(0, 0, W, H), px = d.data, b = p.brightness * 255, c = 1 + p.contrast * 2;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = (px[i] - 128) * c + 128 + b; px[i + 1] = (px[i + 1] - 128) * c + 128 + b; px[i + 2] = (px[i + 2] - 128) * c + 128 + b;
    }
    ctx.putImageData(d, 0, 0);
  }
  return out;
}

/** Sample the baked image in the text zone and return the scrim opacity needed for readable text. */
export function readabilityScrim(baked, rect, textHex) {
  const s = mk(24, 24).getContext("2d", { willReadFrequently: true });
  s.drawImage(baked, rect.x, rect.y, rect.w, rect.h, 0, 0, 24, 24);
  const d = s.getImageData(0, 0, 24, 24).data, samples = [];
  for (let i = 0; i < d.length; i += 4) samples.push([d[i], d[i + 1], d[i + 2]]);
  return requiredScrim(samples, textHex);
}

/** Decode a File/Blob to an HTMLImageElement/ImageBitmap no larger than MAX_DECODE (protects mobile memory). */
export async function decodeImageFile(file) {
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP or AVIF image.");
  if (file.size > 25 * 1048576) throw new Error("That image is over 25 MB. Choose a smaller one.");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, MAX_DECODE / Math.max(bmp.width, bmp.height));
  if (k === 1) return bmp;
  const c = mk(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return c;
}
