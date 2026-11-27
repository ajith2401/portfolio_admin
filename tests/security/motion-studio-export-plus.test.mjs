// P9: bundle ZIP (MANIFEST.json + README.txt), resolution presets, size estimate, cancel/retry, native share, thumbnail
// cache, memory guard. Priority: a Tamil poem is never silently lost, altered or misrendered; a refused route is never
// dropped silently and never appears as complete. Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ROUTES, routeById } from "../../src/lib/motion-studio/formats.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";
import { drawFrame } from "../../src/lib/motion-studio/render.js";
import { FORMATS, MIN_TEXT_PX } from "../../src/lib/motion-studio/safe-zone.js";
import {
  runBundle,
  buildManifest,
  poemFingerprint,
  sourceLineCount,
  routeCoverage,
  readZipEntries,
  MANIFEST_NAME,
  README_NAME,
} from "../../src/lib/motion-studio/bundle.js";
import {
  outputSize,
  RES_PRESETS,
  MIN_SCALE,
  estimateExport,
  estimateBundle,
  lowMemoryHint,
  ESTIMATE_LABEL,
  WARN_BYTES,
  WARN_SECONDS,
} from "../../src/lib/motion-studio/output-size.js";
import {
  shareFiles,
  canShareFiles,
} from "../../src/lib/motion-studio/share.js";
import {
  thumbKey,
  thumbInputs,
  createThumbCache,
} from "../../src/lib/motion-studio/thumb-cache.js";
import {
  createLease,
  CanvasBudgetError,
} from "../../src/lib/motion-studio/canvas-lease.js";
import { canvasLease } from "../../src/lib/motion-studio/export.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const src = (p) => readFileSync(path.join(ROOT, p), "utf8");

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
        Array.from(String(t)).length * px * (font.includes("Tamil") ? k : 0.5),
    }),
  };
};
const ctx = mkCtx();
const TITLE = "மழையின் பாடல்";
const TEXT =
  "மழைத் துளி மண்ணில்\nமெல்ல விழுகிறது\n\nநினைவின் வாசனை\n  மீண்டும் எழுகிறது";
function mk(text = TEXT, format = "reel") {
  const p = parsePoemText(text, { title: TITLE });
  const d = defaultComposition({
    format,
    scenes: generateScenes(p, { title: TITLE }),
  });
  const base = normalizeComposition({
    ...d,
    poster: { ...d.poster, endText: "நன்றி" },
    poem: { title: TITLE, stanzas: p.stanzas, source: p.source },
  });
  const plan = planFit(ctx, base);
  return {
    comp: plan.ok ? applyFit(base, plan) : base,
    poem: { title: TITLE, stanzas: p.stanzas },
  };
}
const { comp, poem } = mk();
const inputFor = (route) =>
  route.id === "full-poem"
    ? { poem, preset: "compact", height: "extended" }
    : route.excerpt
      ? {
          poem,
          format: route.kind === "video" ? "reel" : "poster",
          lines: [{ stanza: 0, line: 0, text: poem.stanzas[0][0] }],
        }
      : { poem };
const item = (id, input) => ({
  route: routeById(id),
  input: input || inputFor(routeById(id)),
});
const fakeBlob = (bytes, type = "image/png") =>
  new Blob([new Uint8Array(bytes).fill(7)], { type });
/** a renderer stand-in: the REAL validator runs first (as export.js does), then fixed-size fake files */
const fakeRender =
  (calls = []) =>
  async (route, input, opts) => {
    calls.push({ id: route.id, preset: opts.preset });
    const v = route.validate(
      ctx,
      route.kind === "video" ? { ...comp, format: route.format } : comp,
      input,
    );
    if (!v.ok)
      throw Object.assign(new Error(`refused: ${v.messages[0]}`), {
        messages: v.messages,
      });
    if (route.kind === "video") return fakeBlob(300, "video/mp4");
    if (route.kind === "set") return { blobs: [fakeBlob(100), fakeBlob(120)] };
    if (route.excerpt)
      return {
        blob: fakeBlob(90),
        excerpt: true,
        complete: false,
        coverage: v.coverage,
      };
    return { blob: fakeBlob(110) }; // no width/height: the runner falls back to the preset size
  };
const preflightReal =
  (calls = []) =>
  async (route, input) => {
    calls.push({ id: route.id, input });
    return route.validate(
      ctx,
      route.kind === "video" ? { ...comp, format: route.format } : comp,
      input,
    );
  };
