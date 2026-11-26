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

// Hard limits shared with composition.js (normalizeComposition caps). Exceeding one is an ERROR the UI shows; the text is
// never cut to fit.
export const LIMITS = Object.freeze({ lineChars: 400, stanzaLines: 120, stanzas: 400 });

const isBlank = (l) => /^\s*$/.test(l);

/**
 * Parse poem text WITHOUT altering it. The returned `source` (line endings normalised to \n, nothing else) is the
 * authoritative copy; `stanzas` are views onto it: every line is verbatim, including leading indentation, tabs, NBSP and
 * trailing whitespace, and Unicode is never normalised (NFC/NFD, ZWJ/ZWNJ stay exactly as typed).
 * Blank (whitespace-only) lines separate stanzas; `blank[i]` is how many of them preceded stanza i, `trailingBlank` how
 * many followed the last stanza, so the exact stanza structure can be rebuilt.
 *
 * Nothing is ever sliced. If the text exceeds a limit, `ok` is false and `issues` names each problem; callers must not
 * build scenes/exports from a poem with `ok === false` and must keep `source` available to the user.
 *
 * @param {string} text
 * @param {{title?: string}} [opts]
 * @returns {{title:string, source:string, stanzas:string[][], blank:number[], trailingBlank:number, lineCount:number,
 *   ok:boolean, truncated:boolean, issues:{code:string, message:string, line?:number}[]}}
 */
export function parsePoemText(text, { title = "" } = {}) {
  const source = normalizeNewlines(text);
  const stanzas = [],
    blank = [],
    issues = [];
  let cur = [],
    run = 0;
  const rows = source.split("\n");
  rows.forEach((raw, i) => {
    if (isBlank(raw)) {
      if (cur.length) {
        stanzas.push(cur);
        cur = [];
      }
      run++;
    } else {
      if (!cur.length) {
        blank.push(run);
        run = 0;
      }
      cur.push(raw);
      if ([...raw].length > LIMITS.lineChars)
        issues.push({ code: "line-too-long", line: i + 1, message: `Line ${i + 1} has ${[...raw].length} characters; the limit is ${LIMITS.lineChars}. Split it into shorter lines.` });
    }
  });
  if (cur.length) stanzas.push(cur);
  // a source that ends with a newline yields one empty trailing row; it is not an intentional blank line
  const trailingBlank = Math.max(0, run - (source.endsWith("\n") ? 1 : 0));
  if (source.length > MAX_POEM_CHARS)
    issues.push({ code: "too-long", message: `This text has ${source.length.toLocaleString("en")} characters; the limit is ${MAX_POEM_CHARS.toLocaleString("en")}. Nothing was cut. Shorten it or split it into several poems.` });
  if (stanzas.length > LIMITS.stanzas)
    issues.push({ code: "too-many-stanzas", message: `This poem has ${stanzas.length} stanzas; the limit is ${LIMITS.stanzas}.` });
  stanzas.forEach((st, i) => {
    if (st.length > LIMITS.stanzaLines)
      issues.push({ code: "stanza-too-long", message: `Stanza ${i + 1} has ${st.length} lines; the limit is ${LIMITS.stanzaLines}. Add a blank line to split it.` });
  });
  const lineCount = stanzas.reduce((n, s) => n + s.length, 0);
  return { title: String(title || "").trim(), source, stanzas, blank, trailingBlank, lineCount, ok: issues.length === 0, truncated: false, issues };
}

/**
 * The inverse, used by the editable poem box. A poem that carries its `source` returns it unchanged (exact round trip);
 * a legacy poem ({stanzas} only) is rebuilt with one blank line between stanzas.
 */
export function poemToText(poem) {
  if (typeof poem?.source === "string") return poem.source;
  return (poem?.stanzas || []).map((s) => s.join("\n")).join("\n\n");
}

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
