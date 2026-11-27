"use client";
// Export all: a route checklist, an output-size preset, a labelled size/time ESTIMATE, one bundle ZIP (MANIFEST.json +
// README.txt), cancel / retry, "continue without failed routes" (explicit, never the default) and native share.
import { useMemo, useState } from "react";
import { Btn } from "../studio-ui";
import { useStudio } from "../studio-context";
import { ROUTES } from "@/lib/motion-studio/formats";
import {
  RES_PRESETS,
  DEFAULT_PRESET,
  estimateExport,
  estimateBundle,
  lowMemoryHint,
  fmtBytes,
  fmtSeconds,
  ESTIMATE_LABEL,
} from "@/lib/motion-studio/output-size";
import { shareFiles } from "@/lib/motion-studio/share";

/** Routes the bundle offers: every registered route except the quote excerpts (they need a line selection). */
export const BUNDLE_ROUTES = ROUTES.filter((r) => !r.excerpt);
const DEFAULT_ON = new Set([
  "reel-cover",
  "poster-set",
  "carousel",
  "full-poem",
]);
const TYPE = { mp4: "video/mp4", png: "image/png", jpg: "image/jpeg" };
let probe = null;
const measureCtx = () => {
  if (!probe && typeof document !== "undefined")
    probe = Object.assign(document.createElement("canvas"), {
      width: 16,
      height: 16,
    }).getContext("2d");
  return probe;
};

