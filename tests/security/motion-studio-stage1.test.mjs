// Stage 1 correctness: source preservation (WP1), scene stanza metadata (WP2), font readiness (WP3), strict
// source-/bounds-aware coverage with the ten negative controls (WP4). Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePoemText,
  poemToText,
  importPoemFile,
  MAX_POEM_CHARS,
  LIMITS,
} from "../../src/lib/motion-studio/poem-input.js";
import {
  defaultComposition,
  normalizeComposition,
  normalizePoemSnapshot,
} from "../../src/lib/motion-studio/composition.js";
import {
  generateScenes,
  attachStanzaMeta,
} from "../../src/lib/motion-studio/scenes.js";
import {
  splitScene,
  mergeNext,
  moveScene,
  moveLine,
  duplicateScene,
  removeScene,
} from "../../src/lib/motion-studio/scene-edit.js";
import {
  wrapSpans,
  wrapLine,
  renderText,
  lineIndent,
} from "../../src/lib/motion-studio/graphemes.js";
import {
  layoutFullPoem,
  validateFullPoem,
  fullPoemCoverage,
} from "../../src/lib/motion-studio/full-poem.js";
import {
  layoutScene,
  validateScene,
  validateScenes,
  posterCards,
} from "../../src/lib/motion-studio/render.js";
import { safeRect, FORMATS } from "../../src/lib/motion-studio/safe-zone.js";
import {
  ensureFonts,
  requiredFaces,
  FontReadinessError,
} from "../../src/lib/motion-studio/font-ready.js";

// measuring stub: every code point is `k` em wide
const mkCtx = (k = 0.55) => {
  let px = 40;
  return {
    set font(f) {
      px = Number(/(\d+)px/.exec(f)[1]);
    },
    get font() {
      return `${px}px x`;
    },
    measureText: (t) => ({ width: Array.from(t).length * px * k }),
  };
};
const ctx = mkCtx();
const comp = (over = {}) =>
  normalizeComposition({ ...defaultComposition({ format: "reel" }), ...over });

const TAMIL = ["அன்பே சிவம்", "தமிழ் என்றும் வாழ்க", "கொடிய வெயில் காய்ந்தாலும்"];

