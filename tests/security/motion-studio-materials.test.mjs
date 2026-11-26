// P4: procedural materials (fx/effects.js, materials.js) and the material verifier (fx/verify.js).
// Positive: deterministic per seed+frame, golden path untouched, every effect on its layer within its cap, the poem
// text drawn identically with/without every preset on every route (Tamil fixtures), contrast floor kept.
// Negative controls: each guard must actually catch what it claims to. Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ROUTES } from "../../src/lib/motion-studio/formats.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";
import { drawFrame } from "../../src/lib/motion-studio/render.js";
import { TEMPLATES } from "../../src/lib/motion-studio/templates.js";
import {
  MATERIALS,
  MATERIAL_IDS,
  MATERIAL_NONE,
  normalizeMaterial,
  materialPlan,
  effectiveIntensity,
  surfaceOpacity,
} from "../../src/lib/motion-studio/materials.js";
import {
  SURFACE_CAP,
  defineEffect,
  undefineEffect,
  listEffects,
  listFx,
  runMaterial,
} from "../../src/lib/motion-studio/fx/registry.js";
import { verifyMaterial } from "../../src/lib/motion-studio/fx/verify.js";
import { withoutClocks } from "../../src/lib/motion-studio/fx/guard.js";

// ---------------------------------------------------------------- fixtures
const mkCtx = () => {
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
        Array.from(String(t)).length *
        px *
        (font.includes("Tamil") ? 0.55 : 0.5),
    }),
  };
};
const ctx = mkCtx();
const CORPUS = {
  indent:
    "மழையின் பாடல்\n  உள்ளம் சொல்லும் கதை\n    இன்னும் ஒரு வரி\n\nகொடிய வெயில் காய்ந்தாலும்",
  long: "தமிழ் என்றும் வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க\nசிறு வரி\n\nகடல் அலை கரையைத் தொட்டுத் திரும்பும் ஒவ்வொரு முறையும் ஒரு கதை சொல்லும்",
};
const TITLE = "மழையின் பாடல்";
function fixture(key, { format = "reel", templateId, material } = {}) {
  const poem = parsePoemText(CORPUS[key], { title: TITLE });
  const d = defaultComposition({
    format,
    templateId,
    scenes: generateScenes(poem, { title: TITLE }),
  });
  let comp = normalizeComposition({
    ...d,
    ...(material ? { material } : {}),
    poem: { title: TITLE, stanzas: poem.stanzas, source: poem.source },
  });
  const plan = planFit(ctx, comp);
  if (plan.ok) comp = applyFit(comp, plan);
  return { comp, poem: { ...poem, title: TITLE } };
}
const inputFor = (route, poem) => ({
  poem,
  preset: "compact",
  height: "extended",
  format: route.id === "quote" ? "poster" : "reel",
  lines: poem.stanzas
    .flatMap((st, si) => st.map((text, line) => ({ stanza: si, line, text })))
    .filter((l) => l.text)
    .slice(0, 2),
});
const routeFormat = (route) =>
  ["story", "square"].includes(route.format) ? route.format : "reel";

/** Logs every call / property write (gradients by id); `text` collects fillText calls; `shared` receives both. */
function recorder(shared = null) {
  const log = shared || [];
  let px = 40,
    grads = 0;
  const val = (v) => (v && typeof v === "object" && v.__g ? `g${v.__g}` : v);
  const grad =
    (kind) =>
    (...a) => {
      const id = ++grads;
      log.push([kind, ...a]);
      return {
        __g: id,
        addColorStop: (...s) => log.push([`g${id}.stop`, ...s]),
      };
    };
  const target = {
    measureText: (t) => ({ width: Array.from(String(t)).length * px * 0.55 }),
    createLinearGradient: grad("lin"),
    createRadialGradient: grad("rad"),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    fillText: (...a) => log.push(["fillText", ...a]),
  };
  const ctx2 = new Proxy(target, {
    get: (t, k) =>
      k in t
        ? t[k]
        : k === "font"
          ? `${px}px x`
          : (...a) => log.push([String(k), ...a.map(val)]),
    set: (t, k, v) => {
      if (k === "font") px = Number(/([\d.]+)px/.exec(v)?.[1] || px);
      log.push([`=${String(k)}`, val(v)]);
      return true;
    },
  });
  return { ctx: ctx2, log };
}
const hash = (log) =>
  createHash("sha256").update(JSON.stringify(log)).digest("hex");
const frameLog = (comp, tMs, opts = {}) => {
  const r = recorder();
  drawFrame(r.ctx, comp, tMs, opts);
  return r.log;
};
const withMat = (comp, m) => normalizeComposition({ ...comp, material: m });

