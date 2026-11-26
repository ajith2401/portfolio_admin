import test from "node:test";
import assert from "node:assert/strict";
import { parsePoemText, parseMarkdownPoem, poemToText, normalizeNewlines } from "../../src/lib/motion-studio/poem-input.js";
import { defaultComposition, normalizeComposition, MAX_SCENES, normalizePoemSnapshot } from "../../src/lib/motion-studio/composition.js";
import { generateScenes, sceneLines } from "../../src/lib/motion-studio/scenes.js";
import { missingLines } from "../../src/lib/motion-studio/scene-edit.js";
import { layoutFullPoem, fullPoemCoverage, PRESETS, MIN_READABLE, FULL_STD_H, FULL_MAX_H } from "../../src/lib/motion-studio/full-poem.js";

// Stub measuring context: every code point is 0.55em wide (close to Tamil advance widths).
const ctx = (() => {
  let px = 16;
  return { set font(f) { px = Number(/(\d+)px/.exec(f)[1]); }, get font() { return `${px}px x`; }, measureText: (t) => ({ width: Array.from(t).length * px * 0.55 }) };
})();

const TAMIL = "அன்பே வா\nநிலவே வா\n\nமழை பெய்கிறது\nமனம் நனைகிறது";

test("paste: blank lines make stanzas, newlines make lines, nothing is dropped or rewritten", () => {
  const p = parsePoemText(TAMIL, { title: "  மழை " });
  assert.deepEqual(p.stanzas, [["அன்பே வா", "நிலவே வா"], ["மழை பெய்கிறது", "மனம் நனைகிறது"]]);
  assert.equal(p.title, "மழை");
  assert.equal(p.lineCount, 4);
  assert.equal(poemToText(p), TAMIL);
});
test("paste: CRLF, CR, BOM and unicode line separators (WhatsApp/Notes/Keep) become real line breaks", () => {
  const p = parsePoemText("﻿ஒன்று\r\nஇரண்டு\r\r\nமூன்று நான்கு ஐந்து");
  assert.deepEqual(p.stanzas.flat(), ["ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து"]);
  assert.equal(normalizeNewlines("a\r\nb"), "a\nb");
});
test("paste: ZWJ/ZWNJ and Tamil combining marks survive byte-for-byte", () => {
  const line = "க்ஷ‍த‌ம் ஸ்ரீ";
  assert.equal(parsePoemText(line).stanzas[0][0], line);
});
test("paste: poem with no blank line is one stanza; whitespace-only input is empty", () => {
  assert.equal(parsePoemText("a\nb\nc").stanzas.length, 1);
  assert.deepEqual(parsePoemText("  \n\t\n").stanzas, []);
});
test("markdown import: heading becomes title, markers stripped, text intact", () => {
  const p = parseMarkdownPoem("# தலைப்பு\n\n> **அன்பே** வா\n- நிலவே *வா*\\\n\n---\nமழை");
  assert.equal(p.title, "தலைப்பு");
  assert.deepEqual(p.stanzas, [["அன்பே வா", "நிலவே வா"], ["மழை"]]);
});
test("a 61-scene poem is NOT truncated by normalization (regression: cap was 60)", () => {
  const stanzas = Array.from({ length: 70 }, (_, i) => [`வரி ${i} ஒன்று`, `வரி ${i} இரண்டு`, `வரி ${i} மூன்று`, `வரி ${i} நான்கு`, `வரி ${i} ஐந்து`]);
  const scenes = generateScenes({ stanzas }, { title: "நீண்ட கவிதை" });
  assert.ok(scenes.length > 60 && scenes.length <= MAX_SCENES);
  const c = normalizeComposition({ ...defaultComposition({ scenes }), scenes });
  assert.equal(c.scenes.length, scenes.length);
  assert.deepEqual(missingLines({ stanzas }, c.scenes), []);
  assert.deepEqual(sceneLines(c.scenes), stanzas.flat());
});
test("poem snapshot is bounded plain text", () => {
  assert.equal(normalizePoemSnapshot(null), undefined);
  assert.equal(normalizePoemSnapshot({ stanzas: [[]] }), undefined);
  const s = normalizePoemSnapshot({ title: "x".repeat(999), stanzas: [["a", "", "b"], "bad", ["c".repeat(999)]] });
  assert.equal(s.title.length, 300);
  assert.deepEqual(s.stanzas[0], ["a", "b"]);
  assert.equal(s.stanzas[1][0].length, 400);
  assert.deepEqual(normalizeComposition({ poem: { stanzas: [["a"]] } }).poem.stanzas, [["a"]]);
  assert.equal(normalizeComposition({}).poem, undefined);
});