// ---------------------------------------------------------------- WP1: source preservation
test("WP1 source round trip is byte exact for blank lines, indentation, tabs, NBSP and trailing whitespace", () => {
  const src = "  அன்பு \n\tஇரண்டாம் வரி \n\n\n\nமூன்று நான்கு   \n   \n\nஐந்து\n";
  const p = parsePoemText(src);
  assert.equal(p.source, src);
  assert.equal(poemToText(p), src);
  assert.deepEqual(p.stanzas, [
    ["  அன்பு ", "\tஇரண்டாம் வரி "],
    ["மூன்று நான்கு   "],
    ["ஐந்து"],
  ]);
  assert.deepEqual(p.blank, [0, 3, 2]); // whitespace-only line counts as blank
  assert.equal(p.ok, true);
});
test("WP1 multiple blank lines are counted, leading and trailing blanks too", () => {
  const p = parsePoemText("\n\nஅ\n\n\n\nஆ\n\n\n");
  assert.deepEqual(p.blank, [2, 3]);
  assert.equal(p.trailingBlank, 2);
  assert.equal(poemToText(p), "\n\nஅ\n\n\n\nஆ\n\n\n");
});
test("WP1 only newline conventions are normalised; NFC/NFD and ZWJ/ZWNJ are untouched", () => {
  const nfc = "கொ",
    nfd = "கொ".normalize("NFD");
  assert.notEqual(nfc, nfd);
  const src = `${nfc}\r\n${nfd}\r\nஶ்ரீ‍x‌y`;
  const p = parsePoemText(src);
  assert.equal(p.source, src.replace(/\r\n/g, "\n"));
  assert.equal(p.stanzas[0][0], nfc);
  assert.equal(p.stanzas[0][1], nfd);
  assert.equal(p.stanzas[0][2], "ஶ்ரீ‍x‌y");
});
test("WP1 over-limit paste is an error, never a truncated copy", () => {
  const src = "அ".repeat(10) + "\n" + "ஆ\n".repeat(MAX_POEM_CHARS);
  const p = parsePoemText(src);
  assert.equal(p.ok, false);
  assert.ok(p.issues.some((i) => i.code === "too-long"));
  assert.equal(p.source.length, src.length); // nothing sliced
  assert.equal(p.truncated, false);
  assert.equal(p.lineCount, 1 + MAX_POEM_CHARS);
});
test("WP1 line / stanza / stanza-count limits report errors with line numbers instead of cutting", () => {
  const long = parsePoemText("ok\n" + "அ".repeat(LIMITS.lineChars + 1));
  assert.deepEqual(
    long.issues.map((i) => [i.code, i.line]),
    [["line-too-long", 2]],
  );
  const tall = parsePoemText(
    Array.from({ length: LIMITS.stanzaLines + 1 }, (_, i) => `வரி ${i}`).join(
      "\n",
    ),
  );
  assert.ok(tall.issues.some((i) => i.code === "stanza-too-long"));
  const many = parsePoemText(
    Array.from({ length: LIMITS.stanzas + 1 }, (_, i) => `வ${i}`).join("\n\n"),
  );
  assert.ok(many.issues.some((i) => i.code === "too-many-stanzas"));
  assert.equal(many.stanzas.length, LIMITS.stanzas + 1);
});
test("WP1 over-limit import keeps the whole text and reports the error", async () => {
  const text = "அ\n".repeat(40000); // 80,000 chars, under 512 KB
  const file = {
    name: "big.txt",
    size: text.length * 3,
    type: "text/plain",
    text: async () => text,
  };
  const r = await importPoemFile(file);
  assert.equal(r.ok, false);
  assert.equal(r.source, text);
  const huge = {
    name: "x.txt",
    size: 600 * 1024,
    type: "text/plain",
    text: async () => "x",
  };
  await assert.rejects(() => importPoemFile(huge), /512 KB/);
});
test("WP1 the snapshot keeps source+blank, legacy snapshots open untouched, a stale source is dropped", () => {
  const p = parsePoemText("  அ\n\n\nஆ\n");
  const snap = normalizePoemSnapshot({
    title: "t",
    stanzas: p.stanzas,
    source: p.source,
    blank: p.blank,
  });
  assert.equal(snap.source, p.source);
  assert.deepEqual(snap.blank, [0, 2]);
  assert.equal(poemToText(snap), p.source);
  const legacy = normalizePoemSnapshot({ title: "t", stanzas: [["அ"], ["ஆ"]] });
  assert.equal(legacy.source, undefined);
  assert.equal(poemToText(legacy), "அ\n\nஆ");
  const stale = normalizePoemSnapshot({
    title: "t",
    stanzas: [["அ"]],
    source: "வேறு",
  });
  assert.equal(stale.source, undefined);
  // survives a full composition round trip
  const c = normalizeComposition(
    JSON.parse(
      JSON.stringify(
        normalizeComposition({ ...defaultComposition({}), poem: snap }),
      ),
    ),
  );
  assert.equal(c.poem.source, p.source);
});
test("WP1 a partial poem is never reported as complete", () => {
  const poem = parsePoemText(TAMIL.join("\n"));
  const lay = layoutFullPoem(ctx, comp(), poem);
  assert.equal(validateFullPoem(poem, lay).ok, true);
  const partial = validateFullPoem({ ...poem, partial: true }, lay);
  assert.equal(partial.ok, false);
  assert.equal(partial.partial, true);
  const tooLong = parsePoemText(
    TAMIL.map((l) => (l + "\n").repeat(400)).join("\n\n"),
    {},
  );
  const lay2 = layoutFullPoem(ctx, comp(), tooLong);
  if (!lay2.fits) assert.equal(validateFullPoem(tooLong, lay2).ok, false);
});

