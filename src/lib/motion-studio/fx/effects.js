// Built-in material effects. Procedural only (self-generated, CC0): no images, no photographic textures, no fonts.
// Every effect is seeded (p.rng / p.staticRng come from comp.material.seed + effect + frame index) and draws through
// the guarded context (fx/guard.js). Under-text effects use p.away() (moves the background AWAY from the text colour,
// which can only raise contrast) or p.tint()/p.toward() (alpha clamped to the contrast-safe budget). Over-text
// (surface) effects are registered with maxAlpha <= SURFACE_CAP and draw non-overlapping dots, so the opacity over any
// text pixel never exceeds the cap.
import { defineEffect } from "./registry.js";

const TAU = Math.PI * 2;
const a3 = (x) => Math.max(0, Math.min(1, x));

/** Sparse non-overlapping dots: one optional dot per grid cell, fully inside that cell. */
function dots(
  ctx,
  W,
  H,
  p,
  { cell, prob, maxSize, amax, light = "#ffffff", dark = "#000000" },
) {
  const k = 0.35 + 0.65 * p.k;
  for (let y = 0; y < H; y += cell)
    for (let x = 0; x < W; x += cell) {
      if (p.rng() > prob) continue;
      const s = 1 + Math.floor(p.rng() * maxSize),
        ox = Math.floor(p.rng() * (cell - s)),
        oy = Math.floor(p.rng() * (cell - s));
      ctx.fillStyle = p.rng() > 0.5 ? light : dark;
      ctx.globalAlpha = a3(k * (0.55 + 0.45 * p.rng())) * amax;
      ctx.fillRect(x + ox, y + oy, s, s);
    }
}

export const FILM_GRAIN = defineEffect({
  id: "film-grain",
  label: "Film grain",
  layer: "surface",
  maxAlpha: 0.1,
  animated: true,
  draw(ctx, { W, H }, p) {
    dots(ctx, W, H, p, { cell: 12, prob: 0.09, maxSize: 3, amax: 0.1 });
  },
});

export const FINE_NOISE = defineEffect({
  id: "fine-noise",
  label: "Fine noise",
  layer: "surface",
  maxAlpha: 0.07,
  animated: true,
  draw(ctx, { W, H }, p) {
    dots(ctx, W, H, p, { cell: 8, prob: 0.06, maxSize: 1, amax: 0.07 });
  },
});

export const PAPER_FIBRE = defineEffect({
  id: "paper-fibre",
  label: "Paper fibre",
  layer: "material",
  maxAlpha: 0.6,
  animated: false,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      n = Math.round((p.params.count || 260) * (0.5 + 0.5 * p.k)),
      weave = !!p.params.weave;
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = r() * W,
        y = r() * H,
        len = 10 + r() * (weave ? 46 : 26);
      const ang = weave
        ? (r() > 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.08
        : r() * TAU;
      const dx = Math.cos(ang) * len,
        dy = Math.sin(ang) * len,
        bend = (r() - 0.5) * 8;
      ctx.lineWidth = 0.8 + r() * 1.1;
      const s = 0.18 + 0.32 * r();
      ctx.strokeStyle = r() > 0.45 ? p.away(s * p.k) : p.toward(s * p.k);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + dx / 2 + bend,
        y + dy / 2 - bend,
        x + dx,
        y + dy,
      );
      ctx.stroke();
    }
  },
});

export const PAPER_MOTTLE = defineEffect({
  id: "paper-mottle",
  label: "Paper texture",
  layer: "material",
  maxAlpha: 0.5,
  animated: false,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      n = p.params.count || 9,
      size = p.params.size || 1;
    for (let i = 0; i < n; i++) {
      const x = r() * W,
        y = r() * H,
        rad = (0.18 + r() * 0.28) * Math.max(W, H) * size,
        s = (0.25 + 0.35 * r()) * p.k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const c0 = i % 2 ? p.away(s) : p.toward(s);
      g.addColorStop(0, c0);
      g.addColorStop(1, i % 2 ? p.away(0) : p.toward(0));
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  },
});

export const INK_BLEED = defineEffect({
  id: "ink-bleed",
  label: "Ink bleed",
  layer: "material",
  maxAlpha: 0.75,
  animated: false,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      strength = (p.params.strength || 0.6) * p.k,
      m = Math.max(W, H);
    const g = ctx.createRadialGradient(
      W / 2,
      H / 2,
      m * 0.32,
      W / 2,
      H / 2,
      m * 0.78,
    );
    g.addColorStop(0, p.away(0));
    g.addColorStop(1, p.away(strength));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // a few soft blots that bleed in from the corners
    for (let i = 0; i < 6; i++) {
      const cx = (i % 2 ? W : 0) + (r() - 0.5) * W * 0.3,
        cy = i < 2 ? 0 : i < 4 ? H : r() * H,
        rad = m * (0.08 + r() * 0.12);
      const b = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      b.addColorStop(0, p.away(strength * 0.7));
      b.addColorStop(1, p.away(0));
      ctx.fillStyle = b;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  },
});

