// P5: font registry, candidate fonts (verified:false until a Tamil-literate human review), display-only roles,
// font verification harness. Synthetic poems only. No real fonts or browsers: FontFaceSet and measuring are stubbed.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  FONT_REGISTRY,
  VERIFIED_FONT_IDS,
  CANDIDATE_FONT_IDS,
  fontById,
  selectableFonts,
  resolveFonts,
  fontReviewOf,
  CANDIDATE_LABEL,
  CANDIDATE_TOGGLE_LABEL,
} from "../../src/lib/motion-studio/font-registry.js";
import { FONT_FAMILY } from "../../src/lib/motion-studio/render.js";
import {
  FONT_KEYS,
  FONT_LABELS,
  TEMPLATES,
} from "../../src/lib/motion-studio/templates.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import {
  requiredFaces,
  ensureFonts,
  fontVerification,
  FontReadinessError,
  TAMIL_FIXTURE,
  registryFamily,
} from "../../src/lib/motion-studio/font-ready.js";
import { ROUTES } from "../../src/lib/motion-studio/formats.js";
import { fontReviewFor } from "../../src/lib/motion-studio/export.js";
import {
  withFonts,
  fontIssues,
} from "../../src/lib/motion-studio/route-checks.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "..", "fixtures", "motion-studio-golden.json");
const CANDIDATES = [
  "Kavivanar",
  "Mukta Malar",
  "Catamaran",
  "Pavanam",
  "Baloo Thambi 2",
  "Meera Inimai",
  "Arima",
  "Arima Madurai",
  "Coiny",
  "Oi",
];
// The exact stacks render.js used before the registry existed (copied literally from HEAD ca6606b).
const LEGACY_FAMILY = {
  "noto-serif": '"Noto Serif Tamil", serif',
  "noto-sans": '"Noto Sans Tamil", sans-serif',
  "hind-madurai": '"Hind Madurai", sans-serif',
  anek: '"Anek Tamil", sans-serif',
  tiro: '"Tiro Tamil", serif',
};

// ---------------------------------------------------------------- stubs (scripts-free test helpers)
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
        (/^\d+ [\d.]+px "/.test(font) ? 0.55 : 0.5),
    }),
  };
};
/** Fake FontFaceSet: `empty` = no face matched, `fail` = load rejects, `check` = fonts.check result. */
export const fakeFonts = ({
  empty = false,
  fail = false,
  check = true,
  only = null,
} = {}) => ({
  calls: [],
  load(font, text) {
    this.calls.push({ font, text });
    if (fail) return Promise.reject(new Error("network error"));
    const hit = !only || font.includes(only);
    return Promise.resolve(empty || !hit ? [] : [{ family: "x" }]);
  },
  check: () => check,
});
/** Measure: a quoted family draws wider than the bare generic fallback, unless `sameAsFallback` names that family. */
export const fakeMeasure =
  ({ sameAsFallback = null } = {}) =>
  (font, text) => {
    const n = Array.from(String(text)).length;
    if (sameAsFallback && font.includes(sameAsFallback)) return n * 20;
    return /"/.test(font) ? n * 21.7 : n * 20;
  };

const TITLE = "மழையின் பாடல்";
const POEM =
  "மழையின் பாடல்\n  உள்ளம் சொல்லும் கதை\nகொடிய வெயில் காய்ந்தாலும்\n\nஸ்ரீ க்ஷ கௌ கோ கொ\nநிழல் தேடும் மனம்";
