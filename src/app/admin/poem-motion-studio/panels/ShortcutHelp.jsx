"use client";
// Visible list of keyboard shortcuts (opened with the "Shortcuts" button or "?") plus the interface-motion preference.
import { SHORTCUTS } from "@/lib/motion-studio/shortcuts";
import Sheet from "./Sheet";

export default function ShortcutHelp({ open, onClose, reduceUi, onReduceUi }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      id="pms-shortcuts"
    >
      <ul className="space-y-2 text-sm" aria-label="Shortcut list">
        {SHORTCUTS.map((s) => (
          <li
            key={s.action}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>{s.label}</span>
            <kbd className="pms-kbd">{s.keys}</kbd>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs" style={{ color: "var(--mute)" }}>
        Shortcuts never act while you are typing in a text box, so your poem and
        the browser’s own undo are never affected.
      </p>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={reduceUi}
          onChange={(e) => onReduceUi(e.target.checked)}
          style={{ width: 22, height: 22 }}
        />
        Reduce interface motion (does not change your video)
      </label>
    </Sheet>
  );
}
