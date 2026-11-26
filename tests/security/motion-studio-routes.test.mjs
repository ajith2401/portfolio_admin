// P3: export route registry, render layers / fx isolation, animation hold-state, new formats and routes.
// Every route: ensureFonts BEFORE any measurement, then its validator; a Tamil corpus passes; mutated layouts fail.
// Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import * as EXPORTS from "../../src/lib/motion-studio/export.js";
import { ROUTES, routeById } from "../../src/lib/motion-studio/formats.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import { defaultComposition, normalizeComposition } from "../../src/lib/motion-studio/composition.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";
import { drawFrame } from "../../src/lib/motion-studio/render.js";
import { BEHAVIOURS, BEHAVIOUR_IDS, HOLD, rowState } from "../../src/lib/motion-studio/animation.js";
import { registerFx, clearFx, listFx, unregisterFx } from "../../src/lib/motion-studio/fx/registry.js";

// ---------------------------------------------------------------- fixtures
// measuring stub: every code point is k em wide (Tamil families slightly wider than the generic fallback)
const mkCtx = (k = 0.55) => {
  let px = 40, font = "40px x";
  return {
    set font(f) { font = f; px = Number(/([\d.]+)px/.exec(f)[1]); },
    get font() { return font; },
    measureText: (t) => ({ width: Array.from(String(t)).length * px * (font.includes("Tamil") ? k : 0.5) }),
  };
};
const ctx = mkCtx();
const CORPUS = {
  indent: "மழையின் பாடல்\n  உள்ளம் சொல்லும் கதை\n    இன்னும் ஒரு வரி\n\nகொடிய வெயில் காய்ந்தாலும்",
  tabs: "\tஅன்பே சிவம்\n\t\tதமிழ் என்றும் வாழ்க\nமூன்றாம்\tவரி",
  nbsp: "கொடிய வெயில் காய்ந்தாலும்\nநிழல் தேடும் மனம்",
  blanks: "முதல் பத்தி\n\n\n\nஇரண்டாம் பத்தி\n\n\nமூன்றாம் பத்தி வரி ஒன்று\nமூன்றாம் பத்தி வரி இரண்டு",
  long: "தமிழ் என்றும் வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க\nசிறு வரி\n\nகடல் அலை கரையைத் தொட்டுத் திரும்பும் ஒவ்வொரு முறையும் ஒரு கதை சொல்லும்",
};
const TITLE = "மழையின் பாடல்";
export function corpusComp(key, format = "reel") {
  const poem = parsePoemText(CORPUS[key], { title: TITLE });
  const base = normalizeComposition({ ...defaultComposition({ format, scenes: generateScenes(poem, { title: TITLE }) }), poem: { title: TITLE, stanzas: poem.stanzas, source: poem.source } });
  const plan = planFit(ctx, base); // explicit fit (whole lines regrouped, never edited) so every scene is legible
  return { comp: plan.ok ? applyFit(base, plan) : base, poem: { ...poem, title: TITLE } };
}
/** The route-specific input (full poem, selected quote lines) for a corpus poem. */
export function inputFor(route, poem) {
  const lines = poem.stanzas.flatMap((st, si) => st.map((text, line) => ({ stanza: si, line, text }))).slice(0, 2);
  return { poem, lines, preset: "compact", height: "extended" };
}
// mutations of either layout shape (scene rows / full-poem items)
const drawnRows = (lay) => (lay.rows ? lay.rows.filter((r) => !r.gap) : lay.items.filter((i) => i.kind === "line"));
const dropLine = (lay) => {
  const r = drawnRows(lay)[0];
  if (lay.rows) lay.rows.splice(lay.rows.indexOf(r), 1); else lay.items.splice(lay.items.indexOf(r), 1);
  return lay;
};
const shiftOff = (lay) => { const r = drawnRows(lay)[0]; if (lay.rows) r.indentPx = (r.indentPx || 0) + 5000; else r.x += 9000; return lay; };

