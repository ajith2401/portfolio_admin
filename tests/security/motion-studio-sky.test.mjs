// Sky & Celestial collection (sky.js): storage, determinism, meteors kept clear of the poem, still frames, contrast,
// and no change at all for projects without a sky. Machine independent: drawing goes to a recording stub context.
import test from "node:test";
import assert from "node:assert/strict";
import {
  SKY_PRESETS,
  SKY_IDS,
  NIGHT_SKIES,
  DAY_SKIES,
  SKY_PALETTES,
  normalizeSky,
  resolveSky,
  skyOf,
  skyActive,
  skyFrozen,
  starField,
  twinkleAt,
  meteorsAt,
  keepOut,
  placeOutside,
  cloudField,
  paintSky,
  skyScrim,
  skyBases,
  skyTextAdvice,
} from "../../src/lib/motion-studio/sky.js";
import { normalizeMaterial } from "../../src/lib/motion-studio/materials.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { fxBases } from "../../src/lib/motion-studio/fx/palette.js";
import { drawFrame } from "../../src/lib/motion-studio/render.js";

const W = 1080,
  H = 1920,
  RECT = { x: 65, y: 269, w: 950, h: 979 };
const comp = (sky, extra = {}) => ({
  material: { id: "none", seed: 7, sky },
  style: { bg: {} },
  motion: {},
  ...extra,
});

// a recording 2D context: every call and property write, in order
function recCtx() {
  const log = [];
  const grad = () => ({ addColorStop: (...a) => log.push(["stop", ...a]) });
  const t = {
    createLinearGradient: (...a) => (log.push(["lin", ...a]), grad()),
    createRadialGradient: (...a) => (log.push(["rad", ...a]), grad()),
    measureText: (s) => ({
      width: String(s).length * 20,
      actualBoundingBoxAscent: 30,
      actualBoundingBoxDescent: 10,
    }),
  };
  const ctx = new Proxy(t, {
    get: (o, k) =>
      k in o
        ? o[k]
        : (...a) =>
            log.push([
              k,
              ...a.map((v) =>
                typeof v === "number" ? Math.round(v * 1000) / 1000 : typeof v,
              ),
            ]),
    set: (o, k, v) => (log.push(["set", k, typeof v === "object" ? "object" : v]), true),
  });
  return { ctx, log };
}

test("collection: 10+ night presets and day presets, unique ids, every palette defined, every preset distinct", () => {
  assert.ok(NIGHT_SKIES.length >= 10, `night presets: ${NIGHT_SKIES.length}`);
  assert.ok(DAY_SKIES.length >= 4);
  assert.equal(new Set(SKY_IDS).size, SKY_IDS.length);
  for (const name of [
    "Velvet Midnight",
    "Moonlit Clouds",
    "Indigo Milky Way",
    "Violet Dream",
    "Aurora Veil",
    "Meteor Shower",
    "Lavender Twilight",
    "Silver Moonlight",
    "Cloud Cathedral",
    "Starlit Horizon",
  ])
    assert.ok(
      SKY_PRESETS.some((p) => p.label === name),
      name,
    );
  const pal = Object.fromEntries(SKY_PALETTES.map((p) => [p.label, p.stops]));
  assert.deepEqual(pal["Midnight Indigo"], [
    "#050B1E",
    "#0A1633",
    "#13244B",
    "#25345D",
  ]);
  assert.deepEqual(pal["Violet Nebula"], [
    "#100B25",
    "#26163F",
    "#4A2868",
    "#80538B",
  ]);
  assert.deepEqual(pal["Moonlit Silver"], [
    "#0B172D",
    "#182944",
    "#314563",
    "#8090A8",
  ]);
  assert.deepEqual(pal["Aurora Night"], [
    "#061829",
    "#0B3547",
    "#17696E",
    "#574F88",
  ]);
  assert.deepEqual(pal["Romantic Twilight"], [
    "#25172F",
    "#49304F",
    "#80536C",
    "#C17F94",
  ]);
  assert.deepEqual(pal["Deep Cosmic Blue"], [
    "#050C20",
    "#111F45",
    "#252B66",
    "#514B86",
  ]);
  assert.deepEqual(pal["Soft Lavender Sky"], [
    "#17172D",
    "#39365D",
    "#746E9C",
    "#AAA0BE",
  ]);
  for (const p of SKY_PRESETS)
    assert.ok(
      SKY_PALETTES.some((x) => x.id === p.palette),
      p.id,
    );
  // distinct: no two presets resolve to the same drawing settings
  const sig = SKY_IDS.map((id) =>
    JSON.stringify({ ...resolveSky({ id }), id: 0, kind: 0 }),
  );
  assert.equal(new Set(sig).size, sig.length);
});

