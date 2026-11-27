// Ink Reveal / Typewriter writing model (src/lib/motion-studio/writing.js): Tamil cluster safety, timing, determinism,
// no partial-glyph drawing, the completed text staying visible, and the "never squeeze" fit checks.
// Machine independent: measureText is a deterministic stub, so no fonts or pixels are involved.
import test from "node:test";
import assert from "node:assert/strict";
import {
  safeUnits,
  planWriting,
  normalizeWriting,
  writingOf,
  writingOn,
  recommendSeconds,
  WRITING_DEFAULTS,
  PEN_PRESETS,
  PEN_VALIDATED_FONTS,
} from "../../src/lib/motion-studio/writing.js";
import {
  drawFrame,
  sceneWritingFit,
} from "../../src/lib/motion-studio/render.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";

function recordingCtx() {
  const log = [];
  let px = 10;
  const target = {
    measureText: (t) => ({ width: Array.from(String(t)).length * px * 0.55 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "font") return `${px}px x`;
      if (k === "canvas") return { width: 1080, height: 1920 };
      return (...a) =>
        log.push([
          String(k),
          ...a.map((v) =>
            typeof v === "number"
              ? Math.round(v * 1000) / 1000
              : (typeof v === "object" || typeof v === "function")
                ? "obj"
                : v,
          ),
        ]);
    },
    set(t, k, v) {
      if (k === "font") {
        const m = /(\d+(?:\.\d+)?)px/.exec(v);
        if (m) px = Number(m[1]);
      }
      log.push([`=${String(k)}`, (typeof v === "object" || typeof v === "function") ? "obj" : v]);
      return true;
    },
  });
  return { ctx, log };
}

const FIXTURE = [
  "தமிழ் மொழி",
  "தமிழ் எழுத்து",
  "அன்பின் ஆழம்",
  "கற்றல்",
  "வாழ்வின் பயணம்",
  "காதல்",
  "ஸ்ரீ",
  "க்ஷேத்திரம்",
  "Hello தமிழகம்",
  "கவிதை — 2026",
  "கொ கெ கை கௌ",
  "க்‌ஷ", // ZWNJ: the author asked for the split form
  "ஸ்ரீ‍", // trailing ZWJ
  "அன்பு நெஞ்சம்", // NBSP
  "தமிழ்".normalize("NFD"),
];
const MARK = /^[\p{M}‌‍]/u;
const mono = (s) => Array.from(s).length * 10;

test("safeUnits: lossless, never starts a unit with a mark/ZWJ/ZWNJ, keeps conjuncts whole", () => {
  for (const s of FIXTURE) {
    for (const measure of [null, mono]) {
      const u = safeUnits(s, measure);
      assert.equal(u.map((x) => x.text).join(""), s, `lossless: ${s}`);
      for (const x of u)
        assert.ok(
          !MARK.test(x.text),
          `unit starts with a mark in ${s}: ${JSON.stringify(x.text)}`,
        );
      let pos = 0;
      for (const x of u) {
        assert.equal(x.start, pos);
        assert.equal(s.slice(x.start, x.end), x.text);
        pos = x.end;
      }
    }
  }
  assert.deepEqual(
    safeUnits("ஸ்ரீ").map((x) => x.text),
    ["ஸ்ரீ"],
  );
  assert.ok(
    safeUnits("க்ஷேத்திரம்").some((x) => x.text.startsWith("க்ஷ")),
    "க்ஷ is one unit",
  );
  for (const v of ["கொ", "கெ", "கை", "கௌ"])
    assert.deepEqual(
      safeUnits(v).map((x) => x.text),
      [v],
    );
  assert.deepEqual(
    safeUnits("க்‌ஷ").map((x) => x.text),
    ["க்‌", "ஷ"],
    "ZWNJ keeps the split the author typed",
  );
});

test("safeUnits: a shaping-dependent pair (measure disagrees) is merged", () => {
  // a fake font where "ab" ligates (narrower than a + b)
  const lig = (s) =>
    s.includes("ab")
      ? Array.from(s).length * 10 - 6
      : Array.from(s).length * 10;
  assert.deepEqual(
    safeUnits("abc", lig).map((x) => x.text),
    ["ab", "c"],
  );
});

