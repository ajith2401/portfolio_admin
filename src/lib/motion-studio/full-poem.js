// Full-Poem Vertical Poster: the ENTIRE poem (title, every stanza, every line, original order) on ONE image.
// Pure layout + a draw routine that reuses the renderer's background/vignette/grain so it matches Reel/Story looks.
// Rules: whole lines are only ever wrapped (never cut); text is never shrunk below MIN_READABLE; when a poem cannot
// fit legibly in the standard canvas the layout says so and can grow the canvas height instead of dropping content.
import { wrapSpans, lineIndent, indentPx } from "./graphemes.js";
import { classifyInto, newResult, rowExtent, checkX, TOLERANCE } from "./coverage.js";
import {
  FONT_FAMILY,
  paintBackground,
  paintVignette,
  paintGrain,
  paintParticles,
  resetTextState,
} from "./render.js";
import { runMaterial } from "./fx/registry.js";
import { paintTextures } from "./textures.js";
import { paintElements } from "./elements.js";
import { materialPlan, effectiveIntensity } from "./materials.js";
import { signatureBox as sigBox, boxBoundsIssues, overlapsSignature } from "./signature.js";

export const FULL_W = 1080;
export const FULL_STD_H = 1920;
export const FULL_MAX_H = 5400; // 1080×5400 = 5.8 MP; keeps 1× export inside every mobile canvas limit
export const MIN_READABLE = 40; // px on the 1080-wide canvas ≈ 3.7 % of width; below this we refuse to shrink
export const GOOD_READABLE = 46;
const MAX_CANVAS_PIXELS = 16_000_000; // iOS Safari canvas ceiling is ~16.7 MP

export const PRESETS = Object.freeze({
  elegant: {
    label: "Elegant",
    note: "Generous whitespace",
    size: 56,
    lh: 1.95,
    gap: 1.3,
    titleScale: 1.35,
    top: 0.1,
    bottom: 0.1,
    side: 0.12,
  },
  balanced: {
    label: "Balanced",
    note: "Regular literary page",
    size: 50,
    lh: 1.75,
    gap: 1.0,
    titleScale: 1.3,
    top: 0.08,
    bottom: 0.09,
    side: 0.09,
  },
  compact: {
    label: "Compact",
    note: "Fits longer poems",
    size: 44,
    lh: 1.5,
    gap: 0.7,
    titleScale: 1.2,
    top: 0.05,
    bottom: 0.07,
    side: 0.07,
  },
  expressive: {
    label: "Expressive",
    note: "Large title, clear stanza hierarchy",
    size: 52,
    lh: 1.8,
    gap: 1.15,
    titleScale: 1.8,
    top: 0.09,
    bottom: 0.1,
    side: 0.09,
    ornament: true,
  },
});

/** Poem as drawn: optional title + stanzas. `poem.title` may be empty. */
const hasTitle = (poem) => !!String(poem?.title || "").trim();
const EXTRA_BLANK_UNIT = 0.6; // each intentional blank line beyond the one that separates stanzas adds 0.6 line heights
const MAX_EXTRA_BLANK = 3;
const extraBlanks = (poem, si) => Math.min(MAX_EXTRA_BLANK, Math.max(0, (Number(poem?.blank?.[si]) || 1) - 1));

const fullFmt = (H) => ({ w: FULL_W, h: H, safe: { side: 0.09 }, full: true });
/** Signature box on the full-poem canvas: bottom-anchored (yPct is a Reel/Story/Poster control), size/align/show from branding. */
const signatureBox = (ctx, comp, H) => sigBox(comp, fullFmt(H), ctx);
/** Footer reserved for the signature: 150 for the legacy 30px, growing with the configured size; 40 when hidden. */
const footerFor = (comp) => (comp.branding?.show && comp.branding?.signature ? 120 + sigBox(comp, fullFmt(FULL_STD_H)).size : 40);