test("normalizeSky: whitelist, clamp, unknown id is no sky, idempotent; material keeps it only when real", () => {
  assert.equal(normalizeSky(null), null);
  assert.equal(normalizeSky({ id: "nope" }), null);
  const n = normalizeSky({
    id: "aurora-veil",
    stars: "dense",
    clouds: "x",
    bright: 99,
    density: "0.333",
    moon: "full",
    horizon: "?",
    constellations: true,
    evil: "<script>",
  });
  assert.deepEqual(n, {
    id: "aurora-veil",
    stars: "dense",
    density: 0.33,
    bright: 40,
    moon: "full",
    constellations: true,
  });
  assert.deepEqual(normalizeSky(n), n, "idempotent");
  for (const id of SKY_IDS)
    assert.deepEqual(normalizeSky(normalizeSky({ id })), { id });
  assert.equal(
    "sky" in normalizeMaterial({ id: "none" }),
    false,
    "legacy material gains no key",
  );
  assert.equal(
    "sky" in normalizeMaterial({ id: "none", sky: { id: "bogus" } }),
    false,
  );
  assert.deepEqual(
    normalizeMaterial({ id: "none", sky: { id: "velvet-midnight" } }).sky,
    { id: "velvet-midnight" },
  );
});

test("composition save/reopen keeps the sky exactly; a template switch keeps the material (sky)", () => {
  const sc = [
    { id: "s", kind: "stanza", lines: ["அன்பே சிவம்"], durationMs: 4000 },
  ];
  const base = normalizeComposition({
    ...defaultComposition({ scenes: sc }),
    scenes: sc,
  });
  const sky = {
    id: "meteor-shower",
    motion: "cinematic",
    meteors: 0.9,
    moon: "crescent",
  };
  const c = normalizeComposition({
    ...base,
    material: { ...(base.material || { id: "none" }), sky },
  });
  assert.deepEqual(c.material.sky, sky);
  const again = normalizeComposition(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(again.material.sky, sky);
  assert.equal(
    JSON.stringify(normalizeComposition(again)),
    JSON.stringify(again),
    "idempotent",
  );
  const legacy = normalizeComposition({ ...base });
  assert.equal(
    legacy.material?.sky,
    undefined,
    "no sky invented on legacy projects",
  );
});

test("resolve: quick choices map to values; advanced values override; a photo background wins over the sky", () => {
  const r = resolveSky({
    id: "velvet-midnight",
    stars: "off",
    clouds: "dramatic",
    motion: "static",
    glow: "subtle",
  });
  assert.equal(r.density, 0);
  assert.ok(r.cloudDensity > 0.8);
  assert.equal(r.motionK, 0);
  assert.equal(
    resolveSky({ id: "velvet-midnight", stars: "off", density: 0.4 }).density,
    0.4,
  );
  assert.equal(skyActive(comp({ id: "velvet-midnight" })), true);
  assert.equal(
    skyActive(
      comp({ id: "velvet-midnight" }, { style: { bg: { image: "x.jpg" } } }),
    ),
    false,
  );
  assert.equal(skyOf(comp(undefined)), null);
});

test("stars: 3 depth layers, seeded and stable (same seed → same stars, other seed → different)", () => {
  const cfg = resolveSky({ id: "velvet-midnight" });
  const a = starField(cfg, 7, W, H),
    b = starField({ ...cfg }, 7, W, H),
    c = starField(cfg, 8, W, H);
  assert.ok(
    a.far.length > 500 && a.mid.length > 100 && a.bright.length > 5,
    `${a.far.length}/${a.mid.length}/${a.bright.length}`,
  );
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.mid.slice(0, 5), c.mid.slice(0, 5));
  const tw = a.mid.filter((s) => s.tw).length;
  assert.ok(
    tw > 0 && tw < a.mid.length,
    `only a subset twinkles (${tw}/${a.mid.length})`,
  );
  const s = a.mid.find((x) => x.tw);
  assert.equal(
    twinkleAt(s, cfg, 3.2),
    twinkleAt(s, cfg, 3.2),
    "twinkle is a function of the frame time",
  );
  assert.notEqual(twinkleAt(s, cfg, 0), twinkleAt(s, cfg, 1.7));
  assert.equal(
    starField(resolveSky({ id: "clear-blue-day" }), 7, W, H).far.length,
    0,
    "no stars on a clear day",
  );
});