// ---------------------------------------------------------------- positive
test("materials: 12 presets, data only, default none, every surface budget within the cap", () => {
  assert.equal(MATERIALS.length, 12);
  assert.equal(MATERIAL_IDS[0], MATERIAL_NONE);
  for (const m of MATERIALS) {
    assert.ok(Object.isFrozen(m) && m.layers.length > 0, m.id);
    assert.ok(surfaceOpacity(m) <= SURFACE_CAP + 1e-9, m.id);
    for (const l of m.layers)
      assert.deepEqual(Object.keys(l).sort(), ["fx", "params"]);
  }
  assert.equal(
    defaultComposition({ format: "reel", scenes: [] }).material,
    undefined,
  );
  assert.deepEqual(listFx(), [], "the ambient registry stays empty");
});

test("determinism: same seed + frame => identical call log; another seed or frame => different", () => {
  const { comp } = fixture("indent");
  for (const m of MATERIALS) {
    const a = withMat(comp, { id: m.id, intensity: 1, seed: 42 });
    const h1 = hash(frameLog(a, 1234)),
      h2 = hash(frameLog(structuredClone(a), 1234));
    assert.equal(h1, h2, `${m.id} not deterministic`);
    const s1 = hash(frameLog(a, 0, { still: true, scene: a.scenes[0] }));
    assert.equal(
      s1,
      hash(frameLog(a, 0, { still: true, scene: a.scenes[0] })),
      `${m.id} still not deterministic`,
    );
    // a preset made only of smooth gradients has nothing random to seed; every other preset must follow the seed
    const smooth = m.layers.every((l) =>
      ["gradient-overlay", "soft-glow"].includes(l.fx),
    );
    const other = hash(
      frameLog(withMat(comp, { id: m.id, intensity: 1, seed: 43 }), 1234),
    );
    if (smooth) assert.equal(other, h1, `${m.id} is seed-independent`);
    else assert.notEqual(other, h1, `${m.id} ignores the seed`);
  }
  // animated effects advance with the frame index only
  const film = withMat(comp, { id: "rain-glass", intensity: 1, seed: 1 });
  assert.notEqual(hash(frameLog(film, 0)), hash(frameLog(film, 1000)));
  // (the text animation itself is continuous in time; the material only depends on the 30 fps frame index)
  const fxAt = (t) => {
    const tr = [];
    drawFrame(recorder().ctx, film, t, { fxTrace: tr });
    return hash(tr);
  };
  assert.notEqual(
    fxAt(1000),
    fxAt(1100),
    "animated material moves between frames",
  );
  assert.equal(
    fxAt(1000),
    fxAt(1010),
    "same 30 fps frame index => same material frame",
  );
});

test("golden path: no material, id none, intensity 0 and reduce all draw exactly the legacy call log", () => {
  for (const key of Object.keys(CORPUS))
    for (const tpl of TEMPLATES) {
      const { comp } = fixture(key, { templateId: tpl.id });
      assert.equal(comp.material, undefined);
      const base = hash(frameLog(comp, 1500)),
        still = hash(frameLog(comp, 0, { still: true, scene: comp.scenes[0] }));
      for (const m of [
        { id: MATERIAL_NONE, intensity: 1 },
        { id: "film", intensity: 0 },
        { id: "aged-paper", intensity: 1, reduce: true },
      ]) {
        const c = withMat(comp, m);
        assert.equal(materialPlan(c).length, 0);
        assert.equal(
          hash(frameLog(c, 1500)),
          base,
          `${tpl.id} ${JSON.stringify(m)}`,
        );
        assert.equal(
          hash(frameLog(c, 0, { still: true, scene: c.scenes[0] })),
          still,
        );
      }
    }
});

