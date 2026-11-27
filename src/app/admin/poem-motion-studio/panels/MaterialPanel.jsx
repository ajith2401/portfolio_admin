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
import { Btn, Range } from "../studio-ui";
import { useStudio } from "../studio-context";

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
          {TEXTURE_FAMILIES.join(" · ")} — the strength is capped
          automatically so the poem always stays readable.
        </p>
      </div>
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
            Reduce effects (turns material, texture and grain off, in preview
            and export)
          </label>
        )}
      </div>
    </fieldset>
  );
}
