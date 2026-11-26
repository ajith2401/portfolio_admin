// WP6: independent signature controls (size/position/alignment/show), single source, legacy preserved.
import test from "node:test";
import assert from "node:assert/strict";
import { defaultComposition, normalizeComposition } from "../../src/lib/motion-studio/composition.js";
import { signatureBox, textRect, signatureBoundsIssues, overlapsSignature, isLegacySignature } from "../../src/lib/motion-studio/signature.js";
import { validateScene, validateScenes, drawFrame } from "../../src/lib/motion-studio/render.js";
import { layoutFullPoem, validateFullPoem } from "../../src/lib/motion-studio/full-poem.js";
import { requiredFaces } from "../../src/lib/motion-studio/font-ready.js";
import { planFit } from "../../src/lib/motion-studio/fit-scenes.js";
import { FORMATS, safeRect } from "../../src/lib/motion-studio/safe-zone.js";

const mkCtx = (k = 0.55) => {
  let px = 40; const calls = [];
  return {
    calls,
    set font(f) { px = Number(/(\d+)px/.exec(f)[1]); this._f = f; }, get font() { return this._f || `${px}px x`; },
    measureText: (t) => ({ width: Array.from(t).length * px * k }),
    save() {}, restore() {}, scale() {}, translate() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), drawImage() {},
    fillText(text, x, y) { calls.push({ text, x, y, font: this._f, align: this.textAlign }); },
  };
};
const ctx = mkCtx();
const LINES = Array.from({ length: 12 }, (_, i) => `வரி ${i + 1} அன்பே சிவம்`);
const sceneComp = (format, brand = {}, style = {}) => {
  const c = defaultComposition({ format, scenes: [{ id: "s0", kind: "stanza", lines: LINES, durationMs: 6000 }] });
  c.style = { ...c.style, sizePx: format === "poster" ? 46 : 40, lineHeight: 2.0, ...style };
  c.branding = { ...c.branding, ...brand };
  return normalizeComposition(c);
};
const legacyComp = (format = "reel") => {
  const c = sceneComp(format);
  delete c.branding.size; delete c.branding.yPct; delete c.branding.align;
  return normalizeComposition(c);
};

test("defaults per format: 40px, centred, Reel/Story 61%, Poster 95.5%", () => {
  for (const [f, y] of [["reel", 0.61], ["story", 0.61], ["poster", 0.955]]) {
    const c = defaultComposition({ format: f });
    assert.equal(c.branding.size, 40); assert.equal(c.branding.align, "center"); assert.equal(c.branding.yPct, null);
    const sg = signatureBox(c, FORMATS[f]);
    assert.equal(sg.size, 40); assert.equal(sg.y, FORMATS[f].h * y); assert.equal(sg.x, 540); assert.match(sg.font, /^500 40px /);
  }
});

test("normalize whitelists and clamps; persistence round trip is stable", () => {
  const c = defaultComposition({ format: "reel" });
  c.branding = { ...c.branding, size: 500, yPct: 7, align: "bogus" };
  const n = normalizeComposition(c);
  assert.equal(n.branding.size, 64); assert.equal(n.branding.yPct, 0.99); assert.equal(n.branding.align, "center");
  assert.equal(normalizeComposition({ ...c, branding: { ...c.branding, size: 2 } }).branding.size, 24);
  const set = normalizeComposition({ ...c, branding: { ...c.branding, size: 52, yPct: 0.5, align: "right", show: false } });
  const rt = normalizeComposition(JSON.parse(JSON.stringify(set)));
  assert.deepEqual(rt.branding, set.branding);
  assert.deepEqual({ s: rt.branding.size, y: rt.branding.yPct, a: rt.branding.align, show: rt.branding.show }, { s: 52, y: 0.5, a: "right", show: false });
});

test("template switch (pickTemplate rebuild) keeps every signature field; colour follows the template", () => {
  const c = normalizeComposition({ ...defaultComposition({ format: "reel", templateId: "ink-silence" }), branding: { show: false, signature: "Test Sig", watermark: true, size: 58, yPct: 0.4, align: "left", color: "#123456" } });
  const next = defaultComposition({ format: c.format, templateId: "paper-ink", scenes: c.scenes, signature: c.branding.signature, branding: c.branding });
  assert.deepEqual({ ...next.branding, color: 0 }, { ...c.branding, color: 0 });
  assert.notEqual(next.templateId, c.templateId);
});