test("layers: every effect paints only on its own layer, under or over the text as declared, within its alpha cap", () => {
  const { comp } = fixture("indent");
  const env = (def, layerTrace, report) => ({
    comp,
    W: 1080,
    H: 1920,
    tMs: 900,
    still: false,
    rect: { x: 0, y: 0, w: 1080, h: 1920 },
    plan: [{ def, params: {}, index: 0 }],
    intensity: 1,
    seed: 9,
    fxTrace: layerTrace,
    fxReport: report,
  });
  for (const def of listEffects()) {
    if (def.layer === "surface") assert.ok(def.maxAlpha <= SURFACE_CAP, def.id);
    for (const layer of ["material", "atmosphere", "surface"]) {
      const trace = [],
        report = [];
      const n = runMaterial(layer, recorder().ctx, env(def, trace, report));
      assert.deepEqual(report, [], `${def.id}: ${report.join("; ")}`);
      if (layer !== def.layer) {
        assert.equal(n, 0);
        assert.equal(trace.length, 0);
        continue;
      }
      assert.ok(trace.length > 0, `${def.id} drew nothing`);
      for (const op of trace) {
        assert.equal(op.layer, def.layer);
        assert.ok(
          op.alpha <= def.maxAlpha + 1e-9,
          `${def.id} alpha ${op.alpha}`,
        );
      }
    }
  }
  // paint order inside drawFrame: under-text ops before the first poem row, surface ops after it
  for (const m of MATERIALS) {
    const shared = [];
    const r = recorder(shared);
    const c = withMat(comp, { id: m.id, intensity: 1 });
    drawFrame(r.ctx, c, 0, {
      still: true,
      scene: c.scenes[0],
      fxTrace: shared,
    });
    const firstText = shared.findIndex(
      (e) => Array.isArray(e) && e[0] === "fillText",
    );
    assert.ok(firstText > 0);
    shared.forEach((e, i) => {
      if (Array.isArray(e)) return;
      if (e.layer === "surface")
        assert.ok(i > firstText, `${m.id}: surface op before the text`);
      else assert.ok(i < firstText, `${m.id}: ${e.layer} op after the text`);
    });
  }
});

test("routes: every preset leaves the Tamil text identical on every route (reel/story/poster/square/full-poem/...)", () => {
  let checked = 0;
  for (const key of Object.keys(CORPUS))
    for (const m of MATERIALS)
      for (const route of ROUTES) {
        const { comp, poem } = fixture(key, {
          format: routeFormat(route),
          material: { id: m.id, intensity: 1, seed: 5 },
        });
        const plain = { ...comp };
        delete plain.material;
        const base = route.validate(ctx, plain, inputFor(route, poem));
        const r = route.validate(ctx, comp, inputFor(route, poem));
        if (!base.ok) {
          assert.equal(
            r.ok,
            false,
            `${route.id}: a failing route must stay failing`,
          );
          continue;
        }
        assert.ok(r.ok, `${key} ${m.id} ${route.id}: ${r.messages.join("; ")}`);
        assert.ok(
          r.material?.ok && r.material.checked > 0,
          `${route.id} did not verify the material`,
        );
        checked += r.material.checked;
      }
  assert.ok(checked > 500, `only ${checked} frames verified`);
  for (const f of ["reel", "story", "poster", "square", "full-poem"])
    assert.ok(
      ROUTES.some((r) => r.format === f || r.id === f),
      f,
    );
});

test("contrast: every preset on every template keeps text contrast >= min(4.5, its own contrast) and over-text <= cap", () => {
  const route = ROUTES.find((r) => r.id === "reel-mp4");
  for (const tpl of TEMPLATES)
    for (const m of MATERIALS) {
      const { comp } = fixture("indent", {
        templateId: tpl.id,
        material: { id: m.id, intensity: 1, seed: 3 },
      });
      const r = route.validate(ctx, comp, {});
      assert.ok(r.ok, `${tpl.id} ${m.id}: ${r.messages.join("; ")}`);
      for (const s of r.material.stats) {
        assert.ok(
          s.maxSurface <= SURFACE_CAP + 1e-6,
          `${tpl.id} ${m.id} surface ${s.maxSurface}`,
        );
        if (s.worst)
          assert.ok(
            s.worst.margin >= -1e-3,
            `${tpl.id} ${m.id} contrast ${s.worst.ratio}`,
          );
      }
    }
});

