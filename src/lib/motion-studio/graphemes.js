// Tamil-safe text helpers. Never split inside a grapheme cluster (vowel signs, pulli, grantha ligatures).
//
// Whitespace model (explicit, testable):
//  - BREAKABLE whitespace = JS \s MINUS the non-breaking spaces (NBSP U+00A0, U+2007, U+202F, U+FEFF). A line may wrap
//    only at breakable whitespace; NBSP stays glued to its neighbours.
//  - A line's INDENT is its leading run of breakable whitespace. It is never drawn as glyphs: it becomes a controlled
//    layout offset (lineIndent / indentPx), so arbitrary whitespace can never push text off the canvas.
//  - TABS are expanded to fixed tab stops (TAB_SIZE columns) in the render text only (renderText); the stored source
//    keeps the tab character.
//  - Trailing whitespace is never drawn.
const seg =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("ta", { granularity: "grapheme" })
    : null;

export function graphemes(s) {
  const str = String(s ?? "");
  return seg ? Array.from(seg.segment(str), (x) => x.segment) : Array.from(str);
}
export const graphemeCount = (s) => graphemes(s).length;

export const TAB_SIZE = 4;
export const MAX_INDENT_COLS = 16;
// \s without NBSP (00A0), figure space (2007), narrow NBSP (202F), BOM/ZWNBSP (FEFF)
const WS =
  "\\t\\n\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000";
export const BREAKABLE_RE = new RegExp(`^[${WS}]*$`);
const WORD_RE = new RegExp(`[^${WS}]+`, "g");
const INDENT_RE = new RegExp(`^[${WS}]*`);
export const isBreakableWhitespace = (s) => BREAKABLE_RE.test(s);

/** Tab → spaces up to the next tab stop (columns counted in code points from the start of `s`). Nothing else changes. */
export function renderText(s, tab = TAB_SIZE) {
  const str = String(s ?? "");
  if (!str.includes("\t")) return str;
  let col = 0,
    out = "";
  for (const ch of str) {
    if (ch === "\t") {
      const n = tab - (col % tab);
      out += " ".repeat(n);
      col += n;
    } else {
      out += ch;
      col += 1;
    }
  }
  return out;
}

/** Leading whitespace of a source line: its length in UTF-16 units and its width in columns (tabs to tab stops). */
export function lineIndent(line) {
  const s = String(line ?? "");
  const m = INDENT_RE.exec(s)[0];
  if (m.length === s.length) return { len: 0, cols: 0 }; // whitespace-only line: not a poem line
  let cols = 0;
  for (const ch of m) cols += ch === "\t" ? TAB_SIZE - (cols % TAB_SIZE) : 1;
  return { len: m.length, cols };
}

/** Indent width in px for a font, bounded so indentation can never consume more than `cap` of the text width. */
export function indentPx(line, measure, maxWidth, cap = 0.4) {
  const { cols } = lineIndent(line);
  if (!cols) return 0;
  const space = measure(" ") || 0;
  return Math.min(Math.min(cols, MAX_INDENT_COLS) * space, maxWidth * cap);
}

/**
 * Wrap one source line to `maxWidth` using `measure(text)` and return the SOURCE RANGES of every row.
 * rows[i] = { start, end, text }: `line.slice(start, end)` is the exact source text of the row and `text` is
 * renderText(that slice). Rows are separated only by breakable whitespace (a wrap) or by nothing (a grapheme break
 * inside one over-long word). `from` skips the indent. No source character other than that whitespace is ever dropped.
 */
export function wrapSpans(line, maxWidth, measure, from = 0) {
  const s = String(line ?? "");
  const rows = [];
  const mt = (a, b) => measure(renderText(s.slice(a, b)));
  const push = (a, b) =>
    rows.push({ start: a, end: b, text: renderText(s.slice(a, b)) });
  const words = [];
  WORD_RE.lastIndex = from;
  for (let m = WORD_RE.exec(s); m; m = WORD_RE.exec(s))
    words.push({ start: m.index, end: m.index + m[0].length });
  let rs = -1,
    rend = -1;
  for (const w of words) {
    if (rs >= 0 && mt(rs, w.end) <= maxWidth) {
      rend = w.end;
      continue;
    }
    if (rs >= 0) {
      push(rs, rend);
      rs = -1;
    }
    if (mt(w.start, w.end) <= maxWidth) {
      rs = w.start;
      rend = w.end;
      continue;
    }
    // one word wider than the line: break only between graphemes
    let ps = w.start,
      pe = w.start,
      off = w.start;
    for (const g of graphemes(s.slice(w.start, w.end))) {
      const ge = off + g.length;
      if (pe > ps && mt(ps, ge) > maxWidth) {
        push(ps, pe);
        ps = off;
      }
      pe = ge;
      off = ge;
    }
    rs = ps;
    rend = pe;
  }
  if (rs >= 0) push(rs, rend);
  return rows;
}

/**
 * Word units of `line.slice(start, end)` as SOURCE ranges [{start, end}]: maximal runs of non-breakable-whitespace.
 * Units are separated ONLY by breakable whitespace, so a conjunct, vowel sign, pulli or NBSP-joined pair is never
 * separated. A range with no breakable whitespace is one unit. Used by word-level animations (animation.js).
 */
export function wordRanges(line, start = 0, end = String(line ?? "").length) {
  const s = String(line ?? "").slice(0, end);
  const out = [];
  WORD_RE.lastIndex = start;
  for (let m = WORD_RE.exec(s); m; m = WORD_RE.exec(s))
    out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/** Row texts only (kept for callers that do not need source ranges). A line with no visible text yields [""]. */
export function wrapLine(line, maxWidth, measure) {
  const rows = wrapSpans(line, maxWidth, measure, 0);
  return rows.length ? rows.map((r) => r.text) : [""];
}