function measureAt(ctx, comp, poem, preset, size) {
  const st = comp.style,
    family = FONT_FAMILY[st.font] || FONT_FAMILY["noto-serif"],
    titleFamily = (st.titleFont && FONT_FAMILY[st.titleFont]) || family,
    align = st.align;
  const maxW = FULL_W * (1 - 2 * preset.side);
  const lh = size * preset.lh,
    items = [];
  const fontFor = (px, wt, fam = family) => `${wt} ${px}px ${fam}`;
  const ax = align === "left" ? FULL_W * preset.side : align === "right" ? FULL_W * (1 - preset.side) : FULL_W / 2;
  const measureAtFont = (px, wt, fam) => {
    ctx.font = fontFor(px, wt, fam);
    return (x) => ctx.measureText(x).width;
  };
  let y = 0;
  if (hasTitle(poem)) {
    const title = poem.title.trim();
    const tpx = Math.round(size * preset.titleScale),
      tlh = tpx * Math.min(1.5, preset.lh);
    const measure = measureAtFont(tpx, 700, titleFamily);
    wrapSpans(title, maxW, measure, 0).forEach((r, ri) => {
      items.push({ kind: "title", text: r.text, start: r.start, end: r.end, wrapRow: ri, px: tpx, wt: 700, x: ax, w: measure(r.text), rowH: tlh, y: y + tlh / 2 });
      y += tlh;
    });
    y += size * (preset.ornament ? 0.5 : 0.9);
    if (preset.ornament) {
      items.push({ kind: "rule", y });
      y += size * 1.1;
    }
  }
  poem.stanzas.forEach((stanza, si) => {
    if (si > 0) {
      y += lh * preset.gap + extraBlanks(poem, si) * lh * EXTRA_BLANK_UNIT;
      if (preset.ornament) {
        items.push({ kind: "rule", y: y - lh * preset.gap * 0.5, short: true });
      }
    }
    stanza.forEach((line, li) => {
      const measure = measureAtFont(size, st.weight);
      const ind = lineIndent(line);
      const ipx = indentPx(line, measure, maxW);
      const x = align === "left" ? ax + ipx : align === "right" ? ax - ipx : ax + ipx / 2;
      wrapSpans(line, maxW - ipx, measure, ind.len).forEach((r, ri) => {
        items.push({
          kind: "line",
          text: r.text,
          start: r.start,
          end: r.end,
          px: size,
          wt: st.weight,
          x,
          w: measure(r.text),
          indentPx: ipx,
          rowH: lh,
          y: y + lh / 2,
          stanza: si,
          line: li,
          wrapRow: ri,
        });
        y += lh;
      });
    });
  });
  return { items, contentH: y, lh, maxW };
}

/**
 * @param {CanvasRenderingContext2D} ctx measuring context
 * @param {object} comp composition (style.font/weight/color/align, branding)
 * @param {{title?:string, stanzas:string[][]}} poem
 * @param {{preset?:string, height?:"standard"|"extended"}} [opts]
 */
export function layoutFullPoem(
  ctx,
  comp,
  poem,
  { preset: presetKey = "balanced", height = "standard", tune = null, min = MIN_READABLE } = {},
) {
  // tune: optional {size, lh, gap, side} from the Whole-Poem Video controls; min: the floor the size search stops at
  const preset = { ...(PRESETS[presetKey] || PRESETS.balanced), ...(tune || {}) };
  const footer = footerFor(comp);
  const frame = (H, size) => {
    const m = measureAt(ctx, comp, poem, preset, size);
    const padH = Math.min(H, FULL_STD_H); // margins stay constant in px on extended canvases
    const top = padH * preset.top,
      bottomPad = padH * preset.bottom + footer;
    return { m, top, need: top + m.contentH + bottomPad, H };
  };
  const chosen = (H, size, extra = {}) => {
    const f = frame(H, size);
    const avail = H - f.top - (Math.min(H, FULL_STD_H) * preset.bottom + footer);
    const offset =
      f.need <= H ? f.top + Math.max(0, (avail - f.m.contentH) / 2) : f.top;
    const pixels = FULL_W * H;
    return {
      ok: true,
      fits: f.need <= H + 0.5,
      preset: presetKey,
      size,
      height: H,
      width: FULL_W,
      items: f.m.items,
      offset,
      requiredHeight: Math.ceil(f.need),
      maxScale: pixels * 4 <= MAX_CANVAS_PIXELS ? 2 : 1,
      level:
        size >= GOOD_READABLE
          ? "good"
          : size >= MIN_READABLE
            ? "small"
            : "tiny",
      footer,
      align: comp.style.align,
      side: preset.side,
      signature: signatureBox(ctx, comp, H),
      presetSize: preset.size,
      shrunk: size < preset.size,
      ...extra,
    };
  };
  // 1) standard canvas: largest size ≤ preset size that fits, never below MIN_READABLE
  let size = preset.size,
    std = null;
  for (; size >= min; size -= 2) {
    const f = frame(FULL_STD_H, size);
    if (f.need <= FULL_STD_H) {
      std = size;
      break;
    }
  }
  if (height === "standard") {
    if (std != null) return chosen(FULL_STD_H, std);
    // Cannot fit legibly in the standard canvas. Nothing is clipped or dropped: the layout reports fits:false (callers must
    // not export it) and says which canvas height and size would work.
    const ext = layoutFullPoem(ctx, comp, poem, { preset: presetKey, height: "extended", tune, min });
    return { ...chosen(FULL_STD_H, min), fits: false, neededAtMinimum: Math.ceil(frame(FULL_STD_H, min).need), suggestedHeight: ext.height, suggestedSize: ext.size, suggestedFits: ext.fits };
  }
  // 2) extended canvas: keep the preset size, grow height up to FULL_MAX_H; shrink (not below minimum) only if even that is not enough
  for (let s = preset.size; s >= min; s -= 2) {
    const f = frame(FULL_MAX_H, s);
    if (f.need <= FULL_MAX_H) {
      const H = Math.max(FULL_STD_H, Math.ceil(f.need / 10) * 10);
      return chosen(H, s, { extended: H > FULL_STD_H });
    }
  }
  return {
    ...chosen(FULL_MAX_H, min),
    fits: false,
    extended: true,
    neededAtMinimum: Math.ceil(frame(FULL_MAX_H, min).need),
  };
}

