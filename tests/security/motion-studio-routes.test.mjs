// P3: export route registry, render layers / fx isolation, animation hold-state, new formats and routes.
// Every route: ensureFonts BEFORE any measurement, then its validator; a Tamil corpus passes; mutated layouts fail.
// Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import * as EXPORTS from "../../src/lib/motion-studio/export.js";
const { takeExportWarnings } = EXPORTS;
import { ROUTES, routeById } from "../../src/lib/motion-studio/formats.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import { defaultComposition, normalizeComposition } from "../../src/lib/motion-studio/composition.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";
import { drawFrame, validateScene, pageLabelBox } from "../../src/lib/motion-studio/render.js";
import { FORMATS, MIN_TEXT_PX, QUOTE_MIN_PX } from "../../src/lib/motion-studio/safe-zone.js";
import { checkQuote, checkCarousel, carouselPlan } from "../../src/lib/motion-studio/route-checks.js";
import { FORMAT_KEYS } from "../../src/lib/motion-studio/composition.js";
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
  const d = defaultComposition({ format, scenes: generateScenes(poem, { title: TITLE }) });
  const base = normalizeComposition({ ...d, poster: { ...d.poster, endText: "நன்றி\nSynthetic Poet" }, poem: { title: TITLE, stanzas: poem.stanzas, source: poem.source } });
  const plan = planFit(ctx, base); // explicit fit (whole lines regrouped, never edited) so every scene is legible
  return { comp: plan.ok ? applyFit(base, plan) : base, poem: { ...poem, title: TITLE } };
}
/** Scene routes are fitted for the format they draw (a Square composition is split for the square canvas). */
const compFor = (key, route) => corpusComp(key, ["story", "square"].includes(route.format) ? route.format : "reel");
/** The route-specific input (full poem, selected quote lines) for a corpus poem. */
export function inputFor(route, poem) {
  const lines = poem.stanzas.flatMap((st, si) => st.map((text, line) => ({ stanza: si, line, text }))).filter((l) => l.text !== "").slice(0, 2);
  return { poem, lines, preset: "compact", height: "extended", format: route.id === "quote" ? "poster" : "reel" };
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
  for (const id of ["reel-mp4", "story-mp4", "square-mp4", "reel-cover", "story-stills", "poster", "poster-set", "carousel", "full-poem", "quote", "animated-quote"]) assert.ok(routeById(id), id);
});

// ---------------------------------------------------------------- corpus x route
for (const key of Object.keys(CORPUS))
  for (const route of ROUTES)
    test(`routes: ${route.id} x corpus "${key}" validates, and mutated layouts fail`, () => {
      const { comp, poem } = compFor(key, route);
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
    const { comp, poem } = compFor("indent", route);
    let err = null;
    try { await withTimeout(route.render(comp, inputFor(route, poem), {})); } catch (e) { err = e; }
    if (route.kind !== "video") assert.equal(err, null, `${route.id} should export: ${err?.message}`);
    const lastFont = Math.max(log.lastIndexOf("fonts.load"), log.lastIndexOf("fonts.check"));
    const firstMeasure = log.indexOf("measure");
    assert.ok(log.includes("fonts.load"), "fonts were loaded");
    assert.ok(firstMeasure > lastFont, `${route.id}: measured before fonts were ready (${log.slice(0, 12).join(",")})`);
  });