export const BOKEH = defineEffect({
  id: "bokeh",
  label: "Bokeh",
  layer: "atmosphere",
  maxAlpha: 0.6,
  animated: true,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      n = p.params.count || 12,
      hex = p.params.color || "#ffe9c4";
    for (let i = 0; i < n; i++) {
      const bx = r() * W,
        by = r() * H,
        rad = 30 + r() * 90,
        sp = 0.2 + r() * 0.5,
        ph = r() * TAU;
      const x = bx + Math.sin(p.t * sp + ph) * 24,
        y = by + Math.cos(p.t * sp * 0.7 + ph) * 18;
      const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
      g.addColorStop(0, p.tint(hex, 0.5 * p.k));
      g.addColorStop(1, p.tint(hex, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
    }
  },
});

export const DUST = defineEffect({
  id: "dust",
  label: "Dust",
  layer: "atmosphere",
  maxAlpha: 0.7,
  animated: true,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      n = p.params.count || 70,
      hex = p.params.color || "#f4efe4";
    for (let i = 0; i < n; i++) {
      const x0 = r() * W,
        y0 = r() * H,
        sp = 6 + r() * 22,
        rad = 0.8 + r() * 2.4,
        ph = r() * TAU;
      const y = (((y0 - p.t * sp) % H) + H) % H,
        x = x0 + Math.sin(p.t * 0.6 + ph) * 12;
      ctx.fillStyle = p.tint(hex, (0.4 + 0.6 * r()) * p.k);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
    }
  },
});

export const LIGHT_LEAK = defineEffect({
  id: "light-leak",
  label: "Light leak",
  layer: "atmosphere",
  maxAlpha: 0.6,
  animated: true,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      hex = p.params.color || "#ff9a5a",
      m = Math.max(W, H);
    for (let i = 0; i < 2; i++) {
      const cx = i ? W * (0.85 + r() * 0.2) : W * (-0.05 + r() * 0.15),
        cy = i ? H * (0.75 + r() * 0.3) : H * (-0.05 + r() * 0.2);
      const pulse = 0.75 + 0.25 * Math.sin(p.t * 0.5 + i * 2);
      const rad = m * (0.35 + r() * 0.2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, p.tint(hex, 0.55 * p.k * pulse));
      g.addColorStop(1, p.tint(hex, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  },
});

export const RAIN_STREAK = defineEffect({
  id: "rain-streak",
  label: "Rain streaks",
  layer: "atmosphere",
  maxAlpha: 0.6,
  animated: true,
  draw(ctx, { W, H }, p) {
    const r = p.staticRng,
      n = p.params.count || 60,
      hex = p.params.color || "#cfe3f5";
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = r() * W,
        y0 = r() * H,
        sp = 500 + r() * 700,
        len = 30 + r() * 50;
      const y = ((((y0 + p.t * sp) % (H + 120)) + H + 120) % (H + 120)) - 60;
      ctx.lineWidth = 1 + r() * 1.4;
      ctx.strokeStyle = p.tint(hex, (0.35 + 0.4 * r()) * p.k);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.18, y + len);
      ctx.stroke();
    }
  },
});

export const SOFT_GLOW = defineEffect({
  id: "soft-glow",
  label: "Soft glow",
  layer: "atmosphere",
  maxAlpha: 0.6,
  animated: false,
  draw(ctx, { W, H, rect }, p) {
    const hex = p.params.color || "#fff1d6",
      cx = rect ? rect.x + rect.w / 2 : W / 2,
      cy = rect ? rect.y + rect.h / 2 : H / 2;
    const rad = Math.max(W, H) * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, p.tint(hex, 0.45 * p.k));
    g.addColorStop(1, p.tint(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
});

export const GRADIENT_OVERLAY = defineEffect({
  id: "gradient-overlay",
  label: "Gradient overlay",
  layer: "atmosphere",
  maxAlpha: 0.6,
  animated: false,
  draw(ctx, { W, H }, p) {
    const g = ctx.createLinearGradient(0, 0, 0, H),
      s = (p.params.strength || 0.45) * p.k;
    g.addColorStop(0, p.away(s));
    g.addColorStop(0.45, p.away(0));
    g.addColorStop(0.7, p.away(0));
    g.addColorStop(1, p.away(s * 0.8));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
});

export const BUILTIN_EFFECTS = Object.freeze([
  FILM_GRAIN,
  FINE_NOISE,
  PAPER_FIBRE,
  PAPER_MOTTLE,
  INK_BLEED,
  BOKEH,
  DUST,
  LIGHT_LEAK,
  RAIN_STREAK,
  SOFT_GLOW,
  GRADIENT_OVERLAY,
]);
