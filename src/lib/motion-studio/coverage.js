// Source-aware completeness checks, shared by every output route. A rendered row identifies the exact source range it
// draws ({start,end} into the source line); every source character must have an explicit disposition:
//   indent            leading whitespace (a layout offset, never glyphs)
//   rendered text     the row ranges, drawn text === renderText(source slice) exactly (no normalisation of any kind)
//   wrap separator    breakable whitespace between two rows of the same line (a deliberate wrap)
//   grapheme break    NO characters between two rows (one over-long word broken between graphemes)
//   trailing space    breakable whitespace after the last row (never drawn)
// Anything else is reported. The check compares against the SOURCE the caller passes, never against the layout itself.
import { lineIndent, isBreakableWhitespace, renderText } from "./graphemes.js";

const stripWs = (s) => String(s).replace(/\s+/g, "");

/**
 * @param {string} src the source line, verbatim
 * @param {{start:number,end:number,text:string}[]} rows rows in drawing order
 * @returns {{ok:boolean, code?:string, detail?:string, expected?:string, actual?:string, graphemeBreaks:number}}
 */
export function checkLineRows(src, rows) {
  const line = String(src ?? "");
  const ind = lineIndent(line);
  let pos = ind.len,
    graphemeBreaks = 0;
  if (!rows || !rows.length) {
    return isBreakableWhitespace(line)
      ? { ok: true, graphemeBreaks }
      : {
          ok: false,
          code: "missing",
          detail: "no row draws this line",
          expected: line,
          actual: "",
          graphemeBreaks,
        };
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (
      !Number.isInteger(r.start) ||
      !Number.isInteger(r.end) ||
      r.start < pos ||
      r.end <= r.start ||
      r.end > line.length
    )
      return {
        ok: false,
        code: "order",
        detail: `row ${i + 1} has an invalid or out-of-order source range`,
        expected: line,
        actual: String(r.text ?? ""),
        graphemeBreaks,
      };
    const gap = line.slice(pos, r.start);
    if (gap !== "" && !isBreakableWhitespace(gap))
      return {
        ok: false,
        code: "text",
        detail: `source text ${JSON.stringify(gap)} is not drawn`,
        expected: line.slice(pos, r.end),
        actual: String(r.text ?? ""),
        graphemeBreaks,
      };
    if (i > 0 && gap === "") graphemeBreaks++;
    if (i === 0 && gap !== "")
      return {
        ok: false,
        code: "whitespace",
        detail: "leading text range is not accounted for",
        expected: line,
        actual: String(r.text ?? ""),
        graphemeBreaks,
      };
    const expected = renderText(line.slice(r.start, r.end));
    if (r.text !== expected) {
      const wsOnly = stripWs(r.text ?? "") === stripWs(expected);
      return {
        ok: false,
        code: wsOnly ? "whitespace" : "text",
        detail: wsOnly
          ? "a space or tab inside the row differs from the source"
          : "row text differs from the source",
        expected,
        actual: String(r.text ?? ""),
        graphemeBreaks,
      };
    }
    pos = r.end;
  }
  const tail = line.slice(pos);
  if (tail !== "" && !isBreakableWhitespace(tail))
    return {
      ok: false,
      code: "text",
      detail: `source text ${JSON.stringify(tail)} is not drawn`,
      expected: tail,
      actual: "",
      graphemeBreaks,
    };
  return { ok: true, graphemeBreaks };
}

const TOL = 0.75;
/** Horizontal extent of a row drawn with textAlign `align` at anchor `x`. */
export function rowExtent(align, x, w) {
  return align === "left"
    ? [x, x + w]
    : align === "right"
      ? [x - w, x]
      : [x - w / 2, x + w / 2];
}
/** Check a horizontal extent against the hard canvas edges and the (soft) side margins. */
export function checkX(ext, W, left, right) {
  if (ext[0] < -TOL || ext[1] > W + TOL) return "outside the canvas";
  if (ext[0] < left - TOL || ext[1] > right + TOL)
    return "outside the safe margins";
  return null;
}
export const TOLERANCE = TOL;

/** Empty structured result shared by every route's validator. */
export const newResult = () => ({ ok: true, partial: false, missingLines: [], textDiffs: [], whitespaceDiffs: [], orderIssues: [], stanzaIssues: [], outOfBounds: [], messages: [] });
/** Record `msg` in one list of a result (and in the flat `messages` list). */
export function note(r, list, msg) { r[list].push(msg); r.messages.push(msg); }
/** Compare a source line with the rows that claim it and file any discrepancy into the right list. */
export function classifyInto(r, label, src, rows) {
  const c = checkLineRows(src, rows);
  if (c.ok) return;
  if (c.code === "missing") note(r, "missingLines", `${label} is missing`);
  else if (c.code === "order") note(r, "orderIssues", `${label}: ${c.detail}`);
  else if (c.code === "whitespace") note(r, "whitespaceDiffs", `${label}: ${c.detail}`);
  else note(r, "textDiffs", `${label}: ${c.detail}`);
}