const GEN = "2026-01-01T00:00:00.000Z";
const base = (over = {}) => ({
  comp,
  poem,
  preset: "native",
  generatedAt: GEN,
  stem: "மழை",
  measureCtx: ctx,
  ...over,
});
// a route whose validator ALWAYS fails (layout mutated so a line is dropped): negative control
const brokenRoute = (id = "reel-cover") => {
  const r = routeById(id);
  const dropLine = (lay) => {
    const row = (lay.rows || []).find((x) => !x.gap);
    if (row) lay.rows.splice(lay.rows.indexOf(row), 1);
    return lay;
  };
  return {
    ...r,
    validate: (c, cm, input = {}) =>
      r.validate(c, cm, { ...input, mutate: dropLine }),
  };
};

// ---------------------------------------------------------------- golden
test("golden: tests/fixtures/motion-studio-golden.json is byte-identical (P9 changes no drawing)", () => {
  const h = createHash("sha256")
    .update(
      readFileSync(path.join(ROOT, "tests/fixtures/motion-studio-golden.json")),
    )
    .digest("hex");
  assert.equal(
    h,
    "0bfacb0897096eb802f8e49feda99fa40b1c5a284f7b5affaf0cb7a34cc2059f",
  );
});

// ---------------------------------------------------------------- bundle manifest
test("bundle: manifest records every route, files, sizes, dimensions, fingerprint, line count, flags, material, generatedAt", async () => {
  const r = await runBundle({
    ...base(),
    items: [
      item("full-poem"),
      item("reel-cover"),
      item("carousel"),
      item("quote"),
    ],
    preflight: preflightReal(),
    render: fakeRender(),
  });
  assert.equal(r.ok, true);
  assert.ok(r.zip instanceof Uint8Array);
  const m = r.manifest;
  assert.equal(m.generatedAt, GEN, "generatedAt is passed in");
  assert.equal(m.poem.fingerprint, poemFingerprint(poem));
  assert.equal(m.poem.sourceLineCount, 4);
  assert.equal(m.poem.sourceLineCount, sourceLineCount(poem));
  assert.equal(m.material, "none");
  assert.equal(m.fontReview, "reviewed");
  assert.deepEqual(
    m.routes.map((x) => x.id),
    ["full-poem", "reel-cover", "carousel", "quote"],
  );
  const by = Object.fromEntries(m.routes.map((x) => [x.id, x]));
  assert.equal(
    by["full-poem"].complete,
    true,
    "full poem draws every source line",
  );
  assert.equal(by["full-poem"].drawnLines, 4);
  assert.equal(
    by["reel-cover"].complete,
    false,
    "a cover is not the whole poem",
  );
  assert.equal(by["reel-cover"].partial, true);
  assert.equal(by.carousel.complete, true);
  assert.equal(by.carousel.files.length, 2);
  assert.deepEqual(
    [by["reel-cover"].width, by["reel-cover"].height],
    [1080, 1920],
    "dimensions from the native preset",
  );
  // EXCERPT flags preserved
  assert.equal(by.quote.excerpt, true);
  assert.equal(by.quote.complete, false);
  assert.equal(by.quote.partial, true);
  assert.equal(by.quote.coverage.partial, true);
  assert.equal(
    m.complete,
    false,
    "a bundle with an excerpt/partial route never claims completeness",
  );
  assert.ok(
    by.carousel.files.every((f) => /^மழை-carousel-0\d\.png$/.test(f.name)),
    "Tamil file stem preserved",
  );
});
test("bundle: the ZIP contains exactly the manifest-listed files (+ MANIFEST.json, README.txt) with matching sizes", async () => {
  const r = await runBundle({
    ...base(),
    items: [item("full-poem"), item("poster-set"), item("story-stills")],
    preflight: preflightReal(),
    render: fakeRender(),
  });
  const entries = readZipEntries(r.zip);
  const listed = r.manifest.routes.flatMap((x) => x.files);
  assert.deepEqual(
    entries.map((e) => e.name).sort(),
    [...listed.map((f) => f.name), MANIFEST_NAME, README_NAME].sort(),
  );
  for (const f of listed)
    assert.equal(entries.find((e) => e.name === f.name).size, f.size, f.name);
  const m = JSON.parse(
    new TextDecoder().decode(
      entries.find((e) => e.name === MANIFEST_NAME).data,
    ),
  );
  assert.deepEqual(
    m,
    r.manifest,
    "the zipped manifest is the returned manifest",
  );
  const readme = new TextDecoder().decode(
    entries.find((e) => e.name === README_NAME).data,
  );
  assert.match(readme, /4 source lines/);
  assert.match(readme, new RegExp(r.manifest.poem.fingerprint));
});
test("NEGATIVE CONTROL: a route forced to fail its validator is never silently dropped and never complete; default = stop, no ZIP", async () => {
  const items = [
    item("full-poem"),
    { route: brokenRoute(), input: { poem } },
    item("carousel"),
  ];
  const calls = [];
  const r = await runBundle({
    ...base(),
    items,
    preflight: preflightReal(),
    render: fakeRender(calls),
  });
  assert.equal(r.ok, false);
  assert.equal(r.stopped, true);
  assert.equal(r.zip, null, "default: stop and report, no ZIP");
  assert.equal(
    calls.length,
    0,
    "nothing drawn after a refusal (validation runs before any drawing)",
  );
  const cover = r.manifest.routes.find((x) => x.id === "reel-cover");
  assert.equal(cover.status, "refused");
  assert.ok(cover.reason && cover.reason.length > 0);
  assert.equal(cover.complete, false);
  assert.deepEqual(
    r.failures.map((f) => f.id),
    ["reel-cover"],
  );
  assert.ok(
    r.manifest.routes
      .filter((x) => x.id !== "reel-cover")
      .every((x) => x.status === "not-run" && !x.complete),
  );
  assert.equal(r.manifest.complete, false);
});
test("NEGATIVE CONTROL: continue-without-failed-routes writes the others and the manifest still lists the refused route", async () => {
  const items = [
    item("full-poem"),
    { route: brokenRoute(), input: { poem } },
    item("carousel"),
  ];
  const r = await runBundle({
    ...base(),
    items,
    continueOnFailure: true,
    preflight: preflightReal(),
    render: fakeRender(),
  });
  assert.ok(r.zip);
  assert.equal(r.ok, false, "a bundle with a refused route is not ok");
  const cover = r.manifest.routes.find((x) => x.id === "reel-cover");
  assert.equal(cover.status, "refused");
  assert.equal(cover.complete, false);
  assert.deepEqual(cover.files, []);
  const names = readZipEntries(r.zip).map((e) => e.name);
  assert.ok(
    !names.some((n) => n.includes("reel-cover")),
    "no file for the refused route",
  );
  assert.equal(r.manifest.complete, false);
  assert.match(
    new TextDecoder().decode(
      readZipEntries(r.zip).find((e) => e.name === README_NAME).data,
    ),
    /REFUSED/,
  );
});
test("bundle: a route that fails at DRAW time (after preflight) is refused too, and stops by default", async () => {
  const render = async (route, input, opts) => {
    if (route.id === "carousel")
      throw new Error(
        "Feed carousel: 1 problem(s) found, nothing was exported.",
      );
    return fakeRender()(route, input, opts);
  };
  const r = await runBundle({
    ...base(),
    items: [item("full-poem"), item("carousel"), item("poster-set")],
    preflight: preflightReal(),
    render,
  });
  assert.equal(r.zip, null);
  assert.equal(
    r.manifest.routes.find((x) => x.id === "carousel").status,
    "refused",
  );
  assert.equal(
    r.manifest.routes.find((x) => x.id === "poster-set").status,
    "not-run",
  );
});
test("bundle: a poster that would overflow (clip) is refused, never written", async () => {
  const r = await runBundle({
    ...base(),
    items: [item("poster")],
    preflight: async () => ({
      ok: true,
      messages: [],
      plan: { overflow: true },
    }),
    render: fakeRender(),
  });
  assert.equal(r.manifest.routes[0].status, "refused");
  assert.match(r.manifest.routes[0].reason, /clipped/);
});
test("bundle: generatedAt is required (pure code never reads the clock)", async () => {
  await assert.rejects(
    () =>
      runBundle({
        ...base({ generatedAt: undefined }),
        items: [item("full-poem")],
        preflight: preflightReal(),
        render: fakeRender(),
      }),
    /generatedAt/,
  );
});
test("coverage: a poster of selected stanzas is partial; an edited scene line is never reported complete", () => {
  const some = {
    ...comp,
    poster: {
      ...comp.poster,
      sceneIds: [comp.scenes.find((s) => s.kind !== "title").id],
    },
  };
  const c = routeCoverage(routeById("poster-set"), some, { poem }, ctx);
  assert.equal(c.complete, false);
  assert.equal(c.partial, true);
  const edited = {
    ...comp,
    scenes: comp.scenes.map((s) =>
      s.kind === "title"
        ? s
        : { ...s, lines: s.lines.map((l) => l.replace("மழைத்", "மழை")) },
    ),
  };
  assert.equal(
    routeCoverage(routeById("reel-mp4"), edited, { poem }, ctx).complete,
    false,
  );
  assert.equal(
    routeCoverage(routeById("reel-mp4"), comp, { poem }, ctx).complete,
    true,
    "untouched scenes reproduce the poem",
  );
});
test("manifest: fontReview is 'unreviewed' when any written route reports it", () => {
  const m = buildManifest({
    generatedAt: GEN,
    poem,
    comp,
    preset: "native",
    entries: [
      {
        id: "a",
        label: "A",
        status: "ok",
        complete: true,
        fontReview: "unreviewed",
        files: [],
      },
    ],
  });
  assert.equal(m.fontReview, "unreviewed");
  assert.equal(m.routes[0].fontReview, "unreviewed");
});
test("fingerprint: changes with any character of the poem (title, line, whitespace)", () => {
  const f = poemFingerprint(poem);
  assert.match(f, /^[0-9a-f]{24}$/);
  assert.notEqual(poemFingerprint({ ...poem, title: TITLE + " " }), f);
  assert.notEqual(
    poemFingerprint({
      ...poem,
      stanzas: [
        poem.stanzas[0],
        [poem.stanzas[1][0], poem.stanzas[1][1].trimStart()],
      ],
    }),
    f,
  );
  assert.equal(poemFingerprint(structuredClone(poem)), f);
});

