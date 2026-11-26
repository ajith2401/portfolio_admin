// Extracts a poem (stanzas of lines) from a structured Tiptap document. Pure; never mutates the document.
// Stanza = a paragraph (a `poem` node holds paragraphs); lines inside a stanza are separated by hardBreak.
import { markdownToDoc } from "../editor/md-import.js";

const lineText = (nodes) =>
  (nodes || []).map((n) => (n.type === "text" ? n.text : n.type === "hardBreak" ? "\n" : "")).join("");

/** @returns {{ stanzas: string[][] }} each stanza is a non-empty list of non-empty lines, in source order */
export function extractPoem(doc) {
  const stanzas = [];
  const pushPara = (n) => {
    const lines = lineText(n.content)
      .split("\n")
      .map((l) => l.replace(/\s+$/g, ""))
      .filter((l) => l.trim() !== "");
    if (lines.length) stanzas.push(lines);
  };
  const walk = (n) => {
    if (!n) return;
    if (n.type === "paragraph" || n.type === "heading") return pushPara(n);
    if (n.type === "image" || n.type === "horizontalRule" || n.type === "codeBlock") return;
    (n.content || []).forEach(walk);
  };
  (doc?.content || []).forEach(walk);
  return { stanzas };
}

/** Legacy Markdown poems go through the existing verified converter; warnings are returned, never hidden. */
export function poemFromWriting(w) {
  if (w?.contentFormat === "tiptap" && w.content && typeof w.content === "object") {
    return { ...extractPoem(w.content), warnings: [], legacy: false };
  }
  const res = markdownToDoc(String(w?.body || ""), { category: "poem" });
  return { ...extractPoem(res.doc), warnings: res.warnings || [], legacy: true };
}
