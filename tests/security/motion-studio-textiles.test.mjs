// Woven textiles (textiles.js): unique presets, deterministic and seamless tiles, whitelisted + clamped settings that
// round-trip through normalizeComposition, legacy projects untouched, a bounded cache, and a local scrim that always
// brings the poem text to >= 4.5:1 on the cloth. Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { drawFrame } from "../../src/lib/motion-studio/render.js";
import { FAMILIES } from "../../src/lib/motion-studio/templates.js";
import {
  normalizeMaterial,
  materialActive,
} from "../../src/lib/motion-studio/materials.js";
import { fxBases } from "../../src/lib/motion-studio/fx/palette.js";
import {
  TEXTILES,
  TEXTILE_IDS,
  TEXTILE_NONE,
  TEXTILE_SUGGESTIONS,
  TEXTILE_DEFAULTS,
  TEXTILE_CACHE,
  textileById,
  normalizeTextile,
  textileActive,
  textileLevel,
  textileThreads,
  textileDistress,
  textileTonal,
  textileData,
  textileCacheSize,
  clearTextileCache,
  textileScrim,
  textileContrast,
  textileOffset,
} from "../../src/lib/motion-studio/textiles.js";

const POEM = "மழை பெய்கிறது\nமனம் நனைகிறது\n\nஒரு விளக்கு மட்டும்\nவிழித்திருக்கும்";
function fixture(templateId, material) {
  const poem = parsePoemText(POEM, { title: "சோதனை" });
  const d = defaultComposition({
    format: "reel",
    templateId,
    scenes: generateScenes(poem, { title: "சோதனை" }),
  });
  return normalizeComposition({
    ...d,
    ...(material ? { material } : {}),
    poem: { title: "சோதனை", stanzas: poem.stanzas, source: poem.source },
  });
}
// a recording ctx: every call and property write, in order (enough for drawFrame's code paths in node)
function recCtx() {
  const ops = [];
  let px = 40,
    font = "40px x";
  const target = {
    get font() {
      return font;
    },
    set font(f) {
      font = f;
      px = Number(/([\d.]+)px/.exec(f)?.[1] || 40);
      ops.push(["font", f]);
    },
    measureText: (t) => ({ width: Array.from(String(t)).length * px * 0.55 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  const grad = { addColorStop: (...a) => ops.push(["stop", ...a]) };
  const ctx = new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "ops") return ops;
      if (typeof k !== "string") return undefined;
      return (...a) => {
        ops.push([k, ...a.map((v) => (typeof v === "object" ? "obj" : v))]);
        return /Gradient$/.test(k) ? grad : undefined;
      };
    },
    set(o, k, v) {
      if (k === "font") o.font = v;
      else ops.push(["set", k, typeof v === "object" ? "obj" : v]);
      return true;
    },
  });
  return ctx;
}
const trace = (comp, tMs = 1200) => {
  const c = recCtx();
  drawFrame(c, comp, tMs, {
    w: 1080,
    h: 1920,
    still: false,
    scene: comp.scenes[0],
    assets: {},
  });
  return JSON.stringify(c.ops);
};

