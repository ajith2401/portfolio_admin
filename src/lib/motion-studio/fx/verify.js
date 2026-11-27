// Material verifier: proves, for the exact frames a route will draw, that a material never touches the poem text.
// For each frame it renders twice through a state-tracking context (no pixels, no fonts: widths come from the route's
// measuring ctx) — once without the material, once with it — and checks:
//   1. identity: every fillText (poem rows, title, signature, page label) is drawn with identical text, position, font,
//      colour, alpha, filter, compositing, shadow and transform;
//   2. guard: no effect violated its sandbox (fx/guard.js: alpha above cap, forbidden calls, unbalanced restore,
//      Math.random / Date);
//   3. over-text opacity: at sample points inside every drawn text box, the combined opacity of all surface ops is
//      <= SURFACE_CAP;
//   4. contrast: compositing every under-text op over the background model (fx/palette.js fxBases) keeps the text's
//      contrast >= min(4.5, the contrast it had without the material).
// Sampling is a dense grid over each text box plus the corner/centre of every op that touches it (exact for the
// non-overlapping dot effects; conservative bboxes elsewhere).
import { lum, ratio } from "../contrast.js";
import { SURFACE_CAP } from "./registry.js";
import { fxBases, floorFor } from "./palette.js";
import { parseColor } from "./guard.js";
import { materialActive, materialById } from "../materials.js";
import { textileById } from "../textiles.js";
import { textureById } from "../textures.js";

const ID = () => [1, 0, 0, 1, 0, 0];
/** A context that tracks state (save/restore stack, transform, styles) and records every fillText with that state. */
export function stateCtx(measureCtx) {
  let s = {
    globalAlpha: 1,
    filter: "none",
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    m: ID(),
  };
  const stack = [],
    texts = [];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const grad = () => ({ addColorStop() {} });
  const measure = (t) => {
    measureCtx.font = s.font;
    return measureCtx.measureText(t);
  };
  const target = {
    save: () => stack.push({ ...s, m: [...s.m] }),
    restore: () => {
      if (stack.length) s = stack.pop();
    },
    scale: (x, y) => {
      s.m = mul(s.m, [x, 0, 0, y, 0, 0]);
    },
    translate: (x, y) => {
      s.m = mul(s.m, [1, 0, 0, 1, x, y]);
    },
    rotate: (r) => {
      const c = Math.cos(r),
        n = Math.sin(r);
      s.m = mul(s.m, [c, n, -n, c, 0, 0]);
    },
    transform: (...a) => {
      s.m = mul(s.m, a);
    },
    setTransform: (...a) => {
      const v =
        a.length === 1 ? [a[0].a, a[0].b, a[0].c, a[0].d, a[0].e, a[0].f] : a;
      s.m = v.map(Number);
    },
    resetTransform: () => {
      s.m = ID();
    },
    getTransform: () => {
      const [a, b, c, d, e, f] = s.m;
      return { a, b, c, d, e, f };
    },
    measureText: measure,
    createLinearGradient: grad,
    createRadialGradient: grad,
    fillText: (t, x, y) => {
      const px = Number(/([\d.]+)px/.exec(s.font)?.[1] || 10);
      texts.push({
        t: String(t),
        x,
        y,
        w: measure(String(t)).width,
        px,
        font: s.font,
        fill: typeof s.fillStyle === "string" ? s.fillStyle : "gradient",
        alpha: s.globalAlpha,
        filter: s.filter,
        op: s.globalCompositeOperation,
        align: s.textAlign,
        baseline: s.textBaseline,
        shadow: [s.shadowColor, s.shadowBlur, s.shadowOffsetX, s.shadowOffsetY],
        m: [...s.m],
      });
    },
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : k in s ? s[k] : () => {}),
    set: (t, k, v) => {
      s[k] = v;
      return true;
    },
  });
  return { ctx, texts };
}