test("meteors: occasional, deterministic, never cross the poem area; frozen still frame is fixed", () => {
  const ko = keepOut(RECT, W, H);
  for (const id of SKY_IDS) {
    const cfg = resolveSky({ id });
    let frames = 0;
    for (let f = 0; f < 900; f++) {
      const ms = meteorsAt(cfg, 7, f / 30, W, H, ko);
      if (ms.length) frames++;
      for (const m of ms) {
        // the whole path (with padding) stays outside the text box
        const bb = [
          Math.min(m.x0, m.x1),
          Math.min(m.y0, m.y1),
          Math.max(m.x0, m.x1),
          Math.max(m.y0, m.y1),
        ];
        assert.ok(
          !(bb[0] < ko[2] && bb[2] > ko[0] && bb[1] < ko[3] && bb[3] > ko[1]),
          `${id} meteor crosses the poem at frame ${f}`,
        );
        assert.ok(m.p >= 0 && m.p <= 1);
      }
      assert.deepEqual(
        ms,
        meteorsAt(cfg, 7, f / 30, W, H, ko),
        "same time → same meteors",
      );
    }
    if (!(cfg.meteors > 0)) assert.equal(frames, 0, `${id} has no meteors`);
    else
      assert.ok(
        frames > 0 && frames < 900 * 0.5,
        `${id}: occasional (${frames}/900 frames)`,
      );
  }
  const shower = resolveSky({ id: "meteor-shower" });
  assert.deepEqual(
    meteorsAt(shower, 7, 0, W, H, ko, true),
    meteorsAt(shower, 7, 99, W, H, ko, true),
  );
});

test("moon/sun placement: pushed clear of the poem area", () => {
  const ko = keepOut(RECT, W, H);
  const p = placeOutside(540, 700, 80, ko, W, H);
  assert.ok(p.cy + p.r <= ko[1] || p.cy - p.r >= ko[3], JSON.stringify(p));
  assert.deepEqual(
    placeOutside(540, 100, 40, ko, W, H),
    { cx: 540, cy: 100, r: 40 },
    "already clear: unchanged",
  );
});

