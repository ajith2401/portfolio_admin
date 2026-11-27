// P6: text animation library (animation.js). Row / word / block units only (never letters); every behaviour x motion
// preference x Tamil fixture reaches the exact HOLD state, rests there, stays inside the safe area, shows every unit
// fully in reading order and splits words only at breakable whitespace. Forged behaviours are refused. Synthetic poems.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ANIMATIONS,
  ANIMATION_IDS,
  LIBRARY,
  LIBRARY_IDS,
  BEHAVIOUR_IDS,
  HOLD,
  MOTION_PREFS,
  PREF_PARAMS,
  MAX_SCALE,
  MIN_DIM_ALPHA,
  REJECTED_ANIMATIONS,
  activeBehaviour,
  animFrame,
  buildPlan,
  validateAnimation,
  prefParams,
} from "../../src/lib/motion-studio/animation.js";
import {
  sceneGeometry,
  drawFrame,
} from "../../src/lib/motion-studio/render.js";
import {
  defaultComposition,
  normalizeComposition,
  TEXT_IN,
  TEXT_IN_ALL,
} from "../../src/lib/motion-studio/composition.js";
import {
  checkScenes,
  checkAnimation,
} from "../../src/lib/motion-studio/route-checks.js";
import { routeById } from "../../src/lib/motion-studio/formats.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";
import {
  isBreakableWhitespace,
  graphemes,
} from "../../src/lib/motion-studio/graphemes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "..", "fixtures", "motion-studio-golden.json");
const GOLDEN_SHA =
  "6cb2e03c30d23d5f4791912e6d5fed8c46fd1389c0e42bbaa8f9cd4924f2f589";

const mkCtx = (k = 0.55) => {
  let px = 40,
    font = "40px x";
  return {
    set font(f) {
      font = f;
      px = Number(/([\d.]+)px/.exec(f)[1]);
    },
    get font() {
      return font;
    },
    measureText: (t) => ({
      width:
        Array.from(String(t)).length * px * (font.includes("Tamil") ? k : 0.5),
    }),
  };
};
const ctx = mkCtx();
const CORPUS = {
  indent:
    "மழையின் பாடல்\n  உள்ளம் சொல்லும் கதை\n    இன்னும் ஒரு வரி\n\nகொடிய வெயில் காய்ந்தாலும்",
  tabs: "\tஅன்பே சிவம்\n\t\tதமிழ் என்றும் வாழ்க\nமூன்றாம்\tவரி",
  nbsp: "கொடிய வெயில் காய்ந்தாலும்\nநிழல் தேடும் மனம்",
  long: "தமிழ் என்றும் வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க\nசிறு வரி\n\nகடல் அலை கரையைத் தொட்டுத் திரும்பும் ஒவ்வொரு முறையும் ஒரு கதை சொல்லும்",
  stanzas:
    "முதல் பத்தி வரி\nஇரண்டாம் வரி\n\nஇரண்டாம் பத்தி\nமேலும் ஒரு வரி\n\nமூன்றாம் பத்தி வரி ஒன்று",
};
const TITLE = "மழையின் பாடல்";
function corpusComp(key, motion = {}) {
  const poem = parsePoemText(CORPUS[key], { title: TITLE });
  const d = defaultComposition({
    format: "reel",
    scenes: generateScenes(poem, { title: TITLE }),
  });
  const base = normalizeComposition({
    ...d,
    motion: { ...d.motion, ...motion },
  });
  const plan = planFit(ctx, base);
  return plan.ok ? applyFit(base, plan) : base;
}
// a quote-style scene with several stanzas (gap rows) in one scene
const multiStanza = () => {
  const comp = corpusComp("stanzas");
  return {
    comp,
    scene: {
      id: "ms",
      kind: "quote",
      lines: [
        "முதல் பத்தி வரி",
        "இரண்டாம் வரி",
        "",
        "இரண்டாம் பத்தி",
        "",
        "மூன்றாம் பத்தி வரி ஒன்று",
      ],
      durationMs: 9000,
    },
  };
};
const NEED_RE = /needs this scene to last at least ([\d.]+) s/;

