"use client";
import { useMemo, useState } from "react";
import { applyFit, planFit, readabilityIssues } from "@/lib/motion-studio/fit-scenes";
import { FIT_ACTION_LABEL } from "@/lib/motion-studio/safe-zone";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
let probe = null;
const measureCtx = () => {
  if (!probe && typeof document !== "undefined") probe = Object.assign(document.createElement("canvas"), { width: 16, height: 16 }).getContext("2d");
  return probe;
};
// fontTick changes when web fonts finish loading, so measurements are recomputed with the real Tamil faces.
const useIssues = (comp, fontTick) =>
  useMemo(() => {
    const ctx = measureCtx();
    return comp && ctx ? readabilityIssues(ctx, comp) : [];
  }, [comp, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps

/** Scene count and estimated duration for every composition, shown next to Export. */
export function ExportEstimate() {
  const { comp } = useStudio();
  const ms = comp.scenes.reduce((t, s) => t + s.durationMs, 0);
  return (
    <p className="text-xs" style={{ color: "var(--mute)" }} data-testid="export-estimate">
      {comp.scenes.length} scene{comp.scenes.length === 1 ? "" : "s"} · estimated duration {secs(ms)}
    </p>
  );
}

/** Opens the preview dialog. Nothing changes until "Apply" is pressed; Apply is one undoable edit. */
export function FitScenesDialog({ onClose }) {
  const { comp, update, setSel, flash, fontTick } = useStudio();
  const plan = useMemo(() => {
    const ctx = measureCtx();
    return ctx ? planFit(ctx, comp) : null;
  }, [comp, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plan) return null;
  const nothing = plan.ok && plan.changed.length === 0 && plan.sizePx.from === plan.sizePx.to;
  return (
    <div role="dialog" aria-modal="true" aria-label={FIT_ACTION_LABEL} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="pms-card w-full max-w-md space-y-3" style={{ background: "var(--card, #fff)" }}>
        <h2 className="text-lg font-semibold">{FIT_ACTION_LABEL}</h2>
        <p className="text-sm">
          Scenes whose text does not fit at your chosen size ({comp.style.sizePx}px) are split at line boundaries. The text size is not changed, and no line is edited, dropped or reordered.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm" data-testid="fit-preview">
          <dt>Scenes</dt>
          <dd data-testid="fit-scenes">{plan.sceneCountBefore} → {plan.sceneCountAfter}{plan.addedScenes > 0 ? ` (+${plan.addedScenes})` : ""}</dd>
          <dt>Estimated duration</dt>
          <dd data-testid="fit-duration">{secs(plan.durationBeforeMs)} → {secs(plan.durationAfterMs)}</dd>
          <dt>Manual timings kept</dt>
          <dd>{plan.keptManualTimings} untouched scene(s)</dd>
          {plan.sizePx.from !== plan.sizePx.to && (<><dt>Text size</dt><dd>{plan.sizePx.from}px → {plan.sizePx.to}px</dd></>)}
        </dl>
        {!plan.ok && <p role="alert" className="text-sm" style={{ color: "var(--warn-ink)" }}>{plan.reason}</p>}
        {plan.unfittable.length > 0 && (
          <p role="alert" className="text-sm" style={{ color: "var(--warn-ink)" }}>
            Scene(s) {plan.unfittable.map((i) => i + 1).join(", ")} still do not fit at {comp.style.sizePx}px (a single line is too long). Choose a smaller size, or shorten or re-break those lines; export stays blocked until then.
          </p>
        )}
        {nothing && <p className="text-sm">Every scene already fits. Nothing to change.</p>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} autoFocus>Cancel</Btn>
          <Btn
            primary
            disabled={!plan.ok || nothing}
            onClick={() => {
              update((c) => applyFit(c, plan));
              setSel(0);
              flash("ok", `Fitted scenes: ${plan.sceneCountBefore} → ${plan.sceneCountAfter}. Undo restores the previous arrangement.`);
              onClose();
            }}
          >
            Apply (undoable)
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** Warning shown while any scene's text cannot fit at the chosen size (out of bounds), with the action button. Small
 *  sizes are advisory only (FontSizeControl) and never show this. */
export function ReadabilityNotice() {
  const { comp, fontTick } = useStudio();
  const [open, setOpen] = useState(false);
  const bad = useIssues(comp, fontTick);
  if (!bad.length) return null;
  return (
    <div role="alert" className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }} data-testid="readability-warning">
      Scene{bad.length > 1 ? "s" : ""} {bad.slice(0, 8).map((i) => i + 1).join(", ")}{bad.length > 8 ? "…" : ""} do not fit at the chosen text size ({comp.style.sizePx}px), so export is blocked. Nothing has been changed.{" "}
      <Btn onClick={() => setOpen(true)}>{FIT_ACTION_LABEL}</Btn>
      {open && <FitScenesDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Always-available entry point in the Scenes panel. */
export function FitScenesButton() {
  const { comp } = useStudio();
  const [open, setOpen] = useState(false);
  if (comp.format === "poster") return null;
  return (
    <>
      <Btn onClick={() => setOpen(true)}>{FIT_ACTION_LABEL}…</Btn>
      {open && <FitScenesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export default FitScenesDialog;
