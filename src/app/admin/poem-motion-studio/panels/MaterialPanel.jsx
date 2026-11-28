"use client";
// Material picker: procedural, seeded surface/atmosphere presets (lib/motion-studio/materials.js). Each swatch is
// drawn by the real renderer (same drawFrame as preview and export) with the author's first scene, so what you pick
// is what exports. "Reduce effects" turns every effect off without losing the chosen preset.
import { useEffect, useMemo, useRef } from "react";
import { drawFrame } from "@/lib/motion-studio/render";
import {
  MATERIALS,
  MATERIAL_NONE,
  DEFAULT_INTENSITY,
  normalizeMaterial,
} from "@/lib/motion-studio/materials";
import {
  TEXTURES,
  TEXTURE_NONE,
  TEXTURE_FAMILIES,
  DEFAULT_TEXTURE_AMOUNT,
  paintTextureSwatch,
} from "@/lib/motion-studio/textures";
import {
  TEXTILES,
  TEXTILE_NONE,
  TEXTILE_DEFAULTS,
  textileById,
  familiesFor,
  textileLevel,
  paintTextileSwatch,
} from "@/lib/motion-studio/textiles";
import { familyLabel } from "@/lib/motion-studio/templates";
import { Btn, Range } from "../studio-ui";
import { useStudio } from "../studio-context";
import SkySection from "./SkySection";

const SW = 56;
function Swatch({ comp, id, tick }) {
  const ref = useRef(null);
  const c = useMemo(
    () => ({
      ...comp,
      material:
        id === MATERIAL_NONE
          ? undefined
          : { id, intensity: 1, reduce: false, seed: comp.material?.seed ?? 1 },
    }),
    [comp, id],
  );
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    try {
      drawFrame(ctx, c, 0, {
        w: cv.width,
        h: cv.height,
        still: true,
        scene: c.scenes?.[0] || null,
        assets: {},
      });
    } catch {
      /* a swatch is decorative: never break the panel */
    }
  }, [c, tick]);
  const h = Math.round((SW * 16) / 9);
  return (
    <canvas
      ref={ref}
      width={SW * 2}
      height={h * 2}
      style={{ width: SW, height: h }}
      className="rounded"
      aria-hidden="true"
    />
  );
}

function TextureSwatch({ comp, id }) {
  const ref = useRef(null);
  const bgKey = JSON.stringify(comp.style.bg) + (comp.material?.seed ?? 1);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || id === TEXTURE_NONE) return;
    const ctx = cv.getContext("2d");
    try {
      paintTextureSwatch(ctx, comp, id, cv.width, cv.height);
    } catch {
      /* decorative */
    }
  }, [bgKey, id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <canvas
      ref={ref}
      width={112}
      height={112}
      style={{ width: 56, height: 56, background: comp.style.bg?.a }}
      className="rounded"
      aria-hidden="true"
    />
  );
}

// Woven textile card swatch: painted only once the card scrolls into view (8 cards, never all at once on a phone).
function TextileSwatch({ id, seed }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || id === TEXTILE_NONE) return;
    const paint = () => {
      try {
        paintTextileSwatch(cv.getContext("2d"), id, cv.width, cv.height, {
          seed,
        });
      } catch {
        /* decorative */
      }
    };
    if (typeof IntersectionObserver !== "function") return paint();
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          paint();
        }
      },
      { rootMargin: "64px" },
    );
    io.observe(cv);
    return () => io.disconnect();
  }, [id, seed]);
  return (
    <canvas
      ref={ref}
      width={112}
      height={112}
      style={{ width: 56, height: 56, background: "var(--line, #ccc)" }}
      className="rounded"
      aria-hidden="true"
    />
  );
}
const pct = (v) => `${Math.round(v * 100)}%`;
const hexLum = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (
    (0.2126 * ((n >> 16) & 255) +
      0.7152 * ((n >> 8) & 255) +
      0.0722 * (n & 255)) /
    255
  );
};
const FABRIC_RANGES = [
  ["strength", "Fabric strength", 0, 1, pct],
  ["scale", "Weave scale", 0.5, 2, (v) => `${Number(v).toFixed(2)}×`],
  ["fibre", "Fibre visibility", 0, 1, pct],
  ["contrast", "Thread contrast", 0, 1, pct],
  ["grain", "Fabric grain", 0, 1, pct],
  ["distress", "Distress", 0, 1, pct],
  ["opacity", "Fabric opacity", 0.2, 1, pct],
  ["tonal", "Tonal variation", 0, 1, pct],
  ["move", "Fabric movement", 0, 1, (v) => (v > 0 ? pct(v) : "still")],
];

