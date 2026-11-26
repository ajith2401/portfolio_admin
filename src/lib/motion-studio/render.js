// Deterministic frame renderer: drawFrame(ctx, comp, tMs, {w,h,fonts}) paints exactly one frame for time tMs.
// Same function drives the on-screen preview and the export, so preview == output. No randomness: particles are
// seeded from index so frames are reproducible.
import { classifyInto, newResult, note, rowExtent, checkX, TOLERANCE } from "./coverage.js";
import { wrapSpans, indentPx, lineIndent } from "./graphemes.js";
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

/** Draw `img` to cover the w×h box (centre-cropped), so a baked 9:16 background also fits a taller poster. */
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
export function paintBackground(ctx, c, w, h, tMs, totalMs, assets) {
  const st = c.style, p = clamp01(tMs / Math.max(1, totalMs)), k = c.motion.intensity;
  ctx.save();
  if (c.motion.bgMotion === "zoom") { const z = 1 + 0.06 * k * p; ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-w / 2, -h / 2); }
  if (c.motion.bgMotion === "drift") ctx.translate(-30 * k * p, -20 * k * p);
  if (assets.bg) drawCover(ctx, assets.bg, -30, -30, w + 60, h + 60);
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
 * Shrinks the font until the block fits but never below `minSize`; `fits:false` means it could not fit legibly.
 */
export function layoutScene(ctx, c, scene, rect, { minSize = 28 } = {}) {
  const st = c.style, family = FONT_FAMILY[st.font];
  const maxW = rect.w * (st.widthPct / 100);
  let size = Math.round(st.sizePx * (scene.scale || 1));
  for (let attempt = 0; attempt < 24; attempt++) {
    ctx.font = `${scene.kind === "title" ? 700 : st.weight} ${size}px ${family}`; // the weight drawFrame will paint with
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
    if (size <= minSize) return { rows, size, lh, total, maxW, fits: false };
    size = Math.max(minSize, Math.floor(size * 0.94));
  }
  return { rows: [], size, lh: size * st.lineHeight, total: 0, maxW, fits: false };
}

/** Anchor x of a row after its layout indent: left/right anchors move by the indent, a centred row by half of it. */
export const rowAnchor = (align, ax, ipx = 0) => (align === "left" ? ax + ipx : align === "right" ? ax - ipx : ax + ipx / 2);

