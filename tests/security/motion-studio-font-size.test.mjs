// Font-size control and export correctness (2026-11 spec): an author-chosen size — 14px, 23px, 30px, anything inside the
// technical bounds — is stored exactly, laid out at exactly that size, never raised to the old 40px floor, and never
// blocks export. Readability is advisory. Text that genuinely does not fit is still refused (negative controls).
// Machine independent: measureText is a deterministic stub.
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import {
  layoutScene,
  validateScene,
  validateScenes,
} from "../../src/lib/motion-studio/render.js";
import {
  planFit,
  applyFit,
  readabilityIssues,
} from "../../src/lib/motion-studio/fit-scenes.js";
import { sceneMin } from "../../src/lib/motion-studio/route-checks.js";
import { sceneLines } from "../../src/lib/motion-studio/scenes.js";
import {
  textPx,
  shrinkFloor,
  sizeAdvice,
  phonePt,
  SIZE_PRESETS,
  TEXT_PX_MIN,
  TEXT_PX_MAX,
  MIN_TEXT_PX,
  FORMATS,
  safeRect,
} from "../../src/lib/motion-studio/safe-zone.js";
import {
  layoutFullPoem,
  fullTune,
} from "../../src/lib/motion-studio/full-poem.js";
import {
  normalizeWhole,
  WHOLE_SIZE_MIN,
} from "../../src/lib/motion-studio/whole-poem.js";
import { checkFull } from "../../src/lib/motion-studio/route-checks.js";