function TextileSection({ comp, m, set }) {
  const t = m.textile || null;
  const cur = t ? t.id : TEXTILE_NONE;
  const preset = textileById(cur);
  const setT = (patch, key) =>
    set({ textile: { ...(t || {}), ...patch } }, key);
  const lightClash =
    preset?.light && !t?.tint && hexLum(comp.style?.color) > 0.6;
  return (
    <div className="pms-fabric mt-3" data-testid="textile-section">
      {/* fabric steppers get full 44px targets (the shared stepper is 36px) */}
      <style>{`.pms-fabric .pms-step{width:44px;height:44px}`}</style>
      <span className="pms-lbl">Woven textiles</span>
      <div
        className="pms-scroller mt-1"
        role="group"
        aria-label="Woven textiles"
      >
        {[{ id: TEXTILE_NONE, label: "None" }, ...TEXTILES].map((o) => {
          const fams =
            o.id === TEXTILE_NONE ? [] : familiesFor(o.id).map(familyLabel);
          const level =
            o.id === TEXTILE_NONE
              ? ""
              : textileLevel(o.id, cur === o.id ? t.strength : undefined);
          return (
            <Btn
              key={o.id}
              aria-pressed={cur === o.id}
              aria-label={`Textile: ${o.label}`}
              title={
                fams.length ? `${o.label} · suits ${fams.join(", ")}` : o.label
              }
              style={{ minHeight: 44, minWidth: 88, maxWidth: 112 }}
              className="flex shrink-0 flex-col items-center gap-1"
              onClick={() =>
                set({
                  textile:
                    o.id === TEXTILE_NONE
                      ? null
                      : { ...TEXTILE_DEFAULTS, id: o.id },
                })
              }
            >
              <TextileSwatch id={o.id} seed={m.seed ?? 1} />
              <span
                className="text-xs"
                style={{ lineHeight: 1.2, textAlign: "center" }}
              >
                {o.label}
              </span>
              {fams.length > 0 && (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--mute)", textAlign: "center" }}
                >
                  {fams[0]}
                </span>
              )}
              {level && (
                <span
                  className="text-[10px]"
                  data-level={level}
                  style={{ color: "var(--mute)" }}
                >
                  {level}
                </span>
              )}
            </Btn>
          );
        })}
      </div>
      {t && (
        <details className="mt-2" data-testid="fabric-controls">
          <summary
            className="pms-lbl"
            style={{
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            Fabric controls · {preset?.label}
          </summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {FABRIC_RANGES.map(([k, label, min, max, fmt]) => (
              <Range
                key={k}
                label={label}
                value={t[k] ?? TEXTILE_DEFAULTS[k]}
                min={min}
                max={max}
                step={0.05}
                onChange={(v) => setT({ [k]: v }, `fabric-${k}`)}
                fmt={fmt}
              />
            ))}
            <div className="pms-lbl">
              <span>Fabric tint</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Fabric tint"
                  style={{ width: 44, height: 44 }}
                  value={t.tint || "#1c4569"}
                  onChange={(e) =>
                    setT({ tint: e.target.value }, "fabric-tint")
                  }
                />
                <Btn
                  style={{ minHeight: 44 }}
                  disabled={!t.tint}
                  onClick={() => setT({ tint: undefined })}
                >
                  No tint
                </Btn>
              </div>
            </div>
            <div className="flex items-end">
              <Btn
                style={{ minHeight: 44 }}
                onClick={() =>
                  set({ textile: { ...TEXTILE_DEFAULTS, id: t.id } })
                }
              >
                Reset fabric
              </Btn>
            </div>
          </div>
        </details>
      )}
      <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
        {lightClash
          ? "Light fabric under light text: a soft shade is added behind the words to keep them readable. Dark text reads better on this cloth."
          : "Drawn on the device, the same in preview and export. Text contrast is checked on the cloth under the words."}
      </p>
    </div>
  );
}

export default function MaterialPanel() {
  const { comp, fontTick, update } = useStudio();
  const m = normalizeMaterial(comp.material || { id: MATERIAL_NONE });
  const set = (patch, key) =>
    update((c) => {
      c.material = normalizeMaterial({
        ...(c.material || { id: MATERIAL_NONE, intensity: DEFAULT_INTENSITY }),
        ...patch,
      });
      return c;
    }, key);
  const options = [{ id: MATERIAL_NONE, label: "None" }, ...MATERIALS];
  return (
    <fieldset style={{ minWidth: 0, maxWidth: "100%" }}>
      <legend className="pms-lbl">Material</legend>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Material presets"
      >
        {options.map((o) => (
          <Btn
            key={o.id}
            aria-pressed={m.id === o.id}
            aria-label={`Material: ${o.label}`}
            style={{ minHeight: 44, minWidth: 44 }}
            className="flex flex-col items-center gap-1"
            onClick={() => set({ id: o.id })}
          >
            <Swatch comp={comp} id={o.id} tick={fontTick} />
            <span className="text-xs">{o.label}</span>
          </Btn>
        ))}
      </div>
      <div className="mt-3">
        <span className="pms-lbl">Surface texture</span>
        <div
          className="pms-scroller mt-1"
          role="group"
          aria-label="Surface textures"
        >
          {[{ id: TEXTURE_NONE, label: "None", family: "" }, ...TEXTURES].map(
            (t) => (
              <Btn
                key={t.id}
                aria-pressed={(m.texture || TEXTURE_NONE) === t.id}
                aria-label={`Texture: ${t.label}`}
                title={t.family ? `${t.family} · ${t.label}` : t.label}
                style={{ minHeight: 44, minWidth: 64 }}
                className="flex shrink-0 flex-col items-center gap-1"
                onClick={() =>
                  set({
                    texture: t.id,
                    textureAmount: m.textureAmount ?? DEFAULT_TEXTURE_AMOUNT,
                  })
                }
              >
                <TextureSwatch comp={comp} id={t.id} />
                <span className="text-xs">{t.label}</span>
              </Btn>
            ),
          )}
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
          {TEXTURE_FAMILIES.join(" · ")} — the strength is capped automatically
          so the poem always stays readable.
        </p>
      </div>
      <SkySection comp={comp} m={m} set={set} />
      <TextileSection comp={comp} m={m} set={set} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {m.texture && (
          <Range
            label="Texture strength"
            value={m.textureAmount ?? DEFAULT_TEXTURE_AMOUNT}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set({ textureAmount: v }, "texture-amount")}
            fmt={(v) => `${Math.round(v * 100)}%`}
          />
        )}
        <Range
          label="Film grain"
          value={m.grain || 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => set({ grain: v }, "film-grain")}
          fmt={(v) => `${Math.round(v * 100)}%`}
        />
        {m.grain > 0 && (
          <label
            className="pms-lbl flex items-center gap-2"
            style={{ minHeight: 44 }}
          >
            <input
              type="checkbox"
              aria-label="Moving grain"
              style={{ width: 24, height: 24 }}
              checked={m.grainMove !== false}
              onChange={(e) => set({ grainMove: e.target.checked })}
            />
            Moving grain (video)
          </label>
        )}
        {m.id !== MATERIAL_NONE && (
          <Range
            label="Material intensity"
            value={m.intensity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set({ intensity: v }, "material-intensity")}
            fmt={(v) => v.toFixed(2)}
          />
        )}
        {(m.id !== MATERIAL_NONE || m.texture || m.grain > 0) && (
          <label
            className="pms-lbl flex items-center gap-2"
            style={{ minHeight: 44 }}
          >
            <input
              type="checkbox"
              aria-label="Reduce effects"
              style={{ width: 24, height: 24 }}
              checked={m.reduce}
              onChange={(e) => set({ reduce: e.target.checked })}
            />
            Reduce effects (turns material, texture and grain off; a woven
            textile stays but stops moving. Preview and export)
          </label>
        )}
      </div>
    </fieldset>
  );
}