// ---------------------------------------------------------------- resolution presets
test("presets: outputSize dimensions per format; video sizes are even; 1.5x only for images within the cap", () => {
  assert.deepEqual(
    [outputSize("reel", "native").w, outputSize("reel", "native").h],
    [1080, 1920],
  );
  assert.deepEqual(
    [outputSize("reel", "medium").w, outputSize("reel", "medium").h],
    [810, 1440],
  );
  assert.deepEqual(
    [outputSize("reel", "draft").w, outputSize("reel", "draft").h],
    [540, 960],
  );
  assert.deepEqual(
    [outputSize("poster", "hq").w, outputSize("poster", "hq").h],
    [1620, 2025],
  );
  assert.deepEqual(
    [
      outputSize("square", "medium", { kind: "video" }).w,
      outputSize("square", "medium", { kind: "video" }).h,
    ],
    [810, 810],
  );
  const pv = outputSize("poster", "medium", { kind: "video" });
  assert.ok(pv.w % 2 === 0 && pv.h % 2 === 0);
  assert.equal(
    outputSize("reel", "hq", { kind: "video" }).ok,
    false,
    "1.5x video refused (encoder edge cap)",
  );
  assert.equal(
    outputSize("full", "hq", { height: 3200 }).ok,
    false,
    "image edge cap enforced",
  );
  for (const p of RES_PRESETS) assert.ok(p.scale >= MIN_SCALE);
});
test("NEGATIVE CONTROL: a scale below the floor cannot be smuggled in (number, object, unknown id)", () => {
  for (const bad of [0.3, { id: "x", scale: 0.25 }, "tiny", null]) {
    const s = outputSize("reel", bad);
    assert.equal(s.ok, false, String(bad));
    assert.equal(
      s.minTextPx,
      MIN_TEXT_PX.reel,
      "the native floor is reported, not a scaled one",
    );
  }
  for (const p of RES_PRESETS) {
    const s = outputSize("reel", p.id);
    if (s.ok)
      assert.equal(
        s.minTextPx,
        MIN_TEXT_PX.reel,
        `${p.id}: min text checked at native`,
      );
  }
});
/** records every canvas call drawFrame makes */
const recorder = () => {
  const log = [];
  let px = 40;
  const t = {
    measureText: (s) => ({ width: Array.from(String(s)).length * px * 0.55 }),
    createLinearGradient: (...a) => (
      log.push(["lg", ...a]),
      { addColorStop: (...x) => log.push(["stop", ...x]) }
    ),
    createRadialGradient: (...a) => (
      log.push(["rg", ...a]),
      { addColorStop: (...x) => log.push(["stop", ...x]) }
    ),
  };
  const p = new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "font") return `${px}px x`;
      return (...a) => log.push([String(k), ...a]);
    },
    set(o, k, v) {
      if (k === "font") px = Number(/([\d.]+)px/.exec(v)?.[1] || px);
      log.push(["=" + String(k), typeof v === "object" ? "obj" : v]);
      return true;
    },
  });
  return { ctx: p, log };
};
test("presets: draw-call geometry is IDENTICAL across presets up to the one uniform scale (layout is native)", () => {
  for (const format of ["reel", "story", "poster", "square"]) {
    const c = { ...comp, format };
    const sc = c.scenes.find((s) => s.kind !== "title");
    const logs = RES_PRESETS.map((p) => {
      const s = outputSize(format, p.id);
      if (!s.ok) return null;
      const r = recorder();
      drawFrame(r.ctx, c, 0, { w: s.w, h: s.h, still: true, scene: sc });
      return { p, s, log: r.log };
    }).filter(Boolean);
    const native = logs.find((x) => x.p.id === "native");
    for (const x of logs) {
      // the first call is the single uniform scale; every other call (text, positions, fonts) is byte-identical
      assert.deepEqual(
        x.log[1],
        ["scale", x.s.w / FORMATS[format].w, x.s.w / FORMATS[format].w],
        `${format}/${x.p.id}`,
      );
      assert.equal(x.s.w / FORMATS[format].w, x.p.scale);
      assert.deepEqual(
        x.log.slice(2),
        native.log.slice(2),
        `${format}/${x.p.id}: geometry differs from native`,
      );
      assert.ok(
        x.log.some((e) => e[0] === "fillText" && e[1] === sc.lines[0]),
        "the poem line is drawn unchanged",
      );
    }
  }
});
test("presets: validators see the same input at every preset (spy), and the result is identical", async () => {
  const seen = {};
  for (const p of RES_PRESETS.filter((x) => outputSize("poster", x.id).ok)) {
    const calls = [];
    await runBundle({
      ...base({ preset: p.id }),
      items: [item("carousel"), item("full-poem")],
      preflight: preflightReal(calls),
      render: fakeRender(),
    });
    seen[p.id] = calls.map((c) => JSON.stringify([c.id, c.input]));
  }
  const ref = seen.native;
  for (const [k, v] of Object.entries(seen))
    assert.deepEqual(v, ref, `validator input differs at ${k}`);
  const r = routeById("carousel");
  assert.equal(
    r.validate.length <= 3,
    true,
    "validate(ctx, comp, input): no preset parameter exists",
  );
  assert.ok(
    !/preset/.test(
      src("src/lib/motion-studio/route-checks.js")
        .replace(
          /preset = "balanced"|\{ preset, height \}|preset, height|preset:/g,
          "",
        )
        .replace(/\/\/.*$/gm, ""),
    ),
    "route-checks never reads a resolution preset",
  );
});
test("NEGATIVE CONTROL: text below the native floor is refused at EVERY preset (draft does not lower the floor)", async () => {
  const sc = comp.scenes.find((s) => s.kind !== "title");
  const tiny = {
    ...comp,
    scenes: comp.scenes.map((s) => (s === sc ? { ...s, scale: 0.6 } : s)),
  };
  const route = routeById("reel-mp4");
  for (const p of RES_PRESETS) {
    const r = await runBundle({
      ...base({ comp: tiny, preset: p.id }),
      items: [{ route, input: { poem } }],
      preflight: async (rt, input) =>
        rt.validate(ctx, { ...tiny, format: "reel" }, input),
      render: fakeRender(),
    });
    assert.equal(r.zip, null, p.id);
    assert.equal(r.manifest.routes[0].status, "refused", p.id);
    if (p.id !== "hq")
      assert.match(r.manifest.routes[0].reason, /below the 40px minimum/, p.id);
  }
});

