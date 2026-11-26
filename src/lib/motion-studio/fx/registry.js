// Effect hooks for drawFrame's layer stack.
//
// Layers, in paint order:  bg -> material -> atmosphere (under text) -> text -> surface (over text) -> signature.
// Effects may register on "material", "atmosphere" or "surface" only. The text and signature layers are never hookable.
// Every effect runs inside ctx.save()/ctx.restore(), and drawFrame re-asserts the text state afterwards, so an effect can
// never leak alpha, transform, blur (filter), shadow or compositing into the poem text.
//
// Two kinds of effect:
//  * AMBIENT fx (registerFx): run on every frame. EMPTY by default: with nothing registered drawFrame makes exactly
//    the same canvas calls as before (proven by tests/security/motion-studio-golden.test.mjs).
//    fx shape: { id, layer, draw(ctx, env) }  env = {comp, W, H, tMs, still, rect}
//  * MATERIAL effects (defineEffect): a catalog (fx/effects.js) that a composition opts into through comp.material
//    (materials.js). They run only for that composition, through the guarded context in fx/guard.js, seeded by
//    comp.material.seed + frame index only.
//    def shape: { id, label, layer, maxAlpha, animated, draw(ctx, env, p) }
//    p = { k (intensity 0..1), params, rng(), staticRng(), frame, t (seconds), away(a), toward(a), tint(hex, a), lightText }
import { guardCtx, withoutClocks, FxViolation } from "./guard.js";
import { makeRng, fxPalette, FX_FPS } from "./palette.js";

export const FX_LAYERS = Object.freeze(["material", "atmosphere", "surface"]);
/** Hard opacity ceiling for anything drawn OVER the text (surface layer). */
export const SURFACE_CAP = 0.12;
const registry = new Map();

export function registerFx(fx) {
  if (!fx || typeof fx.id !== "string" || !fx.id)
    throw new TypeError("fx needs a string id");
  if (!FX_LAYERS.includes(fx.layer))
    throw new TypeError(`fx layer must be one of ${FX_LAYERS.join(", ")}`);
  if (typeof fx.draw !== "function")
    throw new TypeError("fx needs a draw(ctx, env) function");
  registry.set(
    fx.id,
    Object.freeze({ id: fx.id, layer: fx.layer, draw: fx.draw }),
  );
  return () => unregisterFx(fx.id);
}
export const unregisterFx = (id) => registry.delete(id);
export const listFx = () => [...registry.values()];
export const fxFor = (layer) => listFx().filter((f) => f.layer === layer);
export const clearFx = () => registry.clear();

/**
 * Run every effect of `layer`. Isolated: save/restore around each, and if the ctx can report its transform, the exact
 * transform is restored even if an effect calls restore() more often than save().
 */
export function runFx(layer, ctx, env) {
  const list = fxFor(layer);
  if (!list.length) return 0;
  for (const fx of list) {
    const m =
      typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
    ctx.save();
    try {
      fx.draw(ctx, env);
    } finally {
      ctx.restore();
      if (m && typeof ctx.setTransform === "function") ctx.setTransform(m);
    }
  }
  return list.length;
}

// ---------------------------------------------------------------- material effect catalog
const catalog = new Map();
// Static guard: an effect's own source may not reach for wall-clock time or unseeded randomness (runtime traps in
// guard.js catch anything reached indirectly).
const NONDETERMINISTIC =
  /\bMath\s*\.\s*random\b|\bDate\b|\bperformance\s*\.\s*now\b|\bcrypto\b/;

export function defineEffect(def) {
  if (
    !def ||
    typeof def.id !== "string" ||
    !/^[a-z][a-z0-9-]{1,39}$/.test(def.id)
  )
    throw new TypeError("effect needs a kebab-case id");
  if (!FX_LAYERS.includes(def.layer))
    throw new TypeError(`effect layer must be one of ${FX_LAYERS.join(", ")}`);
  if (typeof def.draw !== "function")
    throw new TypeError("effect needs a draw(ctx, env, p) function");
  const maxAlpha = Number(def.maxAlpha);
  if (!(maxAlpha > 0 && maxAlpha <= 1))
    throw new RangeError(`${def.id}: maxAlpha must be in (0, 1]`);
  if (def.layer === "surface" && maxAlpha > SURFACE_CAP)
    throw new RangeError(
      `${def.id}: an over-text (surface) effect is capped at opacity ${SURFACE_CAP}`,
    );
  if (NONDETERMINISTIC.test(String(def.draw)))
    throw new TypeError(
      `${def.id}: effects may not use Math.random, Date, performance.now or crypto; use the seeded p.rng()`,
    );
  const out = Object.freeze({
    id: def.id,
    label: String(def.label || def.id),
    layer: def.layer,
    maxAlpha,
    animated: !!def.animated,
    draw: def.draw,
  });
  catalog.set(def.id, out);
  return out;
}
export const effectById = (id) => catalog.get(id) || null;
export const listEffects = () => [...catalog.values()];
/** Test-only: drop a catalog entry defined by a test. */
export const undefineEffect = (id) => catalog.delete(id);

/**
 * Run the composition's material plan (env.plan = [{def, params, index}]) for one layer, each effect isolated and
 * guarded. Returns how many effects ran (0 => the ctx was not touched at all).
 */
export function runMaterial(layer, ctx, env) {
  const plan = env.plan;
  if (!plan || !plan.length) return 0;
  const list = plan.filter((e) => e.def.layer === layer);
  if (!list.length) return 0;
  const pal = fxPalette(env.comp);
  const frame = env.still
    ? 0
    : Math.max(0, Math.floor(((env.tMs || 0) * FX_FPS) / 1000));
  for (const e of list) {
    const { def } = e;
    const m =
      typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
    ctx.save();
    const g = guardCtx(ctx, {
      fxId: def.id,
      layer,
      maxAlpha: def.maxAlpha,
      trace: env.fxTrace || null,
      violations: env.fxReport || null,
    });
    const f = def.animated ? frame : 0;
    const p = {
      k: env.intensity,
      params: e.params || {},
      frame: f,
      t: f / FX_FPS,
      lightText: pal.lightText,
      rng: makeRng(env.seed, def.id, e.index, f),
      staticRng: makeRng(env.seed, def.id, e.index, "static"),
      away: (a) => pal.away(a, def.maxAlpha),
      toward: (a) => pal.toward(a, def.maxAlpha),
      tint: (hex, a) => pal.tint(hex, a, def.maxAlpha),
    };
    try {
      withoutClocks(() =>
        def.draw(g.ctx, { W: env.W, H: env.H, rect: env.rect }, p),
      );
    } catch (err) {
      const msg = `${def.id}: ${err instanceof FxViolation ? err.message : `failed (${err?.message || err})`}`;
      if (env.fxReport && !env.fxReport.includes(msg)) env.fxReport.push(msg);
    } finally {
      for (let i = g.depth(); i > 0; i--) ctx.restore(); // unwind saves the effect forgot
      ctx.restore();
      if (m && typeof ctx.setTransform === "function") ctx.setTransform(m);
    }
  }
  return list.length;
}
