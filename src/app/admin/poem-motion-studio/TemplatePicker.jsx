"use client";
// Template chooser with real previews: every card draws the actual renderer (same drawFrame as export) with the
// author's own lines. Hover/keyboard-focus show an enlarged still; tap or the "Preview" button opens a full-screen
// animated preview. Hover is never the only way in: every action has a 44px button.
import { useEffect, useMemo, useRef, useState } from "react";
import { drawFrame } from "@/lib/motion-studio/render";
import { defaultComposition } from "@/lib/motion-studio/composition";
import { TEMPLATES, FONT_LABELS } from "@/lib/motion-studio/templates";

const SAMPLE = [
  {
    id: "p1",
    kind: "stanza",
    lines: ["அன்பே சிவம்", "அறமே துணை"],
    durationMs: 3000,
  },
  {
    id: "p2",
    kind: "stanza",
    lines: ["Rain on a quiet street", "மழை பேசும் மௌனம்"],
    durationMs: 3000,
  },
];
const MOTION_LABEL = { fade: "Fade in", line: "Line by line", rise: "Rise up" };
const BGMOTION_LABEL = {
  none: "Still background",
  drift: "Slow drift",
  zoom: "Slow zoom",
};
const PARTICLE_LABEL = {
  none: "No particles",
  dust: "Floating dust",
  rain: "Rain",
  stars: "Stars",
  light: "Light motes",
};

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The author's first scenes when they exist, otherwise a Tamil + mixed sample, so a preview is never blank. */
function sampleScenes(comp) {
  const mine = (comp?.scenes || []).filter((s) => s.lines?.length).slice(0, 2);
  return mine.length
    ? mine.map((s) => ({
        ...s,
        durationMs: Math.max(2400, Math.min(s.durationMs || 3000, 4000)),
      }))
    : SAMPLE;
}
const previewComp = (id, scenes) =>
  defaultComposition({ format: "reel", templateId: id, scenes, signature: "" });

function Thumb({ id, scenes, width, tick, animate = false, still = true }) {
  const ref = useRef(null);
  const height = Math.round((width * 16) / 9);
  const comp = useMemo(() => previewComp(id, scenes), [id, scenes]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const draw = (t) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawFrame(ctx, comp, t, {
        w: cv.width,
        h: cv.height,
        still: still && !animate,
        scene: still && !animate ? comp.scenes[0] : null,
        assets: {},
      });
    };
    if (!animate || prefersReduced()) {
      draw(0);
      return;
    }
    let raf,
      t0 = performance.now();
    const total = comp.scenes.reduce((n, s) => n + s.durationMs, 0) || 6000;
    const loop = (now) => {
      draw((now - t0) % total);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [comp, tick, animate, still]);
  return (
    <canvas
      ref={ref}
      width={width * 2}
      height={height * 2}
      style={{ width, height }}
      className="rounded-md"
      aria-hidden="true"
    />
  );
}

