// Full-Poem Vertical Poster: the ENTIRE poem (title, every stanza, every line, original order) on ONE image.
// Pure layout + a draw routine that reuses the renderer's background/vignette/grain so it matches Reel/Story looks.
// Rules: whole lines are only ever wrapped (never cut); text is never shrunk below MIN_READABLE; when a poem cannot
// fit legibly in the standard canvas the layout says so and can grow the canvas height instead of dropping content.
import { wrapLine } from "./graphemes.js";
import {
  FONT_FAMILY,
  paintBackground,
  paintVignette,
  paintGrain,
} from "./render.js";

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

function measureAt(ctx, comp, poem, preset, size) {
  const st = comp.style,
    family = FONT_FAMILY[st.font] || FONT_FAMILY["noto-serif"];
  const maxW = FULL_W * (1 - 2 * preset.side);
  const lh = size * preset.lh,
    items = [];
  const fontFor = (px, wt) => `${wt} ${px}px ${family}`;
  let y = 0;
  const wrap = (text, px, wt) => {
    ctx.font = fontFor(px, wt);
    return wrapLine(text, maxW, (x) => ctx.measureText(x).width);
  };
  if (hasTitle(poem)) {
    const tpx = Math.round(size * preset.titleScale),
      tlh = tpx * Math.min(1.5, preset.lh);
    const rows = wrap(poem.title.trim(), tpx, 700);
    rows.forEach((r) => {
      items.push({ kind: "title", text: r, px: tpx, wt: 700, y: y + tlh / 2 });
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
      y += lh * preset.gap;
      if (preset.ornament) {
        items.push({ kind: "rule", y: y - lh * preset.gap * 0.5, short: true });
      }
    }
    stanza.forEach((line, li) => {
      wrap(line, size, st.weight).forEach((r, ri) => {
        items.push({
          kind: "line",
          text: r,
          px: size,
          wt: st.weight,
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
  { preset: presetKey = "balanced", height = "standard" } = {},
) {
  const preset = PRESETS[presetKey] || PRESETS.balanced;
  const footer = comp.branding?.show && comp.branding?.signature ? 150 : 40;
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
      presetSize: preset.size,
      shrunk: size < preset.size,
      ...extra,
    };
  };
  // 1) standard canvas: largest size ≤ preset size that fits, never below MIN_READABLE
  let size = preset.size,
    std = null;
  for (; size >= MIN_READABLE; size -= 2) {
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
    const ext = layoutFullPoem(ctx, comp, poem, { preset: presetKey, height: "extended" });
    return { ...chosen(FULL_STD_H, MIN_READABLE), fits: false, neededAtMinimum: Math.ceil(frame(FULL_STD_H, MIN_READABLE).need), suggestedHeight: ext.height, suggestedSize: ext.size, suggestedFits: ext.fits };
  }
  // 2) extended canvas: keep the preset size, grow height up to FULL_MAX_H; shrink (not below minimum) only if even that is not enough
  for (let s = preset.size; s >= MIN_READABLE; s -= 2) {
    const f = frame(FULL_MAX_H, s);
    if (f.need <= FULL_MAX_H) {
      const H = Math.max(FULL_STD_H, Math.ceil(f.need / 10) * 10);
      return chosen(H, s, { extended: H > FULL_STD_H });
    }
  }
  return {
    ...chosen(FULL_MAX_H, MIN_READABLE),
    fits: false,
    extended: true,
    neededAtMinimum: Math.ceil(frame(FULL_MAX_H, MIN_READABLE).need),
  };
}

/** Every poem line (and the title) must be drawn: wrapped rows rejoined must equal the original text. */
export function fullPoemCoverage(poem, layout) {
  const rowsByLine = new Map();
  layout.items
    .filter((i) => i.kind === "line")
    .forEach((i) => {
      const k = `${i.stanza}:${i.line}`;
      rowsByLine.set(k, (rowsByLine.get(k) || []).concat(i.text));
    });
  // whitespace-insensitive: wrapping may break a very long word between graphemes, never alter or drop a character
  const norm = (s) => String(s).replace(/\s+/g, "");
  const missing = [];
  poem.stanzas.forEach((st, si) =>
    st.forEach((l, li) => {
      if (norm((rowsByLine.get(`${si}:${li}`) || []).join("")) !== norm(l))
        missing.push(l);
    }),
  );
  if (
    hasTitle(poem) &&
    norm(
      layout.items
        .filter((i) => i.kind === "title")
        .map((i) => i.text)
        .join(""),
    ) !== norm(poem.title)
  )
    missing.unshift(poem.title);
  return missing;
}

/** Paint a layout. `scale` multiplies the output pixel size (1 or 2). */
export function drawFullPoem(
  ctx,
  comp,
  layout,
  { assets = {}, scale = 1 } = {},
) {
  const W = FULL_W,
    H = layout.height,
    st = comp.style;
  ctx.save();
  ctx.scale(scale, scale);
  paintBackground(
    ctx,
    { ...comp, motion: { ...comp.motion, bgMotion: "none" } },
    W,
    H,
    0,
    1,
    assets,
  );
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
  for (const it of layout.items) {
    const y = layout.offset + it.y;
    if (it.kind === "rule") {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.globalAlpha = 0.5;
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
    ctx.font = `${it.wt} ${it.px}px ${family}`;
    ctx.fillText(it.text, ax, y);
  }
  ctx.shadowColor = "transparent";
  paintVignette(ctx, W, H, st.vignette);
  paintGrain(ctx, W, H, st.grain, 0);
  if (comp.branding?.show && comp.branding.signature) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = comp.branding.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 30px ${FONT_FAMILY["noto-sans"]}`;
    ctx.fillText(comp.branding.signature, W / 2, H - 70);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
