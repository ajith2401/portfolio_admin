// Visual Elements Library: catalog integrity (every file present, same-origin, safe), the backward-compatible
// composition `elements` array, deterministic animation, presets and warnings. Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ELEMENTS,
  ELEMENT_QC,
  ELEMENT_CATEGORIES,
  DECORATION_PRESETS,
  DECORATION_KEYS,
  MAX_ELEMENTS,
  decorationElements,
  elementById,
  elementStateAt,
  elementWarnings,
  newElement,
  normalizeElement,
  normalizeElements,
  searchElements,
  suggestionsFor,
  validModel,
} from "../../src/lib/motion-studio/elements.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";

const PUB = join(process.cwd(), "public");
const scenes = generateScenes(parsePoemText("மழை பெய்கிறது\nமனம் நனைகிறது"), {
  title: "T",
});

test("catalog: every approved element ships its files, same-origin, and only approved grades are included", () => {
  assert.ok(ELEMENTS.length >= 60, `elements: ${ELEMENTS.length}`);
  const ids = new Set();
  for (const e of ELEMENTS) {
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`);
    ids.add(e.id);
    assert.match(e.file, /^\/motion-elements\/[a-z0-9-]+\.(json|webp)$/);
    assert.ok(existsSync(join(PUB, e.file)), `${e.file} exists`);
    if (e.thumb) assert.ok(existsSync(join(PUB, e.thumb)), `${e.thumb} exists`);
    assert.ok(
      ["APPROVED", "APPROVED WITH LIMITATIONS"].includes(e.grade),
      `${e.id}: ${e.grade}`,
    );
    assert.ok(e.provenance && e.sha, `${e.id} keeps provenance`);
    assert.ok(Number.isFinite(e.aspect) && e.aspect > 0);
  }
  // NEEDS REVIEW / REJECTED assets are recorded in the QC table but never offered
  assert.ok(Array.isArray(ELEMENT_QC) && ELEMENT_QC.length >= ELEMENTS.length);
  let held = 0;
  for (const q of ELEMENT_QC)
    if (/NEEDS REVIEW|REJECT/.test(q.grade)) {
      held++;
      assert.ok(!elementById(q.id), `${q.id} must not be offered`);
    }
  for (const e of ELEMENTS)
    assert.ok(
      ELEMENT_QC.some((q) => q.id === e.id && q.grade === e.grade),
      `${e.id} graded`,
    );
  assert.equal(held + ELEMENTS.length, ELEMENT_QC.length);
  for (const c of ELEMENT_CATEGORIES)
    assert.ok(searchElements({ category: c }).length > 0, `${c} non-empty`);
});

test("catalog: every vector model validates and every thumbnail SVG is free of active content", () => {
  for (const e of ELEMENTS) {
    if (e.kind === "vector") {
      const m = JSON.parse(readFileSync(join(PUB, e.file), "utf8"));
      assert.ok(validModel(m), `${e.id} model`);
    }
    if (e.thumb?.endsWith(".svg")) {
      const svg = readFileSync(join(PUB, e.thumb), "utf8");
      assert.doesNotMatch(
        svg,
        /<script|<foreignObject|<image|<use\b|<iframe|\son\w+\s*=|javascript:|href\s*=|url\(/i,
        e.thumb,
      );
    }
  }
  assert.equal(
    validModel({
      v: 1,
      vb: [0, 0, 1, 1],
      order: [0],
      shapes: [{ d: "M0 0<script>" }],
    }),
    false,
  );
  assert.equal(validModel(null), false);
});

test("composition: legacy projects stay byte-identical; elements round-trip through normalize", () => {
  const legacy = defaultComposition({ scenes });
  assert.equal("elements" in normalizeComposition(legacy), false);
  const a = ELEMENTS.find((e) => e.kind === "vector").id;
  const c = {
    ...legacy,
    elements: [
      {
        id: "e1",
        asset: a,
        x: 0.3,
        y: 0.7,
        size: 0.4,
        rot: 10,
        opacity: 0.6,
        tint: "#AA0000",
        flipX: true,
        anim: { kind: "draw" },
      },
      { asset: "does-not-exist" },
    ],
  };
  const n = normalizeComposition(c);
  assert.equal(n.elements.length, 1, "unknown asset dropped");
  assert.equal(n.elements[0].tint, "#aa0000");
  assert.equal(n.elements[0].anim.durMs, 4000);
  assert.deepEqual(
    normalizeComposition(JSON.parse(JSON.stringify(n))).elements,
    n.elements,
    "save → reopen is stable",
  );
  // clamps + raster limits
  const r = ELEMENTS.find((e) => e.kind === "raster").id;
  const nr = normalizeElement({
    asset: r,
    x: 99,
    size: -1,
    tint: "#123456",
    anim: { kind: "draw" },
  });
  assert.equal(nr.x, 1.25);
  assert.equal(nr.size, 0.05);
  assert.equal(nr.tint, undefined, "rasters cannot be tinted");
  assert.equal(nr.anim.kind, "none", "rasters cannot draw on");
  assert.equal(
    normalizeElements(Array.from({ length: 40 }, () => ({ asset: a }))).length,
    MAX_ELEMENTS,
  );
  const dup = normalizeElements([
    { id: "x", asset: a },
    { id: "x", asset: a },
  ]);
  assert.notEqual(dup[0].id, dup[1].id);
});

test("animation is deterministic and still frames show the finished element", () => {
  const a = ELEMENTS.find((e) => e.kind === "vector").id;
  for (const kind of ["drift", "float", "sway", "fade", "draw"]) {
    const el = newElement(a, [], { anim: { kind, delayMs: 500 } });
    for (const t of [0, 400, 1234, 9999])
      assert.deepEqual(
        elementStateAt(el, t),
        elementStateAt(el, t),
        `${kind}@${t}`,
      );
    assert.deepEqual(elementStateAt(el, 3000, { still: true }), {
      dx: 0,
      dy: 0,
      rot: 0,
      alpha: 1,
      draw: 1,
    });
  }
  const d = newElement(a, [], { anim: { kind: "draw", durMs: 2000 } });
  assert.equal(elementStateAt(d, 0).draw, 0);
  assert.equal(elementStateAt(d, 1000).draw, 0.5);
  assert.equal(elementStateAt(d, 5000).draw, 1);
  const f = newElement(a, [], { anim: { kind: "fade", delayMs: 1000 } });
  assert.equal(elementStateAt(f, 500).alpha, 0);
});

test("presets and suggestions reference real elements; warnings catch off-frame and text-covering art", () => {
  assert.deepEqual(DECORATION_KEYS.slice(0, 1), ["none"]);
  for (const k of [
    "minimal",
    "botanical",
    "nature",
    "romantic",
    "solitude",
    "literary",
    "celestial",
    "artistic",
  ]) {
    assert.ok(DECORATION_PRESETS[k], k);
    const els = decorationElements(k);
    assert.ok(els.length > 0, `${k} non-empty`);
    for (const e of els) assert.ok(elementById(e.asset), `${k}: ${e.asset}`);
  }
  assert.deepEqual(decorationElements("none"), []);
  for (const t of [
    "ink-silence",
    "paper-ink",
    "monsoon",
    "midnight",
    "golden-hour",
    "modern-minimal",
    "unknown",
  ])
    assert.ok(
      suggestionsFor(t).length > 0 && suggestionsFor(t).every(elementById),
      t,
    );
  const a = ELEMENTS.find((e) => e.kind === "vector").id;
  const off = {
    elements: [newElement(a, [], { x: 1.24, y: 1.24, size: 0.3 })],
  };
  assert.equal(elementWarnings(off, 1080, 1920).length, 1);
  const cover = {
    elements: [newElement(a, [], { x: 0.5, y: 0.5, size: 1, opacity: 0.9 })],
  };
  assert.ok(
    elementWarnings(cover, 1080, 1920, { x: 130, y: 480, w: 820, h: 960 }).some(
      (w) => /covers/.test(w),
    ),
  );
  assert.deepEqual(
    elementWarnings({ elements: [newElement(a, [])] }, 1080, 1920),
    [],
  );
});

test("Draw on is offered only for line art; silhouettes get Soft reveal; saved silhouette 'draw' still loads", async () => {
  const m = await import("../../src/lib/motion-studio/elements.js");
  const line = m.ELEMENTS.find((e) => m.styleOf(e) === "line");
  const sil = m.ELEMENTS.find((e) => m.styleOf(e) === "silhouette");
  assert.ok(line && sil);
  assert.equal(m.canDrawOn(line), true);
  assert.equal(m.canDrawOn(sil), false, "filled shapes never get a fake pen stroke");
  assert.ok(m.ELEMENT_ANIMS.includes("reveal"));
  const kept = m.normalizeElement({ asset: sil.id, anim: { kind: "draw", durMs: 4000 } });
  assert.equal(kept.anim.kind, "draw", "an existing saved composition is not silently changed");
  const rv = m.normalizeElement({ asset: sil.id, anim: { kind: "reveal", durMs: 2000, delayMs: 500 } });
  assert.equal(rv.anim.kind, "reveal");
  assert.equal(m.elementStateAt(rv, 0).alpha, 0);
  const mid = m.elementStateAt(rv, 1500);
  assert.ok(mid.alpha > 0 && mid.alpha < 1 && mid.dy > 0);
  const end = m.elementStateAt(rv, 9000);
  assert.equal(end.alpha, 1);
  assert.equal(end.dy, 0);
  assert.deepEqual(m.elementStateAt(rv, 1500), mid, "deterministic");
  assert.equal(m.elementStateAt(rv, 0, { still: true }).alpha, 1, "stills show the element");
});
