// Turns text the author typed, pasted or imported into a poem ({title, stanzas}). Pure and total: never throws, never
// drops a line, never rewrites a character. A blank line separates stanzas; a newline separates lines.
// Tamil joiners (ZWJ U+200D / ZWNJ U+200C) and every other code point are preserved exactly.

export const MAX_POEM_CHARS = 60000;
export const MAX_IMPORT_BYTES = 512 * 1024;

/** Normalise only line endings and invisible separators that would otherwise corrupt line structure. */
export function normalizeNewlines(text) {
  return String(text ?? "")
    .replace(/^﻿/, "") // BOM from text-file exports
    .replace(/\r\n?/g, "\n")
    .replace(new RegExp("[\\u2028\\u2029\\u0085\\u000B\\u000C]", "g"), "\n"); // line/paragraph separators some editors paste
}

/**
 * @param {string} text
 * @param {{title?: string}} [opts]
 * @returns {{title:string, stanzas:string[][], truncated:boolean, lineCount:number}}
 */
export function parsePoemText(text, { title = "" } = {}) {
  let t = normalizeNewlines(text);
  const truncated = t.length > MAX_POEM_CHARS;
  if (truncated) t = t.slice(0, MAX_POEM_CHARS);
  const stanzas = [];
  let cur = [];
  for (const raw of t.split("\n")) {
    const line = raw.replace(/[ \t ]+$/g, "").replace(/^[ \t]+/g, (m) => m); // trim trailing space only; keep indent text
    if (line.trim() === "") {
      if (cur.length) stanzas.push(cur);
      cur = [];
    } else cur.push(line.trim());
  }
  if (cur.length) stanzas.push(cur);
  return { title: String(title || "").trim(), stanzas, truncated, lineCount: stanzas.reduce((n, s) => n + s.length, 0) };
}

/** The inverse, used by the editable poem box: stanzas joined by one blank line. */
export const poemToText = (poem) => (poem?.stanzas || []).map((s) => s.join("\n")).join("\n\n");

/**
 * Markdown import that is deliberately text-preserving: a leading `# Heading` becomes the title, list/quote/emphasis
 * markers and trailing hard-break backslashes are removed, and nothing else is changed. No HTML is ever produced.
 */
export function parseMarkdownPoem(md) {
  const lines = normalizeNewlines(md).split("\n");
  let title = "";
  const out = [];
  for (let raw of lines) {
    let l = raw;
    const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      if (!title && out.every((x) => x.trim() === "")) { title = h[1]; continue; }
      l = h[1];
    }
    l = l
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/\\$/, "")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?=[^*\w]|$)/g, "$1$2")
      .replace(/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/, "");
    out.push(l);
  }
  return parsePoemText(out.join("\n"), { title });
}

/** Read a user-chosen .txt/.md File. Rejects other types and oversize files with a message the UI can show. */
export async function importPoemFile(file) {
  if (!file) throw new Error("No file chosen.");
  const name = String(file.name || "");
  const isMd = /\.(md|markdown)$/i.test(name);
  const isTxt = /\.txt$/i.test(name) || file.type === "text/plain";
  if (!isMd && !isTxt) throw new Error("Choose a .txt or .md text file.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("That file is over 512 KB. A poem should be much smaller.");
  const text = await file.text();
  if (text.includes("\u0000")) throw new Error("That file does not look like plain text.");
  const base = name.replace(/\.[^.]+$/, "");
  const p = isMd ? parseMarkdownPoem(text) : parsePoemText(text);
  return { ...p, title: p.title || base };
}
