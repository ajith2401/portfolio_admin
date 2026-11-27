// Studio keyboard shortcuts (pure). The handler NEVER acts while focus is in a text field (input, textarea, select,
// contenteditable) or while an IME composition is in progress, so typing a poem (including Tamil IME input) is never
// hijacked: the browser's own undo/typing keeps working there.
export const SHORTCUTS = Object.freeze([
  { action: "undo", keys: "Ctrl/Cmd + Z", label: "Undo the last change" },
  { action: "redo", keys: "Shift + Ctrl/Cmd + Z (or Ctrl + Y)", label: "Redo" },
  {
    action: "save",
    keys: "Ctrl/Cmd + S",
    label: "Save the open Admin project (only one that is already saved)",
  },
  { action: "help", keys: "?", label: "Show this list of shortcuts" },
]);

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** True when keyboard input at this element is text entry (where shortcuts must stay out of the way). */
export function isEditableTarget(el) {
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT")
    return TEXT_INPUT_TYPES.has(String(el.type || "").toLowerCase());
  // an element inside a contenteditable host (jsdom-like objects without isContentEditable)
  if (typeof el.closest === "function") {
    try {
      if (el.closest("[contenteditable]:not([contenteditable=false])"))
        return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Maps a keydown event to an action id, or null. Does not look at the target (see handleShortcut). */
export function shortcutFor(e) {
  if (!e || e.altKey) return null;
  const mod = !!(e.ctrlKey || e.metaKey);
  const k = String(e.key || "");
  const low = k.toLowerCase();
  if (mod && low === "z") return e.shiftKey ? "redo" : "undo";
  if (mod && !e.shiftKey && low === "y" && e.ctrlKey && !e.metaKey)
    return "redo";
  if (mod && !e.shiftKey && low === "s") return "save";
  if (!mod && k === "?") return "help";
  return null;
}

/**
 * Runs the mapped action. Returns the action id it ran, or null when ignored (editable target, IME composing,
 * unmapped key, or no handler). preventDefault is called only when an action actually ran.
 */
export function handleShortcut(e, actions = {}) {
  if (!e || e.defaultPrevented || e.isComposing || e.keyCode === 229)
    return null;
  if (isEditableTarget(e.target)) return null;
  const a = shortcutFor(e);
  if (!a || typeof actions[a] !== "function") return null;
  e.preventDefault?.();
  actions[a](e);
  return a;
}
