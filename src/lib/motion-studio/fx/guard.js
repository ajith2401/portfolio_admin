// The sandbox every material effect draws through. An effect never touches the real canvas context directly: it gets a
// guarded proxy that
//   * allows only a small whitelist of path/fill calls (no text, no images, no pixel reads/writes, no clearRect,
//     no rotate/setTransform, no filter/blur, no shadows, no compositing other than source-over),
//   * hard-caps globalAlpha at the effect's maxAlpha (<= SURFACE_CAP for over-text effects) and reports any request above,
//   * refuses an unbalanced restore() and unwinds any save() the effect forgot,
//   * traps Math.random / Date / performance.now while the effect runs (effects must use the seeded rng they are given),
//   * optionally traces every paint op (device bbox, alpha, colour or gradient) for the verifier (fx/verify.js).
// Violations are collected in `violations` (when given) and never throw out of drawFrame.
import { hexRgb } from "../contrast.js";

export class FxViolation extends Error {}

const METHODS = new Set([
  "save",
  "restore",
  "translate",
  "scale",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "quadraticCurveTo",
  "bezierCurveTo",
  "arc",
  "ellipse",
  "rect",
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "clip",
  "createLinearGradient",
  "createRadialGradient",
]);
const PROPS = new Set([
  "globalAlpha",
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "globalCompositeOperation",
]);

export function parseColor(v) {
  if (typeof v !== "string") return null;
  if (/^#[0-9a-f]{6}$/i.test(v)) return { rgb: hexRgb(v), a: 1 };
  const m =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      v,
    );
  if (!m) return null;
  return {
    rgb: [+m[1], +m[2], +m[3]],
    a: m[4] == null ? 1 : Math.min(1, Math.max(0, +m[4])),
  };
}