test("normalizeWriting: defaults, clamps, unknown values dropped", () => {
  assert.deepEqual(normalizeWriting(undefined), { ...WRITING_DEFAULTS });
  const w = normalizeWriting({
    mode: "pen",
    speed: 99,
    startDelayMs: -5,
    ink: "rainbow",
    inkHex: "javascript:",
    unit: "x",
  });
  assert.equal(
    w.mode,
    "none",
    "pen-stroke is not a selectable mode until validated",
  );
  assert.ok(w.speed <= 3 && w.startDelayMs >= 0);
  assert.equal(w.ink, WRITING_DEFAULTS.ink);
  assert.match(w.inkHex, /^#[0-9a-f]{6}$/i);
  assert.equal(w.unit, "cluster");
  assert.equal(PEN_VALIDATED_FONTS.length, 0);
  assert.ok(PEN_PRESETS.every((p) => p.validated === false));
});

test("planWriting: ordered, start delay, line pause < stanza pause, final hold", () => {
  const w = normalizeWriting({ mode: "ink" });
  const rows = [
    { text: "தமிழ் மொழி", left: 0, group: 0 },
    { text: "அன்பின் ஆழம்", left: 0, group: 0 },
    { text: "காதல்", left: 0, group: 1 },
  ];
  const p = planWriting(rows, w, mono);
  assert.equal(p.rows[0].start, w.startDelayMs);
  assert.equal(p.rows[1].start - p.rows[0].end, w.linePauseMs);
  assert.equal(p.rows[2].start - p.rows[1].end, w.stanzaPauseMs);
  assert.equal(p.total, p.writeEnd + w.finalHoldMs);
  let t = 0;
  for (const r of p.rows)
    for (const u of r.units) {
      assert.ok(u.t0 >= t && u.t1 >= u.t0);
      t = u.t1;
    }
  const fast = planWriting(rows, { ...w, speed: 2 }, mono);
  assert.ok(fast.writeEnd < p.writeEnd);
  assert.equal(recommendSeconds({ total: 31000 }, [10, 15, 30, 45]), 45);
});

const LINES = ["தமிழ் மொழி இனிது", "ஸ்ரீ க்ஷேத்திரம்"];
function comp(motion = {}, scene = {}) {
  const base = defaultComposition({
    format: "reel",
    templateId: "ink-silence",
    scenes: [
      {
        id: "a",
        kind: "stanza",
        lines: LINES,
        durationMs: 9000,
        stanza: 0,
        part: 0,
        parts: 1,
        ...scene,
      },
    ],
  });
  const c = normalizeComposition(base);
  return { ...c, motion: { ...c.motion, ...motion } };
}
const texts = (log) => log.filter((e) => e[0] === "fillText").map((e) => e[1]);

test("writingOf: reduce motion turns writing off; settings survive normalisation; none stays unsaved", () => {
  const c = comp({ writing: { mode: "ink" } });
  assert.ok(writingOn(c));
  assert.equal(
    writingOf({ ...c, motion: { ...c.motion, reduceMotion: true } }).mode,
    "none",
  );
  const n = normalizeComposition(c);
  assert.equal(n.motion.writing.mode, "ink");
  assert.equal(
    normalizeComposition(comp()).motion.writing,
    undefined,
    "no writing key on compositions that never used it",
  );
  const s = normalizeComposition(
    comp({ writing: { mode: "ink" } }, { noWrite: true }),
  );
  assert.equal(s.scenes[0].noWrite, true);
});

for (const mode of ["ink", "type"])
  test(`drawFrame (${mode}): deterministic, never draws a partial cluster, completed text is drawn`, () => {
    const c = comp({ writing: { mode } });
    const run = (t) => {
      const { ctx, log } = recordingCtx();
      drawFrame(ctx, c, t, {});
      return log;
    };
    for (const t of [0, 600, 1200, 2500, 4000])
      assert.deepEqual(run(t), run(t), `deterministic at ${t}`);
    for (const t of [500, 900, 1300, 1800, 2600, 3400]) {
      for (const s of texts(run(t))) {
        const line = LINES.find((l) => l.startsWith(s));
        if (!line) continue; // signature/branding text
        if (mode === "ink")
          assert.equal(s, line, `ink draws whole shaped rows only (t=${t})`);
        else {
          const cuts = new Set([0, ...safeUnits(line).map((u) => u.end)]);
          assert.ok(
            cuts.has(s.length),
            `typewriter prefix ends on a cluster boundary: ${JSON.stringify(s)}`,
          );
          assert.ok(
            !MARK.test(line.slice(s.length)),
            "the next char is never a dangling mark",
          );
        }
      }
    }
    const end = texts(run(8000));
    for (const l of LINES)
      assert.ok(end.includes(l), `completed line visible near the end: ${l}`);
  });

test("noWrite scene falls back to the normal text animation", () => {
  const { ctx, log } = recordingCtx();
  drawFrame(
    ctx,
    comp({ writing: { mode: "ink" } }, { noWrite: true }),
    6000,
    {},
  );
  const { ctx: c2, log: l2 } = recordingCtx();
  drawFrame(c2, comp(), 6000, {});
  assert.deepEqual(texts(log), texts(l2));
});

test("sceneWritingFit: reports scenes that are too short, never auto-fits", () => {
  const { ctx } = recordingCtx();
  const ok = sceneWritingFit(ctx, comp({ writing: { mode: "ink" } }));
  assert.equal(ok.fits, true);
  const slow = comp(
    { writing: { mode: "ink", speed: 0.25 } },
    { durationMs: 3000 },
  );
  const bad = sceneWritingFit(ctx, slow);
  assert.equal(bad.fits, false);
  assert.ok(bad.scenes[0].needMs > 3000);
  assert.equal(
    slow.scenes[0].durationMs,
    3000,
    "the composition is not changed",
  );
  assert.equal(sceneWritingFit(ctx, comp()).on, false);
});
