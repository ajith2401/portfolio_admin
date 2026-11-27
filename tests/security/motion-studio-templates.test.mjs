// P8: 18 new templates (6 families x 3 variants), 18 palettes, 20 typography presets. DATA ONLY.
// Every template goes through the SAME gates as an export: ensureFonts (mocked FontFace API) and every route validator
// (validateScene(s) / validateFullPoem / quote / poster / carousel), with material verification and animation validation,
// on three synthetic Tamil fixtures (long lines, indents + tabs, several stanzas) and four formats.
// Negative controls prove the load-time checks refuse forged data. Synthetic poems only.
// What this does NOT prove: that the looks are beautiful. Every new entry is needsAestheticReview:true (no design sign-off).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  TEMPLATES,
  DESIGN_TEMPLATES,
  TEMPLATE_LIBRARY,
  FAMILIES,
  familyOf,
  groupByFamily,
  templateById,
  assertTemplate,
  buildTemplate,
  PENDING_REVIEW_LABEL,
} from "../../src/lib/motion-studio/templates.js";
import {
  PALETTES,
  assertPalette,
  paletteById,
  paletteContrast,
  worstContrast,
  PALETTE_CONTRAST_MIN,
} from "../../src/lib/motion-studio/palettes.js";
import {
  TYPE_PRESETS,
  assertTypePreset,
  typePresetById,
  TYPE_SIZE_MIN,
} from "../../src/lib/motion-studio/type-presets.js";
import {
  MATERIALS,
  MATERIAL_IDS,
} from "../../src/lib/motion-studio/materials.js";
import { ANIMATION_IDS } from "../../src/lib/motion-studio/animation.js";
import {
  fontById,
  CANDIDATE_FONT_IDS,
} from "../../src/lib/motion-studio/font-registry.js";
import { ensureFonts } from "../../src/lib/motion-studio/font-ready.js";
import { ROUTES, routeById } from "../../src/lib/motion-studio/formats.js";
import { MIN_TEXT_PX } from "../../src/lib/motion-studio/safe-zone.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";
import {
  galleryList,
  planQuickCreate,
} from "../../src/lib/motion-studio/quick-create.js";
import {
  withFavourite,
  withRecent,
  defaultPrefs,
} from "../../src/lib/motion-studio/prefs.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "..", "fixtures", "motion-studio-golden.json");
const LEGACY = path.join(
  HERE,
  "..",
  "fixtures",
  "motion-studio-legacy-templates.json",
);
const GOLDEN_SHA256 =
  "6cb2e03c30d23d5f4791912e6d5fed8c46fd1389c0e42bbaa8f9cd4924f2f589";

// ---------------------------------------------------------------- fixtures
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
        Array.from(String(t)).length *
        px *
        (/Tamil|Hind|Anek|Tiro/.test(font) ? k : 0.5),
    }),
  };
};
const ctx = mkCtx();
const CORPUS = {
  long: "தமிழ் என்றும் வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க வாழ்க\nசிறு வரி\n\nகடல் அலை கரையைத் தொட்டுத் திரும்பும் ஒவ்வொரு முறையும் ஒரு கதை சொல்லும் மீண்டும் மீண்டும்",
  indentTabs:
    "மழையின் பாடல்\n  உள்ளம் சொல்லும் கதை\n    இன்னும் ஒரு வரி\n\tஅன்பே சிவம்\n\t\tதமிழ் என்றும் வாழ்க\nமூன்றாம்\tவரி",
  stanzas:
    "முதல் பத்தி வரி ஒன்று\nமுதல் பத்தி வரி இரண்டு\n\nஇரண்டாம் பத்தி\nநிழல் தேடும் மனம்\n\nஸ்ரீ க்ஷ கௌ கோ கொ\nகொடிய வெயில் காய்ந்தாலும்\n\nநான்காம் பத்தி கடைசி வரி",
};
const TITLE = "மழையின் பாடல்";
const FORMATS = ["reel", "story", "poster", "square"];
/** Routes per composition format (full-poem and the excerpt routes are format-independent: run once per template). */
const ROUTES_FOR = {
  reel: ["reel-mp4", "reel-cover"],
  story: ["story-mp4", "story-stills"],
  poster: ["poster", "poster-set", "carousel"],
  square: ["square-mp4"],
};
const ANY = ["full-poem", "whole-mp4", "whole-cover", "quote", "animated-quote"];