// ---------------------------------------------------------------- estimate
test("estimate: labelled as an estimate, monotonic in preset scale, duration and card count", () => {
  const order = ["draft", "medium", "native", "hq"];
  for (const id of ["poster-set", "full-poem", "reel-cover"]) {
    const r = routeById(id);
    const e = order
      .map((p) => estimateExport(comp, r, p, { cards: 3 }))
      .filter((x) => x.ok);
    for (let i = 1; i < e.length; i++) {
      assert.ok(
        e[i].bytesLow > e[i - 1].bytesLow &&
          e[i].bytesHigh > e[i - 1].bytesHigh,
        `${id} bytes monotonic`,
      );
      assert.ok(e[i].seconds >= e[i - 1].seconds, `${id} time monotonic`);
    }
    for (const x of e) {
      assert.equal(x.estimate, true);
      assert.equal(x.label, ESTIMATE_LABEL);
      assert.ok(x.bytesLow < x.bytesHigh);
    }
  }
  const set = routeById("poster-set");
  assert.ok(
    estimateExport(comp, set, "native", { cards: 6 }).bytesHigh >
      estimateExport(comp, set, "native", { cards: 3 }).bytesHigh,
  );
  const v = routeById("reel-mp4");
  const longer = {
    ...comp,
    scenes: comp.scenes.map((s) => ({ ...s, durationMs: s.durationMs * 2 })),
  };
  assert.ok(
    estimateExport(longer, v, "native").bytesHigh >
      estimateExport(comp, v, "native").bytesHigh,
  );
  assert.ok(
    estimateExport(longer, v, "native").seconds >
      estimateExport(comp, v, "native").seconds,
  );
  assert.equal(estimateExport(comp, v, "native").unit, "frames");
  assert.equal(
    estimateExport(comp, v, "hq").ok,
    false,
    "1.5x video estimate refused with the reason",
  );
});
test("estimate: warns above 100 MB / 5 minutes; low-memory is a suggestion only", () => {
  const huge = {
    ...comp,
    scenes: Array.from({ length: 60 }, (_, i) => ({
      id: `s${i}`,
      kind: "stanza",
      lines: ["அ"],
      durationMs: 20000,
    })),
  };
  const e = estimateExport(huge, routeById("reel-mp4"), "native");
  assert.ok(e.bytesHigh > WARN_BYTES && e.seconds > WARN_SECONDS);
  assert.ok(
    e.warnings.some((w) => /MB/.test(w)) &&
      e.warnings.some((w) => /minutes/.test(w)),
  );
  assert.equal(
    estimateExport(comp, routeById("reel-cover"), "native").warnings.length,
    0,
  );
  assert.ok(
    estimateBundle([e, estimateExport(comp, routeById("reel-cover"), "native")])
      .warnings.length >= 2,
  );
  assert.equal(
    lowMemoryHint({ deviceMemory: 2, hardwareConcurrency: 8 }).low,
    true,
  );
  assert.equal(
    lowMemoryHint({ deviceMemory: 8, hardwareConcurrency: 2 }).low,
    true,
  );
  assert.equal(
    lowMemoryHint({ deviceMemory: 8, hardwareConcurrency: 8 }).low,
    false,
  );
  assert.equal(lowMemoryHint(undefined).low, false);
  assert.match(lowMemoryHint({ deviceMemory: 1 }).message, /Suggestion only/);
});