/** Validate; a too-short scene must be REFUSED with a message naming the length that works, which then passes. */
function proveScene(b, comp, sc, last, p) {
  const geo = sceneGeometry(ctx, comp, sc);
  let v = validateAnimation(b, sc, geo, {
    last,
    p,
    intensity: comp.motion.intensity,
  });
  if (!v.ok) {
    assert.ok(
      v.messages.every((m) => NEED_RE.test(m)),
      `${b.id}: only a too-short refusal is acceptable: ${v.messages.join(" | ")}`,
    );
    const need = Math.round(Number(NEED_RE.exec(v.messages[0])[1]) * 1000);
    sc = { ...sc, durationMs: need };
    v = validateAnimation(b, sc, sceneGeometry(ctx, comp, sc), {
      last,
      p,
      intensity: comp.motion.intensity,
    });
    assert.ok(
      v.ok,
      `${b.id} at the stated ${need} ms passes: ${v.messages.join(" | ")}`,
    );
  }
  return { v, sc, geo: sceneGeometry(ctx, comp, sc) };
}

// ---------------------------------------------------------------- golden + legacy
test("golden fixture is byte-identical (the four classic behaviours and default comps unchanged)", () => {
  assert.equal(
    createHash("sha256").update(readFileSync(GOLDEN)).digest("hex"),
    GOLDEN_SHA,
  );
});
test("legacy compositions normalize unchanged: no pref / reduceMotion keys, classic ids kept", () => {
  for (const id of TEXT_IN) {
    const c = normalizeComposition({
      ...defaultComposition({}),
      motion: { textIn: id, bgMotion: "none", intensity: 0.5 },
    });
    assert.deepEqual(Object.keys(c.motion).sort(), [
      "bgMotion",
      "intensity",
      "textIn",
    ]);
    assert.equal(c.motion.textIn, id);
  }
  assert.deepEqual(Object.keys(defaultComposition({}).motion).sort(), [
    "bgMotion",
    "intensity",
    "textIn",
  ]);
  assert.deepEqual(TEXT_IN, ["fade", "line", "rise", "none"]);
});
test("motion prefs are whitelisted; library ids accepted; typewriter rejected", () => {
  const n = (m) =>
    normalizeComposition({
      ...defaultComposition({}),
      motion: { textIn: "fade", bgMotion: "none", intensity: 0.5, ...m },
    }).motion;
  for (const p of MOTION_PREFS) assert.equal(n({ pref: p }).pref, p);
  assert.equal(n({ pref: "wild" }).pref, undefined);
  assert.equal(n({ reduceMotion: "yes" }).reduceMotion, undefined);
  assert.equal(n({ reduceMotion: true }).reduceMotion, true);
  for (const id of LIBRARY_IDS) assert.equal(n({ textIn: id }).textIn, id);
  assert.equal(n({ textIn: "typewriter" }).textIn, "fade");
  assert.ok(
    !TEXT_IN_ALL.includes("typewriter") && REJECTED_ANIMATIONS.typewriter,
  );
  assert.equal(ANIMATION_IDS.length, 12);
});
test("each declaration has {id,label,unit,maxDy,maxDx,minAlpha,holdBy}; dimming never below 0.55; zoom at most 1.04", () => {
  for (const id of ANIMATION_IDS) {
    const b = ANIMATIONS[id];
    assert.equal(b.id, id);
    assert.ok(
      b.label && b.description && ["row", "word", "block"].includes(b.unit),
    );
    assert.ok(
      Number.isFinite(b.maxDy) &&
        Number.isFinite(b.maxDx) &&
        b.minAlpha >= MIN_DIM_ALPHA,
    );
    assert.equal(typeof b.holdBy, "function");
  }
  assert.ok(ANIMATIONS["slow-zoom"].maxScale <= MAX_SCALE);
  assert.equal(
    ANIMATIONS["highlight-line"].minAlpha >= 0.55 ||
      ANIMATIONS["highlight-line"].minAlpha === 1,
    true,
  );
});

