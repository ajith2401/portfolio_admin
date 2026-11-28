// Deterministic frame renderer: drawFrame(ctx, comp, tMs, {w,h,fonts}) paints exactly one frame for time tMs.
// Same function drives the on-screen preview and the export, so preview == output. No randomness: particles are
// seeded from index so frames are reproducible.
import { classifyInto, newResult, note, rowExtent, checkX, TOLERANCE } from "./coverage.js";
import { wrapSpans, indentPx, lineIndent } from "./graphemes.js";
import { FORMATS, MIN_TEXT_PX, shrinkFloor } from "./safe-zone.js";
import { signatureBox, textRect, signatureBoundsIssues, overlapsSignature } from "./signature.js";
// Reel/Story floor comes from MIN_TEXT_PX; poster paths pass POSTER_MIN explicitly and keep their legacy default here.
export const defaultMinSize = (format) => (format === "poster" ? 28 : MIN_TEXT_PX[format] ?? MIN_TEXT_PX.reel);
import { totalDuration } from "./scenes.js";
import { rowState, activeBehaviour, buildPlan, animFrame, prefParams, fadeOutAt, MIN_HOLD_MS, FADE_OUT_MS } from "./animation.js";
import { runFx, runMaterial } from "./fx/registry.js";
import { paintTextures } from "./textures.js";
import { paintTextile, paintTextileScrims, textileActive } from "./textiles.js";
import { paintSky, paintSkyScrims, skyActive } from "./sky.js";
import { paintElements } from "./elements.js";
import { writingOf, drawWrittenRows, measureIn, inkColour, planWriting } from "./writing.js";
import { materialPlan, effectiveIntensity } from "./materials.js";
import { registryFamilies, realWeight, titleWeightOf } from "./font-registry.js";

// id -> CSS family stack, derived from the ONE font registry (the five verified stacks are byte-identical to before).
export const FONT_FAMILY = registryFamilies();
/** Family the renderer paints `role` text with: a title may use style.titleFont; everything else uses style.font. */
export const familyFor = (st, role = "body") => FONT_FAMILY[role === "title" && st.titleFont ? st.titleFont : st.font];
/** next/font hashes family names; the page registers the real ones here before drawing. */
export const setFontFamilies = (m) => Object.assign(FONT_FAMILY, m);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
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

