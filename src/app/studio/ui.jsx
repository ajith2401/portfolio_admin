// src/app/studio/ui.jsx
"use client";
import { useState } from "react";
// Small, consistent control primitives for the studio's left rail. Kept quiet
// and typographic so the poem — not the chrome — is what the eye lands on.

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500">
          {label}
        </span>
        {hint ? (
          <span className="text-[11px] text-stone-400">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

export function Section({ title, children }) {
  return (
    <section className="border-b border-stone-200/70 px-5 py-5">
      <h3 className="mb-4 font-serif text-[13px] italic tracking-wide text-stone-600">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition " +
        "placeholder:text-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 " +
        (props.className || "")
      }
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={
        "w-full resize-y rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-stone-800 outline-none transition " +
        "placeholder:text-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 " +
        (props.className || "")
      }
    />
  );
}

export function Slider({ value, min, max, step = 1, onChange, format }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="poetry-range h-1 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200"
      />
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-stone-500">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            "flex-1 rounded px-2 py-1.5 text-xs font-medium transition " +
            (value === o.value
              ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
              : "text-stone-500 hover:text-stone-700")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Grid of colour/paper swatches; the active one gets an oxblood ring.
export function SwatchGrid({ items, value, onChange, renderSwatch }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          title={it.label}
          className={
            "group relative aspect-square overflow-hidden rounded-md ring-1 ring-inset ring-black/10 transition " +
            (value === it.id
              ? "outline outline-2 outline-offset-2 outline-[#7A2E2E]"
              : "hover:ring-black/20")
          }
        >
          {renderSwatch(it)}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-medium transition " +
        (active
          ? "border-[#7A2E2E] bg-[#7A2E2E]/5 text-[#7A2E2E]"
          : "border-stone-200 text-stone-600 hover:border-stone-300 hover:text-stone-800")
      }
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-0.5 text-left"
    >
      <span className="text-sm text-stone-600">{label}</span>
      <span
        className={
          "relative h-5 w-9 shrink-0 rounded-full transition " +
          (checked ? "bg-[#7A2E2E]" : "bg-stone-300")
        }
      >
        <span
          className={
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition " +
            (checked ? "left-[18px]" : "left-0.5")
          }
        />
      </span>
    </button>
  );
}

// Collapsible "Print details" section — keeps the fine controls present but
// out of the way, so the default surface stays calm.
export function Disclosure({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-stone-200/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-serif text-[13px] italic tracking-wide text-stone-600">
          {title}
        </span>
        <span
          className={"text-stone-400 transition " + (open ? "rotate-90" : "")}
        >
          ›
        </span>
      </button>
      {open ? <div className="space-y-5 px-5 pb-6">{children}</div> : null}
    </section>
  );
}

// Radio list of editions — each a publishing context with a one-line blurb.
export function RadioCards({ items, value, onChange }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const active = value === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition " +
              (active
                ? "border-[#7A2E2E] bg-[#7A2E2E]/[0.04]"
                : "border-stone-200 hover:border-stone-300")
            }
          >
            <span
              className={
                "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition " +
                (active ? "border-[#7A2E2E] bg-[#7A2E2E]" : "border-stone-300")
              }
            />
            <span className="min-w-0">
              <span
                className={
                  "block text-sm font-medium " +
                  (active ? "text-stone-900" : "text-stone-700")
                }
              >
                {it.label}
              </span>
              {it.blurb ? (
                <span className="block text-xs text-stone-400">{it.blurb}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