test("legacy project: normalize keeps no new fields, switch keeps it legacy, geometry identical to the old constants", () => {
  for (const f of ["reel", "story", "poster"]) {
    const c = legacyComp(f);
    assert.ok(isLegacySignature(c.branding));
    assert.deepEqual(Object.keys(c.branding).sort(), ["color", "show", "signature", "watermark"]);
    assert.deepEqual(normalizeComposition(JSON.parse(JSON.stringify(c))), c);
    const sw = defaultComposition({ format: f, templateId: "paper-ink", scenes: c.scenes, signature: c.branding.signature, branding: c.branding });
    assert.ok(isLegacySignature(sw.branding), "template switch must not silently move a legacy signature");
    const fmt = FORMATS[f], sg = signatureBox(c, fmt);
    assert.equal(sg.size, 30); assert.equal(sg.x, 540); assert.equal(sg.y, fmt.h * (f === "poster" ? 0.955 : 0.8)); assert.equal(sg.font.slice(0, 8), "500 30px");
    assert.deepEqual(textRect(c, fmt), safeRect(fmt.w, fmt.h, fmt.safe), "legacy text area is untouched");
    const cx = mkCtx(); drawFrame(cx, c, 0, { still: true });
    const drawn = cx.calls.at(-1);
    assert.deepEqual([drawn.text, drawn.x, drawn.y, drawn.align], [c.branding.signature, 540, fmt.h * (f === "poster" ? 0.955 : 0.8), "center"]);
    assert.match(drawn.font, /^500 30px /);
  }
});

test("drawFrame draws the configured signature and the text stays clear of it (reel, story, poster)", () => {
  for (const [f, y] of [["reel", 0.61], ["story", 0.61], ["poster", 0.5]]) {
    const c = sceneComp(f, { size: 48, yPct: y, align: "right" });
    const fmt = FORMATS[f], sg = signatureBox(c, fmt);
    const cx = mkCtx(); drawFrame(cx, c, 0, { still: true, minSize: 10 });
    const s = cx.calls.at(-1);
    assert.deepEqual([s.text, s.x, s.y, s.align], [c.branding.signature, sg.x, sg.y, "right"]);
    assert.match(s.font, /^500 48px /);
    for (const t of cx.calls.slice(0, -1)) assert.ok(!(t.y + 10 > sg.top && t.y - 10 < sg.bottom), `${f}: text row at ${t.y} hits the signature`);
  }
});

test("NEGATIVE CONTROLS: text that only fits when the signature band is ignored is flagged (reel, story, poster)", () => {
  for (const [f, y] of [["reel", 0.61], ["story", 0.61], ["poster", 0.5]]) {
    const hidden = sceneComp(f, { show: false }), shown = sceneComp(f, { show: true, size: 40, yPct: y });
    const sc = (c) => c.scenes[0];
    assert.equal(validateScene(ctx, hidden, sc(hidden), { minSize: f === "poster" ? 46 : 40 }).ok, true, `${f}: fits with the signature hidden`);
    const r = validateScene(ctx, shown, sc(shown), { minSize: f === "poster" ? 46 : 40 });
    assert.equal(r.ok, false, `${f}: must NOT pass when the reserved band removes the room`);
    assert.ok(r.messages.length > 0);
    assert.ok(textRect(shown, FORMATS[f]).h < textRect(hidden, FORMATS[f]).h);
  }
  // direct overlap predicate
  const sg = signatureBox(sceneComp("reel"), FORMATS.reel);
  assert.equal(overlapsSignature(sg, sg.top - 5, sg.top + 5), true);
  assert.equal(overlapsSignature(sg, sg.top - 50, sg.top - 1), false);
});