const mkCtx = (k = 0.55) => {
  let px = 40;
  return {
    set font(f) {
      px = Number(/(\d+(?:\.\d+)?)px/.exec(f)[1]);
    },
    get font() {
      return `${px}px x`;
    },
    measureText: (t) => ({
      width: Array.from(t).length * px * k,
      actualBoundingBoxAscent: px * 0.8,
      actualBoundingBoxDescent: px * 0.2,
    }),
    fillText() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    fillRect() {},
    beginPath() {},
    rect() {},
    clip() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
};
const ctx = mkCtx();
const SIZES = [14, 16, 18, 20, 22, 23, 24, 26, 28, 30, 32, 36, 40, 48, 56, 64];
const scene = {
  id: "s",
  kind: "stanza",
  lines: ["அன்பே சிவம் என்று", "  உள்ளம் சொல்லும்"],
  durationMs: 4000,
};
const withSize = (px, over = {}) => {
  const c = normalizeComposition({
    ...defaultComposition({ scenes: [scene], format: over.format || "reel" }),
    scenes: [scene],
  });
  return normalizeComposition({
    ...c,
    ...over,
    style: { ...c.style, sizePx: px, sizeSet: true },
  });
};

test("textPx: technical validation only — rejects 0, negatives, NaN, Infinity, empty; clamps absurd values", () => {
  for (const bad of [
    0,
    -1,
    -40,
    NaN,
    Infinity,
    -Infinity,
    "",
    null,
    undefined,
    "abc",
  ])
    assert.equal(textPx(bad), null, String(bad));
  assert.equal(textPx(0, 40), 40, "fallback for an invalid value");
  for (const v of SIZES) assert.equal(textPx(v), v, `${v} kept exactly`);
  assert.equal(textPx("23"), 23);
  assert.equal(textPx(23.4), 23, "integer px");
  assert.equal(textPx(3), TEXT_PX_MIN);
  assert.equal(textPx(99999), TEXT_PX_MAX);
  assert.deepEqual(
    [...SIZE_PRESETS],
    [14, 16, 18, 20, 22, 24, 28, 30, 32, 36, 40, 48, 56, 64],
  );
});

test("composition: every size 14..64 (and custom 23) round-trips exactly; sizeSet survives; no destructive migration", () => {
  for (const v of SIZES) {
    const c = withSize(v);
    assert.equal(c.style.sizePx, v);
    assert.equal(c.style.sizeSet, true);
    const again = normalizeComposition(JSON.parse(JSON.stringify(c)));
    assert.equal(again.style.sizePx, v, "save/reopen keeps the exact value");
    assert.equal(
      JSON.stringify(normalizeComposition(again)),
      JSON.stringify(again),
      "idempotent",
    );
  }
  // a legacy comp without sizeSet gains no key it did not have
  const legacy = normalizeComposition(defaultComposition({ scenes: [scene] }));
  assert.equal("sizeSet" in legacy.style, false);
  // invalid stored values fall back to the template size instead of corrupting the comp
  const broken = normalizeComposition({
    ...legacy,
    style: { ...legacy.style, sizePx: "NaN" },
  });
  assert.ok(Number.isInteger(broken.style.sizePx) && broken.style.sizePx > 0);
});

test("layout/validation: a chosen size is drawn at exactly that size in every format — never raised, never blocked", () => {
  for (const format of ["reel", "story", "poster", "square"]) {
    for (const v of SIZES) {
      const c = withSize(v, { format });
      const lay = layoutScene(ctx, c, scene, safeRect(FORMATS[format].w, FORMATS[format].h, FORMATS[format].safe));
      assert.equal(lay.fits, true, `${format} ${v}`);
      assert.equal(lay.size, v, `${format}: ${v}px drawn at ${v}px`);
      const r = validateScene(ctx, c, scene);
      assert.equal(r.ok, true, `${format} ${v}: ${r.messages.join("; ")}`);
    }
  }
});

test("shrinkFloor: automatic fitting may shrink a larger size to the recommendation but never below a chosen size", () => {
  assert.equal(shrinkFloor(40, 64), 40);
  assert.equal(shrinkFloor(40, 30), 30);
  assert.equal(shrinkFloor(40, 14), 14);
  assert.equal(shrinkFloor(40, 2), TEXT_PX_MIN);
  assert.equal(sceneMin("reel", { style: { sizePx: 14 } }), 14);
  assert.equal(sceneMin("reel", { style: { sizePx: 64 } }), MIN_TEXT_PX.reel);
});

test("NEGATIVE CONTROL: text that cannot fit at the chosen size is still refused (out of bounds is a failure)", () => {
  for (const v of [14, 30, 40]) {
    const huge = {
      ...scene,
      lines: Array(400).fill("அன்பே சிவம் உள்ளம் சொல்லும் உண்மை"),
    };
    const c = withSize(v);
    const r = validateScene(ctx, c, huge);
    assert.equal(r.ok, false, `${v}px: overflowing text must not pass`);
    assert.equal(
      c.style.sizePx,
      v,
      "the chosen size is not changed by the failure",
    );
  }
});

test("Fit scenes: splits overflowing scenes, keeps the chosen size, keeps every line", () => {
  const long = Array(30).fill("கொடிய வெயில் காய்ந்தாலும் குளிர்ந்த நிழல் தருவாய்");
  const sc = [
    {
      id: "a",
      kind: "stanza",
      lines: long,
      durationMs: 9000,
      stanza: 0,
      part: 0,
      parts: 1,
    },
  ];
  for (const v of [14, 23, 30]) {
    const c = normalizeComposition({
      ...defaultComposition({ scenes: sc }),
      scenes: sc,
      style: {
        ...defaultComposition({ scenes: sc }).style,
        sizePx: v,
        sizeSet: true,
      },
    });
    const plan = planFit(ctx, c);
    assert.deepEqual(plan.sizePx, { from: v, to: v });
    const f = applyFit(c, plan);
    assert.equal(f.style.sizePx, v);
    assert.deepEqual(sceneLines(f.scenes), sceneLines(c.scenes), "every line kept, in order");
    assert.equal(readabilityIssues(ctx, f).length, 0);
    assert.ok(validateScenes(ctx, f).ok);
  }
});

test("sizeAdvice: advisory levels with a phone-pt equivalent; never a failure", () => {
  assert.equal(phonePt(40), 14.4);
  assert.equal(phonePt(46), 16.6);
  assert.equal(sizeAdvice(64, "reel").level, "comfortable");
  assert.equal(sizeAdvice(40, "reel").level, "compact");
  assert.equal(sizeAdvice(30, "reel").level, "small");
  const t = sizeAdvice(14, "reel");
  assert.equal(t.level, "tiny");
  assert.match(t.text, /still export at this size/);
  for (const v of SIZES)
    assert.ok(
      ["comfortable", "compact", "small", "tiny"].includes(sizeAdvice(v).level),
    );
});

test("Full-Poem poster: comp.full.size is a stored, exact, author size that the layout honours", () => {
  const poem = {
    title: "தலைப்பு",
    stanzas: [["அன்பே சிவம்", "உள்ளம் சொல்லும்"], ["தமிழ் வாழ்க"]],
  };
  const base = normalizeComposition(defaultComposition({ scenes: [scene] }));
  assert.equal(fullTune(base), null, "no full.size: the preset decides");
  for (const v of [14, 16, 24, 30, 32, 40]) {
    const c = normalizeComposition({
      ...base,
      full: { ...(base.full || {}), size: v },
    });
    assert.equal(c.full.size, v, "stored exactly");
    const lay = layoutFullPoem(ctx, c, poem, {
      preset: "balanced",
      height: "standard",
      tune: fullTune(c),
    });
    assert.equal(lay.fits, true, `${v}px fits`);
    assert.equal(lay.size, v, `${v}px drawn at ${v}px (not raised to 40)`);
    const chk = checkFull(ctx, c, poem, {
      preset: "balanced",
      height: "standard",
    });
    assert.equal(
      chk.layout.size,
      v,
      "export check uses the same size as the preview",
    );
  }
  for (const bad of [0, -3, NaN, "x"]) {
    const c = normalizeComposition({
      ...base,
      full: { ...(base.full || {}), size: bad },
    });
    assert.equal(
      c.full?.size,
      undefined,
      `invalid full.size ${bad} is dropped, not stored`,
    );
  }
});

test("Whole-Poem: size below the old 28px minimum is kept exactly; invalid values mean automatic", () => {
  assert.equal(WHOLE_SIZE_MIN, TEXT_PX_MIN);
  for (const v of [14, 16, 20, 23, 30, 32, 36, 40])
    assert.equal(normalizeWhole({ on: true, size: v }).size, v);
  for (const bad of [0, -2, NaN, "x", null])
    assert.equal(
      normalizeWhole({ on: true, size: bad }).size,
      null,
      String(bad),
    );
});
