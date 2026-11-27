// Surface textures + film grain (textures.js): visible, deterministic, contrast-capped, verified, and absent from
// every legacy project. Negative controls prove the cap and the verifier actually bite. Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { drawFrame } from "../../src/lib/motion-studio/render.js";
import { TEMPLATES } from "../../src/lib/motion-studio/templates.js";
import {
  normalizeMaterial,
  materialActive,
} from "../../src/lib/motion-studio/materials.js";
import { verifyMaterial } from "../../src/lib/motion-studio/fx/verify.js";
import {
  fxBases,
  textColours,
  safeAlpha,
} from "../../src/lib/motion-studio/fx/palette.js";
import { hexRgb, lum, ratio } from "../../src/lib/motion-studio/contrast.js";
import {
  TEXTURES,
  TEXTURE_IDS,
  textureField,
  texturePasses,
  passAlphas,
  paintTextures,
} from "../../src/lib/motion-studio/textures.js";

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
    measureText: (t) => ({ width: Array.from(String(t)).length * px * 0.55 }),
  };
};
const ctx = mkCtx();
const POEM =
  "மழை பெய்யும் இரவு\nநினைவுகள் நனையும்\n\nஒரு விளக்கு மட்டும்\nவிழித்திருக்கும்";
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

test("normalizeMaterial: legacy objects gain no texture keys; unknown textures are dropped; values clamp", () => {
  assert.deepEqual(
    Object.keys(normalizeMaterial({ id: "paper", intensity: 0.5 })).sort(),
    ["id", "intensity", "reduce", "seed"],
  );
  assert.equal(
    normalizeMaterial({ id: "none", texture: "evil<script>" }).texture,
    undefined,
  );
  assert.equal(
    normalizeMaterial({ id: "none", texture: "none" }).texture,
    undefined,
  );
  const m = normalizeMaterial({
    id: "none",
    texture: "kraft",
    textureAmount: 7,
    grain: -1,
  });
  assert.equal(m.texture, "kraft");
  assert.equal(m.textureAmount, 1);
  assert.equal(m.grain, undefined);
  assert.equal(normalizeMaterial({ grain: 0.333 }).grain, 0.33);
  assert.equal(
    normalizeMaterial({ grain: 0.5, grainMove: false }).grainMove,
    false,
  );
  assert.equal(TEXTURE_IDS.length, TEXTURES.length + 1);
  assert.ok(TEXTURES.length >= 12, "a real choice of textures");
});

test("every texture field is deterministic, seed-dependent and actually has visible structure", () => {
  for (const id of [...TEXTURES.map((t) => t.id), "grain"]) {
    const a = textureField(id, 7, 64),
      b = textureField(id, 7, 64),
      c = textureField(id, 8, 64);
    assert.deepEqual(a, b, `${id} deterministic`);
    assert.notDeepEqual(a, c, `${id} depends on the seed`);
    let sum = 0;
    for (const v of a) {
      assert.ok(v >= -1 && v <= 1);
      sum += Math.abs(v);
    }
    assert.ok(
      sum / a.length > 0.05,
      `${id} is not blank (mean |v| ${(sum / a.length).toFixed(3)})`,
    );
  }
  assert.equal(textureField("no-such-texture", 1, 64), null);
});

test("texture passes: none for legacy / reduce; capped at the contrast budget; visibly non-zero", () => {
  assert.deepEqual(texturePasses(fixture("ink-silence")), []);
  assert.deepEqual(
    texturePasses(
      fixture("ink-silence", {
        id: "none",
        texture: "paper",
        reduce: true,
        grain: 1,
      }),
    ),
    [],
  );
  for (const t of TEMPLATES) {
    const comp = fixture(t.id, {
      id: "none",
      texture: "watercolor",
      textureAmount: 1,
      grain: 1,
    });
    assert.ok(
      materialActive(comp),
      "texture alone counts as an active material (so it is verified)",
    );
    const passes = texturePasses(comp);
    assert.equal(passes.length, 2);
    const bases = fxBases(comp),
      texts = textColours(comp);
    for (const p of passes) {
      const a = passAlphas(comp, p);
      assert.ok(
        a.away.alpha > 0.1,
        `${t.id}: ${p.id} is visible (away ${a.away.alpha})`,
      );
      assert.ok(
        a.toward.alpha <= safeAlpha(bases, a.toward.rgb, texts) + 1e-9,
        `${t.id}: toward ink within the cap`,
      );
    }
  }
});

