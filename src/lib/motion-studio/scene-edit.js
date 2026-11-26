// Pure scene-editing operations. Every function returns a NEW scenes array; inputs are never mutated.
// None of these touch the source poem: scenes are the creative project's own arrangement.
import { sceneDuration, MIN_SCENE_MS, MAX_SCENE_MS, MAX_LINES_PER_SCENE } from "./scenes.js";
import { MAX_SCENES, MAX_LINES } from "./composition.js";

let n = 0;
const nid = () => `e${Date.now().toString(36)}${(n++).toString(36)}`;
const clone = (s) => ({ ...s, lines: s.lines.slice() });
const dur = (lines, keep) => Math.min(MAX_SCENE_MS, Math.max(MIN_SCENE_MS, keep ?? sceneDuration(lines)));

export function editLine(scenes, si, li, text) {
  const out = scenes.map(clone);
  if (!out[si] || out[si].lines[li] === undefined) return scenes;
  out[si].lines[li] = String(text).slice(0, 400);
  return out;
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
  return [...scenes.slice(0, si), a, b, ...scenes.slice(si + 1)];
}
/** Merge scene `si` with the next one (lines concatenated in order). */
export function mergeNext(scenes, si) {
  const a = scenes[si], b = scenes[si + 1];
  if (!a || !b || a.lines.length + b.lines.length > MAX_LINES) return scenes;
  const m = { ...clone(a), kind: a.kind === "title" ? "stanza" : a.kind, lines: [...a.lines, ...b.lines] };
  m.durationMs = dur(m.lines);
  return [...scenes.slice(0, si), m, ...scenes.slice(si + 2)];
}
export function moveScene(scenes, si, dir) {
  const j = si + dir;
  if (!scenes[si] || !scenes[j]) return scenes;
  const out = scenes.slice(); [out[si], out[j]] = [out[j], out[si]]; return out;
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
  return out.filter((s) => s.lines.length > 0);
}
export function removeScene(scenes, si) { return scenes.filter((_, i) => i !== si); }
export function duplicateScene(scenes, si) {
  if (!scenes[si] || scenes.length >= MAX_SCENES) return scenes;
  return [...scenes.slice(0, si + 1), { ...clone(scenes[si]), id: nid() }, ...scenes.slice(si + 1)];
}

const flat = (stanzas) => stanzas.flat();
/** Lines of the source poem that appear in no scene — shown to the author so omission is never silent. */
export function missingLines(poem, scenes) {
  const used = new Map();
  scenes.filter((s) => s.kind !== "title").forEach((s) => s.lines.forEach((l) => used.set(l, (used.get(l) || 0) + 1)));
  const out = [];
  flat(poem.stanzas).forEach((l) => { const c = used.get(l) || 0; if (c > 0) used.set(l, c - 1); else out.push(l); });
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
