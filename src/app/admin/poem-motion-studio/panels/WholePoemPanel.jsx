"use client";
// Whole-Poem Video controls: the entire poem held still on ONE 9:16 screen while the background moves. Duration,
// layout, text size, motion level, fade and animated background; a live fit status that never hides a problem; and the
// way out (Scene-by-Scene / Full-Poem Poster) when the poem cannot be legible on one screen. Nothing here edits text.
import { useState } from "react";
import {
  PRESETS as FULL_PRESETS,
  MIN_READABLE,
} from "@/lib/motion-studio/full-poem";
import {
  WHOLE_DURATIONS_S,
  WHOLE_MIN_MS,
  WHOLE_MAX_MS,
  WHOLE_MOTION_LABELS,
  WHOLE_SIZE_MAX,
  BACKDROPS,
  backdropOf,
  applyBackdrop,
} from "@/lib/motion-studio/whole-poem";
import { Btn } from "../studio-ui";
import FontSizeControl from "./FontSizeControl";
import { useStudio } from "../studio-context";

const FADES = [
  ["none", "No fade"],
  ["in", "Fade in"],
  ["inout", "Fade in & out"],
];

export default function WholePoemPanel() {
  const {
    comp,
    setWhole_,
    wholeFit,
    fullPoem,
    doWholeVideo,
    doWholeCover,
    progress,
    caps,
    setTab,
    update,
  } = useStudio();
  const w = comp?.whole || {};
  const secs = Math.round((w.durationMs || 30000) / 100) / 10;
  const [custom, setCustom] = useState("");
  const [customErr, setCustomErr] = useState("");
  if (!comp) return null;
  const lines = fullPoem.stanzas.flat().length;
  const bd = backdropOf(comp);
  const applyCustom = () => {
    const v = Number(custom);
    if (
      !Number.isFinite(v) ||
      v * 1000 < WHOLE_MIN_MS ||
      v * 1000 > WHOLE_MAX_MS
    ) {
      setCustomErr(
        `Enter a length from ${WHOLE_MIN_MS / 1000} to ${WHOLE_MAX_MS / 1000} seconds.`,
      );
      return;
    }
    setCustomErr("");
    setWhole_({ durationMs: Math.round(v * 10) * 100 });
  };
  return (
    <section aria-label="Whole poem video" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Whole-Poem Video</h2>
        <p className="text-sm" style={{ color: "var(--mute)" }}>
          The whole poem stays still on one 9:16 screen while the background
          moves. Every line and stanza gap is kept, exactly as written.
        </p>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="rounded-lg p-3 text-sm"
        style={
          wholeFit && !wholeFit.fits
            ? { background: "var(--warn-bg)", color: "var(--warn-ink)" }
            : { background: "var(--panel-2, rgba(127,127,127,.08))" }
        }
      >
        {!wholeFit ? (
          <p>Add a poem to see how it fits.</p>
        ) : wholeFit.fits ? (
          <>
            <p>
              <strong>Fits on one screen.</strong> {lines} lines ·{" "}
              {wholeFit.stanzas} stanza{wholeFit.stanzas === 1 ? "" : "s"} ·
              text {wholeFit.size}px
              {wholeFit.size < MIN_READABLE ? " (small)" : ""} · 1080×1920 ·{" "}
              {secs}s
            </p>
            {wholeFit.notes.map((n, i) => (
              <p key={i} className="mt-1" style={{ color: "var(--warn-ink)" }}>
                {n}
              </p>
            ))}
          </>
        ) : (
          <>
            <p className="font-semibold">
              This poem is too long for one readable screen.
            </p>
            <p className="mt-1">{wholeFit.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn onClick={() => setWhole_({ on: false })}>
                Use Scene-by-Scene
              </Btn>
              <Btn onClick={() => setTab("full")}>Make a Full-Poem Poster</Btn>
              {w.preset !== "compact" && (
                <Btn onClick={() => setWhole_({ preset: "compact" })}>
                  Try Compact layout
                </Btn>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="pms-lbl">Video length</h3>
        <div className="pms-chips" role="group" aria-label="Video length">
          {WHOLE_DURATIONS_S.map((s) => (
            <Btn
              key={s}
              aria-pressed={w.durationMs === s * 1000}
              onClick={() => setWhole_({ durationMs: s * 1000 })}
            >
              {s}s
            </Btn>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="pms-lbl">Custom length (seconds)</span>
            <input
              className="pms-field"
              inputMode="decimal"
              style={{ width: 120 }}
              value={custom}
              placeholder={String(secs)}
              aria-invalid={!!customErr}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            />
          </label>
          <Btn onClick={applyCustom}>Set length</Btn>
        </div>
        {customErr && (
          <p
            role="alert"
            className="mt-1 text-xs"
            style={{ color: "var(--err-ink)" }}
          >
            {customErr}
          </p>
        )}
        <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
          Exports exactly {secs}s ({Math.round(secs * 30)} frames at 30 fps).
          The background loops seamlessly.
        </p>
      </div>

      <div>
        <h3 className="pms-lbl">Layout</h3>
        <div className="pms-chips" role="group" aria-label="Whole poem layout">
          {Object.entries(FULL_PRESETS).map(([k, v]) => (
            <Btn
              key={k}
              aria-pressed={(w.preset || "balanced") === k}
              onClick={() => setWhole_({ preset: k })}
              title={v.note}
            >
              {v.label}
            </Btn>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FontSizeControl
            label="Whole poem text size"
            value={w.size ?? null}
            shown={w.size ?? wholeFit?.size ?? null}
            automatic="Automatic"
            max={WHOLE_SIZE_MAX}
            testId="whole-size"
            onChange={(v) => setWhole_({ size: v }, "whole-size")}
          />
        </div>
        <label className="block">
          <span className="pms-lbl">
            Line spacing {w.lh ? `${w.lh}×` : "(automatic)"}
          </span>
          <input
            type="range"
            className="w-full"
            style={{ minHeight: 44 }}
            aria-label="Whole poem line spacing"
            min={1.2}
            max={2.6}
            step={0.05}
            value={w.lh || 1.7}
            onChange={(e) =>
              setWhole_({ lh: Number(e.target.value) }, "whole-lh")
            }
          />
        </label>
      </div>
      {(w.size || w.lh) && (
        <Btn onClick={() => setWhole_({ size: null, lh: null })}>
          Automatic size and spacing
        </Btn>
      )}

      <div>
        <h3 className="pms-lbl">Moving background</h3>
        <div className="pms-routes" role="group" aria-label="Moving background">
          {BACKDROPS.map((b) => (
            <button
              key={b.id}
              type="button"
              className="pms-btn"
              aria-pressed={bd === b.id}
              onClick={() => update((c) => applyBackdrop(c, b.id))}
            >
              <span className="block">{b.label}</span>
              <span className="block text-xs opacity-80">{b.group}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="pms-lbl">Motion level</h3>
        <div className="pms-chips" role="group" aria-label="Motion level">
          {Object.entries(WHOLE_MOTION_LABELS).map(([k, label]) => (
            <Btn
              key={k}
              aria-pressed={(w.motion || "calm") === k}
              onClick={() => setWhole_({ motion: k })}
            >
              {label}
            </Btn>
          ))}
        </div>
        {comp.motion?.reduceMotion && (
          <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
            Reduce motion is on, so the background is still.
          </p>
        )}
      </div>

      <div>
        <h3 className="pms-lbl">Poem fade</h3>
        <div className="pms-chips" role="group" aria-label="Poem fade">
          {FADES.map(([k, label]) => (
            <Btn
              key={k}
              aria-pressed={(w.fade || "none") === k}
              onClick={() => setWhole_({ fade: k })}
            >
              {label}
            </Btn>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn
          primary
          disabled={progress !== null || !wholeFit?.fits || caps?.mp4 === false}
          onClick={doWholeVideo}
        >
          Export Whole-Poem MP4 ({secs}s)
        </Btn>
        <Btn
          disabled={progress !== null || !wholeFit?.fits}
          onClick={() => doWholeCover("image/png")}
        >
          Export as image (cover / story)
        </Btn>
      </div>
      {caps?.mp4 === false && (
        <p className="text-xs" style={{ color: "var(--warn-ink)" }}>
          {caps.reason || "This device cannot encode MP4 video."} The image
          export still works.
        </p>
      )}
    </section>
  );
}