// ---------------------------------------------------------------- WP2: stanza metadata
const longStanza = Array.from({ length: 9 }, (_, i) => `நீண்ட பத்தி வரி ${i + 1}`);
test("WP2 generateScenes records stanza / part / parts", () => {
  const sc = generateScenes(
    { stanzas: [longStanza, ["இரண்டாம் பத்தி"]] },
    { includeTitle: false },
  );
  assert.ok(sc.length > 2);
  const s0 = sc.filter((s) => s.stanza === 0);
  assert.deepEqual(
    s0.map((s) => s.part),
    s0.map((_, i) => i),
  );
  assert.ok(s0.every((s) => s.parts === s0.length));
  assert.equal(sc.at(-1).stanza, 1);
});
test("WP2 a Feed Poster adds no false gap inside a split stanza but keeps genuine stanza boundaries", () => {
  const c = comp({
    scenes: generateScenes(
      { stanzas: [longStanza, ["இரண்டாம் பத்தி"]] },
      { includeTitle: false },
    ),
  });
  const cc = normalizeComposition({
    ...c,
    poster: { ...c.poster, mode: "single" },
  });
  const { cards } = posterCards(ctx, cc);
  const lines = cards.flatMap((x) => x.lines);
  const gaps = lines.filter((l) => l === "").length;
  assert.equal(gaps, 1, "exactly one gap: the real stanza boundary");
  const firstGap = lines.indexOf("");
  assert.deepEqual(lines.slice(0, firstGap), longStanza);
});
test("WP2 two separate stanzas keep their gap; legacy scenes (no metadata) keep the old behaviour", () => {
  const s2 = generateScenes(
    { stanzas: [["அ"], ["ஆ"]] },
    { includeTitle: false },
  );
  const cc = normalizeComposition({
    ...comp({ scenes: s2 }),
    poster: { mode: "single", sceneIds: [] },
  });
  assert.deepEqual(
    posterCards(ctx, cc).cards.flatMap((x) => x.lines),
    ["அ", "", "ஆ"],
  );
  const legacy = s2.map(({ stanza, part, parts, ...r }) => r); // eslint-disable-line no-unused-vars
  const lc = { ...cc, scenes: legacy };
  assert.deepEqual(
    posterCards(ctx, lc).cards.flatMap((x) => x.lines),
    ["அ", "", "ஆ"],
  );
});
test("WP2 legacy scenes are reconstructed only when the source reliably matches", () => {
  const poem = { stanzas: [longStanza, ["இரண்டாம் பத்தி"]] };
  const gen = generateScenes(poem, { includeTitle: false });
  const legacy = gen.map(({ stanza, part, parts, ...r }) => r); // eslint-disable-line no-unused-vars
  const re = attachStanzaMeta(legacy, poem);
  assert.deepEqual(
    re.map((s) => [s.stanza, s.part, s.parts]),
    gen.map((s) => [s.stanza, s.part, s.parts]),
  );
  const edited = legacy.map((s, i) =>
    i === 0 ? { ...s, lines: ["மாற்றம்", ...s.lines.slice(1)] } : s,
  );
  assert.equal(
    attachStanzaMeta(edited, poem),
    edited,
    "edited scenes are never guessed at",
  );
  const straddle = [
    { ...legacy[0], lines: [...legacy[0].lines, "இரண்டாம் பத்தி"] },
  ];
  assert.equal(attachStanzaMeta(straddle, poem), straddle);
});
test("WP2 metadata survives normalizeComposition; invalid metadata is dropped", () => {
  const sc = generateScenes({ stanzas: [longStanza] }, { includeTitle: false });
  const c = normalizeComposition({ ...defaultComposition({}), scenes: sc });
  assert.deepEqual(
    c.scenes.map((s) => s.part),
    sc.map((s) => s.part),
  );
  const bad = normalizeComposition({
    ...defaultComposition({}),
    scenes: [{ lines: ["அ"], stanza: -1, part: 5, parts: 2 }],
  });
  assert.equal(bad.scenes[0].stanza, undefined);
});
test("WP2 scene editing keeps or drops metadata honestly", () => {
  const sc = generateScenes(
    { stanzas: [longStanza, ["ஆ"]] },
    { includeTitle: false },
  );
  const k = sc.findIndex((s) => s.stanza === 0 && s.lines.length > 1);
  const split = splitScene(sc, k, 1);
  const parts = split.filter((s) => s.stanza === 0);
  assert.deepEqual(
    parts.map((s) => s.part),
    parts.map((_, i) => i),
  );
  assert.ok(parts.every((s) => s.parts === parts.length));
  const last0 = sc.findLastIndex((s) => s.stanza === 0);
  const merged = mergeNext(sc, last0); // crosses into stanza 1
  assert.equal(merged[last0].stanza, undefined);
  assert.equal(moveScene(sc, 0, 1)[0].stanza, undefined);
  assert.equal(duplicateScene(sc, 0)[1].stanza, undefined);
  assert.equal(moveLine(sc, 0, 0, 1, 0)[0].stanza, undefined);
  assert.ok(
    removeScene(sc, 0).every((s) => s.stanza === undefined || s.parts >= 1),
  );
});

