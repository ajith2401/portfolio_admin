// Golden safety net for the renderer. Records EVERY canvas call/property write that drawFrame / drawFullPoem make for
// fixed synthetic Tamil fixtures (Reel / Story / Poster / Full-poem, every template, every text-in behaviour, every
// particle kind, signature legacy / new / hidden) and compares a SHA-256 of each call log with tests/fixtures.
// A pure refactor of render.js must keep every hash byte-identical. Regenerate ONLY for an intended visual change:
//   GOLDEN_UPDATE=1 node --test tests/security/motion-studio-golden.test.mjs
// Machine independent: no real fonts or pixels are involved (measureText is a deterministic stub).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { drawFrame } from "../../src/lib/motion-studio/render.js";
import {
  drawFullPoem,
  layoutFullPoem,
} from "../../src/lib/motion-studio/full-poem.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { TEMPLATES } from "../../src/lib/motion-studio/templates.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "..", "fixtures", "motion-studio-golden.json");

/** A 2D context that logs every method call and every property write, in order. measureText is deterministic. */
export function recordingCtx() {
  const log = [];
  let px = 40;
  const val = (v) =>
    v && typeof v === "object" && v.__grad ? `grad#${v.__grad}` : v;
  let grads = 0;
  const target = {
    measureText: (t) => ({ width: Array.from(String(t)).length * px * 0.55 }),
    createLinearGradient: (...a) => {
      const id = ++grads;
      log.push(["createLinearGradient", ...a]);
      return {
        __grad: id,
        addColorStop: (...s) => log.push([`grad#${id}.addColorStop`, ...s]),
      };
    },
    createRadialGradient: (...a) => {
      const id = ++grads;
      log.push(["createRadialGradient", ...a]);
      return {
        __grad: id,
        addColorStop: (...s) => log.push([`grad#${id}.addColorStop`, ...s]),
      };
    },
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "font") return `${px}px x`;
      return (...a) => {
        log.push([String(k), ...a.map(val)]);
      };
    },
    set(t, k, v) {
      if (k === "font") {
        const m = /(\d+(?:\.\d+)?)px/.exec(v);
        if (m) px = Number(m[1]);
      }
      log.push([`=${String(k)}`, val(v)]);
      return true;
    },
  });
  return { ctx, log };
}

const STANZAS = [
  ["அன்பே சிவம் என்று", "  உள்ளம் சொல்லும்", "\tமழைத் துளி பேசும்"],
  [
    "கொடிய வெயில் காய்ந்தாலும்",
    "தமிழ் என்றும் வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க",
  ],
];
const scenesFor = () => [
  { id: "t", kind: "title", lines: ["மழையின் பாடல்"], durationMs: 3200 },
  {
    id: "a",
    kind: "stanza",
    lines: STANZAS[0],
    durationMs: 5000,
    stanza: 0,
    part: 0,
    parts: 1,
  },
  {
    id: "b",
    kind: "stanza",
    lines: STANZAS[1],
    durationMs: 6000,
    stanza: 1,
    part: 0,
    parts: 1,
    align: "left",
    offsetY: 6,
  },
];
const SIGS = {
  legacy: { show: true, signature: "Synthetic Poet", watermark: false },
  new: {
    show: true,
    signature: "Synthetic Poet",
    watermark: false,
    size: 40,
    yPct: null,
    align: "center",
  },
  right: {
    show: true,
    signature: "Synthetic Poet",
    watermark: false,
    size: 32,
    yPct: 0.62,
    align: "right",
  },
  off: { show: false, signature: "Synthetic Poet", watermark: false },
};
function comp({
  format = "reel",
  templateId = "ink-silence",
  sig = "new",
  style = {},
  motion = {},
} = {}) {
  const base = defaultComposition({ format, templateId, scenes: scenesFor() });
  const c = normalizeComposition({
    ...base,
    branding: { ...SIGS[sig], color: base.branding.color },
  });
  return {
    ...c,
    style: { ...c.style, ...style },
    motion: { ...c.motion, ...motion },
  };
}

const cases = {};
const add = (name, fn) => {
  cases[name] = fn;
};
const TIMES = [
  0, 350, 900, 2600, 3100, 3600, 5200, 7700, 8100, 12000, 13900, 99999,
];
for (const format of ["reel", "story", "poster"])
  for (const sig of Object.keys(SIGS))
    for (const textIn of ["fade", "line", "rise", "none"])
      add(`frame/${format}/${sig}/${textIn}`, (ctx) => {
        const c = comp({ format, sig, motion: { textIn } });
        for (const t of TIMES) drawFrame(ctx, c, t, {});
      });
