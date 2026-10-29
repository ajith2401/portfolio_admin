// src/app/studio/StudioApp.jsx
"use client";
import { useRef, useState } from "react";
import { Undo2, Redo2, RotateCcw, Download, Loader2 } from "lucide-react";
import { useStudioState } from "./useStudioState";
import { useFitScale, exportPoem } from "./lib";
import { ASPECTS, EDITION_BY_ID } from "./presets";
import Controls from "./Controls";
import PoemCanvas from "./PoemCanvas";

export default function StudioApp() {
  const { settings, patch, undo, redo, reset, canUndo, canRedo } =
    useStudioState();
  const canvasRef = useRef(null);
  const { w, h } = ASPECTS[settings.aspect];
  const { ref: stageRef, scale } = useFitScale(w, h);
  const [busy, setBusy] = useState(null); // 'png' | 'jpg' | null

  const [exportError, setExportError] = useState(null);

  const download = async (format) => {
    if (!canvasRef.current) return;
    setBusy(format);
    setExportError(null);
    try {
      const name = (settings.title || settings.author || "poem")
        .replace(/\s+/g, "-")
        .toLowerCase();
      await exportPoem(canvasRef.current, {
        format,
        pixelRatio: 3,
        fileName: name,
      });
    } catch (err) {
      // Never alert() — a native dialog freezes the whole tab. Show it inline.
      console.error("[poetry-studio] export failed", err);
      setExportError("Export failed — please try again.");
    } finally {
      setBusy(null);
    }
  };

  const editionName = EDITION_BY_ID[settings.edition]?.label || "Poetry Studio";

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F4F1EA] text-stone-800">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-[#FBFAF7]/90 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <span className="font-playfair text-xl tracking-tight text-stone-900">
            Poetry Studio
          </span>
          <span className="hidden font-serif text-xs italic text-stone-400 sm:inline">
            a publishing studio for poets
          </span>
        </div>

        {/* Current edition — the page's identity, quietly stated. */}
        <div className="hidden items-baseline gap-2 md:flex">
          <span className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
            Edition
          </span>
          <span className="font-serif text-sm italic text-stone-700">
            {editionName}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <IconBtn onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
            <Undo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
            <Redo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn onClick={reset} title="Reset to defaults">
            <RotateCcw className="h-4 w-4" />
          </IconBtn>
          <div className="mx-1 h-5 w-px bg-stone-200" />
          <button
            onClick={() => download("jpg")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
          >
            {busy === "jpg" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            JPG
          </button>
          <button
            onClick={() => download("png")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#7A2E2E] px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-[#682626] disabled:opacity-50"
          >
            {busy === "png" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            PNG · 3×
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-stone-200 bg-[#FBFAF7]">
          <Controls settings={settings} patch={patch} />
        </aside>

        {/* Preview stage */}
        <main
          ref={stageRef}
          className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-8"
          style={{
            background:
              "radial-gradient(130% 120% at 50% -10%, #3A342B 0%, #26211A 46%, #161209 100%)",
          }}
        >
          <div
            style={{ width: w * scale, height: h * scale }}
            className="rounded-[2px] shadow-[0_40px_90px_-20px_rgba(0,0,0,0.65),0_12px_30px_-10px_rgba(0,0,0,0.55)]"
          >
            <div
              style={{
                width: w,
                height: h,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <PoemCanvas ref={canvasRef} settings={settings} />
            </div>
          </div>

          <span className="pointer-events-none absolute bottom-3 right-4 text-[11px] tabular-nums text-stone-300/50">
            {w}×{h} · exports at {w * 3}×{h * 3}
          </span>

          {exportError ? (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-stone-900/90 px-4 py-2 text-sm text-white shadow-lg">
              {exportError}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function IconBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="rounded-md p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
