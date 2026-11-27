// Pure scene-editing operations. Every function returns a NEW scenes array; inputs are never mutated.
// None of these touch the source poem: scenes are the creative project's own arrangement.
import { sceneDuration, MIN_SCENE_MS, MAX_SCENE_MS, MAX_LINES_PER_SCENE } from "./scenes.js";
import { MAX_SCENES, MAX_LINES } from "./composition.js";
import { LIMITS } from "./poem-input.js";

let n = 0;
const nid = () => `e${Date.now().toString(36)}${(n++).toString(36)}`;
const clone = (s) => ({ ...s, lines: s.lines.slice() });
const noMeta = ({ stanza, part, parts, ...rest }) => rest; // eslint-disable-line no-unused-vars
/**
 * Re-derive part/parts after a structural edit. Scenes keep their source-stanza identity only while consecutive scenes
 * of one stanza still follow each other part by part; anything else simply has no stanza metadata (legacy behaviour:
 * a gap is drawn). Never invents a relationship.
 */
export function restamp(scenes) {
  const out = scenes.map((sc) => ({ ...sc }));
  let i = 0;
  while (i < out.length) {
    const a = out[i];
    if (a.stanza == null || a.part == null) { if (a.stanza != null || a.part != null || a.parts != null) out[i] = noMeta(a); i++; continue; }
    let j = i + 1;
    while (j < out.length && out[j].stanza === a.stanza && out[j].part > out[j - 1].part) j++;
    for (let k = i; k < j; k++) { out[k].part = k - i; out[k].parts = j - i; }
    i = j;
  }
  return out;
}
const dur = (lines, keep) => Math.min(MAX_SCENE_MS, Math.max(MIN_SCENE_MS, keep ?? sceneDuration(lines)));

/** Length of a scene line as the poem parser counts it (code points), so the same LIMITS.lineChars applies everywhere. */
export const lineLength = (text) => [...String(text ?? "")].length;
/**
 * Why a scene-line edit must be refused, or null when it is acceptable. Text is never cut to fit: an over-long edit is
 * refused as a whole and the line keeps its previous text.
 */
