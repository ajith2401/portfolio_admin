// WP5: 40px minimum for Reel/Story, fit-driven scene splitting, legacy projects untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { defaultComposition, normalizeComposition } from "../../src/lib/motion-studio/composition.js";
import { sceneLines, totalDuration } from "../../src/lib/motion-studio/scenes.js";
import { planFit, applyFit, readabilityIssues } from "../../src/lib/motion-studio/fit-scenes.js";
import { validateScenes, layoutScene } from "../../src/lib/motion-studio/render.js";
import { MIN_TEXT_PX, FORMATS, safeRect } from "../../src/lib/motion-studio/safe-zone.js";

const mkCtx = (k = 0.55) => {
  let px = 40;
  return {
    set font(f) { px = Number(/(\d+)px/.exec(f)[1]); },
    get font() { return `${px}px x`; },
    measureText: (t) => ({ width: Array.from(t).length * px * k }),
  };
};
const ctx = mkCtx();
const BASE = [
  "கொடிய வெயில் காய்ந்தாலும் குளிர்ந்த நிழல் தருவாய்",
  "அன்பே சிவம் என்று அறிந்தவர் வாழ்வில் துயரில்லை",
  "தமிழ் என்றும் வாழ்க தரணி எங்கும் ஒளிர்க",
  "மழை பெய்து நிலம் குளிர்ந்து பயிர்கள் செழித்தன",
  "கடலோரம் நடந்து சென்ற காலடித் தடங்கள் அழிந்தன",
  "நிலவொளியில் நனைந்த இரவு நீளமாய் நீண்டது",
  "விடியலின் முதல் கதிர் வந்து விழிகளைத் தொட்டது",
  "பறவைகள் பாடிய பாடலில் பருவம் மாறியது",
];
// long Tamil lines (3x repeated) so four of them overflow a Reel scene at 40px
const TA = BASE.map((l) => `${l} ${l} ${l}`);
const poem = { stanzas: [TA.slice(0, 4), TA.slice(4), ["தனி வரி"]] };
const mkComp = (over = {}) => {
  // one scene per stanza (as an author may have merged them): the four-line scene cannot fit at 40px
  const scenes = [{ id: "t", kind: "title", lines: ["தலைப்பு"], durationMs: 3200 },
    ...poem.stanzas.map((st, si) => ({ id: `s${si}`, kind: "stanza", lines: st, durationMs: 6000, stanza: si, part: 0, parts: 1 }))];
  return normalizeComposition({ ...defaultComposition({ scenes }), scenes, poem: { title: "தலைப்பு", stanzas: poem.stanzas }, ...over });
};
// Dense scenes: 4 long lines per scene overflow at 40px with this stub font.
const dense = () => { const c = mkComp(); c.scenes.forEach((s, i) => { s.durationMs = i % 2 ? 7000 : s.durationMs; }); return c; };

test("MIN_TEXT_PX: reel/story 40, poster 46", () => {
  assert.deepEqual({ ...MIN_TEXT_PX }, { reel: 40, story: 40, poster: 46 });
});

test("planFit: every scene passes validateScenes at 40px, lines identical and ordered", () => {
  for (const format of ["reel", "story"]) {
    const comp = { ...dense(), format };
    const before = validateScenes(ctx, comp, comp.scenes, { minSize: 40 });
    assert.equal(before.ok, false, "fixture must actually need splitting");
    const plan = planFit(ctx, comp);
    assert.ok(plan.ok);
    assert.ok(plan.sceneCountAfter > plan.sceneCountBefore);
    assert.equal(plan.addedScenes, plan.sceneCountAfter - plan.sceneCountBefore);
    assert.deepEqual(plan.unfittable, []);
    const after = applyFit(comp, plan);
    assert.equal(validateScenes(ctx, after, after.scenes, { minSize: 40 }).ok, true);
    assert.deepEqual(sceneLines(plan.scenes), sceneLines(comp.scenes));
    assert.equal(plan.durationAfterMs, totalDuration(plan.scenes));
    assert.equal(plan.durationBeforeMs, totalDuration(comp.scenes));
    plan.scenes.forEach((s) => s.lines.forEach((l) => assert.ok(TA.includes(l) || l === "தலைப்பு" || l === "தனி வரி")));
    // text size never dropped below the floor
    const rect = safeRect(FORMATS[format].w, FORMATS[format].h, FORMATS[format].safe);
    after.scenes.forEach((s) => assert.ok(layoutScene(ctx, after, s, rect).size >= 40));
  }
});

