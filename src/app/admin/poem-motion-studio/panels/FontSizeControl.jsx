"use client";
// One font-size control for every route (Look body size, Whole-Poem size, Full-Poem poster size): slider, exact number
// entry, preset sizes and NON-BLOCKING readability advice. The number is a logical px on the 1080-wide output canvas
// (safe-zone.js); the "≈ N pt on a phone" hint says what that means on a phone screen. Nothing here clamps to a
// readability floor: only the technical bounds (TEXT_PX_MIN..TEXT_PX_MAX) apply, and an exact value is stored as typed.
import { useId, useState } from "react";
import { Btn } from "../studio-ui";
import {
  SIZE_PRESETS,
  TEXT_PX_MIN,
  TEXT_PX_MAX,
  textPx,
  sizeAdvice,
} from "@/lib/motion-studio/safe-zone";

export default function FontSizeControl({
  label = "Font size",
  value, // number, or null when automatic
  shown = value, // the size actually drawn (for automatic sizes)
  onChange, // (px:number|null) => void
  format = "reel",
  max = TEXT_PX_MAX,
  automatic = null, // label of the "automatic" choice (null = no automatic option)
  testId = "font-size",
}) {
  const id = useId();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  // follow outside changes (slider, preset, undo) without an effect: reset the draft when the value prop changes
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value == null ? "" : String(value));
  }
  const commit = (raw) => {
    const n = textPx(raw);
    if (n == null) return setDraft(value == null ? "" : String(value)); // invalid: keep the current size
    const v = Math.min(max, n);
    setDraft(String(v));
    if (v !== value) onChange(v);
  };
  const cur = shown ?? value;
  const adv = cur ? sizeAdvice(cur, format) : null;
  return (
    <div className="pms-size" data-testid={testId}>
      <style>{`.pms-size .pms-step{width:44px;height:44px}.pms-size input[type=number]{width:5.5rem;min-height:44px}`}</style>
      <label className="pms-lbl" htmlFor={`${id}-n`}>
        {label}:{" "}
        {value == null
          ? `${automatic}${cur ? ` (${cur}px)` : ""}`
          : `${value}px`}
      </label>

        <input
          aria-label={`${label} slider`}
          type="range"
          className="block w-full"
          style={{ minHeight: 44, minWidth: 0 }}
          min={TEXT_PX_MIN}
          max={max}
          step={1}
          value={cur ?? 40}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="pms-step"
          aria-label={`Decrease ${label}`}
          disabled={cur != null && cur <= TEXT_PX_MIN}
          onClick={() => onChange(Math.max(TEXT_PX_MIN, (cur ?? 40) - 1))}
        >
          −
        </button>
        <button
          type="button"
          className="pms-step"
          aria-label={`Increase ${label}`}
          disabled={cur != null && cur >= max}
          onClick={() => onChange(Math.min(max, (cur ?? 40) + 1))}
        >
          +
        </button>
        <input
          id={`${id}-n`}
          aria-label={`${label} in px`}
          className="pms-field"
          type="number"
          inputMode="numeric"
          min={TEXT_PX_MIN}
          max={max}
          step={1}
          value={draft}
          placeholder={automatic ? "auto" : ""}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            // commit while typing only once the number is complete enough to be a real size (typing "1" of "14" waits)
            if (
              Number.isFinite(n) &&
              n >= TEXT_PX_MIN &&
              n <= max &&
              Number.isInteger(n)
            )
              onChange(n);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
        />
      </div>
      <div
        className="pms-chips mt-1"
        role="group"
        aria-label={`${label} presets`}
      >
        {automatic && (
          <Btn aria-pressed={value == null} onClick={() => onChange(null)}>
            {automatic}
          </Btn>
        )}
        {SIZE_PRESETS.filter((p) => p <= max).map((p) => (
          <Btn
            key={p}
            aria-pressed={value === p}
            aria-label={`${p}px`}
            onClick={() => onChange(p)}
          >
            {p}
          </Btn>
        ))}
      </div>
      {adv && (
        <p
          className="text-xs mt-1"
          aria-live="polite"
          data-testid={`${testId}-advice`}
          data-level={adv.level}
          style={{
            color:
              adv.level === "tiny" || adv.level === "small"
                ? "var(--warn-ink)"
                : "var(--mute)",
          }}
        >
          ≈ {adv.pt} pt on a phone screen. {adv.text}
        </p>
      )}
    </div>
  );
}