const comp = () => defaultComposition({ scenes: [{ id: "a", kind: "stanza", lines: ["x"], durationMs: 3000 }] });
const poemOf = (stanzas, n = 4, title = "தலைப்பு") => ({ title, stanzas: Array.from({ length: stanzas }, (_, s) => Array.from({ length: n }, (_, l) => `அன்பே நிலவே ${s}-${l}`)) });

test("full poem: short poem fits the standard 1080x1920 canvas at the preset size with every line present", () => {
  for (const k of Object.keys(PRESETS)) {
    const poem = poemOf(2, 4), L = layoutFullPoem(ctx, comp(), poem, { preset: k });
    assert.equal(L.fits, true, k);
    assert.equal(L.height, FULL_STD_H);
    assert.equal(L.size, PRESETS[k].size);
    assert.deepEqual(fullPoemCoverage(poem, L), [], k);
  }
});
test("full poem: medium poem shrinks but never below the readable floor, and keeps every line", () => {
  const poem = poemOf(5, 5), L = layoutFullPoem(ctx, comp(), poem, { preset: "compact" });
  assert.ok(L.size >= MIN_READABLE);
  if (L.fits) assert.deepEqual(fullPoemCoverage(poem, L), []);
});
test("full poem: too long for standard → fits:false with a suggestion, never silently shrunk or clipped", () => {
  const poem = poemOf(8, 6), L = layoutFullPoem(ctx, comp(), poem, { preset: "balanced" });
  assert.equal(L.fits, false);
  assert.ok(L.suggestedHeight > FULL_STD_H && L.suggestedHeight <= FULL_MAX_H);
  assert.equal(L.size, MIN_READABLE);
});
test("full poem: extended canvas keeps the whole poem at a readable size in ONE image", () => {
  const poem = poemOf(8, 6), L = layoutFullPoem(ctx, comp(), poem, { preset: "balanced", height: "extended" });
  assert.equal(L.fits, true);
  assert.ok(L.height > FULL_STD_H && L.height <= FULL_MAX_H);
  assert.ok(L.size >= MIN_READABLE);
  assert.deepEqual(fullPoemCoverage(poem, L), []);
  assert.equal(L.items.filter((i) => i.kind === "line").length >= 48, true);
});
test("full poem: absurdly long poem is reported as not fitting even when extended (never truncated)", () => {
  const poem = poemOf(200, 8), L = layoutFullPoem(ctx, comp(), poem, { preset: "compact", height: "extended" });
  assert.equal(L.fits, false);
  assert.equal(L.height, FULL_MAX_H);
});
test("full poem: long single lines wrap on grapheme boundaries and are still fully covered", () => {
  const poem = { title: "", stanzas: [["தமிழ் ".repeat(40).trim()], ["x".repeat(300)]] };
  const L = layoutFullPoem(ctx, comp(), poem, { preset: "balanced", height: "extended" });
  assert.deepEqual(fullPoemCoverage(poem, L), []);
});
test("full poem: coverage check really detects a missing line", () => {
  const poem = poemOf(2, 3), L = layoutFullPoem(ctx, comp(), poem);
  L.items = L.items.filter((i) => !(i.kind === "line" && i.stanza === 1 && i.line === 2));
  assert.equal(fullPoemCoverage(poem, L).length, 1);
});