test("planFit: stanza metadata stays consistent, input is not mutated", () => {
  const comp = dense();
  const snap = JSON.stringify(comp);
  const plan = planFit(ctx, comp);
  assert.equal(JSON.stringify(comp), snap);
  const byStanza = new Map();
  plan.scenes.filter((s) => s.stanza != null).forEach((s) => byStanza.set(s.stanza, [...(byStanza.get(s.stanza) || []), s]));
  for (const [, list] of byStanza) {
    list.forEach((s, i) => { assert.equal(s.part, i); assert.equal(s.parts, list.length); });
  }
  assert.deepEqual([...byStanza.keys()], [0, 1, 2]);
  assert.equal(new Set(plan.scenes.map((s) => s.id)).size, plan.scenes.length, "ids unique");
});

test("planFit: manual durations on untouched scenes preserved, split durations proportional, overrides on first piece", () => {
  const comp = dense();
  const last = comp.scenes[comp.scenes.length - 1]; // one-line stanza
  last.durationMs = 9100; // manual timing on a one-line scene that fits
  const big = comp.scenes[1]; // 4-line stanza
  big.offsetY = 5; big.align = "left"; big.durationMs = 8000;
  const plan = planFit(ctx, comp);
  assert.equal(plan.scenes[plan.scenes.length - 1].durationMs, 9100);
  assert.ok(plan.keptManualTimings >= 1);
  const first = plan.scenes.find((s) => s.id === big.id);
  assert.equal(first.offsetY, 5); assert.equal(first.align, "left");
  const pieces = plan.scenes.filter((s) => s.stanza === big.stanza && s.part >= 0 && s.lines.every((l) => big.lines.includes(l)));
  assert.ok(pieces.length >= 2);
  pieces.slice(1).forEach((p) => { assert.equal(p.offsetY, undefined); assert.equal(p.align, undefined); });
  const split = pieces.reduce((n, p) => n + p.durationMs, 0);
  assert.ok(Math.abs(split - 8000) <= 3000 * pieces.length, "roughly proportional");
});

test("legacy 28px comp loads byte-identical and is flagged, not rewritten", () => {
  const raw = dense();
  raw.style = { ...raw.style, sizePx: 28 };
  const once = normalizeComposition(JSON.parse(JSON.stringify(raw)));
  assert.equal(once.style.sizePx, 28);
  assert.equal(JSON.stringify(normalizeComposition(JSON.parse(JSON.stringify(once)))), JSON.stringify(once));
  assert.ok(readabilityIssues(ctx, once).length > 0);
  const plan = planFit(ctx, once);
  assert.deepEqual(plan.sizePx, { from: 28, to: 40 }); // explicit and reported, only applied by applyFit
  assert.equal(once.style.sizePx, 28);
  const fitted = applyFit(once, plan);
  assert.equal(readabilityIssues(ctx, fitted).length, 0);
});

test("export validation refuses a sub-40 Reel with a message naming the fit action", () => {
  const comp = { ...mkComp(), format: "reel" };
  comp.style = { ...comp.style, sizePx: 30 };
  const v = validateScenes(ctx, comp, comp.scenes);
  assert.equal(v.ok, false);
  assert.match(v.messages.join(" "), /below the 40px minimum/);
  assert.match(v.messages.join(" "), /Fit scenes to 40px/);
});

test("NEGATIVE CONTROL: a planner that drops a line is caught by the line-identity check", () => {
  const comp = dense();
  const good = planFit(ctx, comp);
  const broken = { ...good, scenes: good.scenes.map((s, i) => (i === 2 ? { ...s, lines: s.lines.slice(0, -1) } : s)).filter((s) => s.lines.length) };
  assert.notDeepEqual(sceneLines(broken.scenes), sceneLines(comp.scenes), "the check used by the tests detects the dropped line");
  assert.deepEqual(sceneLines(good.scenes), sceneLines(comp.scenes));
});

test("unfittable single long line is reported, never dropped or altered", () => {
  const ctx = mkCtx(0.9); // wide glyphs: even alone this line cannot fit at 40px
  const long = "அ".repeat(400);
  const scenes = [{ id: "a", kind: "stanza", lines: [long], durationMs: 5000 }];
  const comp = normalizeComposition({ ...defaultComposition({ scenes }), scenes });
  const plan = planFit(ctx, comp);
  assert.deepEqual(sceneLines(plan.scenes), [long]);
  assert.deepEqual(plan.unfittable, [0]);
});

test("poster format is untouched", () => {
  const comp = { ...dense(), format: "poster" };
  const plan = planFit(ctx, comp);
  assert.equal(plan.changed.length, 0);
  assert.equal(plan.scenes, comp.scenes);
});