test("presets: 8 textiles, unique ids and labels, hero first, valid palettes and suggestions", () => {
  assert.equal(TEXTILES.length, 8);
  assert.equal(TEXTILES[0].id, "dark-indigo-woven");
  assert.equal(new Set(TEXTILES.map((t) => t.id)).size, TEXTILES.length);
  assert.equal(new Set(TEXTILES.map((t) => t.label)).size, TEXTILES.length);
  assert.deepEqual(TEXTILE_IDS, [TEXTILE_NONE, ...TEXTILES.map((t) => t.id)]);
  for (const t of TEXTILES) {
    assert.ok(Object.isFrozen(t));
    for (const c of [...t.warp, ...t.weft, t.gap])
      assert.match(c, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(["subtle", "medium", "strong"].includes(t.level), t.id);
  }
  // the hero's palette is the brief's
  const hero = textileById("dark-indigo-woven");
  for (const c of ["#071B32", "#0B2C50", "#123A60", "#1C4569"])
    assert.ok([...hero.warp, ...hero.weft].includes(c), c);
  const famIds = FAMILIES.map((f) => f.id);
  for (const [fam, ids] of Object.entries(TEXTILE_SUGGESTIONS)) {
    assert.ok(famIds.includes(fam), fam);
    for (const id of ids) assert.ok(textileById(id), id);
  }
  assert.deepEqual(TEXTILE_SUGGESTIONS.midnight, [
    "dark-indigo-woven",
    "midnight-navy-linen",
    "charcoal-woven",
  ]);
  assert.equal(textileLevel("dark-indigo-woven", 0), "subtle");
  assert.equal(textileLevel("dark-indigo-woven", 1), "strong");
});

test("normalizeTextile / normalizeMaterial: whitelist, clamp, drop unknown, legacy objects gain no textile key", () => {
  assert.equal(normalizeTextile(null), null);
  assert.equal(normalizeTextile({ id: "none" }), null);
  assert.equal(normalizeTextile({ id: "evil<script>" }), null);
  const n = normalizeTextile({
    id: "indigo-denim-twill",
    strength: 9,
    scale: 0.01,
    opacity: 0,
    move: -1,
    fibre: 0.333,
    tint: "#ABCDEF",
    onload: "x",
    __proto__: { polluted: true },
  });
  assert.deepEqual(
    Object.keys(n).sort(),
    [...Object.keys(TEXTILE_DEFAULTS), "id", "tint"].sort(),
  );
  assert.equal(n.strength, 1);
  assert.equal(n.scale, 0.5);
  assert.equal(n.opacity, 0.2);
  assert.equal(n.move, 0);
  assert.equal(n.fibre, 0.33);
  assert.equal(n.tint, "#abcdef");
  assert.equal(
    normalizeTextile({ id: "natural-linen", tint: "red" }).tint,
    undefined,
  );
  assert.equal(
    normalizeTextile({ id: "natural-linen", strength: "NaN" }).strength,
    TEXTILE_DEFAULTS.strength,
  );
  assert.deepEqual(
    Object.keys(normalizeMaterial({ id: "paper", intensity: 0.5 })).sort(),
    ["id", "intensity", "reduce", "seed"],
  );
  assert.equal(
    normalizeMaterial({ id: "none", textile: { id: "bogus" } }).textile,
    undefined,
  );
  const m = normalizeMaterial({
    id: "none",
    textile: { id: "charcoal-woven" },
  });
  assert.deepEqual(m.textile, { id: "charcoal-woven", ...TEXTILE_DEFAULTS });
  assert.ok(materialActive({ material: m }));
});

test("save -> reopen: a textile composition round-trips through JSON + normalizeComposition unchanged", () => {
  const c = fixture("midnight", {
    id: "none",
    textile: {
      id: "dark-indigo-woven",
      strength: 0.6,
      scale: 1.25,
      tint: "#224466",
      move: 0.4,
    },
  });
  assert.ok(textileActive(c));
  const again = normalizeComposition(JSON.parse(JSON.stringify(c)));
  assert.equal(JSON.stringify(again), JSON.stringify(c));
  assert.equal(again.material.textile.scale, 1.25);
  assert.equal(again.material.textile.tint, "#224466");
});

test("legacy compositions are byte-identical: no textile key, and drawFrame output is unchanged by the textile code", () => {
  for (const f of FAMILIES) {
    const legacy = fixture(f.id);
    const bytes = JSON.stringify(legacy);
    assert.ok(!bytes.includes("textile"), f.id);
    assert.equal(JSON.stringify(normalizeComposition(JSON.parse(bytes))), bytes);
    // an unknown textile id normalizes away: same bytes and exactly the legacy frame (golden = the legacy trace)
    const junk = JSON.parse(bytes);
    if (junk.material) {
      junk.material.textile = { id: "not-a-textile", strength: 1 };
      const n = normalizeComposition(junk);
      assert.equal(JSON.stringify(n), bytes);
      assert.equal(trace(n), trace(legacy));
      assert.deepEqual(fxBases(n), fxBases(legacy));
    }
    // and drawFrame itself never draws a textile layer for a legacy comp (no pattern / scrim ops beyond the legacy set)
    assert.equal(trace(legacy), trace(JSON.parse(bytes)));
    assert.ok(!textileActive(legacy));
  }
});

test("tiles are deterministic (same bytes twice), seed-dependent, and have visible structure", () => {
  for (const t of TEXTILES) {
    const s = { id: t.id, ...TEXTILE_DEFAULTS };
    for (const gen of [textileThreads, textileDistress, textileTonal]) {
      const a = gen(s, 7),
        b = gen(s, 7),
        c = gen(s, 8);
      assert.equal(a.data.length, a.S * a.S * 4);
      assert.ok(
        Buffer.from(a.data.buffer).equals(Buffer.from(b.data.buffer)),
        `${t.id} ${gen.name} deterministic`,
      );
      if (gen === textileThreads)
        assert.ok(
          !Buffer.from(a.data.buffer).equals(Buffer.from(c.data.buffer)),
          `${t.id} seeded`,
        );
    }
    // threads tile is not flat: luminance spread across the tile
    const d = textileThreads(s, 1).data;
    let lo = 255,
      hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    assert.ok(hi - lo > 12, `${t.id} has thread structure (${lo}..${hi})`);
  }
});

test("tiles are seamless: the wrap step looks like an ordinary interior row / column step", () => {
  // mean abs RGB difference between neighbouring lines k and k+1 (k = S-1 is the wrap back to line 0)
  const steps = ({ S, data }, axis) => {
    const at = (x, y, ch) => data[(y * S + x) * 4 + ch];
    const out = [];
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S;
      let d = 0;
      for (let o = 0; o < S; o++)
        for (let ch = 0; ch < 3; ch++)
          d += axis === "x" ? Math.abs(at(k, o, ch) - at(k1, o, ch)) : Math.abs(at(o, k, ch) - at(o, k1, ch));
      out.push(d / (S * 3));
    }
    return out;
  };
  for (const t of TEXTILES) {
    const s = { id: t.id, ...TEXTILE_DEFAULTS };
    for (const gen of [textileThreads, textileDistress, textileTonal])
      for (const axis of ["x", "y"]) {
        const all = steps(gen(s, 3), axis),
          wrap = all.at(-1),
          inner = all.slice(0, -1).sort((a, b) => a - b),
          p98 = inner[Math.floor(inner.length * 0.98)];
        assert.ok(wrap <= p98 * 1.1 + 0.5, `${t.id} ${gen.name} ${axis}: wrap ${wrap.toFixed(2)} vs interior p98 ${p98.toFixed(2)}`);
      }
  }
});