// ---------------------------------------------------------------- cancel / retry / memory guard
test("cancel: aborts before the next route and releases every canvas", async () => {
  const lease = createLease((w, h) => ({ width: w, height: h }));
  const ac = new AbortController();
  const rendered = [];
  const render = async (route, input, opts) => {
    const c = lease.acquire(1080, 1350); // a renderer that "forgets" to release: the runner must free it
    rendered.push({ id: route.id, c });
    const out = await fakeRender()(route, input, opts);
    if (route.id === "full-poem") ac.abort();
    return out;
  };
  await assert.rejects(
    () =>
      runBundle({
        ...base(),
        items: [item("full-poem"), item("carousel"), item("poster-set")],
        signal: ac.signal,
        preflight: preflightReal(),
        render,
        release: () => lease.releaseAll(),
        live: () => lease.live(),
      }),
    (e) => e.name === "AbortError",
  );
  assert.deepEqual(
    rendered.map((x) => x.id),
    ["full-poem"],
    "no route starts after cancel",
  );
  assert.equal(lease.live(), 0, "canvases released after cancel");
  assert.equal(rendered[0].c.width, 0, "the bitmap backing store was freed");
});
test("memory guard: routes run one at a time; at most ONE export canvas alive; released between routes", async () => {
  const lease = createLease((w, h) => ({ width: w, height: h }));
  let concurrent = 0,
    maxConcurrent = 0;
  const render = async (route, input, opts) => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    assert.equal(
      lease.live(),
      0,
      `a canvas was still alive when ${route.id} started`,
    );
    lease.acquire(10, 10);
    await new Promise((r) => setTimeout(r, 2));
    concurrent--;
    return fakeRender()(route, input, opts);
  };
  await runBundle({
    ...base(),
    items: [
      item("full-poem"),
      item("carousel"),
      item("poster-set"),
      item("story-stills"),
    ],
    preflight: preflightReal(),
    render,
    release: () => lease.releaseAll(),
    live: () => lease.live(),
  });
  assert.equal(maxConcurrent, 1);
  assert.equal(lease.peak(), 1);
  assert.equal(lease.live(), 0);
  assert.throws(() => {
    const l = createLease(() => ({}));
    l.acquire(1, 1);
    l.acquire(1, 1);
  }, CanvasBudgetError);
  assert.equal(
    canvasLease.live(),
    0,
    "export.js shares one lease, idle when nothing exports",
  );
});
test("retry: re-runs every validator from scratch (spy) and never reuses a stale validated result", async () => {
  const calls = [];
  const opts = {
    ...base(),
    items: [item("full-poem"), item("carousel")],
    preflight: preflightReal(calls),
    render: fakeRender(),
  };
  const a = await runBundle(opts);
  const b = await runBundle(opts);
  assert.equal(calls.length, 4, "2 routes x 2 runs");
  assert.ok(a.ok && b.ok);
  // the poem changed between attempts: the retry validates the NEW state and refuses
  let broken = false;
  const flaky = {
    ...routeById("full-poem"),
    validate: (c, cm, input) =>
      broken
        ? { ok: false, messages: ["line 2 missing"] }
        : routeById("full-poem").validate(c, cm, input),
  };
  const o2 = {
    ...base(),
    items: [{ route: flaky, input: inputFor(flaky) }],
    preflight: async (r, input) => r.validate(ctx, comp, input),
    render: fakeRender(),
  };
  assert.equal((await runBundle(o2)).ok, true);
  broken = true;
  const again = await runBundle(o2);
  assert.equal(again.ok, false);
  assert.equal(again.manifest.routes[0].status, "refused");
});
test("export.js: every renderer uses the shared lease and releases in finally; MotionStudio passes release/live", () => {
  const s = src("src/lib/motion-studio/export.js");
  assert.ok(!/mkCanvas\(/.test(s), "no un-leased output canvas");
  assert.ok(
    (s.match(/withCanvas\(/g) || []).length >= 7,
    "every route draws through withCanvas",
  );
  assert.match(s, /finally \{\s*lease\.release\(c\);/);
  const ms = src("src/app/admin/poem-motion-studio/MotionStudio.jsx");
  assert.match(ms, /release: \(\) => canvasLease\.releaseAll\(\)/);
  assert.match(ms, /live: \(\) => canvasLease\.live\(\)/);
});

// ---------------------------------------------------------------- native share
const file = (name = "a.png") =>
  new File([new Uint8Array([1])], name, { type: "image/png" });
test("share: feature-detected; needs a user gesture; never auto-shares; falls back to download with a message", async () => {
  let shared = 0;
  const nav = { canShare: () => true, share: async () => void shared++ };
  const r0 = await shareFiles([file()], {
    nav,
    download: () => assert.fail("no download without a gesture"),
  });
  assert.equal(r0.refused, true);
  assert.equal(shared, 0, "no gesture => no share");
  const r1 = await shareFiles([file()], { nav, userGesture: true });
  assert.equal(r1.shared, true);
  assert.equal(shared, 1);
  const dl = [];
  const r2 = await shareFiles([file("x.png"), file("y.png")], {
    nav: { share: async () => assert.fail("no canShare: must not call share") },
    userGesture: true,
    download: (f, n) => dl.push(n),
  });
  assert.equal(r2.fellBack, true);
  assert.match(r2.message, /downloaded instead/);
  assert.deepEqual(dl, ["x.png", "y.png"]);
  const r3 = await shareFiles([file()], {
    nav: { canShare: () => false, share: async () => assert.fail() },
    userGesture: true,
    fallback: () => dl.push("zip"),
  });
  assert.equal(r3.fellBack, true);
  assert.equal(dl.at(-1), "zip");
  const r4 = await shareFiles([file()], {
    nav: {
      canShare: () => true,
      share: async () => {
        throw new DOMException("x", "AbortError");
      },
    },
    userGesture: true,
    download: () => assert.fail("user cancelled: no download"),
  });
  assert.equal(r4.cancelled, true);
  assert.equal(
    canShareFiles([file()], {
      canShare: () => {
        throw new Error("x");
      },
      share() {},
    }),
    false,
  );
  assert.equal(canShareFiles([file()], null), false);
});
test("share: the UI calls shareFiles only from the Share button's click handler (no effect, no auto-share, no third party)", () => {
  const ui = src("src/app/admin/poem-motion-studio/panels/BundleExport.jsx");
  const calls = ui.match(/shareFiles\(/g) || [];
  assert.equal(calls.length, 1);
  assert.match(
    ui,
    /const share = async \(\) => \{[\s\S]*?shareFiles\([^)]*userGesture: true/,
  );
  assert.match(ui, /onClick=\{share\}/);
  assert.ok(!/useEffect/.test(ui), "no effect can trigger sharing");
  const lib = src("src/lib/motion-studio/share.js");
  assert.ok(
    !/fetch\(|https?:\/\/|XMLHttpRequest|sendBeacon/.test(lib),
    "no network calls",
  );
});

// ---------------------------------------------------------------- thumbnail cache
test("thumb cache: the key changes with EVERY listed input", () => {
  const args = {
    poem,
    comp: {
      ...comp,
      material: { id: "none", intensity: 0.6, reduce: false, seed: 1 },
    },
    route: "poster",
    format: "poster",
  };
  const k0 = thumbKey(args);
  const variants = {
    poemLine: {
      ...args,
      poem: {
        ...poem,
        stanzas: [
          [poem.stanzas[0][0] + "!", poem.stanzas[0][1]],
          poem.stanzas[1],
        ],
      },
    },
    poemWhitespace: {
      ...args,
      poem: {
        ...poem,
        stanzas: [
          poem.stanzas[0],
          [poem.stanzas[1][0], poem.stanzas[1][1].trim()],
        ],
      },
    },
    title: { ...args, poem: { ...poem, title: "வேறு" } },
    template: { ...args, comp: { ...args.comp, templateId: "golden-hour" } },
    material: {
      ...args,
      comp: {
        ...args.comp,
        material: { ...args.comp.material, id: "paper-grain" },
      },
    },
    format: { ...args, format: "reel" },
    route: { ...args, route: "carousel" },
    motionPref: {
      ...args,
      comp: { ...args.comp, motion: { ...args.comp.motion, pref: "calm" } },
    },
    reduceMotion: {
      ...args,
      comp: {
        ...args.comp,
        motion: { ...args.comp.motion, reduceMotion: true },
      },
    },
    font: {
      ...args,
      comp: {
        ...args.comp,
        style: { ...args.comp.style, font: "noto-serif-tamil" },
      },
    },
    titleFont: {
      ...args,
      comp: { ...args.comp, style: { ...args.comp.style, titleFont: "x" } },
    },
    signatureText: {
      ...args,
      comp: {
        ...args.comp,
        branding: { ...args.comp.branding, signature: "— வேறொருவர்" },
      },
    },
    signatureField: {
      ...args,
      comp: {
        ...args.comp,
        branding: { ...args.comp.branding, signatureSize: 99 },
      },
    },
    color: {
      ...args,
      comp: { ...args.comp, style: { ...args.comp.style, color: "#123456" } },
    },
  };
  const keys = new Set([k0]);
  for (const [name, v] of Object.entries(variants)) {
    const k = thumbKey(v);
    assert.notEqual(k, k0, `${name} did not change the key`);
    keys.add(k);
  }
  assert.equal(
    keys.size,
    Object.keys(variants).length + 1,
    "every variant is a distinct key",
  );
  assert.equal(
    thumbKey(structuredClone(args)),
    k0,
    "equal inputs => equal key (key order independent)",
  );
  for (const f of [
    "poem",
    "templateId",
    "material",
    "format",
    "route",
    "motion",
    "font",
    "titleFont",
    "signature",
  ])
    assert.ok(f in thumbInputs(args), f);
});
test("NEGATIVE CONTROL: a changed poem or option never serves the stale thumbnail", () => {
  const cache = createThumbCache({ max: 8 });
  const a = { poem, comp, route: "poster", format: "poster" };
  cache.set(thumbKey(a), "thumb-A");
  assert.equal(cache.get(thumbKey(a)), "thumb-A");
  const changed = {
    ...a,
    poem: {
      ...poem,
      stanzas: [[...poem.stanzas[0].slice(0, 1)], poem.stanzas[1]],
    },
  }; // a line removed
  assert.equal(
    cache.get(thumbKey(changed)),
    undefined,
    "a poem with a missing line must not show the old thumbnail",
  );
  assert.equal(
    cache.get(thumbKey({ ...a, comp: { ...comp, templateId: "other" } })),
    undefined,
  );
});
test("thumb cache: bounded LRU eviction; storage injectable and kept in sync", () => {
  const store = new Map();
  const deleted = [];
  const storage = {
    get: (k) => store.get(k),
    set: (k, v) => store.set(k, v),
    delete: (k) => (deleted.push(k), store.delete(k)),
  };
  const c = createThumbCache({ max: 3, storage });
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.get("a"); // a is now most recent
  c.set("d", 4); // evicts b (least recently used)
  assert.deepEqual(c.keys(), ["c", "a", "d"]);
  assert.equal(c.get("b"), undefined);
  assert.deepEqual(deleted, ["b"]);
  assert.equal(store.size, 3);
  for (let i = 0; i < 50; i++) c.set(`k${i}`, i);
  assert.equal(c.size(), 3);
  assert.equal(store.size, 3, "storage bounded too");
  store.delete("k49"); // storage lost an entry: never a stale or phantom hit
  assert.equal(c.get("k49"), undefined);
  assert.throws(() => createThumbCache({ max: 0 }), RangeError);
});

// ---------------------------------------------------------------- purity
test("pure code: no Date / Math.random / performance.now in the P9 modules (source scan)", () => {
  for (const f of [
    "bundle.js",
    "output-size.js",
    "thumb-cache.js",
    "canvas-lease.js",
    "share.js",
  ]) {
    const code = src(`src/lib/motion-studio/${f}`)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
    assert.ok(!/\bDate\b/.test(code), `${f} uses Date`);
    assert.ok(!/Math\.random/.test(code), `${f} uses Math.random`);
    assert.ok(!/performance\.now/.test(code), `${f} uses performance.now`);
  }
});
test("routes: bundle offers every non-excerpt route; the route registry is unchanged in size", () => {
  assert.equal(ROUTES.length, 11);
  const ui = src("src/app/admin/poem-motion-studio/panels/BundleExport.jsx");
  assert.match(ui, /ROUTES\.filter\(\(r\) => !r\.excerpt\)/);
});
