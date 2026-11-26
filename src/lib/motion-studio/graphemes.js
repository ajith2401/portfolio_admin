// Tamil-safe text helpers. Never split inside a grapheme cluster (vowel signs, pulli, grantha ligatures).
const seg =
  typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("ta", { granularity: "grapheme" }) : null;

export function graphemes(s) {
  const str = String(s ?? "");
  return seg ? Array.from(seg.segment(str), (x) => x.segment) : Array.from(str);
}
export const graphemeCount = (s) => graphemes(s).length;

/** Wrap one line to `maxWidth` using `measure(text)`. Breaks at spaces; a single over-long word breaks only on grapheme boundaries. */
export function wrapLine(line, maxWidth, measure) {
  const words = String(line).split(/(\s+)/).filter((w) => w !== "");
  const out = [];
  let cur = "";
  const flush = () => {
    if (cur.trim() !== "") out.push(cur.replace(/\s+$/, ""));
    cur = "";
  };
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      if (cur) cur += " ";
      continue;
    }
    if (measure(cur + w) <= maxWidth) {
      cur += w;
      continue;
    }
    flush();
    if (measure(w) <= maxWidth) {
      cur = w;
      continue;
    }
    let piece = "";
    for (const g of graphemes(w)) {
      if (piece && measure(piece + g) > maxWidth) {
        out.push(piece);
        piece = "";
      }
      piece += g;
    }
    cur = piece;
  }
  flush();
  return out.length ? out : [""];
}