const lineLabel = (si, li, text) => `stanza ${si + 1}, line ${li + 1}: ${JSON.stringify(String(text).slice(0, 60))}`;

/**
 * Source-aware, bounds-aware validation of a full-poem layout against the SOURCE poem.
 * Every source line is compared with the rows that claim it (source ranges, exact text, no normalisation), stanza
 * boundaries and row order are checked, and every row is checked against the canvas, safe margins and footer.
 */
export function validateFullPoem(poem, layout) {
  const r = newResult();
  const add = (list, msg) => { list.push(msg); r.messages.push(msg); };
  const items = layout.items || [];
  const W = layout.width || FULL_W, H = layout.height, align = layout.align || "center";
  const side = (layout.side ?? 0.09) * W;
  const rowsOf = (kind, si, li) => items.filter((i) => i.kind === kind && (kind === "title" || (i.stanza === si && i.line === li)));
  const classify = (label, src, rows) => classifyInto(r, label, src, rows);
  if (hasTitle(poem)) classify("title", poem.title.trim(), rowsOf("title"));
  poem.stanzas.forEach((st, si) => st.forEach((l, li) => classify(lineLabel(si, li, l), l, rowsOf("line", si, li))));
  // no row may claim a line that is not in the poem
  items.filter((i) => i.kind === "line").forEach((i) => {
    if (!poem.stanzas[i.stanza] || poem.stanzas[i.stanza][i.line] == null) add(r.stanzaIssues, `row for unknown stanza ${i.stanza + 1}, line ${i.line + 1}`);
  });
  // drawing order = source order, y strictly increasing
  const text = items.filter((i) => i.kind === "line" || i.kind === "title");
  for (let k = 1; k < text.length; k++) {
    const a = text[k - 1], b = text[k];
    if (!(b.y > a.y)) add(r.orderIssues, `rows are not in drawing order near ${JSON.stringify(String(b.text).slice(0, 40))}`);
    if (a.kind === "line" && b.kind === "line" && (b.stanza < a.stanza || (b.stanza === a.stanza && b.line < a.line)))
      add(r.orderIssues, `rows are out of source order near ${lineLabel(b.stanza, b.line, b.text)}`);
  }
  // stanza boundaries: a stanza gap is strictly larger than the pitch between lines inside a stanza
  for (let k = 1; k < text.length; k++) {
    const a = text[k - 1], b = text[k];
    if (a.kind !== "line" || b.kind !== "line") continue;
    const pitch = b.y - a.y;
    if (b.stanza !== a.stanza && !(pitch > a.rowH + 0.5)) add(r.stanzaIssues, `no visible gap before stanza ${b.stanza + 1}`);
    if (b.stanza === a.stanza && pitch > a.rowH + 0.5) add(r.stanzaIssues, `unexpected gap inside stanza ${b.stanza + 1}`);
  }
  // bounds
  const footer = layout.footer ?? 40;
  for (const i of text) {
    const label = i.kind === "title" ? "title" : lineLabel(i.stanza, i.line, i.text);
    if (!(i.w >= 0) || !Number.isFinite(i.w)) { add(r.outOfBounds, `${label}: row has no measured width`); continue; }
    const bad = checkX(rowExtent(align, i.x, i.w), W, side, W - side);
    if (bad) add(r.outOfBounds, `${label} is ${bad}`);
    const top = layout.offset + i.y - i.rowH / 2, bot = layout.offset + i.y + i.rowH / 2;
    if (top < -TOLERANCE || bot > H + TOLERANCE) add(r.outOfBounds, `${label} is outside the canvas vertically`);
    else if (bot > H - footer + TOLERANCE) add(r.outOfBounds, `${label} overlaps the footer area`);
  }
  if (layout.signature) {
    const sg = layout.signature;
    boxBoundsIssues(sg, fullFmt(H), "poster").forEach((m) => add(r.outOfBounds, m));
    // every row (not just the last one) must be clear of the signature box
    if (text.some((i) => overlapsSignature(sg, layout.offset + i.y - i.rowH / 2, layout.offset + i.y + i.rowH / 2, TOLERANCE))) add(r.outOfBounds, "signature overlaps the poem");
  }
  r.partial = !layout.fits || !!poem.partial;
  if (r.partial) r.messages.push("the layout is partial");
  r.ok = !r.partial && r.messages.length === 0;
  return r;
}

