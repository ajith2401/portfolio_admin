// Whole-Poem Video (whole-poem.js): the whole poem on ONE 1080×1920 screen, text identical on every frame, exact
// duration/frame count, seamless background loop, honest fit fallback (never truncated, never silently shrunk).
// Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import {
  normalizeWhole,
  wholeFrames,
  wholeDuration,
  loopBgMs,
  textAlphaAt,
  layoutWhole,
  drawWholeFrame,
  motionK,
  WHOLE_DEFAULT_MS,
  WHOLE_DURATIONS_S,
  BACKDROPS,
  applyBackdrop,
  backdropOf,
  WHOLE_HARD_FLOOR,
  wholeWritingFit,
} from "../../src/lib/motion-studio/whole-poem.js";
import { checkWhole } from "../../src/lib/motion-studio/route-checks.js";
import { routeById } from "../../src/lib/motion-studio/formats.js";
import {
  FULL_STD_H,
  MIN_READABLE,
} from "../../src/lib/motion-studio/full-poem.js";
import { PARTICLES } from "../../src/lib/motion-studio/composition.js";

const mkCtx = () => {
  let px = 40,
    font = "40px x";
  const calls = [];
  const base = {
    calls,
    set font(f) {
      font = f;
      px = Number(/([\d.]+)px/.exec(f)[1]);
    },
    get font() {
      return font;
    },
    measureText: (t) => ({
      width: Array.from(String(t)).length * px * 0.55,
      actualBoundingBoxAscent: px * 0.8,
      actualBoundingBoxDescent: px * 0.25,
    }),
    fillText: (text, x, y) =>
      calls.push({
        text,
        x: Math.round(x),
        y: Math.round(y),
        font,
        a: base.globalAlpha,
      }),
    globalAlpha: 1,
  };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
};
const SHORT =
  "மழை பெய்யும் இரவு\nநினைவுகள் நனையும்\n\nஒரு விளக்கு மட்டும்\nவிழித்திருக்கும் ஸ்ரீ க்ஷ\n\nகடைசி வரி, English words too.";
const LONG = Array.from({ length: 12 }, (_, s) =>
  Array.from(
    { length: 6 },
    (_, l) => `பத்தி ${s + 1} வரி ${l + 1} நீண்ட சொற்கள் கொண்ட ஒரு வரி`,
  ).join("\n"),
).join("\n\n");
function fixture(text, whole = { on: true }, extra = {}) {
  const poem = parsePoemText(text, { title: "சோதனை" });
  const d = defaultComposition({
    format: "reel",
    templateId: "ink-silence",
    scenes: generateScenes(poem, { title: "சோதனை" }),
  });
  const comp = normalizeComposition({
    ...d,
    ...extra,
    whole,
    poem: { title: "சோதனை", stanzas: poem.stanzas, source: poem.source },
  });
  return { comp, poem: { ...poem, title: "சோதனை" } };
}
const poemText = (calls) =>
  calls.filter((c) => c.text !== "சோதனை").map((c) => c.text);

test("normalizeWhole: default 30 s, clamps, legacy projects gain no `whole` key", () => {
  const w = normalizeWhole({ on: true });
  assert.equal(w.durationMs, 30000);
  assert.equal(WHOLE_DEFAULT_MS, 30000);
  assert.deepEqual(WHOLE_DURATIONS_S, [10, 15, 20, 30, 45, 60]);
  assert.equal(normalizeWhole({ durationMs: 1 }).durationMs, 5000);
  assert.equal(normalizeWhole({ durationMs: 1e9 }).durationMs, 120000);
  assert.equal(normalizeWhole({ durationMs: "x" }).durationMs, 30000);
  assert.equal(normalizeWhole({ preset: "evil" }).preset, "balanced");
  assert.equal(normalizeWhole({ motion: "zzz" }).motion, "calm");
  assert.equal(normalizeWhole(null), undefined);
  const d = defaultComposition({
    format: "reel",
    templateId: "ink-silence",
    scenes: [],
  });
  assert.equal(
    "whole" in normalizeComposition(d),
    false,
    "legacy composition unchanged",
  );
  const { comp } = fixture(SHORT, {
    on: true,
    durationMs: 15000,
    motion: "expressive",
    fade: "inout",
  });
  const again = normalizeComposition(JSON.parse(JSON.stringify(comp)));
  assert.deepEqual(again.whole, comp.whole, "save -> reopen round-trips");
});

test("exact duration: 30 s at 30 fps is 900 frames; every preset maps to seconds × 30", () => {
  assert.equal(wholeFrames(30000, 30), 900);
  for (const s of WHOLE_DURATIONS_S)
    assert.equal(wholeFrames(s * 1000, 30), s * 30);
  assert.equal(wholeFrames(12300, 30), 369);
  const { comp } = fixture(SHORT);
  assert.equal(wholeDuration(comp), 30000);
});

test("seamless loop: the background clock starts and ends at the same point; text fade honours the setting", () => {
  const T = 30000;
  assert.equal(loopBgMs(0, T), 0);
  assert.ok(Math.abs(loopBgMs(T, T)) < 1e-6);
  assert.ok(Math.abs(loopBgMs(T / 2, T) - T) < 1e-6);
  const { comp } = fixture(SHORT);
  assert.equal(
    textAlphaAt(comp, 0, T),
    1,
    "no fade: text is fully visible on frame 0",
  );
  const fin = fixture(SHORT, { on: true, fade: "inout" }).comp;
  assert.equal(textAlphaAt(fin, 0, T), 0);
  assert.equal(textAlphaAt(fin, T / 2, T), 1);
  assert.ok(textAlphaAt(fin, T - 10, T) < 0.05);
});