// ---------------------------------------------------------------- whitespace / indentation model
test("render transform is explicit: tabs go to 4-column stops, NBSP and everything else is untouched", () => {
  assert.equal(renderText("a\tb"), "a   b");
  assert.equal(renderText("abcd\te"), "abcd    e");
  assert.equal(renderText("x y"), "x y");
  assert.deepEqual(lineIndent("\t  அ"), { len: 3, cols: 6 });
  assert.deepEqual(lineIndent("   "), { len: 0, cols: 0 });
});
test("NBSP never breaks a line; breakable spaces may", () => {
  const m = (t) => Array.from(t).length * 10;
  assert.deepEqual(wrapLine("அ ஆ இ", 40, m), ["அ ஆ", "இ"]);
  const rows = wrapSpans("அ ஆ இ ஈ உ", 100, m);
  assert.equal(
    rows.length,
    1,
    "an NBSP-joined run is one unbreakable word, even if too wide",
  );
});
test("wrapSpans rows are exact source ranges; internal space runs survive inside a row", () => {
  const m = (t) => Array.from(t).length * 10;
  const line = "  அ  ஆ இ ஈ";
  const rows = wrapSpans(line, 60, m, lineIndent(line).len);
  assert.equal(rows[0].text, "அ  ஆ இ");
  assert.equal(line.slice(rows[0].start, rows[0].end), "அ  ஆ இ");
});
test("an over-long word breaks only between graphemes and drops nothing", () => {
  const m = (t) => Array.from(t).length * 10;
  const word = "க்ஷ".repeat(10) + "கொ";
  const rows = wrapSpans(word, 50, m);
  assert.equal(rows.map((r) => r.text).join(""), word);
  rows.forEach((r) => assert.equal(word.slice(r.start, r.end), r.text));
});
test("scene layout indents consistently, keeps wrapped rows aligned and bounded", () => {
  const c = comp();
  const rect = safeRect(1080, 1920, FORMATS.reel.safe);
  const scene = {
    kind: "stanza",
    durationMs: 4000,
    lines: [
      "அ",
      "\tஆ " + "இ ".repeat(40),
      "\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tஈ",
    ],
  };
  const lay = layoutScene(ctx, c, scene, rect);
  const rowsOf = (i) => lay.rows.filter((r) => r.srcLine === i);
  assert.equal(rowsOf(0)[0].indentPx, 0);
  const tabbed = rowsOf(1);
  assert.ok(tabbed.length > 1);
  assert.ok(tabbed[0].indentPx > 0);
  assert.ok(
    tabbed.every((r) => r.indentPx === tabbed[0].indentPx),
    "wrapped continuation rows keep the indent",
  );
  assert.ok(rowsOf(2)[0].indentPx <= lay.maxW * 0.4 + 0.01, "indent is capped");
});