/** Compatibility wrapper: the source lines (and title) that are not drawn exactly, as a list. Empty = complete. */
export function fullPoemCoverage(poem, layout) {
  const v = validateFullPoem(poem, layout);
  const bad = [...v.missingLines, ...v.textDiffs, ...v.whitespaceDiffs, ...v.orderIssues];
  return bad.length ? bad : [];
}

/** Paint a layout. `scale` multiplies the output pixel size (1 or 2). */
export function drawFullPoem(
  ctx,
  comp,
  layout,
  { assets = {}, scale = 1, fxTrace = null, fxReport = null, anim = null } = {},
) {
  // anim (Whole-Poem Video only): { bgMs, fxMs, total, motionK, textAlpha }. The POEM never moves: only the background,
  // textures, materials and particles take time; textAlpha is the optional opening/closing fade. null = the still poster.
  const W = FULL_W,
    H = layout.height,
    st = comp.style,
    still = !anim;
  const fxMs = still ? 0 : anim.fxMs;
  // material layers (materials.js): no-ops unless comp.material selects a preset. Same guard/isolation as drawFrame.
  const fxEnv = { comp, W, H, tMs: fxMs, still, assets, rect: { x: 0, y: 0, w: W, h: H }, plan: materialPlan(comp), intensity: effectiveIntensity(comp), seed: comp.material?.seed ?? 1, fxTrace, fxReport };
  ctx.save();
  ctx.scale(scale, scale);
  paintBackground(
    ctx,
    still
      ? { ...comp, motion: { ...comp.motion, bgMotion: "none" } }
      : { ...comp, motion: { ...comp.motion, intensity: (comp.motion.intensity ?? 1) * anim.motionK } },
    W,
    H,
    still ? 0 : anim.bgMs,
    still ? 1 : anim.total,
    assets,
  );
  const atm = still ? 0 : paintParticles(ctx, comp, W, H, fxMs, anim.motionK);
  if (atm + paintTextures(ctx, fxEnv) + runMaterial("material", ctx, fxEnv) + runMaterial("atmosphere", ctx, fxEnv) + paintElements(ctx, comp, W, H, fxMs, { still: still || !anim.motionK })) resetTextState(ctx);
  const textAlpha = still ? 1 : Math.max(0, Math.min(1, anim.textAlpha ?? 1));
  const align = st.align,
    side = (PRESETS[layout.preset] || PRESETS.balanced).side;
  const ax =
    align === "left" ? W * side : align === "right" ? W * (1 - side) : W / 2;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = st.color;
  if (st.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
  }
  const family = FONT_FAMILY[st.font] || FONT_FAMILY["noto-serif"];
  const titleFamily = (st.titleFont && FONT_FAMILY[st.titleFont]) || family;
  for (const it of layout.items) {
    const y = layout.offset + it.y;
    if (it.kind === "rule") {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.globalAlpha = 0.5 * textAlpha;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = 3;
      const len = it.short ? 56 : 120,
        x0 =
          align === "left" ? ax : align === "right" ? ax - len : ax - len / 2;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + len, y);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.font = `${it.wt} ${it.px}px ${it.kind === "title" ? titleFamily : family}`;
    if (textAlpha < 1) ctx.globalAlpha = textAlpha;
    ctx.fillText(it.text, it.x ?? ax, y);
  }
  if (textAlpha < 1) ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  paintVignette(ctx, W, H, st.vignette);
  paintGrain(ctx, W, H, st.grain, fxMs);
  if (runMaterial("surface", ctx, fxEnv)) resetTextState(ctx);
  const sg = signatureBox(ctx, comp, H);

  if (sg) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = comp.branding.color;
    ctx.textAlign = sg.align;
    ctx.textBaseline = "middle";
    ctx.font = sg.font;
    ctx.fillText(sg.text, sg.x, sg.y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