export function drawFrame(ctx, comp, tMs, { w, h, assets = {}, still = false, scene: forced = null, minSize = 28 } = {}) {
  const fmt = FORMATS[comp.format] || FORMATS.reel;
  w = w || fmt.w; h = h || fmt.h;
  ctx.save(); ctx.scale(w / fmt.w, w / fmt.w);
  const W = fmt.w, H = fmt.h, st = comp.style, total = compDuration(comp);
  const rect = safeRect(W, H, fmt.safe);
  paintBackground(ctx, comp, W, H, still ? 0 : tMs, total, assets);
  if (!still) paintParticles(ctx, comp, W, H, tMs);
  const at = forced ? { scene: forced, index: 0, local: 1e6, last: true } : sceneAt(comp, tMs);
  if (at) {
    const sc = at.scene;
    const { rows, size, total: blockH } = layoutScene(ctx, comp, sc, rect, { minSize });
    const isTitle = sc.kind === "title";
    const align = sc.align || st.align;
    const fadeIn = still ? 1 : ease(at.local / 700);
    const fadeOut = still || at.last ? 1 : 1 - clamp01((at.local - (sc.durationMs - 500)) / 500);
    const shift = ((sc.offsetY || 0) / 100) * rect.h;
    let y = st.vAlign === "top" ? rect.y : st.vAlign === "bottom" ? rect.y + rect.h - blockH : rect.y + (rect.h - blockH) / 2;
    y = Math.max(rect.y, Math.min(rect.y + rect.h - blockH, y + shift));
    ctx.textBaseline = "middle"; ctx.textAlign = align;
    const ax = align === "left" ? rect.x : align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
    let i = 0;
    for (const r of rows) {
      const top = y; y += r.h;
      if (r.gap) continue;
      let a = fadeIn * fadeOut, dy = 0;
      if (!still) {
        if (comp.motion.textIn === "line") a = ease((at.local - r.line * 450) / 600) * fadeOut;
        else if (comp.motion.textIn === "rise") { const p = ease((at.local - i * 150) / 800); a = p * fadeOut; dy = (1 - p) * 40 * (0.4 + comp.motion.intensity); }
        else if (comp.motion.textIn === "none") a = fadeOut;
      } else a = 1;
      ctx.globalAlpha = clamp01(a);
      ctx.font = `${isTitle ? 700 : st.weight} ${size}px ${FONT_FAMILY[st.font]}`;
      if (st.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3; } else ctx.shadowColor = "transparent";
      ctx.fillStyle = st.color;
      ctx.fillText(r.text, rowAnchor(align, ax, r.indentPx), top + r.h / 2 + dy);
      i++;
    }
    ctx.globalAlpha = 1; ctx.shadowColor = "transparent";
  }
  paintVignette(ctx, W, H, st.vignette);
  paintGrain(ctx, W, H, st.grain, still ? 0 : tMs);
  if (comp.branding.show && comp.branding.signature) {
    ctx.globalAlpha = 0.85; ctx.fillStyle = comp.branding.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `500 30px ${FONT_FAMILY["noto-sans"]}`;
    ctx.fillText(comp.branding.signature, W / 2, H * (comp.format === "poster" ? 0.955 : 0.8));
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * Poster cards. Selected scenes (poster.sceneIds, or all poem scenes) are packed into cards without ever shrinking
 * text below POSTER_MIN. mode "single": one card, `overflow:true` when the selection cannot fit legibly.
 */
export const POSTER_MIN = 46;
export function posterCards(ctx, comp) {
  const fmt = FORMATS.poster, rect = safeRect(fmt.w, fmt.h, fmt.safe);
  const pc = { ...comp, format: "poster" };
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
export function validateScene(ctx, comp, scene, { minSize = 28, label = "scene" } = {}) {
  const fmt = FORMATS[comp.format] || FORMATS.reel, W = fmt.w, H = fmt.h, st = comp.style;
  const rect = safeRect(W, H, fmt.safe);
  const lay = layoutScene(ctx, comp, scene, rect, { minSize });
  const r = newResult();
  scene.lines.forEach((ln, i) => {
    if (ln === "") return;
    classifyInto(r, `${label}, line ${i + 1} ${JSON.stringify(String(ln).slice(0, 60))}`, ln, lay.rows.filter((x) => !x.gap && x.srcLine === i));
  });
  if (!lay.fits) note(r, "outOfBounds", `${label}: the text does not fit the safe area at ${lay.size}px`);
  const align = scene.align || st.align;
  const ax = align === "left" ? rect.x : align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
  const shift = ((scene.offsetY || 0) / 100) * rect.h;
  let y = st.vAlign === "top" ? rect.y : st.vAlign === "bottom" ? rect.y + rect.h - lay.total : rect.y + (rect.h - lay.total) / 2;
  y = Math.max(rect.y, Math.min(rect.y + rect.h - lay.total, y + shift));
  const sigY = H * (comp.format === "poster" ? 0.955 : 0.8);
  const sigTop = comp.branding?.show && comp.branding.signature ? sigY - 15 : Infinity;
  for (const row of lay.rows) {
    const top = y; y += row.h;
    if (row.gap) continue;
    const where = `${label}, ${JSON.stringify(String(row.text).slice(0, 40))}`;
    const bad = checkX(rowExtent(align, rowAnchor(align, ax, row.indentPx), row.w), W, rect.x, rect.x + rect.w);
    if (bad) note(r, "outOfBounds", `${where} is ${bad}`);
    if (row.w > lay.maxW + TOLERANCE) note(r, "outOfBounds", `${where} is wider than the text column`);
    if (top < rect.y - TOLERANCE || y > rect.y + rect.h + TOLERANCE || top < -TOLERANCE || y > H + TOLERANCE) note(r, "outOfBounds", `${where} is outside the safe area vertically`);
    if (y > sigTop + TOLERANCE) note(r, "outOfBounds", `${where} overlaps the signature`);
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