/** Draw `img` to cover the w×h box (centre-cropped), so a baked 9:16 background also fits a taller poster. */
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
// opts.rect / opts.still: the text area and still-frame flag, used only by a Sky & Celestial background (sky.js)
export function paintBackground(ctx, c, w, h, tMs, totalMs, assets, opts = {}) {
  const st = c.style, p = clamp01(tMs / Math.max(1, totalMs)), k = c.motion.intensity;
  const bgMotion = c.motion.reduceMotion === true ? "none" : c.motion.bgMotion; // reduce motion also stills the background
  ctx.save();
  if (bgMotion === "zoom") { const z = 1 + 0.06 * k * p; ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-w / 2, -h / 2); }
  if (bgMotion === "drift") ctx.translate(-30 * k * p, -20 * k * p);
  const sky = !assets.bg && skyActive(c);
  if (assets.bg) drawCover(ctx, assets.bg, -30, -30, w + 60, h + 60);
  else if (sky) { ctx.restore(); ctx.save(); paintSky(ctx, c, w, h, tMs, { rect: opts.rect, still: opts.still === true }); } // the sky moves by its own clock, not bgMotion
  else {
    const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, st.bg.a); g.addColorStop(1, st.bg.kind === "solid" ? st.bg.a : st.bg.b);
    ctx.fillStyle = g; ctx.fillRect(-60, -60, w + 120, h + 120);
  }
  ctx.restore();
  if (st.overlay.opacity > 0) { ctx.globalAlpha = st.overlay.opacity; ctx.fillStyle = st.overlay.color; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  if (assets.scrim > 0) { // readability guard: automatic scrim so Tamil text stays legible on photos
    ctx.globalAlpha = assets.scrim; ctx.fillStyle = assets.scrimColor || "#000"; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  }
  if (st.geometry) { ctx.strokeStyle = st.color; ctx.globalAlpha = 0.12; ctx.lineWidth = 3; ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8); ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.5); ctx.lineTo(w * 0.3, h * 0.5); ctx.stroke(); ctx.globalAlpha = 1; }
}
// k scales speed only (Whole-Poem Video Calm/Normal/Expressive); 0 = Static (nothing drawn). Returns 1 when it drew.
// The broad soft layers (mist, bokeh, leak, sweep, ripple) stay at very low alpha so they never compete with the poem.
export function paintParticles(ctx, c, w, h, tMs, k = 1) {
  const kind = c.style.particles; if (kind === "none" || !(k > 0)) return 0;
  if (kind === "stars" && skyActive(c)) return 0; // the sky draws its own stars
  const n = 36, t = (tMs / 1000) * k;
  ctx.save();
  if (AMBIENT[kind]) { AMBIENT[kind](ctx, w, h, t); ctx.restore(); return 1; }
  for (let i = 0; i < n; i++) {
    const x = rnd(i) * w, sp = 0.2 + rnd(i + 50) * 0.6;
    if (kind === "rain") { const y = ((rnd(i + 9) * h + t * 900 * sp) % (h + 120)) - 60; ctx.strokeStyle = "rgba(200,220,240,0.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 46); ctx.stroke(); }
    else if (kind === "stars") { ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(t * sp * 2 + i)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, rnd(i + 3) * h, 1.5 + rnd(i + 7) * 2.5, 0, 6.283); ctx.fill(); }
    else { const y = h - (((rnd(i + 5) * h) + t * 40 * sp) % h); ctx.globalAlpha = 0.18 + 0.2 * rnd(i + 2); ctx.fillStyle = kind === "light" ? "#ffe3b0" : "#ddd"; ctx.beginPath(); ctx.arc(x + Math.sin(t * sp + i) * 20, y, 2 + rnd(i + 8) * 4, 0, 6.283); ctx.fill(); }
  }
  ctx.restore();
  return 1;
}
const softDisc = (ctx, x, y, r, rgb, a) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
};
// time-driven, deterministic (seeded by index), periodic where it matters so a video loop does not jump
const AMBIENT = {
  mist: (ctx, w, h, t) => { for (let i = 0; i < 7; i++) { const x = ((rnd(i + 21) * 1.4 - 0.2) * w + t * (14 + 10 * rnd(i)) ) % (w * 1.4) - w * 0.2, y = (0.15 + 0.7 * rnd(i + 31)) * h + Math.sin(t * 0.2 + i) * 30; softDisc(ctx, x, y, w * (0.35 + 0.25 * rnd(i + 41)), "235,240,245", 0.07); } },
  bokeh: (ctx, w, h, t) => { for (let i = 0; i < 14; i++) { const x = rnd(i + 61) * w + Math.sin(t * 0.25 + i) * 40, y = rnd(i + 71) * h + Math.cos(t * 0.2 + i * 1.7) * 50; softDisc(ctx, x, y, 40 + 70 * rnd(i + 81), i % 3 ? "255,236,200" : "220,230,255", 0.05 + 0.05 * Math.abs(Math.sin(t * 0.4 + i))); } },
  leak: (ctx, w, h, t) => { const a = 0.06 + 0.04 * Math.sin(t * 0.35); softDisc(ctx, w * (0.05 + 0.1 * Math.sin(t * 0.15)), h * (0.08 + 0.06 * Math.cos(t * 0.12)), w * 0.9, "255,170,90", a); softDisc(ctx, w * 0.95, h * (0.92 - 0.05 * Math.sin(t * 0.18)), w * 0.6, "255,120,80", a * 0.7); },
  sweep: (ctx, w, h, t) => { const p = (t * 0.06) % 1.6 - 0.3, x = p * w * 1.4; const g = ctx.createLinearGradient(x - w * 0.35, 0, x + w * 0.35, h * 0.3); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,250,235,0.07)"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); },
  ripple: (ctx, w, h, t) => { ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { const ph = ((t * 0.18 + i / 5) % 1), cx = w * (0.3 + 0.4 * rnd(i + 91)), cy = h * (0.82 + 0.1 * rnd(i + 95)); ctx.strokeStyle = `rgba(220,235,250,${0.16 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(cx, cy, 30 + ph * w * 0.35, 8 + ph * 60, 0, 0, 6.283); ctx.stroke(); } },
  snow: (ctx, w, h, t) => { ctx.fillStyle = "#fff"; for (let i = 0; i < 48; i++) { const sp = 0.3 + rnd(i + 101) * 0.7, y = ((rnd(i + 111) * h + t * 60 * sp) % (h + 20)) - 10, x = rnd(i + 121) * w + Math.sin(t * sp + i) * 24; ctx.globalAlpha = 0.25 + 0.35 * rnd(i + 131); ctx.beginPath(); ctx.arc(x, y, 1.5 + 3 * rnd(i + 141), 0, 6.283); ctx.fill(); } },
};
export function paintVignette(ctx, w, h, v) {
  if (v <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.7 * v})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
export function paintGrain(ctx, w, h, amt, tMs) {
  if (amt <= 0) return;
  const f = Math.floor(tMs / 120);
  ctx.save(); ctx.globalAlpha = Math.min(0.5, amt);
  for (let i = 0; i < 160; i++) { ctx.fillStyle = rnd(i + f * 7) > 0.5 ? "#fff" : "#000"; ctx.fillRect(rnd(i + f) * w, rnd(i * 3 + f) * h, 2, 2); }
  ctx.restore();
}

/**
 * Lay out a scene's lines inside the safe rect. A line equal to "" is a stanza gap (poster cards).
 * A size above `minSize` (the format's recommended size) may shrink to fit, down to `minSize`; a size the author chose
 * at or below it is used exactly as chosen (shrinkFloor). The size is never raised. `fits:false` = it does not fit.
 */
export function layoutScene(ctx, c, scene, rect, { minSize = defaultMinSize(c.format) } = {}) {
  const st = c.style, family = familyFor(st, scene.kind === "title" ? "title" : "body");
  const maxW = rect.w * (st.widthPct / 100);
  let size = Math.round(st.sizePx * (scene.scale || 1));
  const floor = shrinkFloor(minSize, size);
  for (let attempt = 0; attempt < 24; attempt++) {
    ctx.font = `${scene.kind === "title" ? titleWeightOf(st) : realWeight(st.font, st.weight)} ${size}px ${family}`; // the weight drawFrame will paint with
    const measure = (x) => ctx.measureText(x).width;
    const lh = size * st.lineHeight, rows = [];
    let li = 0;
    scene.lines.forEach((ln, srcLine) => {
      if (ln === "") { rows.push({ text: "", gap: true, h: lh * 0.6, line: li, srcLine }); return; }
      // source-aware wrap: rows carry the exact source range they draw; leading whitespace becomes a bounded layout indent
      const ipx = indentPx(ln, measure, maxW);
      wrapSpans(ln, maxW - ipx, measure, lineIndent(ln).len).forEach((r, wrapRow) =>
        rows.push({ text: r.text, start: r.start, end: r.end, w: measure(r.text), indentPx: ipx, line: li, srcLine, wrapRow, h: lh }));
      li++;
    });
    const total = rows.reduce((n, r) => n + r.h, 0);
    if (total <= rect.h) return { rows, size, lh, total, maxW, fits: true };
    if (size <= floor) return { rows, size, lh, total, maxW, fits: false };
    size = Math.max(floor, Math.floor(size * 0.94));
  }
  return { rows: [], size, lh: size * st.lineHeight, total: 0, maxW, fits: false };
}

/** Rows of a layout with their drawn boxes (top/bottom/left/right) for a block starting at y0. Pure: no ctx calls. */
export function rowBoxes(rows, align, ax, y0) {
  let y = y0;
  return rows.map((r) => {
    const top = y; y += r.h;
    if (r.gap) return { ...r, top, bottom: y };
    const [left, right] = rowExtent(align, rowAnchor(align, ax, r.indentPx), r.w);
    return { ...r, top, bottom: y, left, right };
  });
}
/**
 * Geometry of ONE scene exactly as drawFrame lays it out (for validateAnimation): rows with boxes, the text rect, the
 * canvas size, the signature box and a measure() bound to the drawn font. Pass a measuring ctx (fonts proven ready).
 */
export function sceneGeometry(ctx, comp, scene, { minSize = defaultMinSize(comp.format) } = {}) {
  const fmt = FORMATS[comp.format] || FORMATS.reel, st = comp.style;
  const rect = textRect(comp, fmt, ctx);
  const lay = layoutScene(ctx, comp, scene, rect, { minSize });
  const align = scene.align || st.align;
  const ax = align === "left" ? rect.x : align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
  const shift = ((scene.offsetY || 0) / 100) * rect.h;
  let y = st.vAlign === "top" ? rect.y : st.vAlign === "bottom" ? rect.y + rect.h - lay.total : rect.y + (rect.h - lay.total) / 2;
  y = Math.max(rect.y, Math.min(rect.y + rect.h - lay.total, y + shift));
  const isTitle = scene.kind === "title";
  const font = `${isTitle ? titleWeightOf(st) : realWeight(st.font, st.weight)} ${lay.size}px ${familyFor(st, isTitle ? "title" : "body")}`;
  const measure = (t) => { ctx.font = font; return ctx.measureText(t).width; };
  return { rows: rowBoxes(lay.rows, align, ax, y), rect, W: fmt.w, H: fmt.h, sig: signatureBox(comp, fmt, ctx), measure, fits: lay.fits };
}

/**
 * Scene-by-Scene writing check: per scene, the time the writing needs (last ink + hold: the final hold on the last
 * scene, MIN_HOLD_MS elsewhere) against the time the scene shows its text (its length minus the fade-out). Scenes that
 * opt out (noWrite) are skipped. Never auto-fitted: the caller shows the estimate and offers to lengthen the scenes.
 */
export function sceneWritingFit(ctx, comp, { minSize = defaultMinSize(comp.format) } = {}) {
  const w = writingOf(comp);
  if (w.mode === "none") return { on: false, fits: true, scenes: [] };
  const scenes = comp.scenes.map((sc, i) => {
    if (sc.noWrite) return { index: i, skip: true, fits: true };
    const g = sceneGeometry(ctx, comp, sc, { minSize });
    let group = 0;
    const rows = [];
    for (const r of g.rows) { if (r.gap) { group++; continue; } rows.push({ text: r.text, left: r.left, group }); }
    const last = i === comp.scenes.length - 1;
    const plan = planWriting(rows, { ...w, finalHoldMs: last ? w.finalHoldMs : MIN_HOLD_MS }, (t) => g.measure(t));
    const room = sc.durationMs - (last ? 0 : FADE_OUT_MS);
    return { index: i, needMs: Math.ceil(plan.total + (last ? 0 : FADE_OUT_MS)), fits: plan.total <= room, writeEndMs: plan.writeEnd };
  });
  return { on: true, fits: scenes.every((s) => s.fits), scenes };
}

/** Anchor x of a row after its layout indent: left/right anchors move by the indent, a centred row by half of it. */
export const rowAnchor = (align, ax, ipx = 0) => (align === "left" ? ax + ipx : align === "right" ? ax - ipx : ax + ipx / 2);

// ---------------------------------------------------------------- layers
// drawFrame paints explicit ordered layers: bg -> material -> atmosphere (under text) -> text -> surface (over text) ->
// signature. material/atmosphere/surface accept registered effects (fx/registry.js, empty by default). The text layer
// takes no state from any effect: effects run isolated, and the text state is re-asserted before the text is drawn.
export const LAYERS = Object.freeze(["bg", "material", "atmosphere", "elements", "text", "surface", "signature"]);
export const resetTextState = (ctx) => { ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none"; ctx.shadowColor = "transparent"; };
function layerBg(ctx, env) { paintBackground(ctx, env.comp, env.W, env.H, env.still ? 0 : env.tMs, env.total, env.assets, { rect: env.rect, still: env.still }); }
// surface texture + film grain (textures.js) first: the paper the material presets then sit on
// a woven textile (textiles.js), when chosen, is the cloth everything else sits on
function layerMaterial(ctx, env) { return paintTextile(ctx, env) + paintTextures(ctx, env) + runFx("material", ctx, env) + runMaterial("material", ctx, env); }
function layerAtmosphere(ctx, env) {
  if (!env.still) paintParticles(ctx, env.comp, env.W, env.H, env.tMs);
  return runFx("atmosphere", ctx, env) + runMaterial("atmosphere", ctx, env);
}
function layerElements(ctx, env) { return paintElements(ctx, env.comp, env.W, env.H, env.tMs, { still: env.still }); }
function layerText(ctx, env) {
  const { comp, rect, still, minSize } = env, st = comp.style;
  const at = env.forced ? { scene: env.forced, index: 0, local: 1e6, last: true } : sceneAt(comp, env.tMs);
  if (!at) return;
  const sc = at.scene;
  const { rows, size, total: blockH } = layoutScene(ctx, comp, sc, rect, { minSize });
  const isTitle = sc.kind === "title";
  const align = sc.align || st.align;
  const shift = ((sc.offsetY || 0) / 100) * rect.h;
  let y = st.vAlign === "top" ? rect.y : st.vAlign === "bottom" ? rect.y + rect.h - blockH : rect.y + (rect.h - blockH) / 2;
  y = Math.max(rect.y, Math.min(rect.y + rect.h - blockH, y + shift));
  ctx.textBaseline = "middle"; ctx.textAlign = align;
  const ax = align === "left" ? rect.x : align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
  if (textileActive(comp) || skyActive(comp)) textileGuard(ctx, env, rowBoxes(rows, align, ax, y), size);
  // library animations (animation.js LIBRARY) draw through animFrame, the same function validateAnimation checks; the four
  // classic behaviours and every still keep the original per-row path below, call for call.
  const wr = writingOf(comp);
  if (wr.mode !== "none" && !still && !sc.noWrite) {
    // Ink Reveal / Typewriter (writing.js): whole shaped rows, masked or cut only at shaping-neutral cluster boundaries
    const font = `${isTitle ? titleWeightOf(st) : realWeight(st.font, st.weight)} ${size}px ${familyFor(st, isTitle ? "title" : "body")}`;
    let group = 0;
    const wrows = [];
    for (const r of rowBoxes(rows, align, ax, y)) {
      if (r.gap) { group++; continue; }
      wrows.push({ text: r.text, left: r.left, mid: r.top + r.h / 2, font, group, size });
    }
    ctx.font = font;
    if (st.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3; } else ctx.shadowColor = "transparent";
    ctx.fillStyle = inkColour(wr, st.color);
    drawWrittenRows(ctx, wrows, at.local, wr, { size, alpha: clamp01(fadeOutAt(sc, at.local, at.last)), measure: measureIn(ctx) });
    ctx.shadowColor = "transparent";
    return;
  }
  const b = activeBehaviour(comp);
  if (b.library && !still) {
    const geo = { rows: rowBoxes(rows, align, ax, y), rect, measure: (t) => ctx.measureText(t).width };
    const plan = buildPlan(b, sc, geo);
    const f = animFrame(b, sc, plan, at.local, { last: at.last, p: prefParams(comp), intensity: comp.motion?.intensity });
    const font = `${isTitle ? titleWeightOf(st) : realWeight(st.font, st.weight)} ${size}px ${familyFor(st, isTitle ? "title" : "body")}`;
    if (f.scale !== 1 && plan.block) { ctx.save(); ctx.translate(plan.block.cx, plan.block.cy); ctx.scale(f.scale, f.scale); ctx.translate(-plan.block.cx, -plan.block.cy); }
    for (const fr of f.rows) {
      const r = fr.u.row, mid = r.top + r.h / 2;
      ctx.font = font;
      if (st.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3; } else ctx.shadowColor = "transparent";
      ctx.fillStyle = st.color;
      if (fr.whole) {
        ctx.globalAlpha = clamp01(fr.state.alpha);
        ctx.fillText(r.text, rowAnchor(align, ax, r.indentPx) + fr.state.dx, mid + fr.state.dy);
        continue;
      }
      // whole WORDS only (split at breakable whitespace), each one fillText so its shaping is untouched
      ctx.textAlign = "left";
      for (const wd of fr.words) {
        if (wd.state.alpha <= 0) continue;
        ctx.globalAlpha = clamp01(wd.state.alpha);
        ctx.fillText(wd.w.text, wd.w.left + wd.state.dx, mid + wd.state.dy);
      }
      ctx.textAlign = align;
    }
    if (f.scale !== 1 && plan.block) ctx.restore();
    ctx.globalAlpha = 1; ctx.shadowColor = "transparent";
    return;
  }
  let i = 0;
  for (const r of rows) {
    const top = y; y += r.h;
    if (r.gap) continue;
    const s = rowState(comp, sc, r, at.local, { still, last: at.last, index: i });
    ctx.globalAlpha = clamp01(s.alpha);
    ctx.font = `${isTitle ? titleWeightOf(st) : realWeight(st.font, st.weight)} ${size}px ${familyFor(st, isTitle ? "title" : "body")}`;
    if (st.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3; } else ctx.shadowColor = "transparent";
    ctx.fillStyle = st.color;
    ctx.fillText(r.text, rowAnchor(align, ax, r.indentPx) + s.dx, top + r.h / 2 + s.dy);
    i++;
  }
  ctx.globalAlpha = 1; ctx.shadowColor = "transparent";
}
// local readability scrim under the poem block (and the signature) when the cloth there is too close to the text colour
function textileGuard(ctx, env, boxes, size) {
  const { comp, fmt } = env, pad = Math.round(size * 0.45), blocks = [];
  const live = boxes.filter((r) => !r.gap);
  if (live.length) {
    const b = [Math.min(...live.map((r) => r.left)) - pad, Math.min(...live.map((r) => r.top)) - pad * 0.4, Math.max(...live.map((r) => r.right)) + pad, Math.max(...live.map((r) => r.bottom)) + pad * 0.4];
    blocks.push({ box: b, color: comp.style.color });
  }
  const sg = comp.branding?.color ? signatureBox(comp, fmt, ctx) : null;
  if (sg) blocks.push({ box: [sg.left - 16, sg.top - 8, sg.right + 16, sg.bottom + 8], color: comp.branding.color });
  ctx.save();
  if (textileActive(comp)) paintTextileScrims(ctx, env, blocks); // the cloth covers the sky, so it decides the shade
  else paintSkyScrims(ctx, env, blocks);
  ctx.restore();
}
function layerSurface(ctx, env) {
  paintVignette(ctx, env.W, env.H, env.comp.style.vignette);
  paintGrain(ctx, env.W, env.H, env.comp.style.grain, env.still ? 0 : env.tMs);
  return runFx("surface", ctx, env) + runMaterial("surface", ctx, env);
}
function layerSignature(ctx, env) {
  const { comp, fmt } = env;
  const sg = signatureBox(comp, fmt, ctx);
  if (sg) {
    ctx.globalAlpha = 0.85; ctx.fillStyle = comp.branding.color; ctx.textAlign = sg.align; ctx.textBaseline = "middle";
    ctx.font = sg.font;
    ctx.fillText(sg.text, sg.x, sg.y);
    ctx.globalAlpha = 1;
  }
  if (env.pageLabel) {
    const pb = pageLabelBox(comp, fmt, ctx, env.pageLabel);
    ctx.globalAlpha = 0.85; ctx.fillStyle = comp.branding.color; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = pb.font;
    ctx.fillText(pb.text, pb.x, pb.y);
    ctx.globalAlpha = 1;
  }
}
/** Carousel numbering ("2/5"): right-aligned in the top margin, above the text rect. Validated by checkCarousel. */
export const PAGE_LABEL_PX = 28;
export function pageLabelBox(comp, fmt, ctx, text) {
  const side = (fmt.safe?.side ?? 0.06) * fmt.w, size = PAGE_LABEL_PX;
  const font = `600 ${size}px ${FONT_FAMILY["noto-sans"]}`;
  ctx.font = font;
  const w = ctx.measureText(text).width, x = fmt.w - side, y = Math.round((fmt.h * (fmt.safe?.top ?? 0.08)) / 2);
  return { text, font, size, x, y, w, left: x - w, right: x, top: y - size / 2, bottom: y + size / 2 };
}

export function drawFrame(ctx, comp, tMs, { w, assets = {}, still = false, scene: forced = null, minSize = defaultMinSize(comp.format), pageLabel = null, fxTrace = null, fxReport = null } = {}) {
  const fmt = FORMATS[comp.format] || FORMATS.reel;
  w = w || fmt.w; // the height follows from the format's aspect ratio (scale is w / fmt.w on both axes)
  ctx.save(); ctx.scale(w / fmt.w, w / fmt.w);
  const env = { comp, fmt, W: fmt.w, H: fmt.h, tMs, still, assets, forced, minSize, pageLabel, total: compDuration(comp), rect: textRect(comp, fmt, ctx),
    // material (materials.js): [] unless comp.material selects a preset; fxTrace/fxReport are for fx/verify.js only
    plan: materialPlan(comp), intensity: effectiveIntensity(comp), seed: comp.material?.seed ?? 1, fxTrace, fxReport };

  layerBg(ctx, env);
  const under = layerMaterial(ctx, env) + layerAtmosphere(ctx, env) + layerElements(ctx, env);
  if (under) resetTextState(ctx);
  layerText(ctx, env);
  if (layerSurface(ctx, env)) resetTextState(ctx);
  layerSignature(ctx, env);
  ctx.restore();
}

/**
 * Poster cards. Selected scenes (poster.sceneIds, or all poem scenes) are packed into cards without ever shrinking
 * text below POSTER_MIN. mode "single": one card, `overflow:true` when the selection cannot fit legibly.
 */
export const POSTER_MIN = 46;
export function posterCards(ctx, comp) {
  const fmt = FORMATS.poster;
  const pc = { ...comp, format: "poster" };
  const rect = textRect(pc, fmt);
  const ids = comp.poster.sceneIds, chosen = comp.scenes.filter((s) => s.kind !== "title" && (!ids.length || ids.includes(s.id)));
  const fit = (lines) => layoutScene(ctx, pc, { lines, scale: 1 }, rect, { minSize: POSTER_MIN }).fits;
  // A stanza gap goes between scenes only where the SOURCE has a stanza boundary. Consecutive parts of one split stanza
  // join with no gap; scenes without stanza metadata (legacy) keep the old always-gap behaviour.
  const sameStanza = (a, b) => a.stanza != null && b.stanza != null && a.stanza === b.stanza && a.part != null && b.part === a.part + 1;
  const withGaps = (group) => group.flatMap((s, i) => (i && !sameStanza(group[i - 1], s) ? ["", ...s.lines] : s.lines));
  if (!chosen.length) return { cards: [], overflow: false };
  if (comp.poster.mode === "single") {
    const lines = withGaps(chosen);
    return { cards: [{ lines }], overflow: !fit(lines) };
  }
  const cards = []; let cur = [];
  for (const s of chosen) {
    if (cur.length && !fit(withGaps([...cur, s]))) { cards.push({ lines: withGaps(cur) }); cur = []; }
    cur.push(s);
  }
  if (cur.length) cards.push({ lines: withGaps(cur) });
  return { cards, overflow: cards.some((c) => !fit(c.lines)) };
}

/**
 * Source-aware validation of ONE scene exactly as drawFrame would draw it: every source line must be drawn by rows whose
 * source ranges reproduce it, and every row must sit inside the canvas, the format's safe area and clear of the signature.
 * Pass a measuring ctx. Returns the structured result shared with the Full-Poem validator.
 */
export function validateScene(ctx, comp, scene, { minSize = defaultMinSize(comp.format), label = "scene", mutate = null, enforceMin = false } = {}) {
  const fmt = FORMATS[comp.format] || FORMATS.reel, W = fmt.w, H = fmt.h, st = comp.style;
  const rect = textRect(comp, fmt, ctx);
  // `mutate` (negative controls only) transforms a COPY of the layout before it is checked, proving the checks bite.
  const lay0 = layoutScene(ctx, comp, scene, rect, { minSize });
  const lay = mutate ? mutate(structuredClone(lay0)) || lay0 : lay0;
  const r = newResult();
  scene.lines.forEach((ln, i) => {
    if (ln === "") return;
    classifyInto(r, `${label}, line ${i + 1} ${JSON.stringify(String(ln).slice(0, 60))}`, ln, lay.rows.filter((x) => !x.gap && x.srcLine === i));
  });
  // no drawn row may claim a line that is not in the scene
  if (lay.rows.some((x) => !x.gap && !(typeof scene.lines[x.srcLine] === "string" && scene.lines[x.srcLine] !== ""))) note(r, "orderIssues", `${label}: a row draws text that is not a line of this scene`);
  if (!lay.fits) note(r, "outOfBounds", `${label}: the text does not fit the safe area at ${lay.size}px`);
  // A size BELOW the recommended size is the author's choice: it is advisory only (sizeAdvice), never a failure. What
  // must never happen is text resolving below what the author chose (or the technical minimum): that is a defect.
  const want = shrinkFloor(minSize, Math.round(st.sizePx * (scene.scale || 1)));
  if ((comp.format !== "poster" || enforceMin) && lay.size < want) note(r, "outOfBounds", `${label}: text is ${lay.size}px, below the ${want}px it should be drawn at`);
  const align = scene.align || st.align;
  const ax = align === "left" ? rect.x : align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
  const shift = ((scene.offsetY || 0) / 100) * rect.h;
  let y = st.vAlign === "top" ? rect.y : st.vAlign === "bottom" ? rect.y + rect.h - lay.total : rect.y + (rect.h - lay.total) / 2;
  y = Math.max(rect.y, Math.min(rect.y + rect.h - lay.total, y + shift));
  const sg = signatureBox(comp, fmt, ctx);
  signatureBoundsIssues(comp, fmt, ctx).forEach((m) => note(r, "outOfBounds", `${label}: ${m}`));
  for (const row of lay.rows) {
    const top = y; y += row.h;
    if (row.gap) continue;
    const where = `${label}, ${JSON.stringify(String(row.text).slice(0, 40))}`;
    const bad = checkX(rowExtent(align, rowAnchor(align, ax, row.indentPx), row.w), W, rect.x, rect.x + rect.w);
    if (bad) note(r, "outOfBounds", `${where} is ${bad}`);
    if (row.w > lay.maxW + TOLERANCE) note(r, "outOfBounds", `${where} is wider than the text column`);
    if (top < rect.y - TOLERANCE || y > rect.y + rect.h + TOLERANCE || top < -TOLERANCE || y > H + TOLERANCE) note(r, "outOfBounds", `${where} is outside the safe area vertically`);
    if (overlapsSignature(sg, top, y, TOLERANCE)) note(r, "outOfBounds", `${where} overlaps the signature`);
  }
  r.partial = !lay.fits;
  r.ok = r.messages.length === 0 && !r.partial;
  return r;
}

/** Validate every scene a route will draw. `scenes` defaults to comp.scenes. Returns {ok, results, messages}. */
export function validateScenes(ctx, comp, scenes = comp.scenes, opts = {}) {
  const messages = [], results = [];
  scenes.forEach((sc, i) => {
    const res = validateScene(ctx, comp, sc, { ...opts, label: `Scene ${i + 1}` });
    results.push(res);
    messages.push(...res.messages);
  });
  return { ok: messages.length === 0, results, messages };
}
