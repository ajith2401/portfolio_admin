"use client";
// Text animation style (basic view) + writing controls (lib/motion-studio/writing.js). Ink Reveal and Typewriter keep
// the real font and whole shaped Tamil clusters; preview, scrubbing and export draw through the same writing model.
// "Write by Hand" (pen strokes) is shown but disabled until a Tamil font's stroke data passes human review: a mask
// reveal is never advertised as handwriting. Writing time is never squeezed: when it does not fit, the panel shows the
// estimate and offers a longer duration (Whole-Poem) or longer scenes, and the export refuses until the author picks.
import { useMemo } from "react";
import {
  INK_COLOURS,
  INK_KEYS,
  PEN_PRESETS,
  PEN_STATUS,
  SPEEDS,
  UNIT_LABELS,
  WRITING_UNITS,
  normalizeWriting,
  writingOf,
} from "@/lib/motion-studio/writing";
import { sceneWritingFit } from "@/lib/motion-studio/render";
import { wholeWritingFit, WHOLE_MAX_MS } from "@/lib/motion-studio/whole-poem";
import { MAX_SCENE_MS } from "@/lib/motion-studio/scenes";
import { hexRgb, lum } from "@/lib/motion-studio/contrast";
import { Btn, Range } from "../studio-ui";
import { useStudio } from "../studio-context";

const STYLES = [
  { id: "static", label: "Static", desc: "The poem is simply there." },
  {
    id: "hand",
    label: "Write by Hand",
    desc: "Pen strokes. Not available yet for Tamil fonts.",
    disabled: true,
  },
  {
    id: "ink",
    label: "Ink Reveal",
    desc: "Ink flows in along each line, keeping your font.",
  },
  {
    id: "line",
    label: "Line by Line",
    desc: "Each line fades in.",
    scenesOnly: true,
  },
  {
    id: "word",
    label: "Word by Word",
    desc: "Whole words appear in order.",
    scenesOnly: true,
  },
  {
    id: "type",
    label: "Typewriter",
    desc: "Whole letter clusters appear, never split.",
  },
];
const LIB = { line: "line-reveal", word: "word-reveal" };

export function styleOfComp(comp) {
  const w = normalizeWriting(comp?.motion?.writing);
  if (w.mode === "ink") return "ink";
  if (w.mode === "type") return "type";
  const t = comp?.motion?.textIn;
  if (t === "none") return "static";
  if (t === "line-reveal") return "line";
  if (t === "word-reveal") return "word";
  return null;
}
const sec = (ms) => `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)} s`;
let probe = null;
const probeCtx = () =>
  probe ||
  (probe = Object.assign(document.createElement("canvas"), {
    width: 16,
    height: 16,
  }).getContext("2d"));

