// Typography pairings: approved fonts only, real weights, <= 2 families, and applying one touches ONLY style fields.
// Also: every self-hosted font ships its original file + OFL text; no runtime Google Fonts CDN reference.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FONT_PAIRINGS, assertPairing, applyPairing, currentPairing } from "../../src/lib/motion-studio/font-pairings.js";
import { fontById, fontHasWeight, canBody } from "../../src/lib/motion-studio/font-registry.js";
import { defaultComposition, normalizeComposition } from "../../src/lib/motion-studio/composition.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";

const POEM = "மழை பெய்கிறது\nமனம் நனைகிறது\n\nஸ்ரீ க்ஷேத்திரம்";

test("pairings: 12-16, unique, approved/core fonts only, real weights, at most two families", () => {
  assert.ok(FONT_PAIRINGS.length >= 12 && FONT_PAIRINGS.length <= 16);
  assert.equal(new Set(FONT_PAIRINGS.map((p) => p.id)).size, FONT_PAIRINGS.length);
  for (const p of FONT_PAIRINGS) {
    assert.equal(fontById(p.font).verified, true, p.id);
    assert.ok(canBody(p.font), p.id);
    assert.ok(fontHasWeight(p.font, p.weight), p.id);
    if (p.titleFont) assert.equal(fontById(p.titleFont).verified, true, p.id);
  }
  assert.throws(() => assertPairing({ ...FONT_PAIRINGS[0], font: "meera-inimai" }), /not approved/);
  assert.throws(() => assertPairing({ ...FONT_PAIRINGS[0], font: "kavivanar", weight: 700 }), /weight 700/);
  assert.throws(() => assertPairing({ ...FONT_PAIRINGS[0], font: "oi" }), /cannot set poem text/);
  assert.throws(() => assertPairing({ ...FONT_PAIRINGS[0], titleFont: "coiny" }), /not approved/);
});

test("applyPairing changes only font/titleFont/weight/lineHeight/align; poem, scenes, background untouched; round-trips", () => {
  const poem = parsePoemText(POEM, { title: "மழை" });
  const d = normalizeComposition(defaultComposition({ templateId: "midnight", scenes: generateScenes(poem, { title: "மழை" }) }));
  for (const p of FONT_PAIRINGS) {
    const a = applyPairing(structuredClone(d), p.id);
    const changed = Object.keys(a.style).filter((k) => JSON.stringify(a.style[k]) !== JSON.stringify(d.style[k]));
    for (const k of changed) assert.ok(["font", "titleFont", "weight", "lineHeight", "align"].includes(k), `${p.id}: ${k}`);
    for (const k of Object.keys(d)) if (k !== "style") assert.deepEqual(a[k], d[k], `${p.id}: ${k}`);
    const n = normalizeComposition(JSON.parse(JSON.stringify(a)));
    assert.equal(n.style.font, p.font, p.id);
    assert.equal(n.style.titleFont || null, p.titleFont && p.titleFont !== p.font ? p.titleFont : null, p.id);
    assert.ok(!("notices" in n), `${p.id}: approved fonts need no opt-in`);
    assert.equal(currentPairing(n.style), p.id);
  }
  assert.equal(applyPairing(d, "nope"), d);
});

test("self-hosted: local font files ship with OFL text; no Google Fonts CDN URL anywhere in the Studio sources", () => {
  const dir = "src/app/admin/poem-motion-studio/fonts-local";
  for (const f of ["korkai", "panai", "vaagai", "neythal"]) {
    const files = readdirSync(join(dir, f));
    assert.ok(files.includes("OFL.txt"), f);
    assert.ok(files.some((x) => /\.ttf$/i.test(x)), f);
    assert.match(readFileSync(join(dir, f, "OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE/i, f);
    assert.ok(existsSync(`public/fonts/licenses/${f}-OFL.txt`), f);
  }
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(m?jsx?|css)$/.test(e.name) ? [join(d, e.name)] : []));
  for (const f of [...walk("src/app/admin/poem-motion-studio"), ...walk("src/lib/motion-studio")])
    assert.doesNotMatch(readFileSync(f, "utf8"), /fonts\.(googleapis|gstatic)\.com/, f);
});