for (const t of TEMPLATES)
  for (const format of ["reel", "poster"])
    add(`template/${t.id}/${format}`, (ctx) => {
      const c = comp({ format, templateId: t.id });
      for (const tm of [0, 1500, 4100, 9000]) drawFrame(ctx, c, tm, {});
    });
for (const particles of ["none", "dust", "rain", "stars", "light"])
  for (const bgMotion of ["none", "zoom", "drift"])
    add(`fx/${particles}/${bgMotion}`, (ctx) => {
      const c = comp({
        style: {
          particles,
          grain: 0.2,
          vignette: 0.6,
          geometry: true,
          shadow: true,
          overlay: { color: "#102030", opacity: 0.3 },
        },
        motion: { bgMotion, intensity: 0.8, textIn: "rise" },
      });
      for (const tm of [0, 700, 4000, 10000])
        drawFrame(ctx, c, tm, { w: 540, h: 960 });
    });
for (const format of ["reel", "story", "poster"])
  for (const sig of ["legacy", "new", "off"])
    add(`still/${format}/${sig}`, (ctx) => {
      const c = comp({
        format,
        sig,
        style: { align: "right", vAlign: "bottom" },
      });
      for (const sc of c.scenes)
        drawFrame(ctx, c, 0, {
          still: true,
          scene: sc,
          assets: { scrim: 0.35, scrimColor: "#000" },
        });
      drawFrame(ctx, c, 0, {
        still: true,
        scene: {
          kind: "stanza",
          lines: [...STANZAS[0], "", ...STANZAS[1]],
          durationMs: 1,
          id: "p",
        },
        minSize: 46,
      });
    });
const POEM = parsePoemText(
  "அன்பே சிவம் என்று\n  உள்ளம் சொல்லும்\n\tமழைத் துளி பேசும்\n\n\n\nகொடிய வெயில் காய்ந்தாலும்\nதமிழ் என்றும் வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க",
  { title: "மழையின் பாடல்" },
);
for (const preset of ["elegant", "balanced", "compact", "expressive"])
  for (const sig of ["legacy", "new", "off"])
    add(`full/${preset}/${sig}`, (ctx) => {
      const c = comp({
        sig,
        style: {
          shadow: preset === "expressive",
          align: preset === "compact" ? "left" : "center",
        },
      });
      const lay = layoutFullPoem(
        ctx,
        c,
        { ...POEM, title: "மழையின் பாடல்" },
        { preset },
      );
      drawFullPoem(ctx, c, lay, { scale: preset === "balanced" ? 2 : 1 });
    });

function run() {
  const out = {};
  for (const [name, fn] of Object.entries(cases)) {
    const { ctx, log } = recordingCtx();
    fn(ctx);
    const s = JSON.stringify(log);
    out[name] = {
      calls: log.length,
      sha256: createHash("sha256").update(s).digest("hex"),
    };
  }
  return out;
}

test("golden: renderer call logs are byte-identical to tests/fixtures/motion-studio-golden.json", () => {
  const got = run();
  if (process.env.GOLDEN_UPDATE === "1") {
    mkdirSync(path.dirname(FIXTURE), { recursive: true });
    writeFileSync(FIXTURE, JSON.stringify(got, null, 1) + "\n");
  }
  const want = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(
    Object.keys(got).sort(),
    Object.keys(want).sort(),
    "the case list changed",
  );
  const diff = Object.keys(want).filter(
    (k) => got[k].sha256 !== want[k].sha256,
  );
  assert.deepEqual(diff, [], `changed renders: ${diff.join(", ")}`);
});
test("golden: the fixture really covers text drawing (guards against an empty recorder)", () => {
  const { ctx, log } = recordingCtx();
  drawFrame(ctx, comp(), 4000, {});
  const texts = log.filter((e) => e[0] === "fillText").map((e) => e[1]);
  assert.ok(texts.includes("அன்பே சிவம் என்று"));
  assert.ok(texts.includes("Synthetic Poet"));
  assert.ok(Object.keys(cases).length >= 90);
});
test("golden: a one-character change in a drawn row changes the hash (negative control)", () => {
  const a = recordingCtx(),
    b = recordingCtx();
  const c = comp();
  drawFrame(a.ctx, c, 4000, {});
  const c2 = {
    ...c,
    scenes: c.scenes.map((s) =>
      s.id === "a"
        ? {
            ...s,
            lines: [s.lines[0].replace("சிவம்", "சிவன்"), ...s.lines.slice(1)],
          }
        : s,
    ),
  };
  drawFrame(b.ctx, c2, 4000, {});
  assert.notEqual(JSON.stringify(a.log), JSON.stringify(b.log));
});
