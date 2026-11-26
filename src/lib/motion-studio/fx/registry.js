// Effect hooks for drawFrame's layer stack. EMPTY by default: with nothing registered drawFrame makes exactly the same
// canvas calls as before (proven by tests/security/motion-studio-golden.test.mjs).
//
// Layers, in paint order:  bg -> material -> atmosphere (under text) -> text -> surface (over text) -> signature.
// Effects may register on "material", "atmosphere" or "surface" only. The text and signature layers are never hookable.
// Every effect runs inside ctx.save()/ctx.restore(), and drawFrame re-asserts the text state afterwards, so an effect can
// never leak alpha, transform, blur (filter), shadow or compositing into the poem text.
//
// fx shape: { id: string, layer: "material"|"atmosphere"|"surface", draw(ctx, env) }  env = {comp, W, H, tMs, still, rect}
export const FX_LAYERS = Object.freeze(["material", "atmosphere", "surface"]);
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