function PreviewDialog({ tpl, scenes, tick, selected, onUse, onClose }) {
  const closeRef = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const f = box.current?.querySelectorAll("button:not([disabled])");
      if (!f?.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  const reduced = prefersReduced();
  const width =
    typeof window !== "undefined"
      ? Math.min(300, Math.floor((window.innerHeight * 0.52 * 9) / 16))
      : 270;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={`Template preview: ${tpl.name}`}
        className="pms-card flex max-h-[96dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-b-none sm:rounded-b-xl"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{tpl.name}</h2>
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              {tpl.mood}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="pms-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <Thumb
            id={tpl.id}
            scenes={scenes}
            width={width}
            tick={tick}
            animate
            still={false}
          />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
          <dl className="space-y-2">
            <div>
              <dt className="font-semibold">Typography</dt>
              <dd>
                {FONT_LABELS[tpl.style.font]} · {tpl.style.sizePx}px · weight{" "}
                {tpl.style.weight}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Background</dt>
              <dd className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-5 w-10 rounded border"
                  style={{
                    background: `linear-gradient(135deg, ${tpl.bg.a}, ${tpl.bg.b})`,
                    borderColor: "var(--line)",
                  }}
                />
                {tpl.bg.kind === "paper"
                  ? "Paper texture"
                  : tpl.bg.kind === "solid"
                    ? "Solid"
                    : "Gradient"}{" "}
                · {tpl.bg.a} → {tpl.bg.b}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Animation</dt>
              <dd>
                {MOTION_LABEL[tpl.motion.textIn] || tpl.motion.textIn} ·{" "}
                {BGMOTION_LABEL[tpl.motion.bgMotion] || tpl.motion.bgMotion} ·{" "}
                {PARTICLE_LABEL[tpl.fx.particles] || tpl.fx.particles}
              </dd>
            </div>
          </dl>
            {reduced && (
              <p style={{ color: "var(--mute)" }}>
                Reduced motion is on, so this preview is a still frame.
              </p>
            )}
            <p style={{ color: "var(--mute)" }}>
              Shown with{" "}
              {scenes === SAMPLE
                ? "a sample Tamil and English poem"
                : "your own first lines"}
              , drawn by the same renderer as the export.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="pms-btn pms-primary"
            onClick={() => {
              onUse(tpl.id);
              onClose();
            }}
          >
            {selected ? "Already selected" : "Use this template"}
          </button>
          <button type="button" className="pms-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatePicker({ comp, tick, onPick }) {
  const key = (comp?.scenes || []).slice(0, 2).map((x) => `${x.id}:${x.durationMs}:${(x.lines || []).join("|")}`).join("#");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scenes = useMemo(() => sampleScenes(comp), [key]);
  const [peek, setPeek] = useState(null); // hover or keyboard focus: enlarged still
  const [open, setOpen] = useState(null); // full preview dialog
  const tpl = open ? TEMPLATES.find((x) => x.id === open) : null;
  return (
    <div>
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(112px,1fr))" }}
        aria-label="Templates"
      >
        {TEMPLATES.map((x) => {
          const sel = comp.templateId === x.id;
          return (
            <li
              key={x.id}
              className="relative"
              onMouseEnter={() => setPeek(x.id)}
              onMouseLeave={() => setPeek((p) => (p === x.id ? null : p))}
              onFocus={() => setPeek(x.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget))
                  setPeek((p) => (p === x.id ? null : p));
              }}
            >
              <div
                className="pms-card flex flex-col items-center gap-2 p-2"
                style={
                  sel
                    ? {
                        borderColor: "var(--accent)",
                        boxShadow: "0 0 0 3px var(--accent)",
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  aria-pressed={sel}
                  aria-label={`Use template ${x.name}`}
                  className="w-full rounded-lg p-1"
                  style={{ background: "transparent" }}
                  onClick={() => onPick(x.id)}
                >
                  <div className="mx-auto w-fit">
                    <Thumb id={x.id} scenes={scenes} width={96} tick={tick} />
                  </div>
                  <span className="mt-1 block text-sm font-semibold">
                    {x.name}
                  </span>
                  <span
                    className="block text-xs"
                    style={{ color: "var(--mute)" }}
                  >
                    {x.mood}
                  </span>
                </button>
                <button
                  type="button"
                  className="pms-btn w-full"
                  aria-label={`Preview template ${x.name}`}
                  onClick={() => setOpen(x.id)}
                >
                  Preview
                </button>
              </div>
              {peek === x.id && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 -translate-y-[15%] rounded-xl border p-2 shadow-xl md:block"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--line)",
                  }}
                >
                  <Thumb id={x.id} scenes={scenes} width={180} tick={tick} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {tpl && (
        <PreviewDialog
          tpl={tpl}
          scenes={scenes}
          tick={tick}
          selected={comp.templateId === tpl.id}
          onUse={onPick}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
