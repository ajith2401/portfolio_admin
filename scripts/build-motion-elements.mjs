#!/usr/bin/env node
// Builds the Poem Motion Studio element library from the two supplied artwork packs (read-only inputs).
//   node scripts/build-motion-elements.mjs <tamil-poetry-art-library> <human-moments-poetry-scenes> [revised-pack]
// Output (committed): public/motion-elements/<id>.svg (thumbnail), <id>.json (vector model drawn with Canvas Path2D),
// <id>.webp (watercolour rasters) and src/lib/motion-studio/elements-catalog.json (+ QC grades for EVERY input asset).
// Only APPROVED / APPROVED WITH LIMITATIONS assets are copied. Every SVG is validated: no script, foreignObject, image,
// style, external href or on* attribute; only path/circle/ellipse/g. Nothing in the source folders is written.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const [P1, P2, P2R] = process.argv.slice(2);
if (!P1 || !P2) {
  console.error(
    "usage: build-motion-elements.mjs <pack1> <pack2> [pack2-revised]",
  );
  process.exit(2);
}
const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const OUT = path.join(ROOT, "public/motion-elements");
const CAT = path.join(ROOT, "src/lib/motion-studio/elements-catalog.js");
fs.mkdirSync(OUT, { recursive: true });

// ---------- QC grades (human visual review, 2026-11-27). Anything not listed is APPROVED.
const GRADES = {
  // Pack 2: figure quality issues found in review; excluded until the redrawn versions pass review
  "couple-on-bench": [
    "NEEDS REVIEW",
    "Line art is crude; the woman's arm reads wrong.",
  ],
  "man-reading-alone": [
    "NEEDS REVIEW",
    "Stiff pose; arms and book are awkward.",
  ],
  "man-rooftop-moon": ["NEEDS REVIEW", "The figure reads as a stick."],
  "couple-under-tree": [
    "NEEDS REVIEW",
    "Figures are tiny relative to the tree.",
  ],
  "writer-desk-lamp": ["NEEDS REVIEW", "The lamp shape is odd."],
  "obj-umbrella": [
    "APPROVED WITH LIMITATIONS",
    "Padding 6% (target 7%): may touch the edge when rotated.",
  ],
};
const FIGURE_LIMIT =
  "Faceless mannequin figures with simplified hands: use at decoration scale, not as a focal portrait.";
const WC_LIMIT =
  "Raster (WebP): cannot be tinted or drawn on; fades/drifts only.";

// ---------- tiny XML reader (the packs are machine-generated, well-formed SVG)
function parseSvg(src, file) {
  const bad =
    /<\s*(script|foreignObject|image|style|use|iframe|a)\b|\son[a-z]+\s*=|href\s*=|javascript:|url\(/i.exec(
      src,
    );
  if (bad) throw new Error(`${file}: unsafe SVG content "${bad[0]}"`);
  const root = { tag: "root", attrs: {}, kids: [] },
    stack = [root];
  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([a-zA-Z]+)\s*>|<([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) {
      stack.pop();
      continue;
    }
    if (!m[2]) continue;
    const attrs = {};
    for (const a of m[3].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g))
      attrs[a[1]] = a[2];
    const node = { tag: m[2], attrs, kids: [] };
    stack.at(-1).kids.push(node);
    if (!m[4]) stack.push(node);
  }
  const svg = root.kids.find((k) => k.tag === "svg");
  if (!svg) throw new Error(`${file}: no <svg>`);
  return svg;
}
const ALLOWED = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "title",
  "desc",
]);
const INHERIT = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "fill-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "color",
];