function corpus(format = "reel", style = {}, extra = {}) {
  const poem = parsePoemText(POEM, { title: TITLE });
  const d = defaultComposition({
    format,
    scenes: generateScenes(poem, { title: TITLE }),
  });
  const base = normalizeComposition({
    ...d,
    ...extra,
    style: { ...d.style, ...style },
    poster: { ...d.poster, endText: "நன்றி" },
    poem: { title: TITLE, stanzas: poem.stanzas, source: poem.source },
  });
  const plan = planFit(mkCtx(), base);
  return {
    comp: plan.ok ? applyFit(base, plan) : base,
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
const forRoute = (route, style, extra) =>
  corpus(
    ["story", "square"].includes(route.format) ? route.format : "reel",
    style,
    extra,
  );

// ---------------------------------------------------------------- golden + registry shape
test("golden fixture is byte-identical to the pre-registry fixture", () => {
  const sha = createHash("sha1").update(readFileSync(GOLDEN)).digest("hex");
  assert.equal(sha, "00af5dbc88833a3dc495a10c978056b46168c23d");
});

test("registry: exactly 15 entries; the 10 candidates are verified:false, the original 5 verified:true", () => {
  assert.equal(FONT_REGISTRY.length, 15);
  assert.equal(new Set(FONT_REGISTRY.map((f) => f.id)).size, 15);
  assert.deepEqual(VERIFIED_FONT_IDS, Object.keys(LEGACY_FAMILY));
  assert.deepEqual(
    CANDIDATE_FONT_IDS.map((id) => fontById(id).label),
    CANDIDATES,
  );
  for (const id of CANDIDATE_FONT_IDS) {
    const f = fontById(id);
    assert.equal(f.verified, false, id);
    assert.equal(f.license, "OFL (Google Fonts)");
    assert.equal(f.licenseReview, "needs human licence confirmation");
    assert.ok(["body", "display", "both"].includes(f.role));
    assert.equal(f.tamilSubset, true);
    if (!f.loadable)
      assert.ok(
        f.why && f.why.length > 20,
        `${id} loadable:false must say why`,
      );
  }
  assert.deepEqual(
    FONT_REGISTRY.filter((f) => !f.loadable).map((f) => f.id),
    ["arima-madurai"],
  );
  assert.deepEqual(
    FONT_REGISTRY.filter((f) => f.role === "display").map((f) => f.id),
    ["coiny", "oi"],
  );
});

test("FONT_FAMILY is derived from the registry; the 5 legacy stacks are identical strings", () => {
  for (const [id, fam] of Object.entries(LEGACY_FAMILY))
    assert.equal(FONT_FAMILY[id], fam);
  for (const f of FONT_REGISTRY) assert.equal(FONT_FAMILY[f.id], f.family);
  assert.deepEqual(FONT_KEYS, VERIFIED_FONT_IDS); // templates whitelist = verified set
  for (const t of TEMPLATES)
    assert.ok(VERIFIED_FONT_IDS.includes(t.style.font), t.id);
  assert.equal(FONT_LABELS["noto-serif"], "Noto Serif Tamil");
});

test("picker: normal mode offers only the 5 verified fonts; preview mode labels candidates and never offers display fonts for body", () => {
  assert.deepEqual(
    selectableFonts().map((f) => f.id),
    VERIFIED_FONT_IDS,
  );
  const prev = selectableFonts({ preview: true });
  assert.ok(!prev.some((f) => ["coiny", "oi", "arima-madurai"].includes(f.id)));
  assert.equal(prev.length, 5 + 7);
  for (const f of prev.filter((x) => !x.verified))
    assert.ok(f.label.endsWith(`(${CANDIDATE_LABEL})`), f.label);
  const titles = selectableFonts({ preview: true, role: "title" }).map(
    (f) => f.id,
  );
  assert.ok(
    titles.includes("coiny") &&
      titles.includes("oi") &&
      !titles.includes("arima-madurai"),
  );
  assert.match(
    CANDIDATE_TOGGLE_LABEL,
    /Preview candidate fonts \(not reviewed\)/,
  );
});

// ---------------------------------------------------------------- normalizeComposition
test("normalize: an unverified font id is replaced by the template font WITH an unverifiedFont notice (never silently kept)", () => {
  for (const id of CANDIDATE_FONT_IDS.filter(
    (x) => fontById(x).role !== "display",
  )) {
    const d = defaultComposition({ templateId: "ink-silence" });
    const n = normalizeComposition({ ...d, style: { ...d.style, font: id } });
    assert.equal(n.style.font, "noto-serif", id);
    assert.match(
      n.notices?.unverifiedFont || "",
      /candidate font|cannot be loaded/,
      id,
    );
    assert.ok(!("fontPreview" in n));
    // the replacement is stable: a second pass has nothing left to report
    const again = normalizeComposition(n);
    assert.equal(again.style.font, "noto-serif");
    assert.ok(!("notices" in again));
  }
});

test("normalize: with the explicit preview opt-in a loadable candidate is kept; Arima Madurai (loadable:false) never is", () => {
  const d = defaultComposition({});
  const k = normalizeComposition({
    ...d,
    fontPreview: true,
    style: { ...d.style, font: "kavivanar" },
  });
  assert.equal(k.style.font, "kavivanar");
  assert.equal(k.fontPreview, true);
  assert.ok(!("notices" in k));
  assert.equal(fontReviewOf(k), "unreviewed");
  const am = normalizeComposition({
    ...d,
    fontPreview: true,
    style: { ...d.style, font: "arima-madurai" },
  });
  assert.equal(am.style.font, d.style.font);
  assert.match(am.notices.unverifiedFont, /cannot be loaded/);
  // fontPreview must be literally true
  const s = normalizeComposition({
    ...d,
    fontPreview: "yes",
    style: { ...d.style, font: "kavivanar" },
  });
  assert.equal(s.style.font, d.style.font);
  assert.ok(s.notices.unverifiedFont);
});

test("NEGATIVE CONTROL: a display-only font (Coiny/Oi) for body text is refused by normalize and by every route validator", () => {
  const d = defaultComposition({});
  for (const id of ["coiny", "oi"]) {
    const n = normalizeComposition({
      ...d,
      fontPreview: true,
      style: { ...d.style, font: id },
    });
    assert.notEqual(n.style.font, id);
    assert.match(n.notices.displayOnlyFont, /display \(title-only\)/);
    // a composition that bypasses normalize is refused by the validators
    for (const route of ROUTES) {
      const { comp, poem } = forRoute(route, {}, { fontPreview: true });
      const bad = { ...comp, style: { ...comp.style, font: id } };
      const v = route.validate(mkCtx(), bad, inputFor(route, poem));
      assert.equal(v.ok, false, `${route.id}/${id}`);
      assert.ok(
        v.messages.some((m) => /display \(title-only\) font/.test(m)),
        route.id,
      );
    }
    assert.throws(
      () => requiredFaces({ ...d, style: { ...d.style, font: id } }),
      FontReadinessError,
    );
  }
  // positive control: the same font as the TITLE font is allowed (and marked unreviewed)
  const t = normalizeComposition({
    ...d,
    fontPreview: true,
    style: { ...d.style, titleFont: "coiny" },
  });
  assert.equal(t.style.titleFont, "coiny");
  assert.equal(fontIssues(t).length, 0);
  assert.equal(
    withFonts({ ok: true, messages: [] }, t).fontReview,
    "unreviewed",
  );
  // a title font without the opt-in is dropped with a notice
  const nt = normalizeComposition({
    ...d,
    style: { ...d.style, titleFont: "coiny" },
  });
  assert.ok(!("titleFont" in nt.style));
  assert.match(nt.notices.unverifiedFont, /Title font/);
});

test("legacy compositions with the 5 original fonts round-trip unchanged (no new keys)", () => {
  for (const t of TEMPLATES)
    for (const font of VERIFIED_FONT_IDS) {
      const d = defaultComposition({ templateId: t.id });
      const n = normalizeComposition({ ...d, style: { ...d.style, font } });
      assert.equal(n.style.font, font);
      assert.ok(
        !("titleFont" in n.style) && !("notices" in n) && !("fontPreview" in n),
      );
      assert.deepEqual(normalizeComposition(n), n);
      assert.equal(fontReviewOf(n), null);
    }
});

// ---------------------------------------------------------------- routes
test("candidate export: every route validator result carries fontReview:'unreviewed' and a warning; verified fonts do not", () => {
  for (const route of ROUTES) {
    const { comp, poem } = forRoute(
      route,
      { font: "mukta-malar" },
      { fontPreview: true },
    );
    assert.equal(comp.style.font, "mukta-malar");
    const v = route.validate(mkCtx(), comp, inputFor(route, poem));
    assert.equal(v.fontReview, "unreviewed", route.id);
    assert.match(v.fontWarning, /NOT been reviewed by a Tamil reader/);
    const { comp: plain, poem: p2 } = forRoute(route);
    const v2 = route.validate(mkCtx(), plain, inputFor(route, p2));
    assert.ok(!("fontReview" in v2), route.id);
  }
  assert.deepEqual(fontReviewFor({ style: { font: "noto-serif" } }), {});
  assert.equal(
    fontReviewFor({ style: { font: "catamaran" } }).fontReview,
    "unreviewed",
  );
});

test("every route's requiredFaces resolves families from the registry (verified and candidate)", () => {
  const fams = new Set(FONT_REGISTRY.map((f) => f.family));
  for (const style of [{}, { font: "catamaran", titleFont: "oi" }])
    for (const route of ROUTES) {
      const { comp, poem } = forRoute(route, style, { fontPreview: true });
      const scenes = route.scenesFor(comp, inputFor(route, poem), mkCtx());
      const faces = requiredFaces(
        { ...comp, scenes: scenes.length ? scenes : comp.scenes },
        { poemText: POEM, title: TITLE },
      );
      assert.ok(faces.length >= 1, route.id);
      for (const f of faces)
        assert.ok(
          fams.has(f.font.replace(/^\d+ [\d.]+px /, "")),
          `${route.id}: ${f.font}`,
        );
      if (style.titleFont)
        assert.ok(
          faces.find((f) => f.role === "title").font.endsWith(FONT_FAMILY.oi),
          route.id,
        );
    }
  assert.throws(() => registryFamily("comic-sans"), FontReadinessError);
  assert.throws(() => registryFamily("arima-madurai"), /cannot be loaded/);
});

// ---------------------------------------------------------------- ensureFonts + verification harness
const candComp = (font = "pavanam") =>
  normalizeComposition({
    ...defaultComposition({}),
    fontPreview: true,
    style: { ...defaultComposition({}).style, font },
  });

test("ensureFonts: a ready candidate passes and the report says fontReview:'unreviewed'", async () => {
  const r = await ensureFonts(
    candComp(),
    { poemText: POEM },
    { fonts: fakeFonts(), measure: fakeMeasure() },
  );
  assert.equal(r.ok, true);
  assert.equal(r.fontReview, "unreviewed");
  const v = await ensureFonts(
    defaultComposition({}),
    { poemText: POEM },
    { fonts: fakeFonts(), measure: fakeMeasure() },
  );
  assert.ok(!("fontReview" in v));
});

test("NEGATIVE CONTROLS: a candidate that fails to load, matches no face, is not covered, measures like the fallback, or has no measure is refused", async () => {
  const c = candComp();
  const cases = [
    [
      { fonts: fakeFonts({ fail: true }), measure: fakeMeasure() },
      /could not be loaded/,
    ],
    [
      { fonts: fakeFonts({ empty: true }), measure: fakeMeasure() },
      /No font file matches/,
    ],
    [
      { fonts: fakeFonts({ check: false }), measure: fakeMeasure() },
      /not ready/,
    ],
    [
      {
        fonts: fakeFonts(),
        measure: fakeMeasure({ sameAsFallback: "Pavanam" }),
      },
      /same as the fallback/,
    ],
    [{ fonts: fakeFonts() }, /glyph measurement check/],
  ];
  for (const [deps, re] of cases)
    await assert.rejects(
      () => ensureFonts(c, { poemText: POEM }, deps),
      (e) => e instanceof FontReadinessError && re.test(e.message),
    );
});

test("fontVerification: per-font {ok, reasons}; covers conjuncts and two-part vowel signs; never marks a font verified", async () => {
  const ok = await fontVerification("catamaran", {
    fonts: fakeFonts(),
    measure: fakeMeasure(),
  });
  assert.equal(ok.ok, true, ok.reasons.join("; "));
  assert.equal(ok.humanReview, "pending");
  for (const cl of ["க்ஷ", "ஶ்ரீ", "கொ", "கோ", "கௌ"])
    assert.ok(
      ok.checked.some((x) => x.cluster === cl),
      cl,
    );
  assert.equal(fontById("catamaran").verified, false);
  const fb = await fontVerification("catamaran", {
    fonts: fakeFonts(),
    measure: fakeMeasure({ sameAsFallback: "Catamaran" }),
  });
  assert.equal(fb.ok, false);
  assert.ok(fb.reasons.some((r) => /fallback/.test(r)));
  const nf = await fontVerification("kavivanar", {
    fonts: fakeFonts({ check: false }),
    measure: fakeMeasure(),
  });
  assert.equal(nf.ok, false);
  assert.ok(nf.reasons.some((r) => /not covered/.test(r)));
  const am = await fontVerification("arima-madurai", {
    fonts: fakeFonts(),
    measure: fakeMeasure(),
  });
  assert.equal(am.ok, false);
  assert.match(am.reasons[0], /not loadable/);
  const disp = await fontVerification("oi", {
    fonts: fakeFonts(),
    measure: fakeMeasure(),
  });
  assert.equal(disp.ok, true, disp.reasons.join("; ")); // checked as a TITLE font
  const unk = await fontVerification("nope", {});
  assert.equal(unk.ok, false);
  const nm = await fontVerification("pavanam", { fonts: fakeFonts() });
  assert.equal(nm.ok, false);
  assert.ok(TAMIL_FIXTURE.includes("க்ஷ") && TAMIL_FIXTURE.includes("ஶ்ரீ"));
});

test("resolveFonts is pure and reports every replacement", () => {
  assert.deepEqual(resolveFonts({ font: "tiro", fallback: "noto-serif" }), {
    font: "tiro",
    titleFont: null,
    notices: {},
  });
  assert.deepEqual(
    resolveFonts({ font: "unknown", fallback: "noto-serif" }).notices,
    {},
  ); // legacy: unknown ids fall back as before
  assert.ok(
    resolveFonts({ font: "oi", fallback: "noto-serif", preview: true }).notices
      .displayOnlyFont,
  );
});

test("a transient network error loading a font is retried; a persistent one still stops the export with advice", async () => {
  const { ensureFonts } = await import("../../src/lib/motion-studio/font-ready.js");
  const comp = { format: "reel", style: { font: "noto-sans", weight: 600, sizePx: 48 }, scenes: [{ kind: "stanza", lines: ["தமிழ்"] }], branding: { show: false } };
  let calls = 0;
  const mk = (failFirst) => ({ load: async () => { calls++; if (calls <= failFirst) throw new Error("A network error occurred."); return [{}]; }, check: () => true });
  calls = 0;
  const ok = await ensureFonts(comp, {}, { fonts: mk(2), fontRetryMs: 1 });
  assert.equal(ok.ok, true);
  calls = 0;
  await assert.rejects(ensureFonts(comp, {}, { fonts: mk(99), fontRetryMs: 1 }), (e) => /could not be loaded: A network error occurred\./.test(e.message) && /reload the page/.test(e.message) && /Nothing was exported/.test(e.message));
  assert.equal(calls, 3);
});

test("fontDiagnostics reports face state, font-file status and connection, and never throws", async () => {
  const { fontDiagnostics } = await import("../../src/lib/motion-studio/font-ready.js");
  const d = fontDiagnostics(new Set([{ family: '"X"', weight: "100 900", status: "error" }]), "600 40px X, sans-serif", {
    navigator: { onLine: true, connection: { effectiveType: "4g" } },
    performance: { getEntriesByType: () => [{ name: "https://a/_next/static/media/abc.woff2", responseStatus: 404, transferSize: 0 }] },
  });
  assert.match(d, /100 900:error/);
  assert.match(d, /abc\.woff2 404/);
  assert.match(d, /net 4g/);
  assert.equal(typeof fontDiagnostics(null, "400 40px X", {}), "string");
});

test("fontProbe tries each unloaded face alone and reports its range, state change and error; never throws", async () => {
  const { fontProbe, fontDiagnostics } = await import("../../src/lib/motion-studio/font-ready.js");
  const bad = { family: '"X"', weight: "100 900", status: "unloaded", unicodeRange: "U+0B80-0BFF", load: async function () { this.status = "error"; throw Object.assign(new Error("A network error occurred."), { name: "NetworkError" }); } };
  const good = { family: '"X"', status: "loaded", unicodeRange: "U+0000-00FF", load: async () => {} };
  const env = { performance: { getEntriesByType: () => [{ name: "https://h/_next/static/immutable/media/a.woff2", responseStatus: 200, transferSize: 100, duration: 12 }] } };
  const r = await fontProbe(new Set([good, bad]), "400 40px X, sans-serif", env);
  assert.match(r, /U\+0B80-0BFF unloaded->error NetworkError: A network error occurred\./);
  assert.match(r, /a\.woff2 st200 100B 12ms/);
  assert.doesNotMatch(r, /U\+0000-00FF/);
  assert.match(fontDiagnostics(new Set(), "400 40px X", env), /a\.woff2 200/);
  assert.equal(typeof (await fontProbe(null, "400 40px X", {})), "string");
});

test("a combined fonts.load() that fails while each subset loads alone recovers after the serial warm-up", async () => {
  const { ensureFonts, warmFaces } = await import("../../src/lib/motion-studio/font-ready.js");
  const mk = (r) => ({ family: '"Noto Serif Tamil"', status: "unloaded", unicodeRange: r, load: async function () { this.status = "loaded"; return [this]; } });
  const set = new Set([mk("U+0000-00FF"), mk("U+0100-02BA"), mk("U+0B80-0BFF")]);
  assert.equal(await warmFaces(set, '400 40px "Noto Serif Tamil", serif'), 3);
  // combined load fails until every piece is loaded (the observed mobile behaviour)
  const fonts = new Set([...set].map((f) => Object.assign(f, { status: "unloaded" })));
  fonts.load = async (font) => {
    if ([...fonts].some((f) => f.status !== "loaded")) throw Object.assign(new Error("A network error occurred."), { name: "NetworkError" });
    return [...fonts];
  };
  fonts.check = () => true;
  const comp = { format: "reel", style: { font: "noto-serif", weight: 400, sizePx: 48 }, scenes: [{ kind: "stanza", lines: ["தமிழ்"] }], branding: { show: false } };
  let calls = 0;
  const inner = fonts.load;
  fonts.load = async (...a) => (calls++, inner(...a));
  const r = await ensureFonts(comp, { poemText: "தமிழ்", title: "" }, { fonts, fontRetryMs: 1 }).catch((e) => e);
  assert.ok(calls >= 1, "the combined load must have been attempted, calls=" + calls);
  assert.ok(!(r instanceof Error), "should recover after the serial warm-up, got: " + (r && r.message));
});

test("load() rejecting although every piece is loaded and check() is true proceeds; check() false still stops", async () => {
  const { ensureFonts } = await import("../../src/lib/motion-studio/font-ready.js");
  const comp = { format: "reel", style: { font: "noto-serif", weight: 500, sizePx: 48 }, scenes: [{ kind: "stanza", lines: ["தமிழ்"] }], branding: { show: false } };
  const mk = (ready) => {
    const f = new Set([{ family: '"Noto Serif Tamil"', status: ready ? "loaded" : "error", load: async () => { throw new Error("A network error occurred."); } }]);
    f.load = async () => { throw Object.assign(new Error("A network error occurred."), { name: "NetworkError" }); };
    f.check = () => ready;
    if (!ready) f.check = () => false;
    return f;
  };
  const ok = await ensureFonts(comp, { poemText: "தமிழ்", title: "" }, { fonts: mk(true), fontRetryMs: 1 }).catch((e) => e);
  assert.ok(!(ok instanceof Error), "ready faces must proceed: " + (ok && ok.message));
  const bad = await ensureFonts(comp, { poemText: "தமிழ்", title: "" }, { fonts: mk(false), fontRetryMs: 1 }).catch((e) => e);
  assert.ok(bad instanceof Error && /could not be loaded/.test(bad.message), "unready faces must still stop the export");
});

test("when check() fails after every piece loaded, the error names the failing code points and the tag", async () => {
  const { ensureFonts } = await import("../../src/lib/motion-studio/font-ready.js");
  const comp = { format: "reel", style: { font: "noto-serif", weight: 500, sizePx: 48 }, scenes: [{ kind: "stanza", lines: ["தமிழ்"] }], branding: { show: false } };
  const fonts = new Set([{ family: '"Noto Serif Tamil"', weight: "100 900", status: "loaded", load: async () => {} }]);
  fonts.load = async () => [{}];
  fonts.check = (font, t) => !t.includes("்");
  const e = await ensureFonts(comp, { poemText: "தமிழ்", title: "" }, { fonts }).catch((x) => x);
  assert.ok(e instanceof Error && /not ready/.test(e.message), "must stop: " + (e && e.message));
  assert.match(e.message, /fr4 notready U\+BCD/);
});

test("canvasFamily drops next/font's local() 'X Fallback' face (it errors on Android) and keeps real families and generics", async () => {
  const { canvasFamily } = await import("../../src/lib/motion-studio/font-ready.js");
  assert.equal(canvasFamily("'Noto Serif Tamil', 'Noto Serif Tamil Fallback'"), "'Noto Serif Tamil', serif");
  assert.equal(canvasFamily("'Noto Sans Tamil', 'Noto Sans Tamil Fallback'", "sans-serif"), "'Noto Sans Tamil', sans-serif");
  assert.equal(canvasFamily('"Anek Tamil", "Anek Tamil Fallback", sans-serif'), '"Anek Tamil", sans-serif');
  // negative controls: a family merely CONTAINING the word, and a string with nothing else, are left alone
  assert.equal(canvasFamily("'Fallback Sans', serif"), "'Fallback Sans', serif");
  assert.equal(canvasFamily("'X', 'X Fallback', serif"), "'X', serif");
  assert.equal(canvasFamily("'Only Fallback'"), "'Only Fallback'");
  assert.equal(canvasFamily(""), "");
});

test("the admin studio's canvas family map applies canvasFamily to every font (source check)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../src/app/admin/poem-motion-studio/fonts.js", import.meta.url), "utf8");
  assert.match(src, /import \{ canvasFamily \} from "@\/lib\/motion-studio\/font-ready"/);
  assert.match(src, /canvasFamily\(v, SERIF_IDS\.has\(k\) \? "serif" : "sans-serif"\)/);
});

test("the glyph-coverage baseline is a true generic even when the font string ends in the font itself", async () => {
  const { ensureFonts } = await import("../../src/lib/motion-studio/font-ready.js");
  const comp = { format: "reel", style: { font: "noto-serif", weight: 500, sizePx: 48 }, scenes: [{ kind: "stanza", lines: ["தமிழ்"] }], branding: { show: false } };
  const fonts = new Set([{ family: "Noto Serif Tamil", weight: "100 900", status: "loaded" }]);
  fonts.load = async () => [{}];
  fonts.check = () => true;
  const seen = [];
  const measure = (font) => (seen.push(font), /serif$|sans-serif$/.test(font.trim()) && !/Tamil/.test(font) ? 100 : 140);
  const r = await ensureFonts(comp, { poemText: "தமிழ்", title: "" }, { fonts, measure, families: { "noto-serif": "'Noto Serif Tamil'" } }).catch((e) => e);
  assert.ok(seen.some((f) => /40px serif$/.test(f)), "baseline must be measured with a generic: " + seen.join(" | "));
  assert.ok(!(r instanceof Error), "a real Tamil font must pass: " + (r && r.message));
});