export function lineEditError(text) {
  const n = lineLength(text);
  return n > LIMITS.lineChars
    ? `That line would have ${n} characters; the limit is ${LIMITS.lineChars}. Nothing was changed. Split it into shorter lines.`
    : null;
}
/** Edit one scene line verbatim. Returns {ok, scenes, error}; on refusal `scenes` is the SAME array (nothing applied). */
export function editLineResult(scenes, si, li, text) {
  if (!scenes[si] || scenes[si].lines[li] === undefined) return { ok: false, scenes, error: "That line no longer exists." };
  const error = lineEditError(text);
  if (error) return { ok: false, scenes, error };
  const out = scenes.map(clone);
  out[si].lines[li] = String(text);
  return { ok: true, scenes: out, error: null };
}
/** Scenes after the edit, or the unchanged input when the edit is refused (see editLineResult for the reason). */
export function editLine(scenes, si, li, text) {
  return editLineResult(scenes, si, li, text).scenes;
}
export function setDuration(scenes, si, ms) {
  return scenes.map((s, i) => (i === si ? { ...clone(s), durationMs: dur(s.lines, Number(ms)) } : s));
}
export function setScenePresentation(scenes, si, patch) {
  // patch: { offsetY (-30..30 % of safe height), align: 'left'|'center'|'right'|null, scale (0.6..1.4) }
  return scenes.map((s, i) => {
    if (i !== si) return s;
    const o = clone(s);
    if ("offsetY" in patch) o.offsetY = Math.max(-30, Math.min(30, Number(patch.offsetY) || 0));
    if ("align" in patch) o.align = ["left", "center", "right"].includes(patch.align) ? patch.align : undefined;
    if ("scale" in patch) o.scale = Math.max(0.6, Math.min(1.4, Number(patch.scale) || 1));
    return o;
  });
}
/** Split scene `si` so lines [0,at) stay and [at,..) become a new following scene. */
export function splitScene(scenes, si, at) {
  const s = scenes[si];
  if (!s || at <= 0 || at >= s.lines.length || scenes.length >= MAX_SCENES) return scenes;
  const a = { ...clone(s), lines: s.lines.slice(0, at) }, b = { ...clone(s), id: nid(), kind: "stanza", lines: s.lines.slice(at) };
  a.durationMs = dur(a.lines); b.durationMs = dur(b.lines);
  if (s.stanza != null) { a.part = s.part; b.part = s.part + 0.5; } // b follows a inside the same stanza; restamp renumbers
  return restamp([...scenes.slice(0, si), a, b, ...scenes.slice(si + 1)]);
}
/** Merge scene `si` with the next one (lines concatenated in order). */
export function mergeNext(scenes, si) {
  const a = scenes[si], b = scenes[si + 1];
  if (!a || !b || a.lines.length + b.lines.length > MAX_LINES) return scenes;
  const m = { ...clone(a), kind: a.kind === "title" ? "stanza" : a.kind, lines: [...a.lines, ...b.lines] };
  m.durationMs = dur(m.lines);
  // a merge across a real stanza boundary has no single source stanza: drop the metadata rather than invent one
  const out = a.stanza != null && a.stanza === b.stanza ? m : noMeta(m);
  return restamp([...scenes.slice(0, si), out, ...scenes.slice(si + 2)]);
}
export function moveScene(scenes, si, dir) {
  const j = si + dir;
  if (!scenes[si] || !scenes[j]) return scenes;
  const out = scenes.slice(); [out[si], out[j]] = [noMeta(out[j]), noMeta(out[si])]; return restamp(out);
}
/** Move one line to another scene (or the same one) at an index. Removing the last line of a scene removes that scene. */
export function moveLine(scenes, fromS, fromL, toS, toL) {
  if (!scenes[fromS] || scenes[fromS].lines[fromL] === undefined || !scenes[toS]) return scenes;
  const out = scenes.map(clone);
  const [line] = out[fromS].lines.splice(fromL, 1);
  const target = out[toS];
  if (target.lines.length >= MAX_LINES && fromS !== toS) return scenes;
  let idx = Math.max(0, Math.min(toL, target.lines.length));
  if (fromS === toS && fromL < idx) idx -= 0; // splice already shifted indices
  target.lines.splice(idx, 0, line);
  out.forEach((s) => { s.durationMs = s === out[fromS] || s === target ? dur(s.lines) : s.durationMs; });
  out[fromS] = noMeta(out[fromS]); // lines moved between scenes: the touched scenes no longer map to one source stanza part
  out[toS] = noMeta(out[toS]);
  return restamp(out.filter((s) => s.lines.length > 0));
}
export function removeScene(scenes, si) { return restamp(scenes.filter((_, i) => i !== si)); }
export function duplicateScene(scenes, si) {
  if (!scenes[si] || scenes.length >= MAX_SCENES) return scenes;
  return [...scenes.slice(0, si + 1), noMeta({ ...clone(scenes[si]), id: nid() }), ...scenes.slice(si + 1)];
}

/**
 * Lines of the source poem that appear in no scene — shown to the author so omission is never silent.
 * Comparison is exact on the verbatim text, the same rule the source-aware validators use (coverage.js): no trimming, no
 * Unicode normalisation (NFC/NFD), ZWJ/ZWNJ, indentation and trailing spaces all count. A scene line the author edited
 * therefore no longer stands in for its source line, and that source line is reported. Each source occurrence needs its
 * own scene occurrence (a repeated refrain is matched by count); scene order is the author's choice and is not checked.
 */
export function missingLines(poem, scenes) {
  const used = new Map();
  (Array.isArray(scenes) ? scenes : [])
    .filter((s) => s && s.kind !== "title" && Array.isArray(s.lines))
    .forEach((s) => s.lines.forEach((l) => { if (typeof l === "string") used.set(l, (used.get(l) || 0) + 1); }));
  const out = [];
  (Array.isArray(poem?.stanzas) ? poem.stanzas : []).flat().forEach((l) => {
    const c = used.get(l) || 0;
    if (c > 0) used.set(l, c - 1);
    else out.push(l);
  });
  return out;
}

/** Undo/redo history over immutable snapshots. */
export function createHistory(initial, limit = 100) {
  let past = [], present = initial, future = [];
  return {
    get present() { return present; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(next) { if (next === present) return present; past.push(present); if (past.length > limit) past.shift(); present = next; future = []; return present; },
    undo() { if (!past.length) return present; future.push(present); present = past.pop(); return present; },
    redo() { if (!future.length) return present; past.push(present); present = future.pop(); return present; },
    replacePresent(v) { present = v; return present; },
    reset(v) { past = []; future = []; present = v; return present; },
  };
}
export { MAX_LINES_PER_SCENE };
