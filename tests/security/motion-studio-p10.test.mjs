// P10 pre-merge hardening: a scene-line edit is never cut, omission/alteration is never hidden, and a poem imported
// from a Writing keeps its exact text and stanza/blank-line structure. Synthetic poems only.
import test from "node:test";
import assert from "node:assert/strict";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import * as E from "../../src/lib/motion-studio/scene-edit.js";
import {
  extractPoem,
  poemFromWriting,
} from "../../src/lib/motion-studio/poem.js";
import { LIMITS, poemToText } from "../../src/lib/motion-studio/poem-input.js";
import { compositionValid } from "../../src/lib/motion-studio/history.js";
import { defaultComposition } from "../../src/lib/motion-studio/composition.js";

const poem = { stanzas: [["கனவு ஒன்று", "நிலவு இரண்டு"], ["மழை மூன்று"]] };
const base = () => generateScenes(poem, { includeTitle: false });
const T = (text) => ({ type: "text", text });
const HB = { type: "hardBreak" };
const P = (...content) => ({ type: "paragraph", content });
const doc = (...paras) => ({
  type: "doc",
  content: [{ type: "poem", content: paras }],
});

// ---------------------------------------------------------------- editLine refuses instead of truncating
test("a 401-character edit is refused; the previous text is kept and the input is not mutated", () => {
  const s = base(),
    snap = JSON.stringify(s);
  const long = "அ".repeat(LIMITS.lineChars + 1);
  const r = E.editLineResult(s, 0, 0, long);
  assert.equal(r.ok, false);
  assert.match(
    r.error,
    /401 characters; the limit is 400\. Nothing was changed/,
  );
  assert.equal(r.scenes, s, "refusal returns the same scenes array");
  assert.equal(E.editLine(s, 0, 0, long), s);
  assert.equal(E.editLine(s, 0, 0, long)[0].lines[0], "கனவு ஒன்று");
  assert.equal(JSON.stringify(s), snap);
  assert.ok(E.lineEditError(long));
});
test("an edit of exactly 400 characters is applied whole (negative control for the refusal)", () => {
  const exact = "அ".repeat(LIMITS.lineChars);
  const r = E.editLineResult(base(), 0, 0, exact);
  assert.equal(r.ok, true);
  assert.equal(r.scenes[0].lines[0], exact);
  assert.equal(r.scenes[0].lines[0].length, 400);
  assert.equal(E.lineEditError(exact), null);
});
test("the limit counts code points (as parsePoemText does), not UTF-16 units", () => {
  const astral = "𝔸".repeat(LIMITS.lineChars); // 400 code points, 800 UTF-16 units
  assert.equal(E.editLineResult(base(), 0, 0, astral).ok, true);
  assert.equal(E.editLineResult(base(), 0, 0, astral + "x").ok, false);
});
test("Tamil with combining marks, ZWJ/ZWNJ, NBSP, tabs and spaces is stored verbatim (never normalised or trimmed)", () => {
  const t = "  \tகொ்ண்டா‍ட்டம்‌ கை  ";
  const nfd = "கொ".normalize("NFD"); // decomposed vowel sign stays decomposed
  const out = E.editLine(base(), 0, 1, t + nfd);
  assert.equal(out[0].lines[1], t + nfd);
  assert.notEqual(out[0].lines[1], (t + nfd).normalize("NFC"));
});
test("editLineResult on a line that does not exist changes nothing", () => {
  const s = base();
  const r = E.editLineResult(s, 9, 0, "x");
  assert.equal(r.ok, false);
  assert.equal(r.scenes, s);
});
test("before the fix a 401-char edit was silently cut: the cut result would still pass the history gate", () => {
  // documents why refusal must happen in editLine: a sliced 400-char line survives normalizeComposition intact
  const s = base();
  const cut = s.map((x, i) =>
    i === 0 ? { ...x, lines: ["அ".repeat(400), ...x.lines.slice(1)] } : x,
  );
  assert.equal(compositionValid(defaultComposition({ scenes: cut })), true);
});

// ---------------------------------------------------------------- missingLines: exact, source-aware comparison
test("missingLines flags a line the author altered in any way (whitespace, joiners, normalisation)", () => {
  const src = { stanzas: [["  கனவு\tஒன்று ", "க‍ஷ"], ["கொ"]] };
  const sc = () => generateScenes(src, { includeTitle: false });
  assert.deepEqual(
    E.missingLines(src, sc()),
    [],
    "verbatim scenes: nothing missing",
  );
  const edits = [
    [0, 0, "கனவு\tஒன்று "], // leading indent dropped
    [0, 0, "  கனவு\tஒன்று"], // trailing space dropped
    [0, 0, "  கனவு ஒன்று "], // tab became a space
    [0, 1, "கஷ"], // ZWJ removed
  ];
  for (const [si, li, text] of edits) {
    const s = sc();
    const at = s.findIndex((x) => x.lines.includes(src.stanzas[si][li]));
    const out = E.editLine(
      s,
      at,
      s[at].lines.indexOf(src.stanzas[si][li]),
      text,
    );
    assert.deepEqual(
      E.missingLines(src, out),
      [src.stanzas[si][li]],
      JSON.stringify(text),
    );
  }
  const s = sc();
  const at = s.findIndex((x) => x.lines.includes("கொ"));
  const nfd = "கொ".normalize("NFD");
  assert.notEqual(nfd, "கொ");
  assert.deepEqual(
    E.missingLines(src, E.editLine(s, at, 0, nfd)),
    ["கொ"],
    "NFD form is not the source line",
  );
});
test("missingLines matches repeated refrains by count and ignores title scenes", () => {
  const src = { stanzas: [["பல்லவி", "ஒன்று"], ["பல்லவி"]] };
  const s = generateScenes(src, { includeTitle: false });
  assert.deepEqual(E.missingLines(src, s), []);
  const dropped = E.removeScene(s, s.length - 1);
  assert.deepEqual(E.missingLines(src, dropped), ["பல்லவி"]);
  const asTitle = [
    { id: "t", kind: "title", lines: ["பல்லவி"], durationMs: 3000 },
    ...dropped,
  ];
  assert.deepEqual(
    E.missingLines(src, asTitle),
    ["பல்லவி"],
    "a title card does not stand in for a poem line",
  );
  assert.deepEqual(E.missingLines({}, s), []);
  assert.deepEqual(E.missingLines(src, null), ["பல்லவி", "ஒன்று", "பல்லவி"]);
});

