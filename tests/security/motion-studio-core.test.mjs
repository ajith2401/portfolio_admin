import test from "node:test";
import assert from "node:assert/strict";
import { extractPoem } from "../../src/lib/motion-studio/poem.js";
import { generateScenes, sceneLines, splitStanza } from "../../src/lib/motion-studio/scenes.js";
import { graphemes, wrapLine } from "../../src/lib/motion-studio/graphemes.js";
import { safeRect } from "../../src/lib/motion-studio/safe-zone.js";
import { defaultComposition, normalizeComposition } from "../../src/lib/motion-studio/composition.js";
import { TEMPLATES } from "../../src/lib/motion-studio/templates.js";

const T = (text) => ({ type: "text", text });
const HB = { type: "hardBreak" };
const doc = {
  type: "doc",
  content: [{ type: "poem", content: [
    { type: "paragraph", content: [T("அன்பே சிவம்"), HB, T("அறமே துணை"), HB, T("நன்றே செய்"), HB, T("இன்றே செய்"), HB, T("ஒன்றே குலம்")] },
    { type: "paragraph", content: [T("வாழ்க வளமுடன்")] },
  ] }],
};

test("extractPoem keeps stanzas, lines and order; source doc untouched", () => {
  const before = JSON.stringify(doc);
  const p = extractPoem(doc);
  assert.equal(p.stanzas.length, 2);
  assert.deepEqual(p.stanzas[0], ["அன்பே சிவம்", "அறமே துணை", "நன்றே செய்", "இன்றே செய்", "ஒன்றே குலம்"]);
  assert.equal(JSON.stringify(doc), before);
});
test("scenes never drop or reorder lines and respect limits", () => {
  const p = extractPoem(doc);
  const scenes = generateScenes(p, { title: "குறள்" });
  assert.equal(scenes[0].kind, "title");
  assert.deepEqual(sceneLines(scenes), p.stanzas.flat());
  assert.ok(scenes.every((s) => s.lines.length <= 4 && s.durationMs >= 3000));
  assert.equal(splitStanza(p.stanzas[0]).flat().length, 5);
});
test("graphemes keep Tamil clusters whole", () => {
  assert.deepEqual(graphemes("தமிழ்"), ["த", "மி", "ழ்"]);
  const w = "கொண்டாட்டம்கொண்டாட்டம்";
  const lines = wrapLine(w, 5, (s) => graphemes(s).length);
  assert.equal(lines.join(""), w);
  assert.ok(lines.every((l) => graphemes(l).length <= 5));
});
test("safe zone geometry", () => {
  const r = safeRect(1080, 1920);
  assert.deepEqual(r, { x: 65, y: 269, w: 950, h: 979 });
});
test("six distinct templates", () => {
  assert.equal(TEMPLATES.length, 6);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 6);
  assert.ok(new Set(TEMPLATES.map((t) => t.style.font + t.motion.textIn + t.fx.particles)).size >= 5);
});
test("normalizeComposition whitelists, clamps and strips unknown fields", () => {
  const c = normalizeComposition({
    format: "evil", templateId: "nope", __proto__x: 1, injected: "<script>",
    scenes: [{ lines: ["a", "  "], durationMs: 1 }, { lines: [] }],
    style: { sizePx: 9999, color: "red", font: "comic" }, branding: { signature: "x".repeat(500) },
  });
  assert.equal(c.format, "reel");
  assert.equal(c.scenes.length, 1);
  assert.equal(c.scenes[0].durationMs, 3000);
  assert.equal(c.style.sizePx, 140);
  assert.match(c.style.color, /^#/);
  assert.equal(c.style.font, "noto-serif");
  assert.equal(c.branding.signature.length, 60);
  assert.equal("injected" in c, false);
  const d = defaultComposition({ scenes: generateScenes(extractPoem(doc)) });
  assert.deepEqual(normalizeComposition(d), d);
});
