// Deterministic frame renderer: drawFrame(ctx, comp, tMs, {w,h,fonts}) paints exactly one frame for time tMs.
// Same function drives the on-screen preview and the export, so preview == output. No randomness: particles are
// seeded from index so frames are reproducible.
import { wrapLine } from "./graphemes.js";
import { FORMATS, safeRect } from "./safe-zone.js";
import { totalDuration } from "./scenes.js";

export const FONT_FAMILY = {
  "noto-serif": '"Noto Serif Tamil", serif',
  "noto-sans": '"Noto Sans Tamil", sans-serif',
  "hind-madurai": '"Hind Madurai", sans-serif',
  anek: '"Anek Tamil", sans-serif',
  tiro: '"Tiro Tamil", serif',
};
/** next/font hashes family names; the page registers the real ones here before drawing. */
export const setFontFamilies = (m) => Object.assign(FONT_FAMILY, m);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function sceneAt(comp, tMs) {
  let t = Math.max(0, tMs);
  for (let i = 0; i < comp.scenes.length; i++) {
    const s = comp.scenes[i];
    if (t < s.durationMs) return { scene: s, index: i, local: t, last: i === comp.scenes.length - 1 };
    t -= s.durationMs;
  }
  const i = comp.scenes.length - 1;
  return i < 0 ? null : { scene: comp.scenes[i], index: i, local: comp.scenes[i].durationMs, last: true };
}
export const compDuration = (comp) => totalDuration(comp.scenes);

function paintBackground(ctx, c, w, h, tMs, totalMs) {
  const st = c.style, p = clamp01(tMs / Math.max(1, totalMs)), k = c.motion.intensity;
  ctx.save();
  if (c.motion.bgMotion === "zoom") { const z = 1 + 0.06 * k * p; ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-w / 2, -h / 2); }
  if (c.motion.bgMotion === "drift") ctx.translate(-30 * k * p, -20 * k * p);
  const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
  g.addColorStop(0, st.bg.a); g.addColorStop(1, st.bg.kind === "solid" ? st.bg.a : st.bg.b);
  ctx.fillStyle = g; ctx.fillRect(-60, -60, w + 120, h + 120);
  ctx.restore();
  if (st.overlay.opacity > 0) { ctx.globalAlpha = st.overlay.opacity; ctx.fillStyle = st.overlay.color; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  if (st.geometry) { ctx.strokeStyle = st.color; ctx.globalAlpha = 0.12; ctx.lineWidth = 3; ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8); ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.5); ctx.lineTo(w * 0.3, h * 0.5); ctx.stroke(); ctx.globalAlpha = 1; }
}
function paintParticles(ctx, c, w, h, tMs) {
  const kind = c.style.particles; if (kind === "none") return;
  const n = 36, t = tMs / 1000;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = rnd(i) * w, sp = 0.2 + rnd(i + 50) * 0.6;
    if (kind === "rain") { const y = ((rnd(i + 9) * h + t * 900 * sp) % (h + 120)) - 60; ctx.strokeStyle = "rgba(200,220,240,0.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 46); ctx.stroke(); }
    else if (kind === "stars") { ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(t * sp * 2 + i)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, rnd(i + 3) * h, 1.5 + rnd(i + 7) * 2.5, 0, 6.283); ctx.fill(); }
    else { const y = h - (((rnd(i + 5) * h) + t * 40 * sp) % h); ctx.globalAlpha = 0.18 + 0.2 * rnd(i + 2); ctx.fillStyle = kind === "light" ? "#ffe3b0" : "#ddd"; ctx.beginPath(); ctx.arc(x + Math.sin(t * sp + i) * 20, y, 2 + rnd(i + 8) * 4, 0, 6.283); ctx.fill(); }
  }
  ctx.restore();
}
function paintVignette(ctx, w, h, v) {
  if (v <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.7 * v})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function paintGrain(ctx, w, h, amt, tMs) {
  if (amt <= 0) return;
  const f = Math.floor(tMs / 120);
  ctx.save(); ctx.globalAlpha = Math.min(0.5, amt);
  for (let i = 0; i < 160; i++) { ctx.fillStyle = rnd(i + f * 7) > 0.5 ? "#fff" : "#000"; ctx.fillRect(rnd(i + f) * w, rnd(i * 3 + f) * h, 2, 2); }
  ctx.restore();
}