// ---------------------------------------------------------------- registry completeness
test("routes: every render*/export* function of export.js is registered in ROUTES", () => {
  const fns = Object.entries(EXPORTS).filter(([k, v]) => /^(render|export)[A-Z]/.test(k) && typeof v === "function");
  assert.ok(fns.length >= 5);
  const registered = new Set(ROUTES.map((r) => r.exportFn));
  const missing = fns.filter(([, v]) => !registered.has(v)).map(([k]) => k);
  assert.deepEqual(missing, [], `not registered in formats.js ROUTES: ${missing.join(", ")}`);
});
test("routes: ids are unique and every route has the full interface", () => {
  assert.equal(new Set(ROUTES.map((r) => r.id)).size, ROUTES.length);
  for (const r of ROUTES) {
    assert.ok(r.label && r.format && ["video", "image", "set"].includes(r.kind), r.id);
    for (const k of ["scenesFor", "validate", "render", "exportFn"]) assert.equal(typeof r[k], "function", `${r.id}.${k}`);
  }
  for (const id of ["reel-mp4", "story-mp4", "reel-cover", "story-stills", "poster", "poster-set", "full-poem"]) assert.ok(routeById(id), id);
});

// ---------------------------------------------------------------- corpus x route
for (const key of Object.keys(CORPUS))
  for (const route of ROUTES)
    test(`routes: ${route.id} x corpus "${key}" validates, and mutated layouts fail`, () => {
      const { comp, poem } = corpusComp(key);
      const input = inputFor(route, poem);
      assert.ok(route.scenesFor(comp, input, ctx).length > 0, "the route draws something");
      const ok = route.validate(ctx, comp, input);
      assert.equal(ok.ok, true, `${route.id}/${key}: ${ok.messages.join("; ")}`);
      const dropped = route.validate(ctx, comp, { ...input, mutate: dropLine });
      assert.equal(dropped.ok, false, "a dropped line must fail");
      assert.ok(dropped.messages.some((m) => /missing|not drawn/.test(m)), dropped.messages.join("; "));
      const off = route.validate(ctx, comp, { ...input, mutate: shiftOff });
      assert.equal(off.ok, false, "an off-canvas row must fail");
      assert.ok(off.messages.some((m) => /canvas|margin/.test(m)), off.messages.join("; "));
    });

// ---------------------------------------------------------------- fonts before measuring (real render functions, mocked DOM)
function installDom({ empty = false } = {}) {
  const log = [];
  const canvas = () => {
    const c = { width: 0, height: 0 };
    c.getContext = () => {
      const probe = c.width === 10 && c.height === 10; // canvasMeasure(): the font probe itself
      const m = mkCtx();
      return new Proxy(m, {
        get(t, k) {
          if (k === "measureText") return (s) => { log.push(probe ? "probe" : "measure"); return t.measureText(s); };
          if (k === "font") return t.font;
          if (k in t) return t[k];
          if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
          return () => {};
        },
        set(t, k, v) { if (k === "font") t.font = v; return true; },
      });
    };
    c.toBlob = (cb, type) => cb(new Blob(["x"], { type }));
    return c;
  };
  globalThis.document = {
    createElement: () => canvas(),
    fonts: {
      load: async () => { log.push("fonts.load"); return empty ? [] : [{ family: "x" }]; },
      check: () => { log.push("fonts.check"); return true; },
    },
  };
  return log;
}
const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
for (const route of ROUTES)
  test(`routes: ${route.id} loads fonts (ensureFonts) BEFORE any layout measurement`, async () => {
    const log = installDom();
    const { comp, poem } = corpusComp("indent");
    let err = null;
    try { await withTimeout(route.render(comp, inputFor(route, poem), {})); } catch (e) { err = e; }
    if (route.kind !== "video") assert.equal(err, null, `${route.id} should export: ${err?.message}`);
    const lastFont = Math.max(log.lastIndexOf("fonts.load"), log.lastIndexOf("fonts.check"));
    const firstMeasure = log.indexOf("measure");
    assert.ok(log.includes("fonts.load"), "fonts were loaded");
    assert.ok(firstMeasure > lastFont, `${route.id}: measured before fonts were ready (${log.slice(0, 12).join(",")})`);
  });
for (const route of ROUTES)
  test(`routes: ${route.id} refuses (and never measures) when no font face matches`, async () => {
    const log = installDom({ empty: true });
    const { comp, poem } = corpusComp("tabs");
    await assert.rejects(() => withTimeout(route.render(comp, inputFor(route, poem), {})), /fallback font/);
    assert.equal(log.indexOf("measure"), -1, "nothing measured against a fallback face");
  });

