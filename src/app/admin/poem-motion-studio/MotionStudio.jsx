"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, errorMessage } from "@/lib/editor/writing-client";
import { poemFromWriting } from "@/lib/motion-studio/poem";
import { generateScenes, totalDuration } from "@/lib/motion-studio/scenes";
import { TEMPLATES, FONT_KEYS, FONT_LABELS } from "@/lib/motion-studio/templates";
import { defaultComposition, normalizeComposition, PARTICLES, TEXT_IN, BG_MOTION } from "@/lib/motion-studio/composition";
import { drawFrame, compDuration, setFontFamilies } from "@/lib/motion-studio/render";
import { FORMATS, safeRect } from "@/lib/motion-studio/safe-zone";
import { detectCapabilities, exportMp4, exportPng } from "@/lib/motion-studio/export";
import { FONT_CSS } from "./fonts";

const btn = "min-h-11 rounded-lg px-4 text-sm font-medium border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50";
const btnPrimary = "min-h-11 rounded-lg px-4 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50";
const label = "block text-sm font-medium text-gray-800 mb-1";
const field = "w-full min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900";

function download(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function MotionStudio() {
  const [writings, setWritings] = useState([]);
  const [source, setSource] = useState(null); // { id, title, warnings }
  const [comp, setComp] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [msg, setMsg] = useState(null); // {kind:'error'|'ok', text}
  const [saveState, setSaveState] = useState("idle");
  const [sourceChanged, setSourceChanged] = useState(false);
  const [caps, setCaps] = useState(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [guide, setGuide] = useState(true);
  const [progress, setProgress] = useState(null);
  const canvasRef = useRef(null);
  const abortRef = useRef(null);
  const loadedRef = useRef(false);

  const flash = (kind, text) => setMsg({ kind, text });

  useEffect(() => { setFontFamilies(FONT_CSS); detectCapabilities().then(setCaps); }, []);
  useEffect(() => {
    (async () => {
      const [w, p] = await Promise.all([apiRequest("GET", "/api/writings?category=poem&limit=100"), apiRequest("GET", "/api/motion-projects")]);
      if (w.ok) setWritings(w.data.writings || []); else flash("error", errorMessage(w.data) || "Could not load poems");
      if (p.ok) setProjects(p.data.projects || []);
    })();
  }, []);

  const total = comp ? compDuration(comp) : 0;
  const fmt = comp ? FORMATS[comp.format] : FORMATS.reel;

  // draw (fonts must be ready for Tamil shaping; document.fonts.ready + explicit load)
  const paint = useCallback(async (time) => {
    const c = canvasRef.current; if (!c || !comp) return;
    const ctx = c.getContext("2d");
    drawFrame(ctx, comp, time, { w: c.width, h: c.height });
    if (guide) {
      const s = c.width / fmt.w, r = safeRect(fmt.w, fmt.h, fmt.safe);
      ctx.save(); ctx.strokeStyle = "#ff3366"; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
      ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s); ctx.restore();
    }
  }, [comp, guide, fmt]);
  useEffect(() => {
    if (!comp) return;
    (async () => {
      try { await Promise.all(Object.values(FONT_CSS).map((f) => document.fonts.load(`500 40px ${f}`, "தமிழ்"))); } catch {}
      paint(t);
    })();
  }, [comp, t, paint]);
  useEffect(() => {
    if (!playing || !comp) return;
    let raf, start = performance.now() - t;
    const tick = (now) => { const el = now - start; if (el >= total) { setT(0); setPlaying(false); return; } setT(el); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (id) => {
    if (!id) return;
    const r = await apiRequest("GET", `/api/writings/${id}`);
    if (!r.ok) return flash("error", errorMessage(r.data) || "Could not load poem");
    const poem = poemFromWriting(r.data);
    if (!poem.stanzas.length) return flash("error", "This writing has no poem lines to animate.");
    const scenes = generateScenes(poem, { title: r.data.title });
    setSource({ id, title: r.data.title, warnings: poem.warnings });
    setComp(defaultComposition({ scenes })); setName(r.data.title || "Untitled"); setProjectId(null); setT(0); setSourceChanged(false); loadedRef.current = false;
    flash("ok", `Created ${scenes.length} scenes from “${r.data.title}”. The original writing is unchanged.`);
  };
  const patch = (fn) => setComp((c) => normalizeComposition(fn(structuredClone(c))));
  const applyTemplate = (id) => setComp((c) => {
    const base = defaultComposition({ format: c.format, templateId: id, scenes: c.scenes, signature: c.branding.signature });
    return base;
  });

  // ---- projects ----
  const save = useCallback(async () => {
    if (!comp) return;
    setSaveState("saving");
    const r = projectId
      ? await apiRequest("PUT", `/api/motion-projects/${projectId}`, { name, composition: comp })
      : await apiRequest("POST", "/api/motion-projects", { name: name || "Untitled", composition: comp, sourceWritingId: source?.id });
    if (!r.ok) { setSaveState("error"); return flash("error", errorMessage(r.data) || "Save failed"); }
    if (!projectId) { setProjectId(r.data.project._id); setProjects((p) => [r.data.project, ...p]); }
    setSaveState("saved");
  }, [comp, name, projectId, source]);
  useEffect(() => { // autosave: only after a project exists, debounced
    if (!projectId || !comp) return;
    if (!loadedRef.current) { loadedRef.current = true; return; }
    setSaveState("dirty");
    const h = setTimeout(save, 1500);
    return () => clearTimeout(h);
  }, [comp, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProject = async (id) => {
    const r = await apiRequest("GET", `/api/motion-projects/${id}`);
    if (!r.ok) return flash("error", errorMessage(r.data) || "Could not open project");
    loadedRef.current = false;
    setComp(normalizeComposition(r.data.project.composition)); setName(r.data.project.name); setProjectId(id); setT(0);
    setSource(r.data.project.sourceWritingId ? { id: r.data.project.sourceWritingId, title: r.data.project.sourceTitle, warnings: [] } : null);
    setSourceChanged(!!r.data.sourceChanged);
    if (r.data.sourceMissing) flash("error", "The source writing no longer exists. This project keeps its own copy of the text.");
  };
  const ackSource = async () => { const r = await apiRequest("PUT", `/api/motion-projects/${projectId}`, { acknowledgeSource: true }); if (r.ok) setSourceChanged(false); };
  const rebuild = async () => {
    const r = await apiRequest("GET", `/api/writings/${source.id}`); if (!r.ok) return flash("error", "Could not reload the poem");
    const scenes = generateScenes(poemFromWriting(r.data), { title: r.data.title });
    setComp((c) => normalizeComposition({ ...c, scenes })); await ackSource();
  };
  const duplicate = async () => {
    const r = await apiRequest("POST", "/api/motion-projects", { name: `${name} (copy)`, composition: comp, sourceWritingId: source?.id });
    if (r.ok) { setProjects((p) => [r.data.project, ...p]); setProjectId(r.data.project._id); setName(r.data.project.name); flash("ok", "Duplicated."); } else flash("error", errorMessage(r.data) || "Duplicate failed");
  };
  const remove = async () => {
    if (!projectId || !window.confirm(`Delete project “${name}”? The original writing is not affected.`)) return;
    const r = await apiRequest("DELETE", `/api/motion-projects/${projectId}`);
    if (r.ok) { setProjects((p) => p.filter((x) => x._id !== projectId)); setProjectId(null); flash("ok", "Project deleted."); } else flash("error", errorMessage(r.data) || "Delete failed");
  };

  // ---- export ----
  const doReel = async () => {
    setPlaying(false); abortRef.current = new AbortController(); setProgress(0); setMsg(null);
    try {
      await Promise.all(Object.values(FONT_CSS).map((f) => document.fonts.load(`500 40px ${f}`, "தமிழ்")));
      const blob = await exportMp4({ ...comp, format: comp.format === "poster" ? "reel" : comp.format }, { onProgress: setProgress, signal: abortRef.current.signal });
      download(blob, `${(name || "poem").replace(/[^\w஀-௿-]+/g, "-")}-${comp.format}.mp4`);
      flash("ok", `Exported ${(blob.size / 1048576).toFixed(1)} MB MP4. Play it on your device to confirm before posting.`);
    } catch (e) { flash("error", e?.name === "AbortError" ? "Export cancelled." : `Export failed: ${e?.message || e}`); }
    setProgress(null);
  };
  const doPoster = async () => {
    try { await Promise.all(Object.values(FONT_CSS).map((f) => document.fonts.load(`500 40px ${f}`, "தமிழ்"))); download(await exportPng(comp), `${(name || "poem").replace(/[^\w஀-௿-]+/g, "-")}-poster.png`); }
    catch (e) { flash("error", `Poster export failed: ${e?.message || e}`); }
  };

  const previewW = 270, previewH = Math.round((previewW * fmt.h) / fmt.w);
  const tpl = comp?.templateId;
  const num = (v, set) => <input className={field} type="number" value={v} onChange={(e) => set(Number(e.target.value))} />;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 text-gray-900">
      <h1 className="text-2xl font-semibold">Poem Motion Studio</h1>
      <p className="text-sm text-gray-700 mt-1">Turn a Tamil poem into a Reel, Story or Poster. Your original writing is never modified.</p>

      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${msg.kind === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{msg.text}</p>}
      {sourceChanged && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The source poem changed after this project was made. Your scenes are untouched.
          <div className="mt-2 flex gap-2"><button className={btn} onClick={rebuild}>Rebuild scenes from the poem</button><button className={btn} onClick={ackSource}>Keep my scenes</button></div>
        </div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor="pms-src">Start from a poem</label>
          <select id="pms-src" className={field} value={source?.id || ""} onChange={(e) => pick(e.target.value)}>
            <option value="">Choose a poem…</option>
            {writings.map((w) => <option key={w._id} value={w._id}>{w.title}</option>)}
          </select></div>
        <div><label className={label} htmlFor="pms-proj">Open a saved project</label>
          <select id="pms-proj" className={field} value={projectId || ""} onChange={(e) => e.target.value && openProject(e.target.value)}>
            <option value="">Saved projects ({projects.length})…</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select></div>
      </section>
      {source?.warnings?.length > 0 && <p className="mt-2 text-sm text-amber-800">This is a legacy Markdown poem; it was converted for the preview with {source.warnings.length} note(s).</p>}

      {!comp ? <p className="mt-8 text-gray-700">Pick a poem to begin.</p> : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[300px_1fr]">
          <div>
            <canvas ref={canvasRef} width={previewW * 2} height={previewH * 2} style={{ width: previewW, height: previewH }} className="mx-auto rounded-lg border border-gray-300 bg-black" aria-label="Preview" />
            <div className="mt-3 flex items-center gap-2 justify-center">
              <button className={btn} onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
              <button className={btn} onClick={() => { setPlaying(false); setT(0); }}>Restart</button>
            </div>
            <label className="mt-2 block text-sm text-gray-800">Timeline
              <input type="range" className="w-full" min={0} max={Math.max(1, total)} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} /></label>
            <p className="text-xs text-gray-700 text-center">{(t / 1000).toFixed(1)}s / {(total / 1000).toFixed(1)}s</p>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Show Instagram safe zone</label>
          </div>

          <div className="space-y-5">
            <fieldset><legend className={label}>Format</legend>
              <div className="flex flex-wrap gap-2">{["reel", "story", "poster"].map((f) => <button key={f} className={comp.format === f ? btnPrimary : btn} onClick={() => patch((c) => ({ ...c, format: f }))}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div></fieldset>

            <fieldset><legend className={label}>Template</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{TEMPLATES.map((x) => (
                <button key={x.id} aria-pressed={tpl === x.id} onClick={() => applyTemplate(x.id)} className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm ${tpl === x.id ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-300"}`}
                  style={{ background: `linear-gradient(135deg, ${x.bg.a}, ${x.bg.b})`, color: x.style.color }}>
                  <span className="font-semibold">{x.name}</span><br /><span className="text-xs opacity-90">{x.mood}</span></button>))}</div></fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={label}>Font</label><select aria-label="Font" className={field} value={comp.style.font} onChange={(e) => patch((c) => { c.style.font = e.target.value; return c; })}>{FONT_KEYS.map((k) => <option key={k} value={k}>{FONT_LABELS[k]}</option>)}</select></div>
              <div><label className={label}>Size ({comp.style.sizePx}px)</label><input aria-label="Font size" type="range" className="w-full" min={28} max={140} value={comp.style.sizePx} onChange={(e) => patch((c) => { c.style.sizePx = Number(e.target.value); return c; })} /></div>
              <div><label className={label}>Line height ({comp.style.lineHeight.toFixed(2)})</label><input aria-label="Line height" type="range" className="w-full" min={1.2} max={2.4} step={0.05} value={comp.style.lineHeight} onChange={(e) => patch((c) => { c.style.lineHeight = Number(e.target.value); return c; })} /></div>
              <div><label className={label}>Alignment</label><select aria-label="Alignment" className={field} value={comp.style.align} onChange={(e) => patch((c) => { c.style.align = e.target.value; return c; })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
              <div><label className={label}>Text colour</label><input aria-label="Text colour" type="color" className="h-11 w-full rounded-lg border border-gray-300" value={comp.style.color} onChange={(e) => patch((c) => { c.style.color = e.target.value; return c; })} /></div>
              <div><label className={label}>Text appears</label><select aria-label="Text appears" className={field} value={comp.motion.textIn} onChange={(e) => patch((c) => { c.motion.textIn = e.target.value; return c; })}>{TEXT_IN.map((k) => <option key={k}>{k}</option>)}</select></div>
              <div><label className={label}>Background motion</label><select aria-label="Background motion" className={field} value={comp.motion.bgMotion} onChange={(e) => patch((c) => { c.motion.bgMotion = e.target.value; return c; })}>{BG_MOTION.map((k) => <option key={k}>{k}</option>)}</select></div>
              <div><label className={label}>Particles</label><select aria-label="Particles" className={field} value={comp.style.particles} onChange={(e) => patch((c) => { c.style.particles = e.target.value; return c; })}>{PARTICLES.map((k) => <option key={k}>{k}</option>)}</select></div>
              <div><label className={label}>Signature</label><input aria-label="Signature" className={field} value={comp.branding.signature} maxLength={60} onChange={(e) => patch((c) => { c.branding.signature = e.target.value; return c; })} /></div>
              <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-gray-800 min-h-11"><input type="checkbox" checked={comp.branding.show} onChange={(e) => patch((c) => { c.branding.show = e.target.checked; return c; })} /> Show signature</label></div>
            </div>

            <section><h2 className="text-lg font-semibold">Scenes ({comp.scenes.length})</h2>
              <ol className="mt-2 space-y-2">{comp.scenes.map((s, i) => (
                <li key={s.id} className="rounded-lg border border-gray-300 bg-white p-3">
                  <button className="text-left w-full" onClick={() => { setPlaying(false); setT(comp.scenes.slice(0, i).reduce((n, x) => n + x.durationMs, 0)); }}>
                    <span className="text-xs text-gray-700">{i + 1}. {s.kind === "title" ? "Title" : "Stanza"} · {(s.durationMs / 1000).toFixed(1)}s</span>
                    <span className="block whitespace-pre-line text-sm text-gray-900">{s.lines.join("\n")}</span></button>
                  <div className="mt-2 flex items-center gap-2"><label className="text-xs text-gray-700" htmlFor={`d${i}`}>Seconds</label>
                    <input id={`d${i}`} type="number" min={3} max={12} step={0.5} className="w-20 min-h-11 rounded-lg border border-gray-300 px-2 text-sm" value={s.durationMs / 1000} onChange={(e) => patch((c) => { c.scenes[i].durationMs = Number(e.target.value) * 1000; return c; })} />
                    <button className={btn} onClick={() => patch((c) => { c.scenes.splice(i, 1); return c; })} aria-label={`Remove scene ${i + 1} from the video`}>Remove</button></div>
                </li>))}</ol></section>

            <section className="rounded-lg border border-gray-300 bg-white p-4">
              <h2 className="text-lg font-semibold">Save</h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input aria-label="Project name" className={field} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /><button className={btnPrimary} onClick={save}>{projectId ? "Save now" : "Save project"}</button></div>
              <p className="mt-1 text-xs text-gray-700" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved." : saveState === "dirty" ? "Autosaving…" : saveState === "error" ? "Save failed — your work is still on screen." : projectId ? "Autosave is on." : "Not saved yet."}</p>
              {projectId && <div className="mt-2 flex gap-2"><button className={btn} onClick={duplicate}>Duplicate</button><button className={btn} onClick={remove}>Delete project</button></div>}
            </section>

            <section className="rounded-lg border border-gray-300 bg-white p-4">
              <h2 className="text-lg font-semibold">Export</h2>
              {caps && !caps.mp4 && <p className="mt-1 text-sm text-amber-800">{caps.reason} Reel/Story MP4 export is disabled on this device.</p>}
              {caps?.mp4 && <p className="mt-1 text-xs text-gray-700">This browser reports H.264 encoding support. Always play the exported file on your phone before posting.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={!caps?.mp4 || progress !== null || comp.format === "poster"} onClick={doReel}>{progress !== null ? `Rendering ${Math.round(progress * 100)}%` : `Export ${comp.format === "story" ? "Story" : "Reel"} MP4`}</button>
                {progress !== null && <button className={btn} onClick={() => abortRef.current?.abort()}>Cancel</button>}
                <button className={btn} onClick={doPoster}>Export Poster PNG</button>
              </div>
              {comp.format === "poster" && <p className="mt-1 text-xs text-gray-700">Switch the format to Reel or Story to export video.</p>}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