function build(key, templateId, format, { fit = true } = {}) {
  const poem = parsePoemText(CORPUS[key], { title: TITLE });
  assert.ok(poem.ok, `fixture ${key} parses`);
  const d = defaultComposition({
    format,
    templateId,
    scenes: generateScenes(poem, { title: TITLE }),
  });
  const base = normalizeComposition({
    ...d,
    originalScenes: structuredClone(d.scenes),
    poster: { ...d.poster, endText: "நன்றி" },
    poem: { title: TITLE, stanzas: poem.stanzas, source: poem.source },
  });
  const plan = fit ? planFit(ctx, base) : null;
  return {
    comp: plan?.ok ? applyFit(base, plan) : base,
    poem: { ...poem, title: TITLE },
  };
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
/** Every poem line, in order, exactly as the scenes carry it (title card excluded). */
const sceneText = (comp) =>
  comp.scenes.filter((s) => s.kind !== "title").flatMap((s) => s.lines);

// mocked FontFace API (same contract as motion-studio-fonts.test.mjs)
const fakeFonts = () => ({
  calls: [],
  load(font, text) {
    this.calls.push({ font, text });
    return Promise.resolve([{ family: "x" }]);
  },
  check: () => true,
});
const fakeMeasure = () => (font, text) =>
  Array.from(String(text)).length * (/"/.test(font) ? 21.7 : 20);

// ---------------------------------------------------------------- contrast audit (WCAG): every template's poem text
// and signature against both gradient ends / the solid colour, after the template's own overlay. Signature is small
// text (4.5:1); poem text is >= 56px (large, 3:1) but is held to 4.5:1 too. Classic Golden Hour failed (2.82 / 2.43)
// until its light gradient end was darkened from #e9a14a to #a6622a (saved projects keep their stored colours).
test("contrast: every template's text and signature reach 4.5:1 on its background", async () => {
  const { lum, hexRgb, ratio } = await import("../../src/lib/motion-studio/contrast.js");
  const mix = (a, b, o) => a.map((v, i) => v * (1 - o) + b[i] * o);
  const bad = [];
  for (const t of TEMPLATE_LIBRARY) {
    const ov = t.fx?.overlay;
    const cs = [t.bg?.a, t.bg?.b, t.bg?.color]
      .filter((x) => typeof x === "string" && x[0] === "#")
      .map((h) => (ov ? mix(hexRgb(h), hexRgb(ov.color), ov.opacity) : hexRgb(h)));
    if (!cs.length) continue;
    for (const [k, col] of [["text", t.style.color], ["signature", t.signatureColor]]) {
      if (!col) continue;
      const r = Math.min(...cs.map((c) => ratio(lum(...hexRgb(col)), lum(...c))));
      if (r < 4.5) bad.push(`${t.id} ${k} ${r.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- golden + legacy untouched
test("golden fixture is byte-identical (sha256) and the six classic templates equal their pre-P8 snapshot", () => {
  const sha = createHash("sha256").update(readFileSync(GOLDEN)).digest("hex");
  assert.equal(sha, GOLDEN_SHA256);
  const before = JSON.parse(readFileSync(LEGACY, "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(TEMPLATES)), before);
  assert.deepEqual(
    TEMPLATES.map((t) => t.id),
    [
      "ink-silence",
      "paper-ink",
      "monsoon",
      "midnight",
      "golden-hour",
      "modern-minimal",
    ],
  );
  for (const t of TEMPLATES) {
    assert.equal(
      t.needsAestheticReview,
      undefined,
      `${t.id} is a classic template`,
    );
    assert.equal(
      t.material,
      undefined,
      `${t.id} carries no material (golden path)`,
    );
    assert.equal(templateById(t.id), t);
    assert.equal(
      defaultComposition({ templateId: t.id, scenes: [] }).material,
      undefined,
    );
  }
  assert.equal(
    templateById("nope"),
    TEMPLATES[0],
    "unknown ids still fall back to the first classic template",
  );
});

// ---------------------------------------------------------------- counts, ids, references
test("counts: 6 classic + 18 new templates, 18 palettes, 20 type presets, 12 materials; ids unique", () => {
  assert.equal(TEMPLATES.length, 6);
  assert.equal(DESIGN_TEMPLATES.length, 18);
  assert.equal(TEMPLATE_LIBRARY.length, 24);
  assert.equal(PALETTES.length, 18);
  assert.equal(TYPE_PRESETS.length, 20);
  assert.equal(MATERIALS.length, 12);
  for (const list of [TEMPLATE_LIBRARY, PALETTES, TYPE_PRESETS])
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  assert.equal(
    new Set(TEMPLATE_LIBRARY.map((t) => t.name.toLowerCase())).size,
    24,
    "names unique",
  );
  // a new name never contains a classic name (UI labels such as "Use template Golden Hour" stay unambiguous)
  for (const n of DESIGN_TEMPLATES)
    for (const c of TEMPLATES)
      assert.ok(!n.name.toLowerCase().includes(c.name.toLowerCase()), n.name);
  assert.equal(FAMILIES.length, 6);
  for (const f of FAMILIES) {
    assert.equal(
      DESIGN_TEMPLATES.filter((t) => t.family === f.id).length,
      3,
      f.id,
    );
    assert.equal(PALETTES.filter((p) => p.family === f.id).length, 3, f.id);
  }
  assert.equal(
    new Set(DESIGN_TEMPLATES.map((t) => t.palette)).size,
    18,
    "each palette used once",
  );
  for (const t of DESIGN_TEMPLATES) {
    assert.ok(
      Object.isFrozen(t) &&
        Object.isFrozen(t.style) &&
        Object.isFrozen(t.fx.overlay),
      t.id,
    );
    assert.ok(paletteById(t.palette) && typePresetById(t.typePreset), t.id);
    if (t.material)
      assert.ok(
        MATERIAL_IDS.includes(t.material) && t.material !== "none",
        t.id,
      );
    assert.ok(ANIMATION_IDS.includes(t.motion.textIn), t.id);
  }
});

test("review flags: every new template, palette and type preset is needsAestheticReview:true", () => {
  for (const x of [...DESIGN_TEMPLATES, ...PALETTES, ...TYPE_PRESETS])
    assert.equal(x.needsAestheticReview, true, x.id);
  assert.equal(PENDING_REVIEW_LABEL, "Pending design review");
});

// ---------------------------------------------------------------- fonts, sizes, Tamil spacing
test("type presets: verified fonts only, real weights, sizes >= every scene floor, letterSpacing 0, display = title-capable", () => {
  assert.equal(TYPE_SIZE_MIN, Math.max(...Object.values(MIN_TEXT_PX)));
  for (const p of TYPE_PRESETS) {
    const f = fontById(p.font);
    assert.ok(f && f.verified === true && f.loadable === true, p.id);
    assert.ok(!CANDIDATE_FONT_IDS.includes(p.font), p.id);
    assert.equal(p.letterSpacing, 0, p.id);
    assert.ok(p.sizePx >= TYPE_SIZE_MIN, p.id);
    if (p.role === "display")
      assert.ok(["display", "both"].includes(f.role), p.id);
    if (p.title.font) assert.equal(fontById(p.title.font).verified, true, p.id);
  }
  assert.ok(TYPE_PRESETS.filter((p) => p.role === "display").length >= 2);
});
test("templates: verified body font, size >= floors, weight the font ships, preset values copied exactly", () => {
  for (const t of DESIGN_TEMPLATES) {
    const tp = typePresetById(t.typePreset);
    assert.equal(fontById(t.style.font).verified, true, t.id);
    assert.equal(tp.role, "body", t.id);
    for (const k of ["font", "weight", "sizePx", "lineHeight", "align"])
      assert.equal(t.style[k], tp[k], `${t.id}.${k}`);
    for (const fmt of FORMATS)
      assert.ok(t.style.sizePx >= MIN_TEXT_PX[fmt], `${t.id} ${fmt}`);
    if (t.style.titleFont)
      assert.equal(fontById(t.style.titleFont).verified, true, t.id);
  }
});

// ---------------------------------------------------------------- contrast
test("contrast: every palette's text, signature and accent >= 4.5:1; every new template's drawn text + signature too", () => {
  for (const p of PALETTES) {
    const c = paletteContrast(p);
    for (const k of ["text", "signature", "accent"])
      assert.ok(c[k] >= PALETTE_CONTRAST_MIN, `${p.id} ${k} ${c[k]}`);
  }
  for (const t of DESIGN_TEMPLATES) {
    const comp = defaultComposition({ templateId: t.id, scenes: [] });
    const model = { bg: comp.style.bg, overlay: comp.style.overlay };
    assert.ok(worstContrast(model, comp.style.color) >= 4.5, `${t.id} text`);
    assert.ok(
      worstContrast(model, comp.branding.color) >= 4.5,
      `${t.id} signature`,
    );
  }
});

// ---------------------------------------------------------------- normalize round trip, branding, material
test("normalize: each template's default composition round-trips unchanged, keeps its ids, colours, motion feel and material", () => {
  for (const t of TEMPLATE_LIBRARY) {
    const d = defaultComposition({
      format: "reel",
      templateId: t.id,
      scenes: [],
    });
    const again = normalizeComposition(JSON.parse(JSON.stringify(d)));
    assert.deepEqual(again, d, `${t.id} round trip`);
    assert.equal(d.templateId, t.id);
    assert.equal(d.notices, undefined, `${t.id}: no font was replaced`);
    for (const k of [
      "font",
      "sizePx",
      "weight",
      "color",
      "align",
      "lineHeight",
    ])
      assert.equal(d.style[k], t.style[k], `${t.id}.${k}`);
    assert.deepEqual(d.style.bg, { ...t.bg });
    assert.equal(d.motion.textIn, t.motion.textIn);
    assert.equal(d.branding.color, t.signatureColor);
    if (t.motion.pref) assert.equal(d.motion.pref, t.motion.pref);
    if (t.material)
      assert.deepEqual(d.material, {
        id: t.material,
        intensity: 0.6,
        reduce: false,
        seed: 1,
      });
    else assert.equal(d.material, undefined);
  }
});
test("template switch keeps the author's branding (signature text, size, position) exactly as before", () => {
  const branding = {
    show: true,
    signature: "Synthetic Poet",
    watermark: true,
    size: 44,
    yPct: 0.9,
    align: "right",
    color: "#ffffff",
  };
  for (const t of DESIGN_TEMPLATES) {
    const d = defaultComposition({
      templateId: t.id,
      scenes: [],
      signature: branding.signature,
      branding,
    });
    assert.equal(d.branding.signature, "Synthetic Poet");
    assert.equal(d.branding.size, 44);
    assert.equal(d.branding.yPct, 0.9);
    assert.equal(d.branding.align, "right");
    assert.equal(d.branding.watermark, true);
    assert.equal(
      d.branding.color,
      t.signatureColor,
      "the colour follows the template (classic behaviour)",
    );
  }
  const legacy = {
    show: true,
    signature: "Synthetic Poet",
    watermark: false,
    color: "#ffffff",
  };
  const d = defaultComposition({
    templateId: "monsoon-1",
    scenes: [],
    branding: legacy,
  });
  assert.equal(
    "size" in d.branding,
    false,
    "legacy branding stays legacy across a switch",
  );
});

// ---------------------------------------------------------------- the full gate, data-driven
test("ensureFonts (mocked): every template's fonts load for the Tamil fixtures before anything is measured", async () => {
  for (const t of TEMPLATE_LIBRARY)
    for (const key of Object.keys(CORPUS)) {
      const { comp } = build(key, t.id, "reel");
      const fonts = fakeFonts();
      const r = await ensureFonts(
        comp,
        { poemText: CORPUS[key] },
        { fonts, measure: fakeMeasure() },
      );
      assert.equal(r.ok, true, `${t.id}/${key}`);
      assert.ok(!("fontReview" in r), `${t.id}: no candidate font`);
      const fam = fontById(t.style.font).family.split(",")[0];
      assert.ok(
        fonts.calls.some((c) => c.font.includes(fam)),
        `${t.id}: loaded ${fam}`,
      );
    }
});

let gateChecked = 0,
  gateMaterial = 0,
  gateAnim = 0;
for (const t of TEMPLATE_LIBRARY)
  test(`gate: ${t.id} x ${FORMATS.join("/")} x ${Object.keys(CORPUS).length} Tamil fixtures passes every route validator`, () => {
    for (const key of Object.keys(CORPUS)) {
      for (const format of FORMATS) {
        const { comp, poem } = build(key, t.id, format);
        assert.deepEqual(
          sceneText(comp),
          poem.stanzas.flat(),
          `${t.id}/${key}/${format}: every line kept verbatim, in order`,
        );
        for (const id of ROUTES_FOR[format]) {
          const route = routeById(id);
          const r = route.validate(ctx, comp, inputFor(route, poem));
          assert.equal(
            r.ok,
            true,
            `${t.id}/${key}/${format}/${id}: ${(r.messages || []).join("; ")}`,
          );
          assert.ok(!r.fontIssues, `${t.id}/${id}: font issues`);
          if (comp.material) {
            assert.ok(
              r.material?.ok && r.material.checked > 0,
              `${t.id}/${id}: material verified`,
            );
            gateMaterial++;
          }
          if (route.kind === "video") {
            assert.ok(r.animation?.ok, `${t.id}/${id}: animation validated`);
            assert.equal(r.animation.id, t.motion.textIn);
            gateAnim++;
          }
          gateChecked++;
        }
      }
      const { comp, poem } = build(key, t.id, "reel");
      for (const id of ANY) {
        const route = routeById(id);
        const r = route.validate(ctx, comp, inputFor(route, poem));
        assert.equal(
          r.ok,
          true,
          `${t.id}/${key}/${id}: ${(r.messages || []).join("; ")}`,
        );
        if (comp.material)
          assert.ok(r.material?.ok, `${t.id}/${id}: material verified`);
        gateChecked++;
      }
    }
  });
test("gate totals: every (template x fixture x route) combination was validated", () => {
  const perTemplate =
    Object.keys(CORPUS).length *
    (Object.values(ROUTES_FOR).flat().length + ANY.length);
  assert.equal(gateChecked, TEMPLATE_LIBRARY.length * perTemplate);
  assert.ok(gateMaterial > 0 && gateAnim > 0);
  assert.equal(
    new Set([...Object.values(ROUTES_FOR).flat(), ...ANY]).size,
    ROUTES.length,
    "every registered route is covered",
  );
});

test("NEGATIVE CONTROL: the validators are live for P8 templates (a dropped line and an off-canvas row are refused)", () => {
  const drop = (lay) => {
    if (lay.rows)
      lay.rows.splice(
        lay.rows.findIndex((r) => !r.gap),
        1,
      );
    else
      lay.items.splice(
        lay.items.findIndex((i) => i.kind === "line"),
        1,
      );
    return lay;
  };
  for (const t of DESIGN_TEMPLATES) {
    const { comp, poem } = build("stanzas", t.id, "reel");
    for (const id of ["reel-mp4", "full-poem"]) {
      const route = routeById(id);
      const r = route.validate(ctx, comp, {
        ...inputFor(route, poem),
        mutate: drop,
      });
      assert.equal(r.ok, false, `${t.id}/${id}: a dropped line must fail`);
    }
  }
});

// ---------------------------------------------------------------- load-time checks refuse forged data
const goodSpec = {
  id: "forged-1",
  name: "Forged",
  mood: "test",
  family: "midnight",
  palette: "starless",
  type: "sans-center",
  textIn: "line-reveal",
};
test("NEGATIVE CONTROL: a forged low-contrast palette is refused by the load-time check", () => {
  const p = { ...paletteById("starless"), id: "forged", text: "#2a2d36" };
  assert.throws(() => assertPalette(p), /text contrast .* below 4\.5/);
  assert.throws(
    () =>
      assertPalette({
        ...paletteById("porcelain"),
        id: "forged",
        signature: "#c8c8c8",
      }),
    /signature contrast/,
  );
  assert.throws(
    () =>
      assertPalette({
        ...paletteById("graphite"),
        id: "forged",
        accent: "#30343a",
      }),
    /accent contrast/,
  );
  // a template that overrides its colours below the floor is refused even with a good palette
  const t = buildTemplate(goodSpec);
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, color: "#1a1d26" } }),
    /contrast/,
  );
  assert.throws(
    () => assertTemplate({ ...t, signatureColor: "#20232c" }),
    /signature contrast/,
  );
  assert.ok(assertTemplate(t), "the unforged spec passes");
});
test("NEGATIVE CONTROL: a template or type preset naming a candidate / unverified / display-only / unknown font is refused", () => {
  const t = buildTemplate(goodSpec);
  for (const font of CANDIDATE_FONT_IDS)
    assert.throws(
      () => assertTemplate({ ...t, style: { ...t.style, font } }),
      /not verified|cannot be loaded|display-only|weight/,
      font,
    );
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, font: "meera-inimai" } }),
    /not verified/,
  );
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, font: "coiny" } }),
    /display-only/,
  );
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, font: "comic-sans" } }),
    /unknown font/,
  );
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, titleFont: "vaagai" } }),
    /title font/,
  );
  const tp = typePresetById("sans-center");
  assert.throws(
    () => assertTypePreset({ ...tp, id: "forged", font: "meera-inimai" }),
    /not verified/,
  );
  assert.throws(
    () =>
      assertTypePreset({ ...tp, id: "forged", role: "display", font: "coiny" }),
    /not verified/,
  );
  assert.throws(
    () => assertTypePreset({ ...tp, id: "forged", font: "tiro", weight: 700 }),
    /weight 700/,
  );
});
test("NEGATIVE CONTROL: letter-spacing != 0 (Tamil tracking) is refused", () => {
  const tp = typePresetById("tiro-literary");
  for (const ls of [0.02, -0.01, 1, "0.1em", null, undefined])
    assert.throws(
      () => assertTypePreset({ ...tp, id: "forged", letterSpacing: ls }),
      /letterSpacing must be 0/,
      String(ls),
    );
  const t = buildTemplate(goodSpec);
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, letterSpacing: 0.05 } }),
    /letterSpacing/,
  );
});
test("NEGATIVE CONTROL: unknown material / animation / motion / palette / preset / family ids and sub-floor sizes are refused", () => {
  const t = buildTemplate(goodSpec);
  assert.throws(
    () => assertTemplate({ ...t, material: "velvet" }),
    /unknown material/,
  );
  assert.throws(
    () => assertTemplate({ ...t, material: "none" }),
    /unknown material/,
  );
  assert.throws(
    () =>
      assertTemplate({ ...t, motion: { ...t.motion, textIn: "typewriter" } }),
    /unknown animation/,
  );
  assert.throws(
    () => assertTemplate({ ...t, motion: { ...t.motion, textIn: "spin" } }),
    /unknown animation/,
  );
  assert.throws(
    () => assertTemplate({ ...t, motion: { ...t.motion, bgMotion: "shake" } }),
    /background motion/,
  );
  assert.throws(
    () => assertTemplate({ ...t, motion: { ...t.motion, pref: "wild" } }),
    /motion feel/,
  );
  assert.throws(
    () => assertTemplate({ ...t, palette: "nope" }),
    /unknown palette/,
  );
  assert.throws(
    () => assertTemplate({ ...t, typePreset: "display-anek" }),
    /body type preset/,
  );
  assert.throws(
    () => assertTemplate({ ...t, family: "neon" }),
    /unknown family/,
  );
  assert.throws(
    () => assertTemplate({ ...t, style: { ...t.style, sizePx: 40 } }),
    /floor/,
  );
  assert.throws(
    () => assertTemplate({ ...t, needsAestheticReview: false }),
    /needsAestheticReview/,
  );
  assert.throws(
    () => buildTemplate({ ...goodSpec, palette: "nope" }),
    /unknown palette/,
  );
  assert.throws(
    () =>
      assertTypePreset({
        ...typePresetById("sans-center"),
        id: "forged",
        sizePx: 44,
      }),
    /sizePx 44/,
  );
});

// ---------------------------------------------------------------- gallery + Quick Create wiring
test("gallery: families group 1 classic + 3 new each; search by family label or name; favourites/recents accept new ids", () => {
  const groups = groupByFamily(TEMPLATE_LIBRARY);
  assert.deepEqual(
    groups.map((g) => g.id),
    FAMILIES.map((f) => f.id),
  );
  for (const g of groups) {
    assert.equal(g.templates.length, 4, g.id);
    assert.equal(
      g.templates[0].id,
      g.id,
      "the classic template leads its family",
    );
  }
  for (const t of TEMPLATE_LIBRARY) assert.ok(familyOf(t), t.id);
  assert.deepEqual(
    galleryList(undefined, { query: "monsoon memories" }).map((t) => t.id),
    ["monsoon", "monsoon-1", "monsoon-2", "monsoon-3"],
  );
  assert.deepEqual(
    galleryList(undefined, { query: "sumi" }).map((t) => t.id),
    ["ink-silence-1"],
  );
  assert.equal(galleryList().length, 24);
  let prefs = withFavourite(defaultPrefs(), "golden-hour-2", true);
  prefs = withRecent(prefs, "paper-ink-3");
  assert.deepEqual(
    galleryList(undefined, {
      filter: "favourites",
      favourites: prefs.favouriteTemplates,
    }).map((t) => t.id),
    ["golden-hour-2"],
  );
  assert.deepEqual(
    galleryList(undefined, {
      filter: "recent",
      recent: prefs.recentTemplates,
    }).map((t) => t.id),
    ["paper-ink-3"],
  );
});
test("Quick Create: every new template builds the same composition the manual path builds, text unchanged", () => {
  for (const t of DESIGN_TEMPLATES) {
    const r = planQuickCreate({
      text: CORPUS.stanzas,
      title: TITLE,
      routeId: "poster",
      templateId: t.id,
    });
    assert.equal(r.ok, true, `${t.id}: ${r.issues?.join("; ")}`);
    assert.equal(r.composition.templateId, t.id);
    assert.equal(r.composition.style.font, t.style.font);
    assert.deepEqual(
      sceneText(r.composition),
      parsePoemText(CORPUS.stanzas).stanzas.flat(),
    );
    if (t.material) assert.equal(r.composition.material.id, t.material);
  }
});
