"use client";
// Sky & Celestial (sky.js): painted night and day skies that work with every template family. Real rendered thumbnail
// cards, four quick choices, and the advanced controls folded away. Stored on comp.material.sky; "None" removes it.
import { useEffect, useRef } from "react";
import {
  SKY_PRESETS,
  SKY_QUICK,
  SKY_RANGES,
  SKY_ENUMS,
  SKY_PALETTES,
  resolveSky,
  skyTextAdvice,
  paintSkySwatch,
} from "@/lib/motion-studio/sky";
import { Btn, Range } from "../studio-ui";

// card thumbnails are painted once each, only when they scroll into view
function SkySwatch({ id, seed }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !id) return;
    const paint = () => {
      try {
        paintSkySwatch(cv.getContext("2d"), id, cv.width, cv.height, { seed });
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
      width={90}
      height={160}
      data-sky-swatch={id || "none"}
      style={{ width: 45, height: 80, background: "var(--line, #ccc)" }}
      className="rounded"
      aria-hidden="true"
    />
  );
}

const pct = (v) => `${Math.round(v * 100)}%`;
const QUICK_LABELS = {
  stars: "Stars",
  clouds: "Clouds",
  motion: "Sky motion",
  glow: "Glow",
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ADV = [
  [
    "Stars",
    [
      ["density", "Star density", pct],
      ["sizeVar", "Size variation", pct],
      ["brightness", "Star brightness", pct],
      ["bright", "Bright stars", (v) => String(v)],
      ["twinkle", "Twinkle intensity", pct],
      ["twinkleSpeed", "Twinkle speed", pct],
    ],
  ],
  [
    "Shooting stars",
    [
      ["meteors", "Shooting-star frequency", (v) => (v > 0 ? pct(v) : "off")],
      ["meteorSpeed", "Shooting-star speed", pct],
      ["meteorTrail", "Shooting-star trail", pct],
      ["meteorGlow", "Shooting-star brightness", pct],
    ],
  ],
  [
    "Moon",
    [
      ["moonSize", "Moon size", pct],
      ["moonX", "Moon across", pct],
      ["moonY", "Moon height", pct],
      ["moonGlow", "Moon glow", pct],
    ],
  ],
  [
    "Clouds",
    [
      ["cloudDensity", "Cloud density", pct],
      ["cloudOpacity", "Cloud opacity", pct],
      ["cloudSpeed", "Cloud speed", pct],
    ],
  ],
  [
    "Atmosphere",
    [
      ["aurora", "Aurora", (v) => (v > 0 ? pct(v) : "off")],
      ["nebula", "Nebula / Milky Way", (v) => (v > 0 ? pct(v) : "off")],
      ["drift", "Background movement", pct],
    ],
  ],
];
const ENUM_LABELS = {
  moon: "Moon phase",
  horizon: "Horizon",
  auroraColor: "Aurora colour",
  palette: "Sky palette",
};
const enumLabel = (k, v) =>
  k === "palette" ? SKY_PALETTES.find((p) => p.id === v)?.label || v : cap(v);

export default function SkySection({ comp, m, set }) {
  const s = m.sky || null;
  const cfg = s ? resolveSky(s) : null;
  const preset = s ? SKY_PRESETS.find((p) => p.id === s.id) : null;
  const setS = (patch, key) => set({ sky: { ...(s || {}), ...patch } }, key);
  const photo = !!comp.style?.bg?.image;
  const advice = s && !photo ? skyTextAdvice(comp) : null;
  const groups = [
    ["Night skies", SKY_PRESETS.filter((p) => p.kind === "night")],
    ["Day & twilight", SKY_PRESETS.filter((p) => p.kind === "day")],
  ];
  return (
    <div className="pms-sky mt-3" data-testid="sky-section">
      <style>{`.pms-sky .pms-step{width:44px;height:44px}.pms-sky select{min-height:44px}`}</style>
      <span className="pms-lbl">Sky &amp; Celestial</span>
      {groups.map(([title, list], gi) => (
        <div key={title} className="mt-1">
          <span className="text-xs" style={{ color: "var(--mute)" }}>
            {title}
          </span>
          <div
            className="pms-scroller mt-1"
            role="group"
            aria-label={`Sky presets: ${title}`}
          >
            {gi === 0 && (
              <Btn
                aria-pressed={!s}
                aria-label="Sky: None"
                style={{ minHeight: 44, minWidth: 72 }}
                className="flex shrink-0 flex-col items-center justify-center gap-1"
                onClick={() => set({ sky: null })}
              >
                <span className="text-xs">None</span>
              </Btn>
            )}
            {list.map((p) => (
              <Btn
                key={p.id}
                aria-pressed={s?.id === p.id}
                aria-label={`Sky: ${p.label}`}
                title={p.blurb}
                data-sky={p.id}
                style={{ minHeight: 44, minWidth: 88, maxWidth: 104 }}
                className="flex shrink-0 flex-col items-center gap-1"
                onClick={() => set({ sky: { id: p.id } })}
              >
                <SkySwatch id={p.id} seed={m.seed ?? 1} />
                <span
                  className="text-xs"
                  style={{ lineHeight: 1.2, textAlign: "center" }}
                >
                  {p.label}
                </span>
              </Btn>
            ))}
          </div>
        </div>
      ))}
      {s && (
        <>
          <div className="mt-2 grid gap-2" data-testid="sky-quick">
            {Object.entries(SKY_QUICK).map(([k, vals]) => (
              <div key={k}>
                <span className="text-xs" style={{ color: "var(--mute)" }}>
                  {QUICK_LABELS[k]}
                </span>
                <div
                  className="pms-chips"
                  role="group"
                  aria-label={`Sky ${QUICK_LABELS[k]}`}
                >
                  {vals.map((v) => (
                    <Btn
                      key={v}
                      aria-pressed={cfg.q[k] === v}
                      style={{ minHeight: 44 }}
                      onClick={() => {
                        // a quick choice resets the advanced values it drives, so the chip always does what it says
                        const next = { ...s, [k]: v };
                        if (k === "stars") delete next.density;
                        if (k === "clouds") {
                          delete next.cloudDensity;
                          delete next.cloudOpacity;
                        }
                        set({ sky: next }, `sky-${k}`);
                      }}
                    >
                      {cap(v)}
                    </Btn>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <details className="mt-2" data-testid="sky-advanced">
            <summary
              className="pms-lbl"
              style={{
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              Advanced sky controls · {preset?.label}
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {Object.entries(SKY_ENUMS).map(([k, vals]) => (
                <label key={k} className="pms-lbl">
                  <span>{ENUM_LABELS[k]}</span>
                  <select
                    className="pms-field"
                    aria-label={ENUM_LABELS[k]}
                    value={cfg[k]}
                    onChange={(e) => setS({ [k]: e.target.value }, `sky-${k}`)}
                  >
                    {vals.map((v) => (
                      <option key={v} value={v}>
                        {enumLabel(k, v)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label
                className="pms-lbl flex items-center gap-2"
                style={{ minHeight: 44 }}
              >
                <input
                  type="checkbox"
                  style={{ width: 22, height: 22 }}
                  checked={!!cfg.constellations}
                  onChange={(e) =>
                    setS({ constellations: e.target.checked }, "sky-const")
                  }
                />
                Constellation lines
              </label>
            </div>
            {ADV.map(([title, rows]) => (
              <div key={title} className="mt-3">
                <span className="text-xs" style={{ color: "var(--mute)" }}>
                  {title}
                </span>
                <div className="mt-1 grid gap-3 sm:grid-cols-2">
                  {rows.map(([k, label, fmt]) => {
                    const [lo, hi, int] = SKY_RANGES[k];
                    return (
                      <Range
                        key={k}
                        label={label}
                        value={cfg[k]}
                        min={lo}
                        max={hi}
                        step={int ? 1 : 0.05}
                        onChange={(v) => setS({ [k]: v }, `sky-${k}`)}
                        fmt={fmt}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <Btn
                style={{ minHeight: 44 }}
                onClick={() => set({ sky: { id: s.id } })}
              >
                Reset sky
              </Btn>
            </div>
          </details>
        </>
      )}
      <p
        className="mt-1 text-xs"
        data-testid="sky-hint"
        style={{ color: advice ? "var(--warn-ink)" : "var(--mute)" }}
      >
        {photo && s
          ? "A photo background is set: it is shown instead of the sky. Remove the photo to see the sky."
          : advice ||
            "Seeded and drawn on the device, so preview and export match frame for frame. Bright stars, shooting stars and the moon stay clear of the poem. With reduce motion or Static, the sky is one still frame."}
      </p>
    </div>
  );
}