// ---------------------------------------------------------------- Writing import is lossless
test("extractPoem keeps indentation, tabs, NBSP and trailing spaces verbatim", () => {
  const d = doc(P(T("    முதல் வரி"), HB, T("\tஇரண்டாம்  "), HB, T("  மூன்று")));
  const before = JSON.stringify(d);
  const p = extractPoem(d);
  assert.deepEqual(p.stanzas, [["    முதல் வரி", "\tஇரண்டாம்  ", "  மூன்று"]]);
  assert.equal(p.source, "    முதல் வரி\n\tஇரண்டாம்  \n  மூன்று");
  assert.equal(p.ok, true);
  assert.deepEqual(p.notices, []);
  assert.equal(JSON.stringify(d), before, "the document is never mutated");
});
test("extractPoem keeps blank lines: inside a paragraph and as empty paragraphs between stanzas", () => {
  const d = doc(
    P(T("ஒன்று"), HB, HB, T("இரண்டு")), // a blank line inside one paragraph is a stanza break
    P(), // an empty paragraph = one more blank line
    P(),
    P(T("மூன்று")),
  );
  const p = extractPoem(d);
  assert.deepEqual(p.stanzas, [["ஒன்று"], ["இரண்டு"], ["மூன்று"]]);
  assert.equal(p.source, "ஒன்று\n\nஇரண்டு\n\n\n\nமூன்று");
  assert.deepEqual(p.blank, [0, 1, 3]);
  assert.equal(
    poemToText(p),
    p.source,
    "the editable poem box shows the poem exactly as written",
  );
});
test("extractPoem: the text of every stanza line round-trips to the document text (no character lost)", () => {
  const texts = ["  அ‍ஆ ", "\tஇ‌ஈ", " உ"];
  const d = doc(P(T(texts[0]), HB, T(texts[1])), P(T(texts[2])));
  const p = extractPoem(d);
  assert.deepEqual(p.stanzas.flat(), texts);
  assert.equal(p.source.replace(/\n/g, ""), texts.join(""));
});
test("extractPoem never drops content silently: skipped blocks and inline nodes are reported", () => {
  const d = {
    type: "doc",
    content: [
      P(T("வரி"), { type: "mention", attrs: { id: "x" } }),
      { type: "image", attrs: { src: "x" } },
      { type: "horizontalRule" },
      { type: "codeBlock", content: [T("code")] },
      { type: "codeBlock", content: [T("code")] },
    ],
  };
  const p = extractPoem(d);
  assert.deepEqual(p.stanzas, [["வரி"]]);
  const all = p.notices.join(" ");
  assert.match(all, /1 image /);
  assert.match(all, /1 horizontal rule /);
  assert.match(all, /2 code blocks /);
  assert.match(all, /1 inline item /);
  const w = poemFromWriting({ contentFormat: "tiptap", content: d });
  assert.equal(w.legacy, false);
  assert.deepEqual(w.warnings, p.notices);
});
test("extractPoem reports line-ending normalisation instead of hiding it", () => {
  const p = extractPoem(doc(P(T("ஒன்று\r\nஇரண்டு"))));
  assert.deepEqual(p.stanzas, [["ஒன்று", "இரண்டு"]]);
  assert.match(p.notices.join(" "), /carriage returns/);
});
test("extractPoem refuses (ok=false) instead of cutting an over-long line", () => {
  const long = "ம".repeat(LIMITS.lineChars + 5);
  const p = extractPoem(doc(P(T(long))));
  assert.equal(p.ok, false);
  assert.equal(p.stanzas[0][0], long, "the line itself is kept whole");
  assert.match(p.issues[0].message, /405 characters; the limit is 400/);
});
test("legacy Markdown writings keep the converter's warnings and the verbatim lines", () => {
  const w = poemFromWriting({ body: "முதல்\\\n  இரண்டு\n\nமூன்று" });
  assert.equal(w.legacy, true);
  assert.ok(Array.isArray(w.warnings));
  assert.ok(w.stanzas.flat().includes("மூன்று"));
});
