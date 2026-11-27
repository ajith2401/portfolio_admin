// Undo/redo for the Studio composition. Pure (no React, no DOM):
//  - bounded stacks (oldest step dropped first)
//  - coalescing: consecutive pushes with the same key inside `coalesceMs` (a slider drag) replace the present step,
//    so one Undo returns to the state before the whole drag
//  - snapshots are deep copies (structuredClone / JSON fallback): later mutation of an object never rewrites history
//  - a state that does not survive normalizeComposition intact (scenes or poem text altered/dropped by the gate) is
//    REFUSED, so every state undo/redo can reach is a valid composition. History never edits text itself.
import { normalizeComposition } from "./composition.js";

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 900;

const clone = (v) => {
  if (v == null) return v;
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};
const linesOf = (scenes, keepBlank = true) =>
  (Array.isArray(scenes) ? scenes : []).map((s) => (Array.isArray(s?.lines) ? s.lines : [])).map((ls) => (keepBlank ? ls : ls.filter((l) => typeof l === "string" && l.trim() !== ""))).filter((ls) => keepBlank || ls.length);

function gate(c) {
  if (!c || typeof c !== "object" || !Array.isArray(c.scenes)) return null;
  try {
    return normalizeComposition(c);
  } catch {
    return null;
  }
}
const samePoem = (c, n) => !c.poem?.stanzas || JSON.stringify(n.poem?.stanzas) === JSON.stringify(c.poem.stanzas);

/**
 * The history gate (default): normalizeComposition accepts the state, keeps at least one scene, and every NON-BLANK scene
 * line and every poem stanza survives byte-identical. A blank line left while the author is retyping a line is allowed
 * (the gate drops it on save); a line the gate would truncate, or a lost scene/poem line, is refused.
 */
export function compositionValid(c) {
  const n = gate(c);
  if (!n || (c.scenes.length > 0 && n.scenes.length === 0)) return false;
  return JSON.stringify(linesOf(n.scenes, false)) === JSON.stringify(linesOf(c.scenes, false)) && samePoem(c, n);
}
/** Strict form (tests, recovery): normalizeComposition is an identity on every scene line, blanks included. */
export function compositionIntact(c) {
  const n = gate(c);
  if (!n || c.scenes.length === 0) return false;
  return JSON.stringify(linesOf(n.scenes)) === JSON.stringify(linesOf(c.scenes)) && samePoem(c, n);
}

export function createHistory({
  limit = HISTORY_LIMIT,
  coalesceMs = COALESCE_MS,
  validate = compositionValid,
  now = () => Date.now(),
} = {}) {
  let past = [],
    present = null,
    future = [],
    last = { key: null, at: 0 };
  return {
    get present() {
      return present;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get size() {
      return { past: past.length, future: future.length };
    },
    /** New document (or none): clears both stacks. An invalid state is refused (present stays). */
    reset(state) {
      if (state != null && !validate(state)) return false;
      past = [];
      future = [];
      present = clone(state);
      last = { key: null, at: 0 };
      return true;
    },
    /** Records an edit. Returns false (nothing recorded) when there is no document or the state is not valid. */
    push(state, key = null, at = now()) {
      if (present == null || state == null || !validate(state)) return false;
      const snap = clone(state);
      if (key && last.key === key && at - last.at < coalesceMs && past.length) {
        present = snap; // same drag: keep the pre-drag state as the undo target
      } else {
        past.push(present);
        if (past.length > limit) past.splice(0, past.length - limit);
        present = snap;
      }
      future = [];
      last = { key: key || null, at };
      return true;
    },
    undo() {
      if (!past.length) return present;
      future.push(present);
      present = past.pop();
      last = { key: null, at: 0 };
      return present;
    },
    redo() {
      if (!future.length) return present;
      past.push(present);
      present = future.pop();
      last = { key: null, at: 0 };
      return present;
    },
  };
}