for (const route of ROUTES)
  test(`routes: ${route.id} never blocks when no font face matches — it exports and WARNS (never silent)`, async () => {
    installDom({ empty: true });
    takeExportWarnings();
    const { comp, poem } = compFor("tabs", route);
    let err = null;
    try { await withTimeout(route.render(comp, inputFor(route, poem), {})); } catch (e) { err = e; }
    if (route.kind !== "video") assert.equal(err, null, `${route.id} must still export: ${err?.message}`);
    else assert.doesNotMatch(String(err?.message || ""), /fallback font/, "a font problem must not be the reason a video stops");
    const w = takeExportWarnings();
    assert.ok(w.some((m) => /^Font check:.*fallback font/s.test(m)), `${route.id}: the font problem is reported: ${JSON.stringify(w)}`);
    assert.deepEqual(takeExportWarnings(), [], "takeExportWarnings clears the list");
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

// ---------------------------------------------------------------- square format
test("square: 1080x1080 with its own margins, a 44px floor, and a whitelisted format key", () => {
  assert.deepEqual([FORMATS.square.w, FORMATS.square.h], [1080, 1080]);
  assert.notEqual(FORMATS.square.safe, FORMATS.poster.safe);
  assert.equal(MIN_TEXT_PX.square, 44);
  assert.ok(FORMAT_KEYS.includes("square"));
  assert.equal(normalizeComposition({ ...defaultComposition({ format: "square", scenes: [] }) }).format, "square");
});
// Superseded by the font-size spec (2026-11): 44px is the square RECOMMENDATION; 43px (or 14px) is the author's choice.
test("square: 44px and an author-chosen 43px both pass; text that cannot fit is still refused", () => {
  const base = normalizeComposition({ ...defaultComposition({ format: "square", scenes: [] }) });
  const comp = { ...base, style: { ...base.style, sizePx: 44 } };
  const scene = { id: "s", kind: "stanza", lines: ["அன்பே சிவம்", "  உள்ளம் சொல்லும்"], durationMs: 4000 };
  const at = validateScene(ctx, comp, scene);
  assert.equal(at.ok, true, at.messages.join("; "));
  for (const px of [43, 14]) {
    const below = validateScene(ctx, { ...comp, style: { ...comp.style, sizePx: px } }, scene);
    assert.equal(below.ok, true, `${px}px: ${below.messages.join("; ")}`);
  }
  // negative control: far more text than the card can hold at 44px is refused, not clipped
  const huge = { ...scene, lines: Array(80).fill("அன்பே சிவம் உள்ளம் சொல்லும்") };
  assert.equal(validateScene(ctx, comp, huge).ok, false);
});

// ---------------------------------------------------------------- quote (excerpt)
test("quote: never claims completeness, reports partial coverage, and enforces its larger floor in every format", () => {
  const { comp, poem } = corpusComp("indent");
  for (const format of ["reel", "story", "poster", "square"]) {
    const sel = [{ stanza: 0, line: 0, text: poem.stanzas[0][0] }, { stanza: 1, line: 0, text: poem.stanzas[1][0] }];
    const v = checkQuote(ctx, comp, poem, sel, { format });
    assert.equal(v.ok, true, `${format}: ${v.messages.join("; ")}`);
    assert.equal(v.excerpt, true);
    assert.equal(v.complete, false);
    assert.deepEqual(v.coverage, { selected: 2, total: poem.stanzas.flat().filter(Boolean).length, partial: true });
    assert.deepEqual(v.scene.lines, [poem.stanzas[0][0], "", poem.stanzas[1][0]], "exact source lines, stanza gap kept");
    assert.ok(QUOTE_MIN_PX[format] > (MIN_TEXT_PX[format] ?? 0));
    // even selecting EVERY line is still reported as an excerpt
    const all = poem.stanzas.flatMap((st, s) => st.map((t, l) => ({ stanza: s, line: l, text: t }))).filter((x) => x.text);
    const va = checkQuote(ctx, comp, poem, all, { format });
    assert.equal(va.complete, false);
    assert.equal(va.coverage.partial, true);
  }
});
test("quote: a selection whose text differs from the source by one character, or out of order, or missing, is refused", () => {
  const { comp, poem } = corpusComp("nbsp");
  const src = poem.stanzas[0][0];
  const edited = checkQuote(ctx, comp, poem, [{ stanza: 0, line: 0, text: src.replace(" ", " ") }]);
  assert.equal(edited.ok, false);
  assert.ok(edited.messages.some((m) => /exact source text/.test(m)));
  assert.equal(checkQuote(ctx, comp, poem, [{ stanza: 0, line: 1 }, { stanza: 0, line: 0 }]).ok, false);
  assert.equal(checkQuote(ctx, comp, poem, [{ stanza: 0, line: 0 }, { stanza: 0, line: 0 }]).ok, false);
  assert.equal(checkQuote(ctx, comp, poem, [{ stanza: 7, line: 0 }]).ok, false);
  assert.equal(checkQuote(ctx, comp, poem, []).ok, false);
});
// Superseded by the font-size spec (2026-11): the 56px poster quote size is a recommendation; a smaller size the author
// chose (40px body -> 52px quote) is drawn as chosen. Text that cannot fit at its size is still refused, never clipped.
test("quote: an author-chosen size below the quote recommendation is honoured; unfittable text is still refused", () => {
  const { comp, poem } = corpusComp("long");
  const tiny = { ...comp, style: { ...comp.style, sizePx: 40 } }; // 40*1.3 = 52 < 56 poster recommendation
  const v = checkQuote(ctx, tiny, poem, [{ stanza: 0, line: 1 }], { format: "poster" });
  assert.equal(v.ok, true, v.messages.join("; "));
  const all = poem.stanzas.flatMap((st, s) => st.map((t, l) => ({ stanza: s, line: l, text: t }))).filter((x) => x.text);
  const big = { ...comp, style: { ...comp.style, sizePx: 140 } };
  const bad = checkQuote(ctx, big, { ...poem, stanzas: Array(6).fill(poem.stanzas.flat()) }, Array(6).fill(0).flatMap((_, s) => all.map((x, l) => ({ stanza: s, line: l, text: x.text }))), { format: "poster" });
  assert.equal(bad.ok, false, "negative control: far too much text is refused");
});

// ---------------------------------------------------------------- carousel
test("carousel: cover + poem cards + end card, numbered k/N, every card validated (cover/end text included)", () => {
  const { comp } = corpusComp("blanks");
  const plan = carouselPlan(ctx, comp);
  assert.equal(plan.cards[0].role, "cover");
  assert.equal(plan.cards.at(-1).role, "end");
  assert.deepEqual(plan.cards.map((c) => c.page), plan.cards.map((_, i) => `${i + 1}/${plan.cards.length}`));
  const v = checkCarousel(ctx, comp);
  assert.equal(v.ok, true, v.messages.join("; "));
  assert.equal(v.results.length, plan.cards.length, "one validation result per card");
  // negative control: an end card too long to fit at the poster floor is refused, not clipped
  const long = { ...comp, poster: { ...comp.poster, endText: Array(40).fill("நன்றி நன்றி நன்றி").join("\n") } };
  const bad = checkCarousel(ctx, long);
  assert.equal(bad.ok, false);
  assert.ok(bad.messages.some((m) => /^End card/.test(m)), bad.messages.join("; "));
  // the page label sits in the top margin, inside the side margins
  const b = pageLabelBox(comp, FORMATS.poster, ctx, "12/12");
  assert.ok(b.top >= 0 && b.right <= FORMATS.poster.w * (1 - FORMATS.poster.safe.side) + 0.5);
});

// ---------------------------------------------------------------- nothing blocks an export: the auto-fix ladder
test("resolveRoute: passes straight through (no warning, no change) when the check is ok", () => {
  takeExportWarnings();
  const comp = { motion: { textIn: "rise" }, style: { font: "noto-serif" } };
  const r = EXPORTS.resolveRoute("X", comp, () => ({ ok: true, messages: [] }), { minSize: 40 });
  assert.equal(r.comp, comp); assert.equal(r.minSize, 40);
  assert.deepEqual(takeExportWarnings(), []);
});
test("resolveRoute: lowers the text floor stepwise, draws with the SAME floor, never below 16px, and says so", () => {
  takeExportWarnings();
  const comp = { motion: { textIn: "fade" }, style: { font: "noto-serif" } };
  const seen = [];
  const r = EXPORTS.resolveRoute("Video", comp, (c, ms) => { seen.push(ms); return ms <= 30 ? { ok: true, messages: [] } : { ok: false, messages: ["a", "b"] }; }, { minSize: 40 });
  assert.equal(r.v.ok, true); assert.equal(r.minSize, 28); // 40*0.7
  assert.ok(seen.every((m) => m >= EXPORTS.SOFT_FLOOR_PX));
  const w = takeExportWarnings();
  assert.ok(w.some((m) => /Video: .*smaller \(down to 28px\)/.test(m)), JSON.stringify(w));
});
test("resolveRoute: simplifies the animation only when that helps; an unhelpful step is NOT kept", () => {
  takeExportWarnings();
  const comp = { motion: { textIn: "rise" }, style: { font: "noto-serif" } };
  const r = EXPORTS.resolveRoute("Video", comp, (c) => (c.motion.textIn === "fade" ? { ok: true, messages: [] } : { ok: false, messages: ["anim"] }));
  assert.equal(r.comp.motion.textIn, "fade");
  assert.ok(takeExportWarnings().some((m) => /simplified to a fade/.test(m)));
  // negative control: fade does not help -> the user's animation is kept
  const r2 = EXPORTS.resolveRoute("Video", comp, () => ({ ok: false, messages: ["other"] }));
  assert.equal(r2.comp.motion.textIn, "rise");
  const w = takeExportWarnings();
  assert.ok(!w.some((m) => /simplified/.test(m)));
  assert.ok(w.some((m) => /could not be fixed automatically.*other/.test(m)), "an unfixable problem is still reported, never silent");
});

// Updated by the font-size spec (2026-11): the old 16px floor is gone; only the technical bound (8px) remains.
test("font size: the author's size is the floor (not a failure); only the technical 8px bound applies", async () => {
  const { sceneMin, SIZE_PX_MIN } = await import("../../src/lib/motion-studio/route-checks.js");
  assert.equal(SIZE_PX_MIN, 8);
  assert.equal(sceneMin("reel"), MIN_TEXT_PX.reel);
  assert.equal(sceneMin("reel", { style: { sizePx: 64 } }), MIN_TEXT_PX.reel, "a larger size keeps the format floor");
  assert.equal(sceneMin("reel", { style: { sizePx: 22 } }), 22);
  assert.equal(sceneMin("reel", { style: { sizePx: 14 } }), 14);
  assert.equal(sceneMin("reel", { style: { sizePx: 3 } }), 8, "negative control: never below the technical 8px bound");
  const c = normalizeComposition({ ...defaultComposition({ title: "", stanzas: [["அ"]] }), style: { ...defaultComposition({ title: "", stanzas: [["அ"]] }).style, sizePx: 17 } });
  assert.equal(c.style.sizePx, 17);
  const c2 = normalizeComposition({ ...c, style: { ...c.style, sizePx: 3 } });
  assert.equal(c2.style.sizePx, 8);
});