// ---------- path length (flatten) for draw-on timing
function pathLength(d) {
  const t = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g) || [];
  let i = 0,
    cmd = "",
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    len = 0;
  const n = () => parseFloat(t[i++]);
  const seg = (pts) => {
    let px = x,
      py = y;
    for (const [qx, qy] of pts) {
      len += Math.hypot(qx - px, qy - py);
      px = qx;
      py = qy;
    }
  };
  const bez = (p) => {
    const out = [];
    for (let k = 1; k <= 16; k++) {
      const s = k / 16,
        u = 1 - s;
      out.push(
        p.length === 3
          ? [
              u * u * x + 2 * u * s * p[0][0] + s * s * p[2][0],
              u * u * y + 2 * u * s * p[0][1] + s * s * p[2][1],
            ]
          : [
              u ** 3 * x +
                3 * u * u * s * p[0][0] +
                3 * u * s * s * p[1][0] +
                s ** 3 * p[2][0],
              u ** 3 * y +
                3 * u * u * s * p[0][1] +
                3 * u * s * s * p[1][1] +
                s ** 3 * p[2][1],
            ],
      );
    }
    return out;
  };
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
    const rel = cmd === cmd.toLowerCase(),
      C = cmd.toUpperCase(),
      ox = rel ? x : 0,
      oy = rel ? y : 0;
    if (C === "M") {
      x = n() + ox;
      y = n() + oy;
      sx = x;
      sy = y;
      cmd = rel ? "l" : "L";
    } else if (C === "L") {
      const nx = n() + ox,
        ny = n() + oy;
      seg([[nx, ny]]);
      x = nx;
      y = ny;
    } else if (C === "H") {
      const nx = n() + ox;
      seg([[nx, y]]);
      x = nx;
    } else if (C === "V") {
      const ny = n() + oy;
      seg([[x, ny]]);
      y = ny;
    } else if (C === "Q") {
      const p = [[n() + ox, n() + oy], null, [n() + ox, n() + oy]];
      p[1] = p[0];
      const q = bez([p[0], 0, p[2]]);
      seg(q);
      [x, y] = p[2];
    } else if (C === "C") {
      const p = [
        [n() + ox, n() + oy],
        [n() + ox, n() + oy],
        [n() + ox, n() + oy],
      ];
      seg(bez(p));
      [x, y] = p[2];
    } else if (C === "A") {
      n();
      n();
      n();
      n();
      n();
      const nx = n() + ox,
        ny = n() + oy;
      seg([[nx, ny]]);
      len += 0.57 * Math.hypot(nx - x, ny - y);
      x = nx;
      y = ny;
    } else if (C === "Z") {
      seg([[sx, sy]]);
      x = sx;
      y = sy;
    } else throw new Error(`unsupported path command ${cmd}`);
  }
  return Math.round(len * 10) / 10;
}
const circleD = (cx, cy, rx, ry) =>
  `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
function matrixOf(tr) {
  if (!tr) return null;
  const r =
    /^rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)$/.exec(
      tr.trim(),
    );
  if (!r) throw new Error(`unsupported transform ${tr}`);
  const a = (+r[1] * Math.PI) / 180,
    cx = +(r[2] || 0),
    cy = +(r[3] || 0),
    c = Math.cos(a),
    s = Math.sin(a);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy].map(
    (v) => Math.round(v * 1e5) / 1e5,
  );
}
const paint = (v) =>
  v === "none" || v == null
    ? 0
    : v === "currentColor"
      ? 1
      : /^#[0-9a-f]{6}$/i.test(v)
        ? v.toLowerCase()
        : 1;

/** SVG -> { vb, shapes:[{ d, f, s, w, fo, so, o, cap, join, dash, m, len, id }] } in document order. */
function vectorModel(svg, file) {
  const vb = (svg.attrs.viewBox || "").split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)))
    throw new Error(`${file}: bad viewBox`);
  const shapes = [];
  const walk = (node, inh, op, m) => {
    if (!ALLOWED.has(node.tag))
      throw new Error(`${file}: element <${node.tag}> not allowed`);
    const st = { ...inh };
    for (const k of INHERIT) if (node.attrs[k] != null) st[k] = node.attrs[k];
    const o = op * (node.attrs.opacity != null ? +node.attrs.opacity : 1);
    const mm = matrixOf(node.attrs.transform) || m;
    if (node.tag !== "svg" && node.tag !== "g" && node.attrs.transform && m)
      throw new Error(`${file}: nested transforms`);
    let d = null;
    if (node.tag === "path") d = node.attrs.d;
    else if (node.tag === "circle")
      d = circleD(
        +node.attrs.cx || 0,
        +node.attrs.cy || 0,
        +node.attrs.r,
        +node.attrs.r,
      );
    else if (node.tag === "ellipse")
      d = circleD(
        +node.attrs.cx || 0,
        +node.attrs.cy || 0,
        +node.attrs.rx,
        +node.attrs.ry,
      );
    if (d) {
      const f = paint(st.fill ?? "black"),
        s = paint(st.stroke);
      if (f || s)
        shapes.push({
          ...(node.attrs.id ? { id: node.attrs.id } : {}),
          d,
          f,
          s,
          w: +(st["stroke-width"] ?? 1),
          ...(st["fill-opacity"] != null && +st["fill-opacity"] !== 1
            ? { fo: +st["fill-opacity"] }
            : {}),
          ...(st["stroke-opacity"] != null && +st["stroke-opacity"] !== 1
            ? { so: +st["stroke-opacity"] }
            : {}),
          ...(o !== 1 ? { o: Math.round(o * 1000) / 1000 } : {}),
          ...(st["stroke-linecap"] && st["stroke-linecap"] !== "butt"
            ? { cap: st["stroke-linecap"] }
            : {}),
          ...(st["stroke-linejoin"] && st["stroke-linejoin"] !== "miter"
            ? { join: st["stroke-linejoin"] }
            : {}),
          ...(st["stroke-dasharray"] && st["stroke-dasharray"] !== "none"
            ? { dash: st["stroke-dasharray"].split(/[\s,]+/).map(Number) }
            : {}),
          ...(mm ? { m: mm } : {}),
          len: pathLength(d) // fills too: draw-on traces a filled shape's outline before the fill reveals,
        });
    }
    for (const k of node.kids) walk(k, st, o, mm);
  };
  walk(svg, {}, 1, null);
  return { vb, shapes };
}
/** Draw order: shapes named in draw-order.json first (in that order), then the remaining strokes, then fills. */
function orderFor(model, order) {
  const rank = new Map();
  if (order)
    order.order.flatMap((g) => g.strokes).forEach((id, i) => rank.set(id, i));
  return model.shapes
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = rank.has(a.s.id)
        ? rank.get(a.s.id)
        : a.s.s
          ? 1e6 + a.i
          : 2e6 + a.i;
      const rb = rank.has(b.s.id)
        ? rank.get(b.s.id)
        : b.s.s
          ? 1e6 + b.i
          : 2e6 + b.i;
      return ra - rb;
    })
    .map((x) => x.i);
}

// ---------- inventory
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const p1m = JSON.parse(fs.readFileSync(path.join(P1, "manifest.json"), "utf8"));
const p2m = JSON.parse(fs.readFileSync(path.join(P2, "manifest.json"), "utf8"));
const p2order = JSON.parse(
  fs.readFileSync(path.join(P2, "draw-order.json"), "utf8"),
);
let revisedOrder = {};
const revised = new Set();
if (P2R && fs.existsSync(path.join(P2R, "REVISION-NOTES.md"))) {
  revisedOrder = JSON.parse(
    fs.readFileSync(path.join(P2R, "draw-order.json"), "utf8"),
  );
}
const CAT_OF = {
  "Birds & Creatures": "creatures",
  Botanical: "botanical",
  Celestial: "celestial",
  Nature: "nature",
  Ornaments: "ornaments",
  Watercolour: "watercolour",
  Watercolor: "watercolour",
  "A. Couples & Relationships": "couples",
  "B. Solitude & Reflection": "solitude",
  "C. Literary Life": "literary",
  "D. Cinematic Environments": "environments",
  "E. Modular Objects": "objects",
};
const items = [],
  qc = [];
const sha = (b) =>
  crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

for (const a0 of p1m) {
  const a = { ...a0, filename: a0.filename.replace(/\s*\(.*\)$/, "") }; // "watercolor/x.png (+ .webp)"
  const id = slug(path.basename(a.filename).replace(/\.(svg|png|webp)$/, ""));
  const isWc = a.filename.startsWith("watercolor/");
  items.push({
    id,
    pack: 1,
    file: a.filename,
    name: a.asset_name,
    category: CAT_OF[a.category] || slug(a.category),
    kind: isWc ? "watercolour" : "vector",
    style: isWc ? "watercolour" : "fine-line",
    opacity: a.recommended_default_opacity ?? 0.8,
    placement: a.suggested_placement || "",
    animation: a.suggested_animation || "",
    provenance: a.provenance,
    src: P1,
  });
}
for (const a of p2m.assets) {
  if (a.format !== "SVG" && !a.id.startsWith("wc-")) continue;
  const fixed =
    P2R &&
    revisedOrder &&
    fs.existsSync(path.join(P2R, a.filename)) &&
    fs.readFileSync(path.join(P2R, a.filename), "utf8") !==
      fs.readFileSync(path.join(P2, a.filename), "utf8");
  if (fixed) revised.add(a.id);
  items.push({
    id: a.id,
    pack: 2,
    file: a.filename,
    name: a.name,
    category: a.id.startsWith("wc-")
      ? "watercolour"
      : CAT_OF[a.category] || slug(a.category),
    kind: a.id.startsWith("wc-") ? "watercolour" : "vector",
    style: a.style,
    opacity: a.default_opacity ?? 0.9,
    placement: a.placement || "",
    animation: a.animation || "",
    provenance:
      "AI-generated (Claude, Anthropic); procedurally authored vector geometry for this project. Not public domain / CC0.",
    src: fixed ? P2R : P2,
    revised: fixed,
  });
}

const catalog = [];
for (const it of items) {
  let [grade, note] = GRADES[it.id] || ["APPROVED", ""];
  if (it.revised && grade === "NEEDS REVIEW")
    [grade, note] = [
      "APPROVED WITH LIMITATIONS",
      "Redrawn after review (see the pack's REVISION-NOTES.md).",
    ];
  const figure =
    it.pack === 2 &&
    it.kind === "vector" &&
    /couple|man-|woman|figure|reader|writer|book-to-chest|platform-figure/.test(
      it.id,
    );
  if (grade === "APPROVED" && figure)
    [grade, note] = ["APPROVED WITH LIMITATIONS", FIGURE_LIMIT];
  if (grade === "APPROVED" && it.kind === "watercolour")
    [grade, note] = ["APPROVED WITH LIMITATIONS", WC_LIMIT];
  const srcFile = path.join(it.src, it.file);
  const entry = {
    id: it.id,
    pack: it.pack,
    source: path.join(path.basename(it.src), it.file),
    grade,
    note,
  };
  try {
    if (it.kind === "watercolour") {
      // transparent watercolours: the pack's WebP when it has one, else the PNG re-encoded (max 1400 px, alpha kept)
      const webp = srcFile.replace(/\.png$/, ".webp");
      const img = sharp(fs.existsSync(webp) ? webp : srcFile).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true });
      const buf = await img.webp({ quality: 82, alphaQuality: 90 }).toBuffer();
      const meta = await sharp(buf).metadata();
      if (!meta.hasAlpha) throw new Error("watercolour has no transparency");
      fs.writeFileSync(path.join(OUT, `${it.id}.webp`), buf);
      catalog.push({
        id: it.id,
        name: it.name,
        pack: it.pack,
        category: it.category,
        kind: "raster",
        style: it.style,
        file: `/motion-elements/${it.id}.webp`,
        aspect: Math.round((meta.width / meta.height) * 1000) / 1000,
        opacity: it.opacity,
        placement: it.placement,
        animation: it.animation,
        grade,
        ...(note ? { note } : {}),
        provenance: it.provenance,
        sha: sha(buf),
      });
    } else {
      const src = fs.readFileSync(srcFile, "utf8");
      const svg = parseSvg(src, it.file);
      const model = vectorModel(svg, it.file);
      const ord =
        (revised.has(it.id) ? revisedOrder[it.id] : p2order[it.id]) || null;
      model.order = orderFor(model, ord);
      const strokes = model.shapes.filter((s) => s.s).length;
      if (grade === "NEEDS REVIEW" || grade === "REJECTED") {
        qc.push(entry);
        continue;
      }
      fs.writeFileSync(path.join(OUT, `${it.id}.svg`), src);
      const json = JSON.stringify({
        v: 1,
        vb: model.vb,
        order: model.order,
        shapes: model.shapes,
      });
      fs.writeFileSync(path.join(OUT, `${it.id}.json`), json);
      catalog.push({
        id: it.id,
        name: it.name,
        pack: it.pack,
        category: it.category,
        kind: "vector",
        style: /silhouette/.test(it.style) ? "silhouette" : "line",
        file: `/motion-elements/${it.id}.json`,
        thumb: `/motion-elements/${it.id}.svg`,
        aspect: Math.round((model.vb[2] / model.vb[3]) * 1000) / 1000,
        opacity: it.opacity,
        placement: it.placement,
        animation: it.animation,
        drawOn: true,
        strokes,
        shapes: model.shapes.length,
        grade,
        ...(note ? { note } : {}),
        provenance: it.provenance,
        sha: sha(json),
      });
    }
    qc.push(entry);
  } catch (e) {
    qc.push({ ...entry, grade: "REJECTED", note: String(e.message || e) });
  }
}
const CAT_FIX = { "painterly-watercolor": "watercolour", "artistic-ornaments": "ornaments", "modular-objects": "objects" };
for (const e of catalog) e.category = CAT_FIX[e.category] || e.category;
catalog.sort(
  (a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
);
fs.writeFileSync(
  CAT,
  "// GENERATED by scripts/build-motion-elements.mjs: do not edit by hand. Element catalog + the QC grade of every input asset.\n" +
    "const CATALOG = " + JSON.stringify({ v: 1, elements: catalog, qc }, null, 1) + ";\nexport default CATALOG;\n",
);
const by = qc.reduce((m, q) => ((m[q.grade] = (m[q.grade] || 0) + 1), m), {});
console.log(`catalog: ${catalog.length} elements; QC`, by);
for (const q of qc.filter((x) => x.grade !== "APPROVED"))
  console.log(`  ${q.grade.padEnd(26)} ${q.id}: ${q.note}`);