test("the tile cache is bounded (LRU of TEXTILE_CACHE entries)", () => {
  clearTextileCache();
  for (const t of TEXTILES) textileData({ id: t.id, ...TEXTILE_DEFAULTS }, 1);
  assert.ok(TEXTILE_CACHE <= 3);
  assert.equal(textileCacheSize(), TEXTILE_CACHE);
  const k = textileData({ id: TEXTILES.at(-1).id, ...TEXTILE_DEFAULTS }, 1);
  assert.equal(
    textileData({ id: TEXTILES.at(-1).id, ...TEXTILE_DEFAULTS }, 1),
    k,
    "cache hit returns the same entry",
  );
  clearTextileCache();
  assert.equal(textileCacheSize(), 0);
});

test("movement is deterministic and stops for stills, reduce motion and Reduce effects", () => {
  const c = fixture("midnight", {
    id: "none",
    textile: { id: "dark-indigo-woven", move: 0.5 },
  });
  assert.deepEqual(
    textileOffset(c, 2000, false),
    textileOffset(c, 2000, false),
  );
  assert.notDeepEqual(textileOffset(c, 2000, false), [0, 0]);
  assert.deepEqual(textileOffset(c, 2000, true), [0, 0]);
  const r = { ...c, material: { ...c.material, reduce: true } };
  assert.deepEqual(textileOffset(r, 2000, false), [0, 0]);
  const still = fixture("midnight", {
    id: "none",
    textile: { id: "dark-indigo-woven" },
  });
  assert.deepEqual(textileOffset(still, 5000, false), [0, 0]);
});

test("readability: with the local scrim every textile x family reaches >= 4.5:1 under the text", () => {
  const box = [140, 760, 940, 1160];
  for (const f of FAMILIES)
    for (const t of TEXTILES) {
      const c = fixture(f.id, {
        id: "none",
        textile: { id: t.id, strength: 1, contrast: 1, distress: 1 },
      });
      const text = c.style.color;
      const s = textileScrim(c, box, text, { W: 1080, H: 1920 });
      assert.ok(
        s.alpha >= 0 && s.alpha <= 0.9,
        `${f.id}/${t.id} scrim alpha ${s.alpha}`,
      );
      const cr = textileContrast(c, box, text, {
        W: 1080,
        H: 1920,
        scrim: s.alpha,
      });
      assert.ok(
        cr >= 4.5,
        `${f.id}/${t.id}: ${cr.toFixed(2)}:1 after a ${s.alpha.toFixed(2)} scrim`,
      );
    }
});

test("fxBases is textile-aware (the cloth's own colours) and unchanged without a textile", () => {
  const plain = fixture("golden-hour");
  const linen = fixture("golden-hour", {
    id: "none",
    textile: { id: "natural-linen" },
  });
  assert.notDeepEqual(fxBases(linen), fxBases(plain));
  assert.ok(fxBases(linen).length >= fxBases(plain).length);
});