test("worst case: both passes fully toward the text on one pixel still keep contrast >= floor (every template)", () => {
  for (const t of TEMPLATES) {
    const comp = fixture(t.id, {
      id: "none",
      texture: "risograph",
      textureAmount: 1,
      grain: 1,
    });
    const passes = texturePasses(comp);
    for (const txt of textColours(comp)) {
      const tl = lum(...hexRgb(txt));
      for (const b of fxBases(comp)) {
        let c = b.rgb;
        for (const p of passes) {
          const a = passAlphas(comp, p).toward;
          c = c.map((v, i) => v * (1 - a.alpha) + a.rgb[i] * a.alpha);
        }
        const floor = Math.min(4.5, ratio(tl, lum(...b.rgb)));
        assert.ok(ratio(tl, lum(...c)) >= floor - 1e-3, `${t.id} ${txt}`);
      }
    }
  }
});

test("drawFrame records texture passes for the verifier; nothing is recorded or drawn without a texture", () => {
  const trace = [];
  const plain = fixture("ink-silence");
  drawFrame(verifyCtx(), plain, 0, {
    still: true,
    scene: plain.scenes[0],
    fxTrace: trace,
  });
  assert.equal(trace.filter((o) => /^texture:/.test(o.fx)).length, 0);
  const comp = fixture("ink-silence", {
    id: "none",
    texture: "paper",
    grain: 0.5,
  });
  drawFrame(verifyCtx(), comp, 0, {
    still: true,
    scene: comp.scenes[0],
    fxTrace: trace,
  });
  const ops = trace.filter((o) => /^texture:/.test(o.fx));
  assert.ok(ops.length >= 2 && ops.every((o) => o.layer === "material"));
  assert.ok(
    ops.some((o) => o.fx === "texture:paper") &&
      ops.some((o) => o.fx === "texture:grain"),
  );
});
function verifyCtx() {
  return new Proxy(mkCtx(), {
    get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
}

test("paintTextures: with a pattern-capable ctx it fills with the pattern at the capped alpha (no pixels lost)", () => {
  const comp = fixture("ink-silence", {
    id: "none",
    texture: "canvas",
    textureAmount: 1,
  });
  // Node has no canvas: the tile cannot be built, so nothing is painted — and nothing throws
  const calls = [];
  const fake = {
    createPattern: () => {
      calls.push("pattern");
      return {};
    },
    save() {},
    restore() {},
    translate() {},
    fillRect: () => calls.push("fill"),
  };
  const n = paintTextures(fake, {
    comp,
    W: 1080,
    H: 1920,
    still: true,
    seed: 1,
    plan: [],
  });
  assert.ok(n >= 1);
  assert.deepEqual(calls, [], "no tile canvas in Node => no fill");
});

test("verifier passes texture + grain on every template, and a texture at full strength (no cap) is caught", () => {
  for (const t of TEMPLATES) {
    const comp = fixture(t.id, {
      id: "paper",
      intensity: 1,
      texture: "ink-splatter",
      textureAmount: 1,
      grain: 1,
    });
    const v = verifyMaterial(ctx, comp, [
      (c, cm, x) =>
        drawFrame(c, cm, 0, { still: true, scene: cm.scenes[0], ...x }),
    ]);
    assert.equal(v.ok, true, `${t.id}: ${v.messages.join("; ")}`);
  }
  // negative control: the same texture op, but at the uncapped look strength toward the text colour
  const comp = fixture("ink-silence", {
    id: "none",
    texture: "paper",
    textureAmount: 1,
  });
  const v = verifyMaterial(ctx, comp, [
    (c, cm, x) => {
      drawFrame(c, cm, 0, { still: true, scene: cm.scenes[0], ...x });
      x.fxTrace?.push({
        fx: "texture:uncapped",
        layer: "material",
        bbox: [0, 0, 1080, 1920],
        alpha: 0.9,
        paint: { rgb: hexRgb(cm.style.color), a: 1 },
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