test("the poem is IDENTICAL (text, position, font) on every frame while the background moves", () => {
  const { comp, poem } = fixture(SHORT, { on: true, motion: "expressive" }, {});
  applyBackdrop(comp, "rain");
  const fit = layoutWhole(mkCtx(), comp, poem);
  assert.equal(fit.fits, true);
  assert.equal(fit.layout.height, FULL_STD_H, "always one 9:16 screen");
  const frames = [0, 1, 450, 899].map((i) => {
    const c = mkCtx();
    drawWholeFrame(c, comp, fit.layout, (i / 30) * 1000);
    return c.calls.map(({ text, x, y, font, a }) => ({ text, x, y, font, a }));
  });
  for (const f of frames.slice(1)) assert.deepEqual(f, frames[0]);
  // every source line drawn, in order, unchanged
  assert.deepEqual(
    poemText(frames[0]).filter((t) => poem.stanzas.flat().includes(t)),
    poem.stanzas.flat(),
  );
  assert.ok(motionK(comp) > 1);
});

test("checkWhole: complete, exact poem passes; the route is registered as a video and a cover", () => {
  const { comp, poem } = fixture(SHORT);
  const v = checkWhole(mkCtx(), comp, poem);
  assert.equal(v.ok, true, (v.messages || []).join("; "));
  assert.equal(routeById("whole-mp4").kind, "video");
  assert.equal(routeById("whole-cover").kind, "image");
  // negative control: a dropped line is caught
  const bad = checkWhole(mkCtx(), comp, poem, {
    mutate: (l) => {
      l.items = l.items.filter((it) => it.text !== poem.stanzas[0][0]);
      return l;
    },
  });
  assert.equal(bad.ok, false);
});

test("long poem: never truncated, never silently shrunk — compact / smaller text is announced, else refused with a reason", () => {
  const { comp, poem } = fixture(LONG);
  const fit = layoutWhole(mkCtx(), comp, poem);
  if (fit.fits) {
    assert.ok(fit.notes.length > 0, "any fallback is reported");
    assert.ok(fit.size >= WHOLE_HARD_FLOOR);
  } else {
    assert.match(fit.reason, /Scene-by-Scene/);
    assert.match(fit.reason, /Nothing was cut/);
    const v = checkWhole(mkCtx(), comp, poem);
    assert.equal(v.ok, false);
    assert.equal(v.fits, false);
  }
  assert.equal(poem.stanzas.flat().length, 72, "source text untouched");
  // a short poem at the default layout needs no note and stays at a readable size
  const s = fixture(SHORT);
  const f2 = layoutWhole(mkCtx(), s.comp, s.poem);
  assert.deepEqual(f2.notes, []);
  assert.ok(f2.size >= MIN_READABLE);
});

test("backdrops map to real renderer options; reduced motion stops the background", () => {
  for (const b of BACKDROPS) assert.ok(PARTICLES.includes(b.particles), b.id);
  const { comp } = fixture(SHORT, { on: true, motion: "normal" });
  applyBackdrop(comp, "mist");
  assert.equal(backdropOf(comp), "mist");
  assert.equal(motionK(comp), 1);
  comp.motion.reduceMotion = true;
  assert.equal(motionK(comp), 0);
});

test("Whole-Poem writing: off by default, completed poem stays fully visible to the last frame, fit is reported not forced", () => {
  const { comp, poem } = fixture(SHORT, { on: true }, {});
  assert.equal(comp.motion.writing, undefined, "static stays the default");
  const ink = { ...comp, motion: { ...comp.motion, writing: { mode: "ink" } } };
  const fit = layoutWhole(mkCtx(), ink, poem);
  const wf = wholeWritingFit(mkCtx(), ink, fit.layout);
  assert.equal(wf.on, true);
  assert.equal(wf.fits, true, "a short poem writes inside 30 s");
  assert.equal(wf.totalMs, 30000);
  assert.equal(wholeFrames(wholeDuration(ink), 30), 900, "writing never changes the frame count");
  const lines = poem.stanzas.flat();
  for (const i of [849, 899]) {
    const c = mkCtx();
    drawWholeFrame(c, ink, fit.layout, (i / 30) * 1000);
    const drawn = poemText(c.calls);
    for (const l of lines) assert.ok(drawn.includes(l), `frame ${i} shows the completed line: ${l}`);
    assert.ok(c.calls.filter((x) => lines.includes(x.text)).every((x) => x.a === undefined || x.a > 0.99), `frame ${i} fully opaque`);
  }
  const c0 = mkCtx();
  drawWholeFrame(c0, ink, fit.layout, 0);
  assert.equal(poemText(c0.calls).filter((t) => lines.includes(t)).length, 0, "frame 0: nothing written yet (start delay)");
  const slow = { ...ink, motion: { ...ink.motion, writing: { mode: "ink", speed: 0.25, finalHoldMs: 10000 } }, whole: { ...ink.whole, durationMs: 10000 } };
  const bad = wholeWritingFit(mkCtx(), slow, layoutWhole(mkCtx(), slow, poem).layout);
  assert.equal(bad.fits, false);
  assert.ok(bad.recommendS * 1000 >= bad.needMs, "recommends a duration that fits");
  assert.equal(slow.whole.durationMs, 10000, "duration not changed automatically");
});