// ---------------------------------------------------------------- the matrix
test("every behaviour x pref x Tamil fixture: hold reached and held, in bounds, every unit shown in reading order", () => {
  const fixtures = [
    ...Object.keys(CORPUS).map((k) => ({ k, comp: corpusComp(k) })),
    { k: "multi-stanza", ...multiStanza() },
  ];
  let proved = 0;
  for (const id of ANIMATION_IDS)
    for (const pref of MOTION_PREFS)
      for (const f of fixtures) {
        const comp = {
          ...f.comp,
          motion: { ...f.comp.motion, textIn: id, pref },
        };
        const scenes = f.scene ? [f.scene] : f.comp.scenes;
        scenes.forEach((sc0, i) => {
          const last = i === scenes.length - 1,
            p = PREF_PARAMS[pref],
            b = ANIMATIONS[id];
          const { v, sc, geo } = proveScene(b, comp, sc0, last, p);
          const { holdBy, outMs } = v.animation;
          assert.ok(
            holdBy + (b.library ? 1000 : 0) <= sc.durationMs - outMs,
            `${id}: hold reached before the scene ends`,
          );
          const plan = buildPlan(b, sc, geo);
          // rest at hold: EXACT {1,0,0} and scale 1 for every unit from holdBy until the out phase
          for (let t = holdBy; t <= sc.durationMs - outMs; t += 97) {
            const fr = animFrame(b, sc, plan, t, {
              last,
              p,
              intensity: comp.motion.intensity,
            });
            assert.equal(fr.scale, 1, `${id} scale at ${t}`);
            for (const r of fr.rows) {
              assert.deepEqual(
                r.state,
                HOLD,
                `${id}/${pref}/${f.k} row ${r.u.index} at ${t}`,
              );
              for (const w of r.words || []) assert.deepEqual(w.state, HOLD);
            }
          }
          // alpha in [0,1], scale in [1, 1.04], dx 0, every unit's first full frame in reading order
          const first = new Map();
          for (let t = 0; t <= holdBy; t += 20) {
            const fr = animFrame(b, sc, plan, t, {
              last,
              p,
              intensity: comp.motion.intensity,
            });
            assert.ok(fr.scale >= 1 && fr.scale <= MAX_SCALE);
            for (const r of fr.rows) {
              const units = r.words
                ? r.words.map((w) => [`w${w.w.order}`, w.state])
                : [[`r${r.u.index}`, r.state]];
              for (const [key, s] of units) {
                assert.ok(
                  s.alpha >= 0 &&
                    s.alpha <= 1 &&
                    s.dx === 0 &&
                    Math.abs(s.dy) <= Math.max(b.maxDy, 0),
                );
                if (s.alpha === 1 && !first.has(key)) first.set(key, t);
              }
            }
          }
          const keys = plan.rows.flatMap((u) =>
            b.unit === "word"
              ? u.words.map((w) => `w${w.order}`)
              : [`r${u.index}`],
          );
          for (const key of keys) if (!first.has(key)) first.set(key, holdBy);
          const times = keys.map((k) => first.get(k));
          for (let j = 1; j < times.length; j++)
            assert.ok(
              times[j] >= times[j - 1],
              `${id}: reading order (${keys[j]})`,
            );
          // word splits only at breakable whitespace of the SOURCE line
          if (b.unit === "word")
            for (const u of plan.rows) {
              const src = sc.lines[u.row.srcLine];
              let at = u.row.start;
              for (const w of u.words) {
                assert.ok(
                  isBreakableWhitespace(src.slice(at, w.start)),
                  "gap is breakable whitespace",
                );
                assert.ok(
                  w.start === u.row.start || w.start > at,
                  "words are separated",
                );
                assert.ok(
                  !/[\s]/.test(
                    src.slice(w.start, w.end).replace(/[   ﻿]/g, ""),
                  ),
                  "no breakable space inside a word",
                );
                at = w.end;
              }
              assert.ok(isBreakableWhitespace(src.slice(at, u.row.end)));
            }
          proved++;
        });
      }
  assert.ok(proved > 300, `proved ${proved} scene/behaviour/pref combinations`);
});
test("word reveal keeps NBSP-joined pairs and whitespace-free rows as one unit", () => {
  const b = ANIMATIONS["word-reveal"];
  const sc = {
    id: "n",
    kind: "stanza",
    lines: ["கொடிய வெயில் காய்ந்தாலும்", "தமிழ்"],
    durationMs: 6000,
  };
  const plan = buildPlan(b, sc, sceneGeometry(ctx, corpusComp("nbsp"), sc));
  assert.deepEqual(
    plan.rows[0].words.map((w) => w.text),
    ["கொடிய வெயில்", "காய்ந்தாலும்"],
  );
  assert.deepEqual(
    plan.rows[1].words.map((w) => w.text),
    ["தமிழ்"],
  );
});
test("slow zoom ends at exactly 1.0 and never exceeds 1.04; highlight never dims below 0.55", () => {
  const comp = corpusComp("indent");
  const sc = comp.scenes[comp.scenes.length - 1];
  for (const pref of MOTION_PREFS) {
    const p = PREF_PARAMS[pref];
    const z = ANIMATIONS["slow-zoom"],
      geo = sceneGeometry(ctx, comp, sc),
      plan = buildPlan(z, sc, geo);
    const hb = z.holdBy(sc, plan, p, true);
    for (let t = 0; t <= sc.durationMs; t += 25) {
      const s = animFrame(z, sc, plan, t, { last: true, p }).scale;
      assert.ok(s >= 1 && s <= 1.04);
      if (t >= hb) assert.equal(s, 1);
    }
    const h = ANIMATIONS["highlight-line"],
      hp = buildPlan(h, sc, geo);
    for (let t = 0; t <= sc.durationMs; t += 25)
      for (const r of animFrame(h, sc, hp, t, { last: true, p }).rows) {
        if (t > 900)
          assert.ok(r.state.alpha >= 0.55, `dim ${r.state.alpha} at ${t}`);
      }
  }
});

