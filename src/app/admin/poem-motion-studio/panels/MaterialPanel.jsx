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
    <fieldset>
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
      {m.id !== MATERIAL_NONE && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Range
            label="Material intensity"
            value={m.intensity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set({ intensity: v }, "material-intensity")}
            fmt={(v) => v.toFixed(2)}
          />
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
            Reduce effects (turns all material effects off, in preview and
            export)
          </label>
        </div>
      )}
    </fieldset>
  );
}