/** Device-space box of a recorded fillText (generous vertically). */
export function textBox(r) {
  const [a, , , d, e, f] = r.m,
    al = r.align === "start" ? "left" : r.align === "end" ? "right" : r.align;
  const x0 = al === "left" ? r.x : al === "right" ? r.x - r.w : r.x - r.w / 2;
  const y0 =
    r.baseline === "middle"
      ? r.y - r.px * 0.75
      : r.baseline === "top"
        ? r.y
        : r.y - r.px;
  const y1 =
    r.baseline === "middle"
      ? r.y + r.px * 0.75
      : r.baseline === "top"
        ? r.y + r.px * 1.3
        : r.y + r.px * 0.35;
  const X = [a * x0 + e, a * (x0 + r.w) + e],
    Y = [d * y0 + f, d * y1 + f];
  return [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)];
}

const lerp = (a, b, k) => a + (b - a) * k;
function paintAt(op, x, y) {
  const p = op.paint;
  if (!p.grad) return p;
  const g = p.grad,
    stops = [...g.stops].sort((m, n) => m.o - n.o);
  if (!stops.length) return { rgb: [0, 0, 0], a: 0 };
  const ux = (x - op.tf.tx) / op.tf.sx,
    uy = (y - op.tf.ty) / op.tf.sy,
    A = g.args;
  let t;
  if (g.kind === "linear") {
    const dx = A[2] - A[0],
      dy = A[3] - A[1],
      L = dx * dx + dy * dy;
    t = L ? ((ux - A[0]) * dx + (uy - A[1]) * dy) / L : 0;
  } else if (A[0] === A[3] && A[1] === A[4]) {
    const dist = Math.hypot(ux - A[0], uy - A[1]);
    t = A[5] === A[2] ? (dist <= A[2] ? 0 : 1) : (dist - A[2]) / (A[5] - A[2]);
  } else return stops.reduce((m, s) => (s.a > m.a ? s : m), stops[0]); // non-concentric: worst stop
  t = Math.min(1, Math.max(0, t));
  if (t <= stops[0].o) return stops[0];
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i].o) {
      const s0 = stops[i - 1],
        s1 = stops[i],
        k = s1.o === s0.o ? 1 : (t - s0.o) / (s1.o - s0.o);
      return {
        rgb: s0.rgb.map((v, j) => lerp(v, s1.rgb[j], k)),
        a: lerp(s0.a, s1.a, k),
      };
    }
  return stops[stops.length - 1];
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const meets = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const BUCKET = 32;
function bucketize(ops) {
  const m = new Map();
  ops.forEach((op, i) => {
    const b = op.bbox;
    for (
      let by = Math.floor(b[1] / BUCKET);
      by <= Math.floor(b[3] / BUCKET);
      by++
    )
      for (
        let bx = Math.floor(b[0] / BUCKET);
        bx <= Math.floor(b[2] / BUCKET);
        bx++
      ) {
        const k = `${bx},${by}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(i);
      }
  });
  return (x, y) =>
    (m.get(`${Math.floor(x / BUCKET)},${Math.floor(y / BUCKET)}`) || []).map(
      (i) => ops[i],
    ); // ascending = paint order
}
const mix = (c, rgb, a) => c.map((v, i) => v * (1 - a) + rgb[i] * a);

/** Analyse one traced frame. Returns {maxSurface, worst: {margin, ratio, floor, text}} and pushes messages. */
function analyse(comp, texts, trace, messages, where) {
  const boxes = texts.map((r) => ({ r, box: textBox(r) }));
  const clipOps = (layerSet) =>
    trace.filter(
      (op) =>
        layerSet.includes(op.layer) && boxes.some((b) => meets(op.bbox, b.box)),
    );
  const surf = clipOps(["surface"]),
    under = clipOps(["material", "atmosphere"]);
  // huge ops (full-canvas gradients) would land in every bucket: keep them in a separate always-checked list
  const big = (op) =>
    (op.bbox[2] - op.bbox[0]) * (op.bbox[3] - op.bbox[1]) > 400 * 400;
  const sAt = bucketize(surf.filter((o) => !big(o))),
    uAt = bucketize(under.filter((o) => !big(o)));
  const sBig = surf.filter(big),
    uBig = under.filter(big);
  const seq = new Map(trace.map((o, i) => [o, i]));
  const order = (a, b) => seq.get(a) - seq.get(b);
  const bases = fxBases(comp);
  let maxSurface = 0,
    worst = null;
  for (const { r, box } of boxes) {
    const tc = parseColor(r.fill);
    if (!tc) continue;
    const tl = lum(...tc.rgb);
    const floors = bases.map((b) => floorFor(tc.rgb, b.rgb));
    const pts = [];
    for (let y = box[1]; y <= box[3]; y += 8)
      for (let x = box[0]; x <= box[2]; x += 8) pts.push([x, y]);
    for (const op of [...surf, ...under]) {
      if (!meets(op.bbox, box)) continue;
      const cx = Math.min(
          box[2],
          Math.max(box[0], (op.bbox[0] + op.bbox[2]) / 2),
        ),
        cy = Math.min(box[3], Math.max(box[1], (op.bbox[1] + op.bbox[3]) / 2));
      pts.push(
        [
          Math.max(op.bbox[0], box[0]) + 0.01,
          Math.max(op.bbox[1], box[1]) + 0.01,
        ],
        [cx, cy],
      );
    }
    for (const [x, y] of pts) {
      // over-text opacity
      let keep = 1;
      for (const op of [...sAt(x, y), ...sBig].sort(order))
        if (inBox(op.bbox, x, y)) keep *= 1 - op.alpha * paintAt(op, x, y).a;
      maxSurface = Math.max(maxSurface, 1 - keep);
      // contrast after the under-text tint
      const us = [...uAt(x, y), ...uBig]
        .filter((op) => inBox(op.bbox, x, y))
        .sort(order);
      if (!us.length) continue;
      bases.forEach((b, i) => {
        let c = b.rgb;
        for (const op of us) {
          const p = paintAt(op, x, y);
          c = mix(c, p.rgb, op.alpha * p.a);
        }
        const got = ratio(tl, lum(...c)),
          margin = got - floors[i];
        if (!worst || margin < worst.margin)
          worst = { margin, ratio: got, floor: floors[i], text: r.t };
      });
    }
  }
  if (maxSurface > SURFACE_CAP + 1e-6)
    messages.push(
      `${where}: over-text effects reach opacity ${maxSurface.toFixed(3)} on the text (cap ${SURFACE_CAP})`,
    );
  if (worst && worst.margin < -1e-3)
    messages.push(
      `${where}: the material lowers text contrast to ${worst.ratio.toFixed(2)}:1 (needs ${worst.floor.toFixed(2)}:1) behind ${JSON.stringify(worst.text.slice(0, 30))}`,
    );
  return { maxSurface, worst };
}

const sameText = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutMaterial = (comp) => {
  const rest = { ...comp };
  delete rest.material;
  return rest;
};

/**
 * Verify `comp`'s material on every frame in `draws` ([(ctx, comp, extra) => void], extra = {fxTrace, fxReport}).
 * Pass the route's measuring ctx. A composition without an active material is trivially ok (nothing is drawn).
 */
export function verifyMaterial(
  measureCtx,
  comp,
  draws,
  { label = "Material" } = {},
) {
  if (!materialActive(comp))
    return { ok: true, messages: [], checked: 0, skipped: true, stats: [] };
  const name = `${label} "${[materialById(comp.material.id)?.label, textureById(comp.material.texture)?.label, textileById(comp.material.textile?.id)?.label, comp.material.grain > 0 ? "Film grain" : null].filter(Boolean).join(" + ") || comp.material.id}"`;
  const messages = [],
    stats = [],
    plain = withoutMaterial(comp);
  draws.forEach((draw, i) => {
    const where = `${name} (frame ${i + 1})`;
    const a = stateCtx(measureCtx),
      b = stateCtx(measureCtx),
      fxTrace = [],
      fxReport = [];
    draw(a.ctx, plain, {});
    draw(b.ctx, comp, { fxTrace, fxReport });
    if (!sameText(a.texts, b.texts))
      messages.push(
        `${where}: the material changed how the poem text is drawn`,
      );
    fxReport.forEach((m) => messages.push(`${where}: ${m}`));
    stats.push(analyse(comp, b.texts, fxTrace, messages, where));
  });
  const uniq = [...new Set(messages)];
  return {
    ok: uniq.length === 0,
    messages: uniq,
    checked: draws.length,
    stats,
  };
}