// ---------------------------------------------------------------- WP4: ten negative controls (full poem)
const full = () => {
  const poem = parsePoemText(
    "அன்பே சிவம்\n  தமிழ் என்றும் வாழ்க\n\nகொடிய வெயில்\tகாய்ந்தாலும் இனிமை\n\n\nகடைசி வரி",
  );
  const lay = layoutFullPoem(ctx, comp(), poem);
  return { poem, lay };
};
const clone = (lay) => ({ ...lay, items: lay.items.map((i) => ({ ...i })) });
test("control 9: valid positive render passes with no false positives (indent, tab, NBSP, blank lines)", () => {
  const { poem, lay } = full();
  const v = validateFullPoem(poem, lay);
  assert.deepEqual(v.messages, []);
  assert.equal(v.ok, true);
  assert.deepEqual(fullPoemCoverage(poem, lay), []);
});
test("control 10: intentional stanza gaps and wrap separators are accepted", () => {
  const poem = parsePoemText(
    "அன்பே சிவம் அன்பே சிவம் அன்பே சிவம் அன்பே சிவம் அன்பே சிவம் அன்பே சிவம் அன்பே சிவம்\n\n\nஇரண்டாம்",
  );
  const narrow = mkCtx(1.6); // forces wrapping
  const lay = layoutFullPoem(narrow, comp(), poem, { preset: "compact" });
  assert.ok(
    lay.items.filter((i) => i.kind === "line" && i.stanza === 0).length > 1,
    "the line really wrapped",
  );
  const v = validateFullPoem(poem, lay);
  assert.deepEqual(
    v.messages,
    [],
    "wrap separators (breakable spaces) and the stanza gap are dispositioned",
  );
});
test("control 1: a dropped stanza is reported", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  bad.items = bad.items.filter((i) => i.stanza !== 1);
  const v = validateFullPoem(poem, bad);
  assert.equal(v.ok, false);
  assert.ok(v.missingLines.length >= 1);
  assert.match(v.missingLines.join(" "), /stanza 2/);
  assert.ok(fullPoemCoverage(poem, bad).length >= 1);
});
test("control 2: off-canvas text is reported", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  bad.items.find((i) => i.kind === "line").x = 9000;
  const v = validateFullPoem(poem, bad);
  assert.equal(v.ok, false);
  assert.ok(v.outOfBounds.some((m) => /canvas/.test(m)));
});
test("control 3: a missing internal space is reported as a whitespace discrepancy", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  const it = bad.items.find((i) => i.kind === "line" && i.text.includes(" "));
  it.text = it.text.replace(" ", "");
  const v = validateFullPoem(poem, bad);
  assert.equal(v.ok, false);
  assert.ok(v.whitespaceDiffs.length === 1, JSON.stringify(v.messages));
});
test("control 4: NFC/NFD changed without a mapping is reported", () => {
  const poem = parsePoemText("கொடிய வெயில்");
  const lay = layoutFullPoem(ctx, comp(), poem);
  assert.equal(validateFullPoem(poem, lay).ok, true);
  const bad = clone(lay);
  const it = bad.items.find((i) => i.kind === "line");
  it.text = it.text.normalize("NFD");
  assert.notEqual(it.text, poem.stanzas[0][0]);
  const v = validateFullPoem(poem, bad);
  assert.equal(v.ok, false);
  assert.ok(v.textDiffs.length === 1, JSON.stringify(v.messages));
});
test("control 5: an over-wide grapheme / row is reported", () => {
  const poem = parsePoemText("க்ஷ" + "கொ".repeat(3));
  const huge = mkCtx(40); // every code point wider than the whole canvas row
  const lay = layoutFullPoem(huge, comp(), poem);
  const v = validateFullPoem(poem, lay);
  assert.equal(v.ok, false);
  assert.ok(v.outOfBounds.length >= 1);
  assert.ok(v.outOfBounds.some((m) => /canvas|margins|beyond|wider/.test(m)));
});
test("control 6: a missing line is reported", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  const k = bad.items.findIndex(
    (i) => i.kind === "line" && i.stanza === 0 && i.line === 1,
  );
  bad.items.splice(k, 1);
  const v = validateFullPoem(poem, bad);
  assert.equal(v.missingLines.length, 1);
  assert.match(v.missingLines[0], /stanza 1, line 2/);
});
test("control 7: invalid row order is reported", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  const rows = bad.items.filter((i) => i.kind === "line");
  [rows[0].y, rows[1].y] = [rows[1].y, rows[0].y];
  const v = validateFullPoem(poem, bad);
  assert.equal(v.ok, false);
  assert.ok(v.orderIssues.length >= 1);
});
test("control 8: invalid horizontal and vertical bounds are reported", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  const rows = bad.items.filter((i) => i.kind === "line");
  rows[0].x = -400;
  rows[2].y = lay.height + 500;
  const v = validateFullPoem(poem, bad);
  assert.ok(v.outOfBounds.some((m) => /canvas|margins/.test(m)));
  assert.ok(v.outOfBounds.some((m) => /vertically|footer/.test(m)));
  const foot = clone(lay);
  foot.items.filter((i) => i.kind === "line").at(-1).y =
    lay.height - lay.offset - lay.footer / 2;
  assert.ok(
    validateFullPoem(poem, foot).outOfBounds.some((m) => /footer/.test(m)),
  );
});
test("a stanza boundary erased from the layout is reported", () => {
  const { poem, lay } = full();
  const bad = clone(lay);
  const last = bad.items.filter((i) => i.kind === "line" && i.stanza === 1);
  const base = lay.items.find((i) => i.stanza === 0 && i.line === 1).y;
  bad.items
    .filter((i) => i.kind === "line" && i.stanza >= 1)
    .forEach((i, k) => {
      i.y = base + (k + 1) * lay.items.find((x) => x.kind === "line").rowH;
    });
  assert.ok(validateFullPoem(poem, bad).stanzaIssues.length >= 1);
  assert.ok(last.length > 0);
});
test("extra blank lines add visible space and are still valid", () => {
  const a = layoutFullPoem(ctx, comp(), parsePoemText("அ\n\nஆ"));
  const poem2 = parsePoemText("அ\n\n\n\nஆ");
  const b = layoutFullPoem(ctx, comp(), poem2);
  const gap = (l) =>
    l.items.filter((i) => i.kind === "line")[1].y -
    l.items.filter((i) => i.kind === "line")[0].y;
  assert.ok(gap(b) > gap(a));
  assert.equal(validateFullPoem(poem2, b).ok, true);
});

