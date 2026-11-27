// Thumbnail cache (pure, bounded LRU). The key covers EVERY input a thumbnail depends on: the exact source poem (its
// fingerprint AND its canonical text, so no hash collision can ever return another poem's thumbnail), the template,
// material, format, route, motion preference, fonts, signature fields, plus the style and scene text. Any change to any
// of them is a different key, so a stale thumbnail can never be served. Storage is injectable (default: a Map).
import { poemFingerprint, poemCanonical } from "./bundle.js";

const stable = (v) => {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v)
    .sort()
    .filter((k) => v[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
    .join(",")}}`;
};

/** The fields a thumbnail depends on (exported so tests can prove each one changes the key). */
export function thumbInputs({ poem, comp, route, format } = {}) {
  const st = comp?.style || {};
  const sig = comp?.branding?.signature ?? null;
  return {
    poem: poemFingerprint(poem),
    poemText: poemCanonical(poem),
    templateId: comp?.templateId ?? null,
    material: comp?.material
      ? {
          id: comp.material.id ?? "none",
          intensity: comp.material.intensity ?? null,
          reduce: !!comp.material.reduce,
          seed: comp.material.seed ?? null,
        }
      : "none",
    format: format ?? comp?.format ?? null,
    route: route ?? null,
    motion: {
      pref: comp?.motion?.pref ?? null,
      reduceMotion: !!comp?.motion?.reduceMotion,
      textIn: comp?.motion?.textIn ?? null,
    },
    font: st.font ?? null,
    titleFont: st.titleFont ?? null,
    signature: sig,
    branding: comp?.branding ?? null,
    style: st,
    scenes: (comp?.scenes || []).map((s) => [s.kind, s.lines]),
  };
}
export const thumbKey = (args) => stable(thumbInputs(args));

/** storage: { get(k), set(k, v), delete(k) } (a Map works). Bounded: the least recently used entry is evicted first. */
export function createThumbCache({ max = 48, storage = new Map() } = {}) {
  if (!(max >= 1)) throw new RangeError("thumbnail cache needs max >= 1");
  const order = []; // least recently used first
  const touch = (k) => {
    const i = order.indexOf(k);
    if (i >= 0) order.splice(i, 1);
    order.push(k);
  };
  return {
    get(key) {
      if (!order.includes(key)) return undefined;
      const v = storage.get(key);
      if (v === undefined) {
        order.splice(order.indexOf(key), 1);
        return undefined;
      }
      touch(key);
      return v;
    },
    set(key, value) {
      touch(key);
      storage.set(key, value);
      while (order.length > max) storage.delete(order.shift());
    },
    has: (key) => order.includes(key),
    delete(key) {
      const i = order.indexOf(key);
      if (i >= 0) order.splice(i, 1);
      storage.delete(key);
    },
    clear() {
      for (const k of order.splice(0)) storage.delete(k);
    },
    size: () => order.length,
    keys: () => [...order],
    max,
  };
}
