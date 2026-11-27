"use client";
// Elements: decorative art layered behind the poem. Library (search, category chips, style filter, checkerboard cards),
// template-aware suggestions, Layers (order, visibility, lock) and an inspector for the selected element with
// non-drag alternatives for everything the canvas drag does (position presets, sliders with -/+ steps).
import { useMemo, useState } from "react";
import { useStudio } from "../studio-context";
import { Btn, Field, Range } from "../studio-ui";
import {
  ELEMENTS,
  ELEMENT_CATEGORIES,
  CATEGORY_LABELS,
  ELEMENT_STYLES,
  ELEMENT_ANIMS,
  ANIM_LABELS,
  MAX_ELEMENTS,
  POSITION_PRESETS,
  SIZE_MIN,
  SIZE_MAX,
  DECORATION_PRESETS,
  DECORATION_KEYS,
  decorationElements,
  elementById,
  elementWarnings,
  newElement,
  newElementId,
  normalizeElement,
  searchElements,
  suggestionsFor,
} from "@/lib/motion-studio/elements";
import { FORMATS } from "@/lib/motion-studio/safe-zone";

const CHECKER = {
  backgroundColor: "#f4f1ea",
  backgroundImage:
    "linear-gradient(45deg,#ddd8cc 25%,transparent 25%),linear-gradient(-45deg,#ddd8cc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd8cc 75%),linear-gradient(-45deg,transparent 75%,#ddd8cc 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
};
const thumbOf = (a) => a.thumb || a.file;