// ---------------------------------------------------------------- WP4: per-route validation of scenes (Reel / Story / Poster)
test("every scene of a Tamil poem validates; broken scene rows are caught per format", () => {
  const poem = parsePoemText(TAMIL.join("\n") + "\n\n  " + TAMIL[1]);
  for (const format of ["reel", "story", "poster"]) {
    const c = comp({
      format,
      scenes: generateScenes(poem, { title: "தலைப்பு" }),
    });
    const v = validateScenes(ctx, c, c.scenes);
    assert.deepEqual(v.messages, [], format);
  }
  const c = comp({ scenes: generateScenes(poem, { includeTitle: false }) });
  // a scene whose line is wider than the safe area at the minimum size cannot be validated as complete
  const wide = { kind: "stanza", durationMs: 4000, lines: ["க்ஷ".repeat(400)] };
  assert.equal(validateScene(mkCtx(40), c, wide).ok, false);
});
test("Full-Poem validation does not stand in for scene validation", () => {
  const poem = parsePoemText(TAMIL.join("\n"));
  const lay = layoutFullPoem(ctx, comp(), poem);
  assert.equal(validateFullPoem(poem, lay).ok, true);
  const c = comp({
    scenes: [{ kind: "stanza", durationMs: 4000, lines: ["க்ஷ".repeat(400)] }],
  });
  assert.equal(validateScenes(mkCtx(40), c, c.scenes).ok, false);
});