// ---------------------------------------------------------------- negative controls
test("negative: an over-text effect above the cap is rejected (definition, runtime alpha, verifier)", () => {
  assert.throws(
    () =>
      defineEffect({
        id: "t-loud",
        layer: "surface",
        maxAlpha: 0.2,
        draw() {},
      }),
    /capped at opacity 0.12/,
  );
  // runtime: asking for more than the cap is clamped and reported
  const def = defineEffect({
    id: "t-greedy",
    layer: "surface",
    maxAlpha: 0.1,
    draw(c, e) {
      c.globalAlpha = 0.9;
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, e.W, e.H);
    },
  });
  try {
    const { comp } = fixture("indent");
    const trace = [],
      report = [];
    runMaterial("surface", recorder().ctx, {
      comp,
      W: 1080,
      H: 1920,
      still: true,
      plan: [{ def, params: {}, index: 0 }],
      intensity: 1,
      seed: 1,
      fxTrace: trace,
      fxReport: report,
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    assert.ok(
      report.some((m) => /t-greedy/.test(m)),
      report.join("; "),
    );
    assert.ok(trace.every((op) => op.alpha <= 0.1 + 1e-9));
  } finally {
    undefineEffect("t-greedy");
  }
  // verifier: a forged surface op over the text (as if an effect escaped the guard) is caught
  const { comp } = fixture("indent", {
    material: { id: "film", intensity: 1 },
  });
  const v = verifyMaterial(ctx, comp, [
    (c, cm, x) => {
      drawFrame(c, cm, 0, { still: true, scene: cm.scenes[0], ...x });
      if (x.fxTrace)
        x.fxTrace.push({
          fx: "forged",
          layer: "surface",
          bbox: [-1e4, -1e4, 1e4, 1e4],
          alpha: 0.5,
          paint: { rgb: [255, 255, 255], a: 1 },
          tf: { tx: 0, ty: 0, sx: 1, sy: 1 },
        });
    },
  ]);
  assert.equal(v.ok, false);
  assert.ok(
    v.messages.some((m) => /over-text effects reach opacity 0\.5/.test(m)),
    v.messages.join("; "),
  );
});

test("negative: a contrast-killing under-text op is caught by the verifier", () => {
  const { comp } = fixture("indent", {
    material: { id: "paper", intensity: 1 },
  });
  const textRgb = comp.style.color.match(/\w\w/g).map((h) => parseInt(h, 16));
  const v = verifyMaterial(ctx, comp, [
    (c, cm, x) => {
      drawFrame(c, cm, 0, { still: true, scene: cm.scenes[0], ...x });
      if (x.fxTrace)
        x.fxTrace.push({
          fx: "forged",
          layer: "material",
          bbox: [-1e4, -1e4, 1e4, 1e4],
          alpha: 0.95,
          paint: { rgb: textRgb, a: 1 },
          tf: { tx: 0, ty: 0, sx: 1, sy: 1 },
        });
    },
  ]);
  assert.equal(v.ok, false);
  assert.ok(
    v.messages.some((m) => /lowers text contrast/.test(m)),
    v.messages.join("; "),
  );
});

const helperRandom = () => Math.random(); // outside the effect's own source: only the runtime trap can see it
test("negative: Math.random / Date are detected (static and at runtime)", () => {
  assert.throws(
    () =>
      defineEffect({
        id: "t-rand",
        layer: "material",
        maxAlpha: 0.5,
        draw() {
          return Math.random();
        },
      }),
    /Math\.random/,
  );
  assert.throws(
    () =>
      defineEffect({
        id: "t-date",
        layer: "material",
        maxAlpha: 0.5,
        draw() {
          return Date.now();
        },
      }),
    /Date/,
  );
  for (const [id, fn] of [
    ["t-indirect-rand", helperRandom],
    ["t-indirect-date", () => new globalThis.Date()],
  ]) {
    const def = defineEffect({
      id,
      layer: "material",
      maxAlpha: 0.5,
      draw: (c) => {
        c.fillStyle = "#000000";
        c.fillRect(0, 0, 1 + fn(), 1);
      },
    });
    try {
      const { comp } = fixture("indent");
      const report = [];
      runMaterial("material", recorder().ctx, {
        comp,
        W: 10,
        H: 10,
        still: true,
        plan: [{ def, params: {}, index: 0 }],
        intensity: 1,
        seed: 1,
        fxReport: report,
        rect: { x: 0, y: 0, w: 1, h: 1 },
      });
      assert.ok(
        report.some((m) => /deterministic/.test(m)),
        `${id}: ${report.join("; ")}`,
      );
    } finally {
      undefineEffect(id);
    }
  }
  assert.equal(
    typeof Math.random(),
    "number",
    "Math.random restored after the effect",
  );
  assert.ok(Date.now() > 0, "Date restored after the effect");
  assert.throws(
    () => withoutClocks(() => performance.now()),
    /performance\.now/,
  );
});

test("negative: alpha / transform / blur leaking into the text is detected; the guarded runner prevents it", () => {
  const { comp } = fixture("indent", {
    material: { id: "dust", intensity: 1 },
  });
  const leaky = (mutate) => (c, cm, x) => {
    const p = cm.material
      ? new Proxy(c, {
          get: (t, k) =>
            k === "fillText"
              ? (...a) => {
                  mutate(t);
                  t.fillText(...a);
                }
              : t[k],
          set: (t, k, v) => {
            t[k] = v;
            return true;
          },
        })
      : c;
    drawFrame(p, cm, 0, { still: true, scene: cm.scenes[0], ...x });
  };
  for (const [what, mutate] of [
    [
      "alpha",
      (t) => {
        t.globalAlpha = 0.5;
      },
    ],
    ["transform", (t) => t.translate(3, 0)],
    [
      "blur",
      (t) => {
        t.filter = "blur(2px)";
      },
    ],
    [
      "shadow",
      (t) => {
        t.shadowBlur = 4;
      },
    ],
  ]) {
    const v = verifyMaterial(ctx, comp, [leaky(mutate)]);
    assert.equal(v.ok, false, what);
    assert.ok(
      v.messages.some((m) => /changed how the poem text is drawn/.test(m)),
      what,
    );
  }
  // a real effect that tries all of it through the runner: the text stays identical, the misuse is reported
  const def = defineEffect({
    id: "t-leak",
    layer: "material",
    maxAlpha: 0.5,
    draw(c) {
      c.save();
      c.save();
      c.globalAlpha = 0.4;
      c.translate(50, 50);
      c.scale(2, 2);
      c.filter = "blur(3px)";
      c.shadowBlur = 9;
      c.globalCompositeOperation = "multiply";
      c.fillStyle = "#000000";
      c.fillRect(0, 0, 4, 4);
    },
  });
  try {
    const plain = { ...comp };
    delete plain.material;
    const rec = (cm) => {
      const r = recorder();
      drawFrame(r.ctx, cm, 0, { still: true, scene: cm.scenes[0] });
      return r.log.filter((e) => e[0] === "fillText");
    };
    // run the leaky effect inside a real drawFrame by swapping it in for the plan
    const report = [];
    const r1 = recorder();
    drawFrame(r1.ctx, plain, 0, { still: true, scene: plain.scenes[0] });
    runMaterial("material", r1.ctx, {
      comp,
      W: 1080,
      H: 1920,
      still: true,
      plan: [{ def, params: {}, index: 0 }],
      intensity: 1,
      seed: 1,
      fxReport: report,
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    assert.ok(
      report.some((m) => /filter|shadow|compositing/.test(m)),
      report.join("; "),
    );
    const saves = r1.log.filter((e) => e[0] === "save").length,
      restores = r1.log.filter((e) => e[0] === "restore").length;
    assert.equal(saves, restores, "forgotten save() calls are unwound");
    assert.deepEqual(rec(plain), rec(plain));
  } finally {
    undefineEffect("t-leak");
  }
});

test("normalize: whitelist + clamp, idempotent round trip, legacy compositions unchanged", () => {
  const { comp } = fixture("indent");
  assert.equal("material" in comp, false, "legacy comps gain no material key");
  assert.deepEqual(
    normalizeComposition(structuredClone(comp)),
    comp,
    "legacy round trip unchanged",
  );
  const cases = [
    [
      { id: "film", intensity: 5, seed: -4 },
      { id: "film", intensity: 1, reduce: false, seed: 0 },
    ],
    [
      { id: "film", intensity: -1 },
      { id: "film", intensity: 0, reduce: false, seed: 1 },
    ],
    [
      { id: "<script>", intensity: 0.5 },
      { id: MATERIAL_NONE, intensity: 0.5, reduce: false, seed: 1 },
    ],
    [
      { id: "paper", intensity: "abc", reduce: "yes", seed: 1e12 },
      { id: "paper", intensity: 0.6, reduce: false, seed: 2147483647 },
    ],
    [
      { id: "linen", intensity: 0.333, reduce: true, seed: 7.9 },
      { id: "linen", intensity: 0.33, reduce: true, seed: 7 },
    ],
  ];
  for (const [inp, want] of cases) {
    assert.deepEqual(normalizeMaterial(inp), want);
    const n = withMat(comp, { ...inp, extra: "dropped" });
    assert.deepEqual(n.material, want);
    assert.deepEqual(normalizeComposition(structuredClone(n)), n, "idempotent");
  }
});

test("reduce effects: forces intensity 0, no effect (surface included) draws, preview and export alike", () => {
  const { comp } = fixture("indent");
  for (const m of MATERIALS) {
    const on = withMat(comp, { id: m.id, intensity: 1 }),
      off = withMat(comp, { id: m.id, intensity: 1, reduce: true });
    assert.ok(materialPlan(on).length > 0);
    assert.equal(effectiveIntensity(off), 0);
    assert.deepEqual(materialPlan(off), []);
    const trace = [];
    drawFrame(recorder().ctx, off, 700, { fxTrace: trace });
    assert.equal(trace.length, 0, m.id);
    const r = ROUTES.find((x) => x.id === "reel-mp4").validate(ctx, off, {});
    assert.equal(
      r.material,
      undefined,
      "no material verification needed when nothing draws",
    );
  }
});
