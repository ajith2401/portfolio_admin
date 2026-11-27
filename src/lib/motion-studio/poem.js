// Extracts a poem (stanzas of lines) from a structured Tiptap document. Pure; never mutates the document.
// Stanza = a paragraph (a `poem` node holds paragraphs); lines inside a stanza are separated by hardBreak.
//
// Lossless: the document's text is first rebuilt as plain poem text (`source`) and then parsed by parsePoemText, the
// same parser the typed/pasted/imported paths use. Every line is kept verbatim (leading indentation, tabs, NBSP,
// trailing spaces, ZWJ/ZWNJ); blank lines inside a paragraph (two hardBreaks) and empty paragraphs between stanzas are
// kept as blank lines in `source` (blank lines separate stanzas, and their counts are kept in `blank`/`trailingBlank`).
// Anything the Studio cannot represent as poem text (an image, a rule, a code block, an unknown inline node) is NOT
// silently dropped: it is reported in `notices`, which the Studio shows next to the poem.
import { markdownToDoc } from "../editor/md-import.js";
import { parsePoemText, normalizeNewlines } from "./poem-input.js";

const SKIPPED_BLOCKS = {
  image: "image",
  horizontalRule: "horizontal rule",
  codeBlock: "code block",
};

const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * @returns {{ stanzas: string[][], source: string, blank: number[], trailingBlank: number, ok: boolean,
 *   issues: {code:string, message:string}[], notices: string[] }}
 * `stanzas` is in source order; each stanza is a non-empty list of verbatim lines. `ok === false` (a line or the poem is
 * over a limit) means the caller must refuse to build scenes and show `issues` — nothing is ever cut to fit.
 */
export function extractPoem(doc) {
  const blocks = []; // text of each paragraph/heading in order ("" for an empty paragraph)
  const skipped = {};
  let inlineSkipped = 0;
  const lineText = (nodes) =>
    (nodes || [])
      .map((n) => {
        if (n?.type === "text") return String(n.text ?? "");
        if (n?.type === "hardBreak") return "\n";
        inlineSkipped++;
        return "";
      })
      .join("");
  const walk = (n) => {
    if (!n) return;
    if (n.type === "paragraph" || n.type === "heading")
      return void blocks.push(lineText(n.content));
    if (SKIPPED_BLOCKS[n.type])
      return void (skipped[n.type] = (skipped[n.type] || 0) + 1);
    (n.content || []).forEach(walk);
  };
  (doc?.content || []).forEach(walk);

  // One blank line between consecutive paragraphs (their visual gap); each empty paragraph adds one more.
  const rows = [];
  blocks.forEach((b, i) => {
    if (i > 0 && blocks[i - 1] !== "") rows.push("");
    if (b === "") rows.push("");
    else rows.push(b);
  });
  const raw = rows.join("\n");
  const p = parsePoemText(raw);

  const notices = [];
  for (const [type, n] of Object.entries(skipped))
    notices.push(
      `${plural(n, SKIPPED_BLOCKS[type])} in the writing ${n === 1 ? "is" : "are"} not poem text and ${n === 1 ? "was" : "were"} left out of the scenes.`,
    );
  if (inlineSkipped)
    notices.push(
      `${plural(inlineSkipped, "inline item")} that ${inlineSkipped === 1 ? "is" : "are"} not text (for example an embed) ${inlineSkipped === 1 ? "was" : "were"} left out of the scenes.`,
    );
  if (normalizeNewlines(raw) !== raw)
    notices.push(
      "Line breaks written as carriage returns or Unicode line separators were read as ordinary line breaks.",
    );

  return {
    stanzas: p.stanzas,
    source: p.source,
    blank: p.blank,
    trailingBlank: p.trailingBlank,
    ok: p.ok,
    issues: p.issues,
    notices,
  };
}

/** Legacy Markdown poems go through the existing verified converter; warnings are returned, never hidden. */
export function poemFromWriting(w) {
  if (
    w?.contentFormat === "tiptap" &&
    w.content &&
    typeof w.content === "object"
  ) {
    const p = extractPoem(w.content);
    return { ...p, warnings: p.notices, legacy: false };
  }
  const res = markdownToDoc(String(w?.body || ""), { category: "poem" });
  const p = extractPoem(res.doc);
  return {
    ...p,
    warnings: [...(res.warnings || []), ...p.notices],
    legacy: true,
  };
}