test("NEGATIVE CONTROL full poem: a signature box over the text is flagged; the real layout is clean", () => {
  const comp = sceneComp("reel", { size: 40 });
  const poem = { title: "தலைப்பு", stanzas: [LINES.slice(0, 4), LINES.slice(4, 8)] };
  const L = layoutFullPoem(ctx, comp, poem, { preset: "balanced" });
  assert.equal(validateFullPoem(poem, L).ok, true, JSON.stringify(validateFullPoem(poem, L).messages));
  assert.equal(L.footer, 160); // 120 + real size
  const mid = L.items.filter((i) => i.kind === "line")[3];
  const y = L.offset + mid.y;
  const forged = { ...L, signature: { ...L.signature, top: y - 20, bottom: y + 20 } };
  const bad = validateFullPoem(poem, forged);
  assert.equal(bad.ok, false); assert.ok(bad.messages.some((m) => /signature overlaps/.test(m)));
  const off = layoutFullPoem(ctx, sceneComp("reel", { show: false }), poem, { preset: "balanced" });
  assert.equal(off.footer, 40); assert.equal(off.signature, null);
  const L30 = layoutFullPoem(ctx, legacyComp("reel"), poem, { preset: "balanced" });
  assert.equal(L30.footer, 150); assert.equal(L30.signature.size, 30);
});

test("out-of-bounds signature is flagged (canvas, safe margins, safe area)", () => {
  const fmt = FORMATS.reel;
  const low = sceneComp("reel", { yPct: 0.99 });
  assert.ok(signatureBoundsIssues(low, fmt, ctx).some((m) => /canvas/.test(m)));
  assert.ok(signatureBoundsIssues(sceneComp("reel", { yPct: 0.85 }), fmt, ctx).some((m) => /vertically/.test(m)));
  const wide = sceneComp("reel", { size: 64, signature: "W".repeat(60) });
  const issues = signatureBoundsIssues(wide, fmt, ctx);
  assert.ok(issues.some((m) => /canvas/.test(m)) && issues.some((m) => /margins/.test(m)));
  const v = validateScene(ctx, wide, wide.scenes[0], { minSize: 40 });
  assert.equal(v.ok, false); assert.ok(v.messages.some((m) => /signature is outside/.test(m)));
  assert.deepEqual(signatureBoundsIssues(sceneComp("reel"), fmt, ctx), [], "the default is in bounds");
  assert.deepEqual(signatureBoundsIssues(sceneComp("poster"), FORMATS.poster, ctx), []);
});

test("requiredFaces: the signature face uses its real size; show=false removes the face and the reserved band", () => {
  const sig = (c) => requiredFaces(c).find((f) => f.role === "signature");
  assert.match(sig(sceneComp("reel", { size: 52 })).font, /^500 52px /);
  assert.match(sig(sceneComp("reel")).font, /^500 40px /);
  assert.match(sig(legacyComp("reel")).font, /^500 30px /);
  const off = sceneComp("reel", { show: false });
  assert.equal(sig(off), undefined);
  assert.deepEqual(textRect(off, FORMATS.reel), safeRect(1080, 1920, FORMATS.reel.safe));
  assert.equal(signatureBox(off, FORMATS.reel), null);
});

test("WP5 fit still works with the signature shown at 61%", () => {
  const dense = Array.from({ length: 12 }, (_, i) => `கொடிய வெயில் காய்ந்தாலும் குளிர்ந்த நிழல் தருவாய் ${i}`);
  for (const f of ["reel", "story"]) {
    const c = defaultComposition({ format: f, scenes: [{ id: "s0", kind: "stanza", lines: dense, durationMs: 6000, stanza: 0, part: 0, parts: 1 }] });
    c.poem = { title: "", stanzas: [dense] };
    const comp = normalizeComposition(c);
    assert.equal(comp.branding.show, true);
    assert.equal(validateScenes(ctx, comp, comp.scenes, { minSize: 40 }).ok, false, "needs splitting");
    const plan = planFit(ctx, comp);
    assert.equal(plan.ok ?? true, true);
    const scenes = plan.scenes || plan.next?.scenes;
    assert.ok(scenes && scenes.length > 1);
    assert.equal(validateScenes(ctx, comp, scenes, { minSize: 40 }).ok, true);
  }
});