/** Lay out a scene's lines inside the safe rect. Returns { rows:[{text,y}], size } shrinking the font until it fits. */
export function layoutScene(ctx, c, scene, rect) {
  const st = c.style, family = FONT_FAMILY[st.font];
  const maxW = rect.w * (st.widthPct / 100);
  let size = st.sizePx;
  for (let attempt = 0; attempt < 12; attempt++) {
    ctx.font = `${st.weight} ${size}px ${family}`;
    const measure = (s) => ctx.measureText(s).width;
    const rows = [];
    scene.lines.forEach((ln, li) => wrapLine(ln, maxW, measure).forEach((r) => rows.push({ text: r, line: li })));
    const lh = size * st.lineHeight;
    if (rows.length * lh <= rect.h || size <= 28) return { rows, size, lh, maxW };
    size = Math.max(28, Math.floor(size * 0.92));
  }
  return { rows: [], size, lh: size * st.lineHeight, maxW };
}

export function drawFrame(ctx, comp, tMs, { w, h } = {}) {
  const fmt = FORMATS[comp.format] || FORMATS.reel;
  w = w || fmt.w; h = h || fmt.h;
  const sx = w / fmt.w;
  ctx.save(); ctx.scale(sx, sx);
  const W = fmt.w, H = fmt.h, st = comp.style, total = compDuration(comp);
  paintBackground(ctx, comp, W, H, tMs, total);
  paintParticles(ctx, comp, W, H, tMs);
  const at = sceneAt(comp, tMs);
  if (at) {
    const rect = safeRect(W, H, fmt.safe);
    const { rows, lh, size } = layoutScene(ctx, comp, at.scene, rect);
    const isTitle = at.scene.kind === "title";
    const fadeIn = ease(at.local / 700), fadeOut = at.last ? 1 : 1 - clamp01((at.local - (at.scene.durationMs - 500)) / 500);
    const blockH = rows.length * lh;
    let y0 = st.vAlign === "top" ? rect.y : st.vAlign === "bottom" ? rect.y + rect.h - blockH : rect.y + (rect.h - blockH) / 2;
    ctx.textBaseline = "middle";
    ctx.textAlign = st.align;
    const ax = st.align === "left" ? rect.x : st.align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
    rows.forEach((r, i) => {
      let a = fadeIn * fadeOut, dy = 0;
      if (comp.motion.textIn === "line") a = ease((at.local - r.line * 450) / 600) * fadeOut;
      else if (comp.motion.textIn === "rise") { const p = ease((at.local - i * 150) / 800); a = p * fadeOut; dy = (1 - p) * 40 * (0.4 + comp.motion.intensity); }
      else if (comp.motion.textIn === "none") a = fadeOut;
      ctx.globalAlpha = clamp01(a);
      ctx.font = `${isTitle ? 700 : st.weight} ${size}px ${FONT_FAMILY[st.font]}`;
      if (st.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3; } else ctx.shadowColor = "transparent";
      ctx.fillStyle = st.color;
      ctx.fillText(r.text, ax, y0 + i * lh + lh / 2 + dy);
    });
    ctx.globalAlpha = 1; ctx.shadowColor = "transparent";
  }
  paintVignette(ctx, W, H, st.vignette);
  paintGrain(ctx, W, H, st.grain, tMs);
  if (comp.branding.show && comp.branding.signature) {
    ctx.globalAlpha = 0.85; ctx.fillStyle = comp.branding.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `500 30px ${FONT_FAMILY["noto-sans"]}`;
    ctx.fillText(comp.branding.signature, W / 2, H * (comp.format === "poster" ? 0.94 : 0.8));
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