function Card({ a, onAdd, disabled }) {
  return (
    <li>
      <button
        type="button"
        className="pms-btn flex w-full flex-col items-stretch gap-1 p-1 text-left"
        style={{ minHeight: 44 }}
        aria-label={`Add element ${a.name}`}
        title={a.note || a.name}
        disabled={disabled}
        onClick={() => onAdd(a.id)}
      >
        <span
          className="block aspect-square w-full overflow-hidden rounded"
          style={CHECKER}
        >
          {/* same-origin static art; decorative thumbnail (the button carries the name) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbOf(a)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain p-1"
          />
        </span>
        <span className="line-clamp-2 text-xs">{a.name}</span>
      </button>
    </li>
  );
}

export default function ElementsPanel() {
  const { comp, update, selEl, setSelEl } = useStudio();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [style, setStyle] = useState("");
  const els = comp.elements || [];
  const full = els.length >= MAX_ELEMENTS;
  const results = useMemo(
    () => searchElements({ q, category: cat, style }),
    [q, cat, style],
  );
  const suggested = suggestionsFor(comp.templateId).map(elementById);
  const sel = els.find((e) => e.id === selEl) || null;
  const selAsset = sel && elementById(sel.asset);
  const fmt = FORMATS[comp.format] || FORMATS.reel;
  const warnings = elementWarnings(comp, fmt.w, fmt.h, {
    x: fmt.w * 0.12,
    y: fmt.h * 0.25,
    w: fmt.w * 0.76,
    h: fmt.h * 0.5,
  });

  const setEls = (fn, key) =>
    update((c) => ({ ...c, elements: fn(c.elements || []) }), key);
  const patch = (p, key) =>
    sel &&
    setEls(
      (list) =>
        list.map((e) =>
          e.id === sel.id
            ? normalizeElement({
                ...e,
                ...p,
                anim: { ...e.anim, ...(p.anim || {}) },
              })
            : e,
        ),
      key,
    );
  const add = (assetId) => {
    if (full) return;
    const e = newElement(assetId, els);
    if (!e) return;
    setEls((list) => [...list, e]);
    setSelEl(e.id);
  };
  const move = (dir) =>
    setEls((list) => {
      const i = list.findIndex((e) => e.id === sel.id),
        j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const out = [...list];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  const idx = sel ? els.findIndex((e) => e.id === sel.id) : -1;

  return (
    <section aria-label="Elements" className="space-y-4">
      <p className="text-sm" style={{ color: "var(--mute)" }}>
        Decorative art sits behind the poem. Drag an element on the preview, or
        use the controls below.
      </p>

      <fieldset>
        <legend className="pms-lbl">Decoration preset</legend>
        <div className="flex flex-wrap gap-2">
          {DECORATION_KEYS.map((k) => (
            <Btn
              key={k}
              onClick={() => {
                const next = decorationElements(k);
                update((c) => ({ ...c, elements: next }));
                setSelEl(next[0]?.id || null);
              }}
            >
              {DECORATION_PRESETS[k].label}
            </Btn>
          ))}
        </div>
      </fieldset>

      {warnings.length > 0 && (
        <div
          role="status"
          className="rounded border p-2 text-sm"
          style={{ borderColor: "#b45309" }}
        >
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {/* ---------------- layers */}
      <div>
        <h3 className="pms-lbl">
          Layers ({els.length}/{MAX_ELEMENTS})
        </h3>
        {els.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--mute)" }}>
            No elements yet. Add one from the library or a preset.
          </p>
        ) : (
          <ul aria-label="Element layers" className="space-y-1">
            {[...els].reverse().map((e) => {
              const a = elementById(e.asset);
              return (
                <li key={e.id} className="flex items-center gap-1">
                  <Btn
                    className="flex-1 text-left"
                    aria-pressed={e.id === selEl}
                    onClick={() => setSelEl(e.id)}
                  >
                    {a?.name || e.asset}
                    {e.hidden ? " (hidden)" : ""}
                    {e.locked ? " 🔒" : ""}
                  </Btn>
                  <Btn
                    aria-label={`${e.hidden ? "Show" : "Hide"} ${a?.name}`}
                    onClick={() =>
                      setEls((l) =>
                        l.map((x) =>
                          x.id === e.id
                            ? normalizeElement({ ...x, hidden: !x.hidden })
                            : x,
                        ),
                      )
                    }
                  >
                    {e.hidden ? "Show" : "Hide"}
                  </Btn>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---------------- inspector */}
      {sel && selAsset && (
        <section
          aria-label="Selected element"
          className="space-y-3 rounded border p-3"
        >
          <h3 className="font-medium">{selAsset.name}</h3>
          {selAsset.note && (
            <p className="text-xs" style={{ color: "var(--mute)" }}>
              {selAsset.note}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn
              onClick={() => patch({ locked: !sel.locked })}
              aria-pressed={!!sel.locked}
            >
              {sel.locked ? "Unlock" : "Lock"}
            </Btn>
            <Btn
              disabled={full}
              onClick={() => {
                const d = {
                  ...sel,
                  id: newElementId(els),
                  x: Math.min(1, sel.x + 0.05),
                  y: Math.min(1, sel.y + 0.05),
                  locked: false,
                };
                setEls((l) => [...l, normalizeElement(d)]);
                setSelEl(d.id);
              }}
            >
              Duplicate
            </Btn>
            <Btn
              onClick={() =>
                patch({ ...newElement(sel.asset, []), id: sel.id })
              }
            >
              Reset
            </Btn>
            <Btn disabled={idx >= els.length - 1} onClick={() => move(1)}>
              Bring forward
            </Btn>
            <Btn disabled={idx <= 0} onClick={() => move(-1)}>
              Send backward
            </Btn>
            <Btn
              onClick={() => {
                setEls((l) => l.filter((e) => e.id !== sel.id));
                setSelEl(null);
              }}
            >
              Delete
            </Btn>
          </div>
          {sel.locked ? (
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Locked: unlock to move or edit it.
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="pms-lbl">Position</legend>
                <div
                  className="grid grid-cols-3 gap-1"
                  style={{ maxWidth: 240 }}
                >
                  {POSITION_PRESETS.map(([k, label, x, y]) => (
                    <Btn
                      key={k}
                      aria-label={`Position: ${label}`}
                      onClick={() => patch({ x, y })}
                    >
                      {label}
                    </Btn>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-2 sm:grid-cols-2">
                <Range
                  label="Horizontal"
                  value={sel.x}
                  min={-0.2}
                  max={1.2}
                  step={0.01}
                  onChange={(v) => patch({ x: v }, "el-x")}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                />
                <Range
                  label="Vertical"
                  value={sel.y}
                  min={-0.2}
                  max={1.2}
                  step={0.01}
                  onChange={(v) => patch({ y: v }, "el-y")}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                />
                <Range
                  label="Size"
                  value={sel.size}
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  step={0.01}
                  onChange={(v) => patch({ size: v }, "el-size")}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                />
                <Range
                  label="Rotation"
                  value={sel.rot}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(v) => patch({ rot: v }, "el-rot")}
                  fmt={(v) => `${v}°`}
                />
                <Range
                  label="Opacity"
                  value={sel.opacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => patch({ opacity: v }, "el-op")}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Btn
                  aria-pressed={!!sel.flipX}
                  onClick={() => patch({ flipX: !sel.flipX })}
                >
                  Flip horizontal
                </Btn>
                <Btn
                  aria-pressed={!!sel.flipY}
                  onClick={() => patch({ flipY: !sel.flipY })}
                >
                  Flip vertical
                </Btn>
                {selAsset.kind === "vector" && (
                  <>
                    <Field label="Tint">
                      <input
                        type="color"
                        aria-label="Tint"
                        className="pms-field"
                        style={{ minHeight: 44, minWidth: 64 }}
                        value={sel.tint || comp.style.color}
                        onChange={(e) =>
                          patch({ tint: e.target.value }, "el-tint")
                        }
                      />
                    </Field>
                    <Btn
                      disabled={!sel.tint}
                      onClick={() =>
                        setEls((l) =>
                          l.map((x) =>
                            x.id === sel.id
                              ? normalizeElement({ ...x, tint: null })
                              : x,
                          ),
                        )
                      }
                    >
                      Use text colour
                    </Btn>
                  </>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Animation">
                  <select
                    aria-label="Element animation"
                    className="pms-field"
                    value={sel.anim.kind}
                    onChange={(e) =>
                      patch({
                        anim: {
                          kind: e.target.value,
                          ...(e.target.value === "draw" ? { durMs: 4000 } : {}),
                        },
                      })
                    }
                  >
                    {ELEMENT_ANIMS.filter(
                      (k) => k !== "draw" || selAsset.kind === "vector",
                    ).map((k) => (
                      <option key={k} value={k}>
                        {ANIM_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                {["drift", "float", "sway"].includes(sel.anim.kind) && (
                  <Range
                    label="Speed"
                    value={sel.anim.speed}
                    min={0.25}
                    max={3}
                    step={0.25}
                    onChange={(v) => patch({ anim: { speed: v } }, "el-speed")}
                    fmt={(v) => `${v}×`}
                  />
                )}
                {["fade", "draw"].includes(sel.anim.kind) && (
                  <>
                    <Range
                      label="Start delay"
                      value={sel.anim.delayMs / 1000}
                      min={0}
                      max={20}
                      step={0.5}
                      onChange={(v) =>
                        patch({ anim: { delayMs: v * 1000 } }, "el-delay")
                      }
                      fmt={(v) => `${v}s`}
                    />
                    <Range
                      label="Duration"
                      value={sel.anim.durMs / 1000}
                      min={0.5}
                      max={30}
                      step={0.5}
                      onChange={(v) =>
                        patch({ anim: { durMs: v * 1000 } }, "el-dur")
                      }
                      fmt={(v) => `${v}s`}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- library */}
      {suggested.length > 0 && (
        <div>
          <h3 className="pms-lbl">Suggested for this look</h3>
          <ul
            aria-label="Suggested elements"
            className="grid grid-cols-3 gap-2 sm:grid-cols-5"
          >
            {suggested.map((a) => (
              <Card key={a.id} a={a} onAdd={add} disabled={full} />
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="pms-lbl">Library ({ELEMENTS.length})</h3>
        <input
          type="search"
          aria-label="Search elements"
          placeholder="Search: moon, couple, jasmine…"
          className="pms-field w-full"
          style={{ minHeight: 44 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div
          role="group"
          aria-label="Element categories"
          className="flex flex-wrap gap-1"
        >
          <Btn aria-pressed={!cat} onClick={() => setCat("")}>
            All
          </Btn>
          {ELEMENT_CATEGORIES.map((c) => (
            <Btn
              key={c}
              aria-pressed={cat === c}
              onClick={() => setCat(cat === c ? "" : c)}
            >
              {CATEGORY_LABELS[c]}
            </Btn>
          ))}
        </div>
        <select
          aria-label="Element style"
          className="pms-field"
          style={{ minHeight: 44 }}
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option value="">All styles</option>
          {ELEMENT_STYLES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {full && (
          <p role="status" className="text-sm">
            The limit of {MAX_ELEMENTS} elements is reached: delete one to add
            another.
          </p>
        )}
        {results.length === 0 ? (
          <p role="status" className="text-sm">
            No elements match. Try another word or clear the filters.
          </p>
        ) : (
          <ul
            aria-label="Element library"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {results.map((a) => (
              <Card key={a.id} a={a} onAdd={add} disabled={full} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