// ---------------------------------------------------------------- reduce motion
test("reduceMotion degrades every behaviour to a plain fade with hold (and stills the background)", () => {
  for (const id of ANIMATION_IDS) {
    const comp = {
      ...corpusComp("indent"),
      motion: {
        textIn: id,
        bgMotion: "zoom",
        intensity: 0.5,
        reduceMotion: true,
      },
    };
    assert.equal(activeBehaviour(comp), ANIMATIONS.fade);
    const a = checkAnimation(ctx, comp, comp.scenes);
    assert.ok(a.ok, a.messages.join(" | "));
    assert.equal(a.id, "fade");
  }
});

// ---------------------------------------------------------------- negative controls
const base = LIBRARY["line-reveal"];
const sampleComp = corpusComp("indent");
const sampleScene = { ...sampleComp.scenes[1], durationMs: 9000 };
const refuse = (b, re, sc = sampleScene, comp = sampleComp) => {
  const v = validateAnimation(b, sc, sceneGeometry(ctx, comp, sc), {
    last: false,
    p: PREF_PARAMS.normal,
  });
  assert.equal(v.ok, false, `${b.id} must be refused`);
  if (re)
    assert.ok(
      v.messages.some((m) => re.test(m)),
      `${b.id}: ${v.messages.join(" | ")}`,
    );
  return v;
};
test("refused: a behaviour that hides a row forever", () => {
  refuse(
    {
      ...base,
      id: "hide",
      rowState: (s, row, t, info) =>
        info.index === 0
          ? { alpha: 0, dy: 0, dx: 0 }
          : base.rowState(s, row, t, info),
    },
    /not at rest|never|fully shown/,
  );
});
test("refused: a behaviour that exceeds its maxDy", () => {
  refuse(
    {
      ...base,
      id: "jump",
      rowState: (s, row, t, info) =>
        t < 300
          ? { alpha: 0.5, dy: 80, dx: 0 }
          : base.rowState(s, row, t, info),
    },
    /its maximum is/,
  );
});
test("refused: a behaviour that leaves the safe rect", () => {
  refuse(
    {
      ...base,
      id: "escape",
      maxDy: 1e5,
      rowState: (s, row, t, info) =>
        t < 300
          ? { alpha: 0.8, dy: 4000, dx: 0 }
          : base.rowState(s, row, t, info),
    },
    /outside the safe area|canvas/,
  );
});
test("refused with a message: holdBy beyond the scene length (never silently truncated)", () => {
  refuse(
    { ...base, id: "slow", holdBy: () => 1e5 },
    /needs this scene to last at least/,
  );
  refuse(ANIMATIONS["highlight-line"], /needs this scene to last at least/, {
    ...sampleScene,
    durationMs: 1200,
  });
});
test("refused: a word split inside a grapheme", () => {
  const wr = LIBRARY["word-reveal"];
  const bad = {
    ...wr,
    id: "split",
    split: (line, start, end) => [
      { start, end: start + 2 },
      { start: start + 2, end },
    ],
  };
  refuse(bad, /split|whitespace|word/i);
  assert.ok(
    graphemes(sampleScene.lines[0]).length < sampleScene.lines[0].length,
    "fixture has multi-unit graphemes",
  );
});
test("refused: Math.random or Date inside a behaviour", () => {
  refuse(
    {
      ...base,
      id: "rand",
      rowState: (s, row, t, info) => ({
        ...base.rowState(s, row, t, info),
        alpha: Math.min(1, Math.random() + 0.99),
      }),
    },
    /determin/i,
  );
  refuse(
    {
      ...base,
      id: "date",
      rowState: (s, row, t, info) =>
        Date.now() < 0 ? HOLD : base.rowState(s, row, t, info),
    },
    /determin/i,
  );
});
test("refused: a forged behaviour claiming a classic id gets no classic leniency", () => {
  refuse({
    ...ANIMATIONS.rise,
    rowState: () => ({ alpha: 0.9, dy: 50, dx: 0 }),
  });
});