// ---------------------------------------------------------------- WP3: font readiness
const fakeFonts = ({
  resolveAfter = 0,
  empty = false,
  never = false,
  check = true,
} = {}) => {
  const calls = [];
  return {
    calls,
    load: (font, text) => {
      calls.push({ font, text });
      if (never) return new Promise(() => {});
      return new Promise((r) =>
        setTimeout(() => r(empty ? [] : [{ family: "x" }]), resolveAfter),
      );
    },
    check: () => check,
  };
};
const goodMeasure = (font) =>
  font.includes("serif") && !font.includes("Tamil") ? 100 : 217;
test("font readiness: export right after init waits for the faces before returning", async () => {
  const f = fakeFonts({ resolveAfter: 30 });
  let done = false;
  const p = ensureFonts(
    comp(),
    { poemText: TAMIL.join("\n") },
    { fonts: f, measure: goodMeasure },
  ).then((r) => {
    done = true;
    return r;
  });
  assert.equal(done, false);
  const r = await p;
  assert.equal(r.ok, true);
});
test("font readiness: layout (measurement) happens only after readiness resolves", async () => {
  const f = fakeFonts({ resolveAfter: 20 });
  const order = [];
  await ensureFonts(comp(), {}, { fonts: f, measure: goodMeasure }).then(() =>
    order.push("ready"),
  );
  order.push("layout");
  assert.deepEqual(order, ["ready", "layout"]);
});
test("font readiness: a missing font (no face matches) stops the export with a clear error", async () => {
  await assert.rejects(
    () =>
      ensureFonts(
        comp(),
        {},
        { fonts: fakeFonts({ empty: true }), measure: goodMeasure },
      ),
    (e) => e instanceof FontReadinessError && /fallback font/.test(e.message),
  );
});
test("font readiness: a slow load times out instead of hanging", async () => {
  const t0 = Date.now();
  await assert.rejects(
    () =>
      ensureFonts(
        comp(),
        { timeoutMs: 40 },
        { fonts: fakeFonts({ never: true }), measure: goodMeasure },
      ),
    /did not load within/,
  );
  assert.ok(Date.now() - t0 < 1500);
});
test("font readiness: loads the exact weights with the poem text — title 700, body weight, signature 500 — and only the used family", async () => {
  const f = fakeFonts();
  const c = comp({
    scenes: generateScenes({ stanzas: [TAMIL] }, { title: "தலைப்பு" }),
  });
  await ensureFonts(
    c,
    { poemText: TAMIL.join("") },
    { fonts: f, measure: goodMeasure },
  );
  const weights = f.calls.map((x) => /^(\d+)/.exec(x.font)[1]);
  assert.ok(weights.includes("700"), "title face");
  assert.ok(weights.includes(String(c.style.weight)), "body face");
  assert.ok(
    f.calls.some((x) => /^500 40px/.test(x.font) && x.text.includes("A")),
    "signature face (WP6: new compositions default to 40px)",
  );
  assert.ok(
    f.calls
      .find((x) => x.font.startsWith(String(c.style.weight)))
      .text.includes("அ"),
    "the Tamil glyphs are requested",
  );
  const bodyFamily = requiredFaces(c)[0].font.replace(/^\d+ [\d.]+px /, "");
  const families = new Set(
    f.calls.map((x) => x.font.replace(/^\d+ [\d.]+px /, "")),
  );
  assert.ok(
    families.size <= 2 && families.has(bodyFamily),
    "never all five families",
  );
});
test("font readiness: a face that resolves but draws no Tamil glyphs (same width as fallback) is rejected", async () => {
  await assert.rejects(
    () => ensureFonts(comp(), {}, { fonts: fakeFonts(), measure: () => 100 }),
    /does not draw Tamil glyphs/,
  );
});
test("font readiness: fonts.check false is not ready", async () => {
  await assert.rejects(
    () =>
      ensureFonts(
        comp(),
        {},
        { fonts: fakeFonts({ check: false }), measure: goodMeasure },
      ),
    /not ready/,
  );
});