/** Run fn with Math.random / Date / performance.now replaced by traps; always restored. */
export function withoutClocks(fn) {
  const g = globalThis,
    R = Math.random,
    D = g.Date,
    perf = g.performance,
    hadOwnNow = perf && Object.prototype.hasOwnProperty.call(perf, "now");
  const ownNow = hadOwnNow ? perf.now : undefined;
  const trap = (what) => () => {
    throw new FxViolation(
      `effect used ${what} (effects must be seeded and deterministic)`,
    );
  };
  Math.random = trap("Math.random");
  g.Date = new Proxy(D, {
    construct: trap("Date"),
    apply: trap("Date"),
    get: (t, k) => (k === "now" ? trap("Date.now") : t[k]),
  });
  try {
    if (perf)
      Object.defineProperty(perf, "now", {
        value: trap("performance.now"),
        configurable: true,
        writable: true,
      });
  } catch {
    /* read-only performance: skip */
  }
  try {
    return fn();
  } finally {
    Math.random = R;
    g.Date = D;
    try {
      if (perf) {
        if (hadOwnNow) perf.now = ownNow;
        else delete perf.now;
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Guarded proxy over `ctx` for one effect. opts: {fxId, layer, maxAlpha, trace?: [], violations?: []}.
 * Returns {ctx: proxy, depth: () => number}.
 */
export function guardCtx(
  ctx,
  { fxId, layer, maxAlpha, trace = null, violations = null },
) {
  const bad = (msg) => {
    const m = `${fxId}: ${msg}`;
    if (violations && !violations.includes(m)) violations.push(m);
  };
  // effect-local state: transform (translate/scale only), alpha, paints, path bbox
  let st = {
    tx: 0,
    ty: 0,
    sx: 1,
    sy: 1,
    alpha: maxAlpha,
    fill: { rgb: [0, 0, 0], a: 1 },
    stroke: { rgb: [0, 0, 0], a: 1 },
    lw: 1,
  };
  const stack = [];
  let path = null;
  const grads = new WeakMap(); // wrapper -> {real, info}
  const dev = (x, y) => [st.tx + st.sx * x, st.ty + st.sy * y];
  const addPt = (x, y, r = 0) => {
    const [dx, dy] = dev(x, y),
      rx = Math.abs(r * st.sx),
      ry = Math.abs(r * st.sy);
    path = path
      ? [
          Math.min(path[0], dx - rx),
          Math.min(path[1], dy - ry),
          Math.max(path[2], dx + rx),
          Math.max(path[3], dy + ry),
        ]
      : [dx - rx, dy - ry, dx + rx, dy + ry];
  };
  const record = (bbox, paint) => {
    if (!trace) return;
    trace.push({
      fx: fxId,
      layer,
      bbox,
      alpha: st.alpha,
      paint,
      tf: { tx: st.tx, ty: st.ty, sx: st.sx, sy: st.sy },
    });
  };
  const rectBox = (x, y, w, h, pad = 0) => {
    const [x0, y0] = dev(x, y),
      [x1, y1] = dev(x + w, y + h);
    return [
      Math.min(x0, x1) - pad,
      Math.min(y0, y1) - pad,
      Math.max(x0, x1) + pad,
      Math.max(y0, y1) + pad,
    ];
  };
  const setPaint = (k, v) => {
    if (v && typeof v === "object" && grads.has(v)) {
      const g = grads.get(v);
      st[k] = { grad: g.info };
      ctx[k === "fill" ? "fillStyle" : "strokeStyle"] = g.real;
      return;
    }
    const c = parseColor(v);
    if (!c)
      return bad(
        `unsupported ${k}Style ${JSON.stringify(String(v)).slice(0, 40)} (use #rrggbb or rgba())`,
      );
    st[k] = c;
    ctx[k === "fill" ? "fillStyle" : "strokeStyle"] = v;
  };
  const mkGrad = (kind, args) => {
    const real =
      kind === "linear"
        ? ctx.createLinearGradient(...args)
        : ctx.createRadialGradient(...args);
    const info = { kind, args, stops: [] };
    const w = {
      addColorStop: (o, col) => {
        const c = parseColor(col);
        if (!c)
          return bad(`unsupported gradient colour ${String(col).slice(0, 30)}`);
        info.stops.push({ o: Math.min(1, Math.max(0, +o)), ...c });
        real.addColorStop(o, col);
      },
    };
    grads.set(w, { real, info });
    return w;
  };
  const impl = {
    save: () => {
      stack.push({ ...st });
      ctx.save();
    },
    restore: () => {
      if (!stack.length)
        return bad("unbalanced restore() (more restores than saves)");
      st = stack.pop();
      ctx.restore();
    },
    translate: (x, y) => {
      st.tx += st.sx * x;
      st.ty += st.sy * y;
      ctx.translate(x, y);
    },
    scale: (x, y) => {
      st.sx *= x;
      st.sy *= y;
      ctx.scale(x, y);
    },
    beginPath: () => {
      path = null;
      ctx.beginPath();
    },
    closePath: () => ctx.closePath(),
    moveTo: (x, y) => {
      addPt(x, y);
      ctx.moveTo(x, y);
    },
    lineTo: (x, y) => {
      addPt(x, y);
      ctx.lineTo(x, y);
    },
    quadraticCurveTo: (a, b, x, y) => {
      addPt(a, b);
      addPt(x, y);
      ctx.quadraticCurveTo(a, b, x, y);
    },
    bezierCurveTo: (a, b, c, d, x, y) => {
      addPt(a, b);
      addPt(c, d);
      addPt(x, y);
      ctx.bezierCurveTo(a, b, c, d, x, y);
    },
    arc: (x, y, r, ...rest) => {
      addPt(x, y, r);
      ctx.arc(x, y, r, ...rest);
    },
    ellipse: (x, y, rx, ry, rot, ...rest) => {
      addPt(x, y, Math.max(rx, ry));
      ctx.ellipse(x, y, rx, ry, rot, ...rest);
    },
    rect: (x, y, w, h) => {
      addPt(x, y);
      addPt(x + w, y + h);
      ctx.rect(x, y, w, h);
    },
    fill: (...a) => {
      if (path) record(path, st.fill);
      ctx.fill(...a);
    },
    stroke: () => {
      if (path) {
        const p = (st.lw * Math.max(Math.abs(st.sx), Math.abs(st.sy))) / 2;
        record([path[0] - p, path[1] - p, path[2] + p, path[3] + p], st.stroke);
      }
      ctx.stroke();
    },
    fillRect: (x, y, w, h) => {
      record(rectBox(x, y, w, h), st.fill);
      ctx.fillRect(x, y, w, h);
    },
    strokeRect: (x, y, w, h) => {
      record(
        rectBox(
          x,
          y,
          w,
          h,
          (st.lw * Math.max(Math.abs(st.sx), Math.abs(st.sy))) / 2,
        ),
        st.stroke,
      );
      ctx.strokeRect(x, y, w, h);
    },
    clip: (...a) => ctx.clip(...a),
    createLinearGradient: (...a) => mkGrad("linear", a),
    createRadialGradient: (...a) => mkGrad("radial", a),
  };
  const proxy = new Proxy(
    {},
    {
      get(_, k) {
        if (METHODS.has(k)) return impl[k];
        if (k === "globalAlpha") return st.alpha;
        if (PROPS.has(k)) return ctx[k];
        if (typeof k === "symbol") return undefined;
        return () => bad(`${String(k)} is not available to effects`);
      },
      set(_, k, v) {
        if (k === "globalAlpha") {
          const a = Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 1;
          if (a > maxAlpha + 1e-9)
            bad(
              `asked for alpha ${a} above its cap ${maxAlpha}${layer === "surface" ? " (over-text effects are capped)" : ""}`,
            );
          st.alpha = Math.min(a, maxAlpha);
          ctx.globalAlpha = st.alpha;
          return true;
        }
        if (k === "fillStyle") {
          setPaint("fill", v);
          return true;
        }
        if (k === "strokeStyle") {
          setPaint("stroke", v);
          return true;
        }
        if (k === "lineWidth") {
          st.lw = Math.max(0, +v || 0);
          ctx.lineWidth = st.lw;
          return true;
        }
        if (k === "lineCap" || k === "lineJoin") {
          ctx[k] = v;
          return true;
        }
        if (k === "globalCompositeOperation") {
          if (v !== "source-over") bad(`compositing "${v}" is not allowed`);
          return true;
        }
        bad(`may not set ${String(k)}`);
        return true;
      },
    },
  );
  ctx.globalAlpha = maxAlpha;
  ctx.globalCompositeOperation = "source-over";
  return { ctx: proxy, depth: () => stack.length };
}