// ---------------------------------------------------------------- wiring
function recCtx() {
  const log = [];
  const inner = mkCtx();
  const grad = { addColorStop: () => {} };
  const t = new Proxy(
    {},
    {
      get(_, k) {
        if (k === "measureText") return inner.measureText;
        if (k === "font") return inner.font;
        if (
          k === "createLinearGradient" ||
          k === "createRadialGradient" ||
          k === "createPattern"
        )
          return (...a) => {
            log.push([k, ...a]);
            return grad;
          };
        if (k === "getImageData")
          return () => ({ data: new Uint8ClampedArray(4) });
        return (...a) => log.push([k, ...a]);
      },
      set(_, k, v) {
        if (k === "font") inner.font = v;
        log.push(["=", k, typeof v === "object" ? "obj" : v]);
        return true;
      },
    },
  );
  return { ctx: t, log };
}
test("still routes draw the HOLD state: call logs are identical for every behaviour", () => {
  const comp0 = corpusComp("long");
  const ref = recCtx();
  drawFrame(ref.ctx, comp0, 0, { still: true, scene: comp0.scenes[1] });
  for (const id of ANIMATION_IDS) {
    const r = recCtx();
    drawFrame(
      r.ctx,
      { ...comp0, motion: { ...comp0.motion, textIn: id, pref: "expressive" } },
      0,
      { still: true, scene: comp0.scenes[1] },
    );
    assert.deepEqual(r.log, ref.log, `${id} still`);
  }
});
test("preview/export renderer draws exactly the units animFrame validated (word positions and alphas)", () => {
  const comp0 = corpusComp("nbsp");
  const comp = {
    ...comp0,
    motion: { ...comp0.motion, textIn: "word-reveal", pref: "calm" },
  };
  const sc = comp.scenes[1],
    b = activeBehaviour(comp);
  const plan = buildPlan(b, sc, sceneGeometry(ctx, comp, sc));
  const startMs = comp.scenes.slice(0, 1).reduce((a, s) => a + s.durationMs, 0);
  for (const local of [200, 450, 900]) {
    const r = recCtx();
    drawFrame(r.ctx, comp, startMs + local, {});
    const drawn = r.log.filter((c) => c[0] === "fillText").map((c) => c[1]);
    const fr = animFrame(b, sc, plan, local, {
      last: comp.scenes.length === 2,
      p: prefParams(comp),
    });
    const expect = fr.rows.flatMap((x) =>
      x.whole
        ? [x.u.row.text]
        : x.words.filter((w) => w.state.alpha > 0).map((w) => w.w.text),
    );
    for (const t of expect)
      assert.ok(drawn.includes(t), `drawn "${t}" at ${local}`);
  }
});
test("every animated route validator runs the animation check; stills do not", () => {
  const comp0 = corpusComp("indent");
  const short = {
    ...comp0,
    motion: { ...comp0.motion, textIn: "highlight-line" },
    scenes: comp0.scenes.map((s) => ({ ...s, durationMs: 1200 })),
  };
  const v = checkScenes(ctx, short, short.scenes);
  assert.equal(v.ok, false);
  assert.ok(v.messages.some((m) => NEED_RE.test(m)));
  assert.ok(
    !checkScenes(ctx, short, short.scenes, { animated: false }).messages.some(
      (m) => NEED_RE.test(m),
    ),
  );
  assert.ok(
    !(routeById("story-stills").validate(ctx, short, {}).messages || []).some(
      (m) => NEED_RE.test(m),
    ),
  );
  const ok = {
    ...comp0,
    motion: { ...comp0.motion, textIn: "line-reveal", pref: "calm" },
  };
  const g = checkScenes(ctx, ok, ok.scenes);
  assert.ok(g.animation?.ok, (g.animation?.messages || []).join(" | "));
});