test("paintSky: deterministic draw calls per timestamp; Static and reduce-motion freeze; still frame is fixed", () => {
  const draw = (c, t, o = {}) => {
    const { ctx, log } = recCtx();
    paintSky(ctx, c, W, H, t, { rect: RECT, ...o });
    return JSON.stringify(log);
  };
  for (const id of SKY_IDS) {
    const c = comp({ id });
    assert.equal(
      draw(c, 4321),
      draw(c, 4321),
      `${id}: same frame time → same drawing`,
    );
  }
  const aur = comp({ id: "aurora-veil" });
  assert.notEqual(
    draw(aur, 0),
    draw(aur, 9000),
    "aurora/stars animate over time",
  );
  const stat = comp({ id: "aurora-veil", motion: "static" });
  assert.equal(draw(stat, 0), draw(stat, 9000), "Static: nothing moves");
  const rm = comp({ id: "aurora-veil" }, { motion: { reduceMotion: true } });
  assert.equal(draw(rm, 0), draw(rm, 9000), "reduce motion: one still frame");
  assert.equal(
    draw(aur, 0, { still: true }),
    draw(aur, 9000, { still: true }),
    "still export frame ignores time",
  );
  assert.equal(skyFrozen(aur), false);
  assert.equal(skyFrozen(stat), true);
  const clouds = cloudField(resolveSky({ id: "cotton-cumulus" }), 7, W, H);
  assert.ok(
    clouds.length >= 3 && new Set(clouds.map((c) => c.layer)).size === 3,
    "3 cloud layers",
  );
});

test("readability: shade for light text on bright skies, none needed for white on deep night; advice is advisory", () => {
  const box = [RECT.x, RECT.y, RECT.x + RECT.w, RECT.y + RECT.h];
  assert.equal(
    skyScrim(comp({ id: "velvet-midnight" }), box, "#FFFFFF").alpha,
    0,
    "white on midnight reads as is",
  );
  for (const col of ["#FFFFFF", "#FFF8E7", "#C0C0C0", "#FFD27F", "#9FD3FF"])
    for (const id of SKY_IDS) {
      const s = skyScrim(comp({ id }), box, col);
      assert.ok(s.alpha >= 0 && s.alpha <= 0.9, `${id} ${col}`);
    }
  assert.ok(
    skyScrim(comp({ id: "clear-blue-day" }), box, "#FFFFFF").alpha > 0.2,
    "white on a bright day gets a shade",
  );
  assert.ok(
    skyTextAdvice({
      ...comp({ id: "velvet-midnight" }),
      style: { bg: {}, color: "#111111" },
    }),
    "dark text on night: advice",
  );
  assert.equal(
    skyTextAdvice({
      ...comp({ id: "velvet-midnight" }),
      style: { bg: {}, color: "#FFFFFF" },
    }),
    null,
  );
  // the contrast model (fxBases) uses the sky, not the hidden template gradient
  const c = {
    ...comp({ id: "violet-dream" }),
    style: {
      bg: { a: "#ffffff", b: "#ffffff" },
      color: "#ffffff",
      overlay: { opacity: 0 },
    },
  };
  assert.ok(fxBases(c).length >= 4 && skyBases(c).length >= 4);
  assert.ok(
    fxBases(c).every((b) => b.rgb[0] < 200),
    "dark sky bases, not the white template gradient",
  );
});

test("legacy compositions draw exactly as before (no sky → byte-identical call log)", () => {
  const sc = [
    {
      id: "s",
      kind: "stanza",
      lines: ["அன்பே சிவம்", "உள்ளம் சொல்லும்"],
      durationMs: 4000,
    },
  ];
  const c = normalizeComposition({
    ...defaultComposition({ scenes: sc }),
    scenes: sc,
  });
  const run = (cc) => {
    const { ctx, log } = recCtx();
    drawFrame(ctx, cc, 1500, { assets: {} });
    return log;
  };
  const a = run(c),
    b = run(normalizeComposition(JSON.parse(JSON.stringify(c))));
  assert.deepEqual(a, b);
  const withSky = run({
    ...c,
    material: {
      ...(c.material || { id: "none" }),
      sky: { id: "velvet-midnight" },
    },
  });
  assert.notDeepEqual(withSky, a, "a sky changes the background");
  const txt = (log) => log.filter((e) => e[0] === "fillText");
  assert.deepEqual(
    txt(withSky).length,
    txt(a).length,
    "the poem text is drawn the same number of times",
  );
});