export default function WritingPanel() {
  const { comp, update, whole, wholeFit, setWhole_, fontTick } = useStudio();
  const w = normalizeWriting(comp.motion?.writing);
  const eff = writingOf(comp);
  const on = w.mode !== "none";
  const cur = styleOfComp(comp);
  const setW = (patch) =>
    update((c) => {
      c.motion = {
        ...c.motion,
        writing: normalizeWriting({ ...(c.motion?.writing || {}), ...patch }),
      };
      return c;
    }, "writing");
  const pick = (id) =>
    update((c) => {
      const m = { ...c.motion };
      const wr = normalizeWriting(m.writing);
      if (id === "ink" || id === "type") m.writing = { ...wr, mode: id };
      else {
        if (m.writing) m.writing = { ...wr, mode: "none" };
        m.textIn = id === "static" ? "none" : LIB[id];
      }
      c.motion = m;
      return c;
    });

  const fit = useMemo(() => {
    if (!on || typeof document === "undefined") return null;
    try {
      if (whole)
        return wholeFit?.fits
          ? wholeWritingFit(probeCtx(), comp, wholeFit.layout)
          : null;
      return sceneWritingFit(probeCtx(), comp);
    } catch {
      return null;
    }
  }, [on, whole, wholeFit, comp, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps -- fontTick: re-measure once fonts load

  const lengthenScenes = () =>
    update((c) => {
      const f = sceneWritingFit(probeCtx(), c);
      c.scenes = c.scenes.map((sc, i) => {
        const r = f.scenes[i];
        return r && !r.fits
          ? {
              ...sc,
              durationMs: Math.min(
                MAX_SCENE_MS,
                Math.ceil(r.needMs / 100) * 100,
              ),
            }
          : sc;
      });
      return c;
    });
  const inkHex = w.ink === "custom" ? w.inkHex : INK_COLOURS[w.ink]?.hex;
  const darkOnLight =
    on &&
    inkHex &&
    /^#[0-9a-f]{6}$/i.test(comp.style?.color || "") &&
    lum(...hexRgb(inkHex)) < 0.15 &&
    lum(...hexRgb(comp.style.color)) > 0.45;

  return (
    <fieldset className="pms-writing mb-3" data-testid="writing-panel">
      <style>{`.pms-writing .pms-step{width:44px;height:44px}`}</style>
      <legend className="pms-lbl">Text animation style</legend>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="group"
        aria-label="Text animation style"
      >
        {STYLES.map((s) => {
          const disabled = s.disabled || (whole && s.scenesOnly);
          return (
            <Btn
              key={s.id}
              aria-pressed={cur === s.id}
              disabled={disabled}
              aria-label={`${s.label}. ${disabled && whole && s.scenesOnly ? "Scene-by-Scene only." : s.desc}`}
              style={{
                minHeight: 44,
                textAlign: "left",
                opacity: disabled ? 0.55 : 1,
              }}
              className="flex flex-col items-start gap-0.5"
              onClick={() => pick(s.id)}
            >
              <span>
                {s.label}
                {s.id === "hand" && (
                  <span className="ml-1 text-xs">(experimental, off)</span>
                )}
              </span>
              <span className="text-xs opacity-75">
                {whole && s.scenesOnly ? "Scene-by-Scene only." : s.desc}
              </span>
            </Btn>
          );
        })}
      </div>
      <p className="mt-1 text-xs opacity-75" role="note">
        {PEN_STATUS}
      </p>
      {on && eff.mode === "none" && (
        <p className="mt-1 text-xs" role="note">
          Reduce motion is on, so the writing is shown as a plain fade.
        </p>
      )}

      {on && (
        <div className="mt-3 grid gap-3" data-testid="writing-controls">
          <div
            role="group"
            aria-label="Writing speed"
            className="flex flex-wrap gap-2"
          >
            {Object.entries(SPEEDS).map(([k, v]) => (
              <Btn
                key={k}
                aria-pressed={w.speed === v}
                style={{ minHeight: 44 }}
                onClick={() => setW({ speed: v })}
              >
                {k[0].toUpperCase() + k.slice(1)}
              </Btn>
            ))}
          </div>
          <div>
            <span className="pms-lbl">Ink colour</span>
            <div
              className="pms-chips mt-1"
              role="group"
              aria-label="Ink colour"
            >
              {INK_KEYS.map((k) => (
                <Btn
                  key={k}
                  aria-pressed={w.ink === k}
                  style={{ minHeight: 44 }}
                  onClick={() => setW({ ink: k })}
                >
                  {INK_COLOURS[k].hex && (
                    <span
                      aria-hidden
                      className="mr-1 inline-block rounded-full align-middle"
                      style={{
                        width: 14,
                        height: 14,
                        background: INK_COLOURS[k].hex,
                        border: "1px solid #888",
                      }}
                    />
                  )}
                  {INK_COLOURS[k].label}
                </Btn>
              ))}
              <label
                className="pms-btn flex items-center gap-2"
                style={{ minHeight: 44 }}
              >
                <input
                  type="color"
                  aria-label="Custom ink colour"
                  value={w.inkHex}
                  onChange={(e) =>
                    setW({ ink: "custom", inkHex: e.target.value })
                  }
                />
                Custom
              </label>
            </div>
            {darkOnLight && (
              <p className="mt-1 text-xs" role="note">
                This ink is dark but the design uses light text, so it may be
                hard to read on this background. Text colour keeps the
                design&apos;s contrast.
              </p>
            )}
          </div>
          <Range
            label="Start delay"
            value={w.startDelayMs / 1000}
            min={0}
            max={5}
            step={0.1}
            fmt={(v) => `${v} s`}
            onChange={(v) => setW({ startDelayMs: Math.round(v * 1000) })}
          />
          <Range
            label="Line pause"
            value={w.linePauseMs / 1000}
            min={0}
            max={3}
            step={0.05}
            fmt={(v) => `${v} s`}
            onChange={(v) => setW({ linePauseMs: Math.round(v * 1000) })}
          />
          <Range
            label="Stanza pause"
            value={w.stanzaPauseMs / 1000}
            min={0}
            max={5}
            step={0.1}
            fmt={(v) => `${v} s`}
            onChange={(v) => setW({ stanzaPauseMs: Math.round(v * 1000) })}
          />
          <Range
            label="Final hold"
            value={w.finalHoldMs / 1000}
            min={0}
            max={10}
            step={0.5}
            fmt={(v) => `${v} s`}
            onChange={(v) => setW({ finalHoldMs: Math.round(v * 1000) })}
          />

          {fit && (
            <div
              role="status"
              aria-live="polite"
              className="text-sm"
              data-testid="writing-estimate"
            >
              {whole ? (
                fit.fits ? (
                  <p>
                    Writing takes about {sec(fit.writeEndMs)}; the completed
                    poem then stays on screen until the end of the{" "}
                    {sec(fit.totalMs)} video.
                  </p>
                ) : (
                  <div>
                    <p>
                      The writing needs about {sec(fit.needMs)} (with the final
                      hold), but the video is {sec(fit.totalMs)}. Nothing is
                      sped up, shrunk or cut; the export waits until you choose.
                    </p>
                    {fit.recommendS * 1000 <= WHOLE_MAX_MS ? (
                      <Btn
                        primary
                        className="mt-1"
                        onClick={() =>
                          setWhole_(
                            { durationMs: fit.recommendS * 1000 },
                            "dur",
                          )
                        }
                      >
                        Use {fit.recommendS} s (recommended)
                      </Btn>
                    ) : (
                      <p>
                        Even the longest video is too short: write faster,
                        shorten the pauses, or use Scene-by-Scene.
                      </p>
                    )}
                  </div>
                )
              ) : fit.fits ? (
                <p>
                  Every scene finishes writing and holds the completed text
                  before it moves on.
                </p>
              ) : (
                <div>
                  <p>
                    {fit.scenes.filter((x) => !x.fits).length} scene(s) are too
                    short for this writing speed (
                    {fit.scenes
                      .filter((x) => !x.fits)
                      .slice(0, 4)
                      .map(
                        (x) => `scene ${x.index + 1}: needs ${sec(x.needMs)}`,
                      )
                      .join(", ")}
                    ). Nothing is sped up or cut; the export waits until you
                    choose.
                  </p>
                  <Btn primary className="mt-1" onClick={lengthenScenes}>
                    Lengthen scenes to fit
                  </Btn>
                </div>
              )}
            </div>
          )}

          <details>
            <summary
              className="pms-lbl"
              style={{ minHeight: 44, cursor: "pointer" }}
            >
              Advanced writing controls
            </summary>
            <div className="mt-2 grid gap-3">
              <div
                role="group"
                aria-label="Reveal by"
                className="flex flex-wrap gap-2"
              >
                {WRITING_UNITS.map((u) => (
                  <Btn
                    key={u}
                    aria-pressed={w.unit === u}
                    style={{ minHeight: 44 }}
                    onClick={() => setW({ unit: u })}
                  >
                    {UNIT_LABELS[u]}
                  </Btn>
                ))}
              </div>
              <Range
                label="Exact speed"
                value={w.speed}
                min={0.25}
                max={3}
                step={0.05}
                fmt={(v) => `${v}×`}
                onChange={(v) => setW({ speed: v })}
              />
              {w.mode === "ink" && (
                <Range
                  label="Ink edge softness"
                  value={w.edge}
                  min={0}
                  max={1}
                  step={0.05}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => setW({ edge: v })}
                />
              )}
              <p className="text-xs opacity-75">
                Pen presets ({PEN_PRESETS.map((p) => p.label).join(", ")}) and
                their nib, pressure and taper controls appear only for fonts
                whose Tamil pen strokes have passed review. None has yet.
              </p>
            </div>
          </details>
        </div>
      )}
    </fieldset>
  );
}