// ---------------------------------------------------------------- animation hold-state invariant
test("animation: every behaviour reaches the exact HOLD state {alpha:1,dy:0,dx:0} after its in-phase", () => {
  const scene = { id: "s", kind: "stanza", lines: ["அ", "ஆ", "இ", "ஈ"], durationMs: 9000 };
  for (const id of BEHAVIOUR_IDS) {
    const b = BEHAVIOURS[id];
    for (let index = 0; index < 4; index++) {
      const row = { line: index };
      const info = { intensity: 1, last: false, index };
      const start = b.inEndMs(scene, row, info);
      for (let t = start; t <= scene.durationMs - 500; t += 250) assert.deepEqual(b.rowState(scene, row, t, info), HOLD, `${id} row ${index} at ${t}ms`);
      assert.deepEqual(b.rowState(scene, row, 1e6, { ...info, last: true }), HOLD, `${id} last scene holds`);
    }
  }
});
test("animation: stills are always HOLD and dx is always 0", () => {
  const comp = { motion: { textIn: "rise", intensity: 0.7 } };
  const scene = { durationMs: 4000 };
  assert.deepEqual(rowState(comp, scene, { line: 3 }, 0, { still: true, index: 3 }), HOLD);
  for (const id of BEHAVIOUR_IDS) for (const t of [0, 100, 900, 3700]) assert.equal(BEHAVIOURS[id].rowState(scene, { line: 1 }, t, { index: 1 }).dx, 0);
  assert.ok(BEHAVIOURS.rise.rowState(scene, { line: 0 }, 0, { index: 0, intensity: 0.5 }).dy > 0, "negative control: rise is NOT hold at t=0");
});

// ---------------------------------------------------------------- fx registry / text isolation
function stateCtx() {
  const st = { globalAlpha: 1, filter: "none", globalCompositeOperation: "source-over", tf: [1, 0, 0, 1, 0, 0], shadowColor: "transparent" };
  const stack = [], texts = [];
  const target = {
    save: () => stack.push({ ...st, tf: [...st.tf] }),
    restore: () => { if (stack.length) Object.assign(st, stack.pop()); },
    scale: (x, y) => { st.tf = [st.tf[0] * x, 0, 0, st.tf[3] * y, st.tf[4], st.tf[5]]; },
    translate: (x, y) => { st.tf = [st.tf[0], 0, 0, st.tf[3], st.tf[4] + x * st.tf[0], st.tf[5] + y * st.tf[3]]; },
    getTransform: () => [...st.tf],
    setTransform: (m) => { st.tf = [...m]; },
    measureText: (t) => ({ width: Array.from(String(t)).length * 22 }),
    fillText: (t) => texts.push({ t, alpha: st.globalAlpha, filter: st.filter, op: st.globalCompositeOperation, tf: [...st.tf] }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : k in st ? st[k] : () => {}),
    set: (t, k, v) => { st[k] = v; return true; },
  });
  return { ctx, texts };
}
test("fx: registry is empty by default; register/unregister by id", () => {
  assert.deepEqual(listFx(), []);
  const off = registerFx({ id: "t1", layer: "surface", draw() {} });
  assert.equal(listFx().length, 1);
  off();
  assert.deepEqual(listFx(), []);
  assert.throws(() => registerFx({ id: "x", layer: "text", draw() {} }), /layer/);
  assert.throws(() => registerFx({ id: "x", layer: "signature", draw() {} }), /layer/);
  assert.equal(unregisterFx("nope"), false);
});
test("fx: an effect that sets alpha / blur / transform / compositing (and unbalances restore) never reaches the text", () => {
  const comp = normalizeComposition({ ...defaultComposition({ format: "reel", scenes: [{ id: "a", kind: "stanza", lines: ["அன்பே சிவம்"], durationMs: 4000 }] }) });
  const clean = stateCtx();
  drawFrame(clean.ctx, comp, 2000, {});
  const evil = (ctx) => { ctx.globalAlpha = 0.05; ctx.filter = "blur(8px)"; ctx.globalCompositeOperation = "xor"; ctx.scale(3, 3); ctx.translate(400, 0); ctx.restore(); ctx.restore(); ctx.globalAlpha = 0.05; ctx.filter = "blur(8px)"; };
  try {
    registerFx({ id: "evil-m", layer: "material", draw: evil });
    registerFx({ id: "evil-a", layer: "atmosphere", draw: evil });
    registerFx({ id: "evil-s", layer: "surface", draw: evil });
    const dirty = stateCtx();
    drawFrame(dirty.ctx, comp, 2000, {});
    assert.deepEqual(dirty.texts, clean.texts, "poem text and signature drawn with identical alpha/filter/transform/compositing");
    assert.ok(clean.texts.some((x) => x.t === "அன்பே சிவம்" && x.alpha === 1 && x.filter === "none"));
  } finally { clearFx(); }
});