export default function BundleExport() {
  const {
    comp,
    caps,
    progress,
    abortRef,
    runBundleExport,
    bundleInput,
    fontTick,
    flash,
  } = useStudio();
  const [on, setOn] = useState(() => new Set(DEFAULT_ON));
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [result, setResult] = useState(null);
  const [last, setLast] = useState(null);
  const busy = progress !== null;
  const chosen = BUNDLE_ROUTES.filter((r) => on.has(r.id));

  const est = useMemo(() => {
    const ctx = measureCtx();
    const list = chosen.map((r) => {
      let cards;
      if (r.kind === "set" && ctx) {
        try {
          cards = r.scenesFor(comp, bundleInput(r), ctx).length;
        } catch {
          cards = undefined;
        }
      }
      return estimateExport(comp, r, preset, { cards });
    });
    return { list, total: estimateBundle(list) };
  }, [comp, preset, fontTick, on]); // eslint-disable-line react-hooks/exhaustive-deps
  const lowMem = useMemo(
    () => lowMemoryHint(typeof navigator !== "undefined" ? navigator : null),
    [],
  );

  const toggle = (id) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const run = async (continueOnFailure = false) => {
    const opts = {
      routeIds: chosen.map((r) => r.id),
      preset,
      continueOnFailure,
    };
    setLast(opts);
    setResult(null);
    const r = await runBundleExport(opts); // always a fresh run: every route is re-validated
    setResult(r);
    if (r?.zip)
      flash(
        "ok",
        `Bundle exported: ${r.manifest.routesWritten} of ${r.manifest.routesRequested} routes${r.failures.length ? `, ${r.failures.length} refused (listed in MANIFEST.json)` : ""}.`,
      );
  };
  const retry = () => last && run(last.continueOnFailure);
  const share = async () => {
    const files = (result?.files || []).map(
      (f) =>
        new File([f.data], f.name, {
          type: TYPE[f.name.split(".").pop()] || "application/octet-stream",
        }),
    );
    const r = await shareFiles(files, {
      userGesture: true,
      title: comp?.name || "Poem",
      fallback: () => {},
    });
    flash(
      r.shared ? "ok" : "error",
      r.fellBack
        ? "This browser cannot share these files directly. The bundle ZIP was already downloaded."
        : r.message,
    );
  };
  const t = est.total;
  const shareable = result?.files?.length > 0; // shareFiles feature-detects; unsupported -> message, ZIP already downloaded

  return (
    <section
      aria-label="Export all"
      className="space-y-3 border-t pt-3"
      style={{ borderColor: "var(--line)" }}
    >
      <h3 className="text-base font-semibold">Export all (one ZIP)</h3>
      <fieldset>
        <legend className="pms-lbl">Routes in the bundle</legend>
        <ul className="grid gap-1 sm:grid-cols-2" aria-label="Bundle routes">
          {BUNDLE_ROUTES.map((r) => {
            const noVideo = r.kind === "video" && !caps?.mp4;
            return (
              <li key={r.id}>
                <label
                  className="flex items-center gap-2 text-sm"
                  style={{ minHeight: 44 }}
                >
                  <input
                    type="checkbox"
                    style={{ width: 22, height: 22 }}
                    checked={on.has(r.id)}
                    disabled={busy || noVideo}
                    onChange={() => toggle(r.id)}
                    aria-label={`Include ${r.label}`}
                  />
                  <span>
                    {r.label}
                    {noVideo ? " (no MP4 on this device)" : ""}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <label className="pms-lbl">
        Output size
        <select
          className="pms-field"
          aria-label="Output size"
          value={preset}
          disabled={busy}
          onChange={(e) => setPreset(e.target.value)}
        >
          {RES_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p
        className="text-xs"
        role="status"
        data-testid="bundle-estimate"
        title={ESTIMATE_LABEL}
      >
        {chosen.length === 0
          ? "Choose at least one route."
          : `Estimate (not exact): ${chosen.length} route${chosen.length === 1 ? "" : "s"}, about ${fmtBytes(t.bytesLow)}–${fmtBytes(t.bytesHigh)}, up to ~${fmtSeconds(t.seconds)}. Layout and checks always run at native size.`}
        {t.warnings.length > 0 && ` Warning: ${t.warnings.join(" ")}`}
        {lowMem.low && ` ${lowMem.message}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Btn
          primary
          disabled={busy || chosen.length === 0}
          onClick={() => run(false)}
          aria-label="Export all selected routes as one ZIP"
        >
          {busy
            ? `Working ${Math.round((progress || 0) * 100)}%`
            : "Export all"}
        </Btn>
        {busy && (
          <Btn
            onClick={() => abortRef.current?.abort()}
            aria-label="Cancel the bundle export"
          >
            Cancel
          </Btn>
        )}
        {!busy && result && !result.ok && last && (
          <Btn
            onClick={retry}
            aria-label="Retry the bundle export (re-checks every route)"
          >
            Retry
          </Btn>
        )}
        {!busy &&
          result?.stopped &&
          result.failures?.length > 0 &&
          result.failures.length < (last?.routeIds.length || 0) && (
            <Btn
              onClick={() => run(true)}
              aria-label="Continue without failed routes"
            >
              Continue without failed routes
            </Btn>
          )}
        {!busy && shareable ? (
          <Btn onClick={share} aria-label="Share the exported files">
            Share
          </Btn>
        ) : null}
      </div>
      {result?.cancelled && (
        <p
          role="alert"
          className="text-sm"
          style={{ color: "var(--warn-ink)" }}
        >
          Bundle cancelled. Nothing was kept. Retry runs every check again.
        </p>
      )}
      {result?.error && (
        <p
          role="alert"
          className="text-sm"
          style={{ color: "var(--warn-ink)" }}
        >
          Bundle failed: {result.error}. Retry runs every check again; a smaller
          output size may help on low-memory devices.
        </p>
      )}
      {result?.failures?.length > 0 && (
        <div
          role="alert"
          className="text-sm"
          style={{ color: "var(--warn-ink)" }}
          data-testid="bundle-refused"
        >
          <p className="font-semibold">
            {result.stopped
              ? `Stopped: ${result.failures.length} route${result.failures.length === 1 ? " was" : "s were"} refused, so no ZIP was written.`
              : `${result.failures.length} route${result.failures.length === 1 ? " was" : "s were"} refused and left out (listed in MANIFEST.json).`}
          </p>
          <ul className="list-disc pl-5">
            {result.failures.map((f) => (
              <li key={f.id}>
                {f.label}: {f.reason}
              </li>
            ))}
          </ul>
          {result.stopped && (
            <p className="text-xs">
              Fix the poem or the look and Retry, or choose “Continue without
              failed routes” to export the others.
            </p>
          )}
        </div>
      )}
      {result?.zip && (
        <p
          className="text-xs"
          style={{ color: "var(--mute)" }}
          data-testid="bundle-done"
        >
          {result.manifest.routesWritten} route
          {result.manifest.routesWritten === 1 ? "" : "s"} in the ZIP · bundle{" "}
          {result.manifest.complete
            ? "complete"
            : "NOT complete (see MANIFEST.json)"}
          {result.manifest.routes.some((r) => r.excerpt || r.partial)
            ? " · some outputs are excerpts or partial"
            : ""}
        </p>
      )}
    </section>
  );
}
