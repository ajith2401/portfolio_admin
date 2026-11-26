"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, errorMessage } from "@/lib/editor/writing-client";
import { poemFromWriting } from "@/lib/motion-studio/poem";
import { generateScenes } from "@/lib/motion-studio/scenes";
import {
  TEMPLATES,
  FONT_KEYS,
  FONT_LABELS,
} from "@/lib/motion-studio/templates";
import {
  defaultComposition,
  normalizeComposition,
  PARTICLES,
  TEXT_IN,
  BG_MOTION,
} from "@/lib/motion-studio/composition";
import {
  drawFrame,
  compDuration,
  setFontFamilies,
} from "@/lib/motion-studio/render";
import { FORMATS, safeRect } from "@/lib/motion-studio/safe-zone";
import {
  detectCapabilities,
  exportMp4,
  renderSceneStills,
  renderPosters,
  renderFullPoem,
  renderReelCover,
  zipBlobs,
} from "@/lib/motion-studio/export";
import * as E from "@/lib/motion-studio/scene-edit";
import {
  bakeBackground,
  readabilityScrim,
  decodeImageFile,
} from "@/lib/motion-studio/background";
import {
  decodeAudio,
  shapeAudio,
  startRecording,
  recordingSupport,
} from "@/lib/motion-studio/audio";
import { FONT_CSS } from "./fonts";
import {
  parsePoemText,
  poemToText,
  importPoemFile,
} from "@/lib/motion-studio/poem-input";
import {
  layoutFullPoem,
  drawFullPoem,
  fullPoemCoverage,
  PRESETS as FULL_PRESETS,
  FULL_W,
} from "@/lib/motion-studio/full-poem";
import {
  saveDraft,
  loadDraft,
  listDrafts,
  deleteDraft,
  clearDrafts,
  newDraftId,
} from "@/lib/motion-studio/drafts";

const THEME_CSS = `
.pms{--bg:#f6f6f4;--card:#fff;--ink:#14141a;--mute:#4a4a55;--line:#c9c9d1;--accent:#14141a;--accent-ink:#fff;--warn-bg:#fff7e0;--warn-ink:#5c3d00;--err-bg:#fdecec;--err-ink:#7a1010;--ok-bg:#e8f6ee;--ok-ink:#0b4a26;color:var(--ink);background:var(--bg)}
.pms[data-theme=dark]{--bg:#101014;--card:#1b1b22;--ink:#f1f1f4;--mute:#b4b4c0;--line:#4a4a58;--accent:#f1f1f4;--accent-ink:#101014;--warn-bg:#3a2d08;--warn-ink:#ffe3a3;--err-bg:#3c1414;--err-ink:#ffc9c9;--ok-bg:#0f3321;--ok-ink:#bff0d3}
@media (prefers-color-scheme:dark){.pms[data-theme=system]{--bg:#101014;--card:#1b1b22;--ink:#f1f1f4;--mute:#b4b4c0;--line:#4a4a58;--accent:#f1f1f4;--accent-ink:#101014;--warn-bg:#3a2d08;--warn-ink:#ffe3a3;--err-bg:#3c1414;--err-ink:#ffc9c9;--ok-bg:#0f3321;--ok-ink:#bff0d3}}
.pms button:focus-visible,.pms input:focus-visible,.pms select:focus-visible,.pms textarea:focus-visible,.pms [role=tab]:focus-visible{outline:3px solid #2f6fed;outline-offset:2px}
.pms-btn{min-height:44px;min-width:44px;border-radius:10px;padding:0 14px;font-size:14px;font-weight:600;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.pms-btn:disabled{opacity:.5}.pms-btn[aria-pressed=true],.pms-primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.pms-field{width:100%;min-height:44px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:0 10px;font-size:14px}
.pms-card{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:12px}
.pms-lbl{display:block;font-size:13px;font-weight:600;margin-bottom:4px}
.pms-tabs{position:sticky;bottom:0;z-index:20;background:var(--card);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom)}
@media (min-width:1024px){.pms-tabs{position:static;border-top:0;border-bottom:1px solid var(--line)}}
`;
const cx = (...a) => a.filter(Boolean).join(" ");
const slug = (s) => (s || "poem").replace(/[^\w஀-௿-]+/g, "-");
function download(blob, name) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: name,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
const Btn = ({ primary, className, ...p }) => (
  <button
    type="button"
    {...p}
    className={cx("pms-btn", primary && "pms-primary", className)}
  />
);
const Field = ({ label, children, hint }) => (
  <div>
    <label className="pms-lbl">
      {label}
      {children}
    </label>
    {hint && (
      <p className="text-xs" style={{ color: "var(--mute)" }}>
        {hint}
      </p>
    )}
  </div>
);
const Range = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt = (v) => v,
}) => (
  <label className="pms-lbl">
    {label}: {fmt(value)}
    <input
      aria-label={label}
      type="range"
      className="w-full"
      style={{ minHeight: 44 }}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </label>
);

export default function MotionStudio() {
  const [theme, setTheme] = useState("system");
  const [mode, setMode] = useState("quick");
  const [tab, setTab] = useState("scenes");
  const [writings, setWritings] = useState([]);
  const [source, setSource] = useState(null);
  const [, bump] = useState(0);
  const [hist] = useState(() => E.createHistory(null));
  const [scrimPct, setScrimPct] = useState(0);
  const [hasBitmap, setHasBitmap] = useState(false);
  const [recOk, setRecOk] = useState({ ok: true });
  const lastKey = useRef({ k: null, at: 0 });
  const [projectId, setProjectId] = useState(null);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [sourceChanged, setSourceChanged] = useState(false);
  const [caps, setCaps] = useState(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [guide, setGuide] = useState(true);
  const [progress, setProgress] = useState(null);
  const [sel, setSel] = useState(0);
  const [full, setFull] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [bgReady, setBgReady] = useState(0);
  const [stills, setStills] = useState(null);
  const [audioInfo, setAudioInfo] = useState(null);
  const [recState, setRecState] = useState("idle");
  const [route, setRoute] = useState(null);
  const [textBox, setTextBox] = useState("");
  const [titleBox, setTitleBox] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [cloudDialog, setCloudDialog] = useState(false);
  const [poemText, setPoemText] = useState("");
  const [poemTitle, setPoemTitle] = useState("");
  const [fontTick, setFontTick] = useState(0);
  const [draftSaved, setDraftSaved] = useState(null);
  const draftId = useRef(null);
  const fullCanvasRef = useRef(null);
  const canvasRef = useRef(null),
    fullRef = useRef(null),
    abortRef = useRef(null),
    loadedRef = useRef(false);
  const bgBitmap = useRef(null),
    assetsRef = useRef({}),
    audioRef = useRef({ blob: null, buffer: null, url: null }),
    recRef = useRef(null);

  const comp = hist.present;
  const flash = (kind, text) => setMsg({ kind, text });
  const total = comp ? compDuration(comp) : 0;
  const fmt = comp ? FORMATS[comp.format] : FORMATS.reel;

  // ---- history-backed edits (coalesce rapid edits sharing a key so undo steps are meaningful)
  const commit = useCallback((next, key) => {
    const h = hist;
    if (!h.present) return;
    const now = Date.now();
    if (key && lastKey.current.k === key && now - lastKey.current.at < 900)
      h.replacePresent(next);
    else h.push(next);
    lastKey.current = { k: key || null, at: now };
    bump((n) => n + 1);
  }, [hist]);
  const update = (fn, key) =>
    commit(fn(structuredClone(hist.present)), key);
  const setScenes = (fn, key) =>
    update((c) => ({ ...c, scenes: fn(c.scenes) }), key);
  const start = (c) => {
    hist.reset(c);
    lastKey.current = { k: null, at: 0 };
    bump((n) => n + 1);
  };
  const undo = () => {
    hist.undo();
    bump((n) => n + 1);
  };
  const redo = () => {
    hist.redo();
    bump((n) => n + 1);
  };

  useEffect(() => {
    setFontFamilies(FONT_CSS);
    setRecOk(recordingSupport());
    detectCapabilities().then(setCaps);
    try {
      const th = localStorage.getItem("pms:theme");
      if (th) setTheme(th);
      const m = localStorage.getItem("pms:mode");
      if (m) setMode(m);
      localStorage.removeItem("pms:draft"); // legacy key; recovery now lives in IndexedDB
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("pms:theme", theme);
      localStorage.setItem("pms:mode", mode);
    } catch {}
  }, [theme, mode]);
  useEffect(() => {
    (async () => {
      const [w, p] = await Promise.all([
        apiRequest("GET", "/api/writings?category=poem&limit=100"),
        apiRequest("GET", "/api/motion-projects"),
      ]);
      if (w.ok) setWritings(w.data.writings || []);
      else flash("error", errorMessage(w.data) || "Could not load poems");
      if (p.ok) setProjects(p.data.projects || []);
    })();
  }, []);
  // device-only recovery copy (IndexedDB). Never sent to the server; shown as "Saved on this device".
  useEffect(() => {
    listDrafts().then(setDrafts);
    document.fonts?.ready?.then(() => setFontTick((n) => n + 1));
    const f = () => setFontTick((n) => n + 1);
    document.fonts?.addEventListener?.("loadingdone", f);
    return () => document.fonts?.removeEventListener?.("loadingdone", f);
  }, []);
  useEffect(() => {
    if (!comp) return;
    const h = setTimeout(async () => {
      if (!draftId.current) draftId.current = newDraftId();
      const ok = await saveDraft({
        id: draftId.current,
        name,
        projectId,
        source,
        composition: normalizeComposition(comp),
      });
      if (ok) setDraftSaved(Date.now());
    }, 800);
    return () => clearTimeout(h);
  });

  // ---- background asset (baked once per parameter change; decoded bitmap capped at 2048px for mobile memory)
  const bg = comp?.style.bg.image;
  const bgKey = bg
    ? `${bg.x}|${bg.y}|${bg.zoom}|${bg.brightness}|${bg.contrast}|${bg.blur}|${comp.format}|${comp.style.color}|${bgReady}`
    : "";
  useEffect(() => {
    if (!comp) return;
    if (!bg || !bgBitmap.current) {
      assetsRef.current = {};
      setT((x) => x);
      return;
    }
    const f = FORMATS[comp.format],
      k = 0.5; // preview-resolution bake; export re-bakes at full size
    const baked = bakeBackground(
      bgBitmap.current,
      bg,
      Math.round(f.w * k),
      Math.round(f.h * k),
    );
    const r = safeRect(f.w, f.h, f.safe);
    const dark = parseInt(comp.style.color.slice(1, 3), 16) < 100;
    const scrim = readabilityScrim(
      baked,
      { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k },
      comp.style.color,
    );
    assetsRef.current = {
      bg: baked,
      scrim,
      scrimColor: dark ? "#fff" : "#000",
    };
    setScrimPct(scrim);
    setT((x) => x);
  }, [bgKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- painting
  const paintTo = useCallback(
    (c, time) => {
      if (!c || !comp) return;
      const ctx = c.getContext("2d");
      drawFrame(ctx, comp, time, {
        w: c.width,
        h: c.height,
        assets: assetsRef.current,
      });
      if (guide) {
        const s = c.width / fmt.w,
          r = safeRect(fmt.w, fmt.h, fmt.safe);
        ctx.save();
        ctx.strokeStyle = "#ff3366";
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
        ctx.restore();
      }
    },
    [comp, guide, fmt],
  );
  const paint = useCallback(
    (time) => {
      paintTo(canvasRef.current, time);
      paintTo(fullRef.current, time);
    },
    [paintTo],
  );
  useEffect(() => {
    if (!comp) return;
    let dead = false;
    (async () => {
      try {
        await Promise.all(
          Object.values(FONT_CSS).map((f) =>
            document.fonts.load(`500 40px ${f}`, "தமிழ் Aa"),
          ),
        );
      } catch {}
      if (!dead) paint(t);
    })();
    return () => {
      dead = true;
    };
  }, [comp, t, paint, full, bgReady]);
  useEffect(() => {
    if (!playing || !comp) return;
    let raf;
    const t0 = performance.now() - t;
    const au = audioRef.current.el;
    if (au) {
      au.currentTime = t / 1000;
      au.play().catch(() => {});
    }
    const tick = (now) => {
      const el = now - t0;
      if (el >= total) {
        setT(0);
        setPlaying(false);
        return;
      }
      setT(el);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audioRef.current.el?.pause();
    };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekScene = (i) => {
    setPlaying(false);
    setSel(i);
    setT(comp.scenes.slice(0, i).reduce((n, x) => n + x.durationMs, 0) + 800);
  };

  // ---- loading a poem
  const pick = async (id) => {
    if (!id) return;
    const r = await apiRequest("GET", `/api/writings/${id}`);
    if (!r.ok)
      return flash("error", errorMessage(r.data) || "Could not load poem");
    const poem = poemFromWriting(r.data);
    if (!poem.stanzas.length)
      return flash("error", "This writing has no poem lines to animate.");
    const scenes = generateScenes(poem, { title: r.data.title });
    draftId.current = null;
    setSource({
      id,
      kind: "writing",
      title: r.data.title,
      warnings: poem.warnings,
      version: r.data.version ?? null,
      poem: { stanzas: poem.stanzas },
    });
    start({
      ...defaultComposition({ scenes }),
      originalScenes: structuredClone(scenes),
    });
    setName(r.data.title || "Untitled");
    setProjectId(null);
    setT(0);
    setSel(0);
    setSourceChanged(false);
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
    flash(
      "ok",
      `Created ${scenes.length} scenes from “${r.data.title}”. The original writing is unchanged.`,
    );
  };
  const startManual = (text, title) => {
    const p = parsePoemText(text, { title });
    if (!p.stanzas.length)
      return flash("error", "Write or paste at least one line of the poem first.");
    const scenes = generateScenes({ stanzas: p.stanzas }, { title: p.title });
    draftId.current = null;
    setSource({ id: null, kind: "manual", title: p.title, warnings: [], poem: { stanzas: p.stanzas } });
    start({
      ...defaultComposition({ scenes }),
      originalScenes: structuredClone(scenes),
      poem: { title: p.title, stanzas: p.stanzas },
    });
    setName(p.title || "Untitled poem");
    setProjectId(null);
    setT(0);
    setSel(0);
    setSourceChanged(false);
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
    flash(
      p.truncated ? "error" : "ok",
      p.truncated
        ? `The text was longer than the ${"60,000"}-character limit and the end was cut. Created ${scenes.length} scenes from the rest.`
        : `Created ${scenes.length} scenes from ${p.lineCount} lines. Nothing was saved to your Portfolio or Admin; a recovery copy stays on this device.`,
    );
  };
  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return flash("error", "The clipboard is empty.");
      setTextBox(t);
      flash("ok", "Pasted. Check the stanza breaks, then choose Create scenes.");
    } catch {
      flash("error", "This browser blocked clipboard access. Tap into the box and use Paste from the keyboard or context menu instead.");
    }
  };
  const onImport = async (file) => {
    try {
      const p = await importPoemFile(file);
      setTextBox(poemToText(p));
      setTitleBox(p.title);
      setRoute("import");
      flash("ok", `Imported “${file.name}” as text only. Review it, then choose Create scenes.`);
    } catch (e) {
      flash("error", e?.message || "Could not import that file.");
    }
  };
  const openDraft = async (id) => {
    const d = await loadDraft(id);
    if (!d) return flash("error", "That recovery copy could not be opened.");
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
    draftId.current = d.id;
    start(normalizeComposition(d.composition));
    setName(d.name);
    setProjectId(d.projectId || null);
    setSource(d.source || null);
    setT(0);
    setSel(0);
    flash("ok", "Restored from this device.");
  };
  const applyPoemEdit = () => {
    const p = parsePoemText(poemText, { title: poemTitle });
    if (!p.stanzas.length) return flash("error", "The poem is empty, so nothing was changed.");
    const scenes = generateScenes({ stanzas: p.stanzas }, { title: p.title });
    setSource((x) => ({ ...x, title: p.title, poem: { stanzas: p.stanzas } }));
    update((c) => ({
      ...c,
      scenes,
      originalScenes: structuredClone(scenes),
      poem: { title: p.title, stanzas: p.stanzas },
    }));
    flash("ok", `Rebuilt ${scenes.length} scenes from your edited text. Use Undo to go back.`);
  };
  useEffect(() => {
    if (source?.poem) {
      setPoemText(poemToText(source.poem));
      setPoemTitle(source.title || "");
    }
  }, [source]);
  const poemMissing = useMemo(
    () =>
      comp && source?.poem ? E.missingLines(source.poem, comp.scenes) : [],
    [comp, source],
  );

  // ---- projects
  const save = useCallback(async () => {
    if (!comp) return;
    setSaveState("saving");
    const body = {
      name: name || "Untitled",
      composition: normalizeComposition(comp),
    };
    const r = projectId
      ? await apiRequest("PUT", `/api/motion-projects/${projectId}`, body)
      : await apiRequest("POST", "/api/motion-projects", {
          ...body,
          ...(source?.id ? { sourceWritingId: source.id } : {}),
        });
    if (!r.ok) {
      setSaveState("error");
      return flash("error", errorMessage(r.data) || "Save failed");
    }
    if (!projectId) {
      setProjectId(r.data.project._id);
      setProjects((p) => [r.data.project, ...p]);
    }
    setSaveState("saved");
  }, [comp, name, projectId, source]);
  useEffect(() => {
    if (!projectId || !comp) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    setSaveState("dirty");
    const h = setTimeout(save, 1500);
    return () => clearTimeout(h);
  }, [comp, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProject = async (id) => {
    const r = await apiRequest("GET", `/api/motion-projects/${id}`);
    if (!r.ok)
      return flash("error", errorMessage(r.data) || "Could not open project");
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
    const c = normalizeComposition(r.data.project.composition);
    start(c);
    setName(r.data.project.name);
    setProjectId(id);
    setT(0);
    setSel(0);
    draftId.current = null;
    setSource(
      r.data.project.sourceWritingId
        ? {
            id: r.data.project.sourceWritingId,
            kind: "writing",
            title: r.data.project.sourceTitle,
            warnings: [],
          }
        : c.poem
          ? { id: null, kind: "manual", title: c.poem.title, warnings: [], poem: { stanzas: c.poem.stanzas } }
          : null,
    );
    setSourceChanged(!!r.data.sourceChanged);
    if (r.data.sourceMissing)
      flash(
        "error",
        "The source writing no longer exists. This project keeps its own copy of the text.",
      );
    else if (c.style.bg.image?.local)
      flash(
        "ok",
        "This project used a photo from your device. Choose it again under Background; until then a gradient is shown.",
      );
  };
  const ackSource = async () => {
    const r = await apiRequest("PUT", `/api/motion-projects/${projectId}`, {
      acknowledgeSource: true,
    });
    if (r.ok) setSourceChanged(false);
  };
  const rebuild = async () => {
    const snap = await apiRequest("POST", "/api/motion-projects", {
      name: `${name} (before rebuild)`,
      composition: normalizeComposition(comp),
      sourceWritingId: source.id,
    });
    if (!snap.ok)
      return flash(
        "error",
        "Could not keep a copy of your current scenes, so nothing was rebuilt.",
      );
    setProjects((p) => [snap.data.project, ...p]);
    const r = await apiRequest("GET", `/api/writings/${source.id}`);
    if (!r.ok) return flash("error", "Could not reload the poem");
    const scenes = generateScenes(poemFromWriting(r.data), {
      title: r.data.title,
    });
    update((c) => ({ ...c, scenes, originalScenes: structuredClone(scenes) }));
    await ackSource();
    flash(
      "ok",
      "Rebuilt from the current poem. Your previous version is saved as “(before rebuild)”.",
    );
  };
  const duplicate = async () => {
    const r = await apiRequest("POST", "/api/motion-projects", {
      name: `${name} (copy)`,
      composition: normalizeComposition(comp),
      sourceWritingId: source?.id,
    });
    if (r.ok) {
      setProjects((p) => [r.data.project, ...p]);
      setProjectId(r.data.project._id);
      setName(r.data.project.name);
      flash("ok", "Duplicated.");
    } else flash("error", errorMessage(r.data) || "Duplicate failed");
  };
  const remove = async () => {
    const r = await apiRequest("DELETE", `/api/motion-projects/${projectId}`);
    setConfirmDel(false);
    if (r.ok) {
      setProjects((p) => p.filter((x) => x._id !== projectId));
      setProjectId(null);
      flash("ok", "Project deleted. The original writing is untouched.");
    } else flash("error", errorMessage(r.data) || "Delete failed");
  };

  // ---- background / audio inputs
  const onBgFile = async (file) => {
    if (!file) return;
    try {
      bgBitmap.current?.close?.();
      bgBitmap.current = await decodeImageFile(file); setHasBitmap(true);
      update((c) => {
        c.style.bg.image = {
          url: "",
          local: true,
          x: 0.5,
          y: 0.5,
          zoom: 1,
          brightness: 0,
          contrast: 0,
          blur: 0,
        };
        return c;
      });
      setBgReady((n) => n + 1);
      flash(
        "ok",
        "Photo added. It stays on this device unless you save it to the library.",
      );
    } catch (e) {
      flash("error", e.message || "Could not read that image.");
    }
  };
  const uploadBg = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    const r = await fetch("/api/upload-image", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });
    const d = await r.json().catch(() => ({}));
    const url =
      d?.imageUrls?.large || d?.imageUrls?.medium || d?.imageUrls?.small;
    if (!r.ok || !url) return flash("error", d?.message || "Upload failed.");
    update((c) => {
      c.style.bg.image = {
        ...(c.style.bg.image || {
          x: 0.5,
          y: 0.5,
          zoom: 1,
          brightness: 0,
          contrast: 0,
          blur: 0,
        }),
        url,
        local: false,
      };
      return c;
    });
    flash(
      "ok",
      "Saved to your image library; this project can now reopen it anywhere.",
    );
  };
  const setAudio = async (blob, label) => {
    try {
      const buffer = await decodeAudio(blob);
      if (audioRef.current.url) URL.revokeObjectURL(audioRef.current.url);
      const url = URL.createObjectURL(blob);
      audioRef.current = {
        blob,
        buffer,
        url,
        el: Object.assign(new Audio(url), { preload: "auto" }),
      };
      setAudioInfo({
        label,
        seconds: buffer.duration,
        type: blob.type || "unknown",
        url,
      });
      update((c) => {
        c.audio = {
          ...c.audio,
          source: label === "Recording" ? "record" : "upload",
          label,
          trimStartMs: 0,
          trimEndMs: 0,
        };
        return c;
      });
    } catch (e) {
      flash("error", e.message);
    }
  };
  const toggleRecord = async () => {
    if (recState === "recording") {
      const b = await recRef.current.stop();
      recRef.current = null;
      setRecState("idle");
      await setAudio(b, "Recording");
      return;
    }
    try {
      recRef.current = await startRecording();
      setRecState("recording");
    } catch (e) {
      flash("error", e.message);
    }
  };
  const clearAudio = () => {
    audioRef.current.el?.pause();
    audioRef.current = { blob: null, buffer: null, url: null };
    setAudioInfo(null);
    update((c) => {
      c.audio = { ...c.audio, source: "none", label: "" };
      return c;
    });
  };
  useEffect(
    () => () => {
      recRef.current?.cancel();
      abortRef.current?.abort();
    },
    [],
  );

  // ---- export
  const fontsReady = () =>
    Promise.all(
      Object.values(FONT_CSS).map((f) =>
        document.fonts.load(`500 40px ${f}`, "தமிழ் Aa"),
      ),
    );
  const exportAssets = (fm) => {
    if (!bg || !bgBitmap.current) return {};
    const f = FORMATS[fm],
      baked = bakeBackground(bgBitmap.current, bg, f.w, f.h),
      r = safeRect(f.w, f.h, f.safe);
    const dark = parseInt(comp.style.color.slice(1, 3), 16) < 100;
    return {
      bg: baked,
      scrim: readabilityScrim(baked, r, comp.style.color),
      scrimColor: dark ? "#fff" : "#000",
    };
  };
  const guard = async (fn) => {
    setPlaying(false);
    abortRef.current = new AbortController();
    setProgress(0);
    setMsg(null);
    try {
      await fontsReady();
      await fn(abortRef.current.signal);
    } catch (e) {
      flash(
        "error",
        e?.name === "AbortError"
          ? "Export cancelled. Nothing was kept."
          : `Export failed: ${e?.message || e}`,
      );
    }
    setProgress(null);
  };
  const doVideo = () =>
    guard(async (signal) => {
      const fm = comp.format === "poster" ? "reel" : comp.format;
      let c = { ...comp, format: fm },
        audioBuffer = null;
      const A = audioRef.current;
      if (A.buffer && comp.audio.source !== "none") {
        const clipMs =
          (comp.audio.trimEndMs || A.buffer.duration * 1000) -
          comp.audio.trimStartMs;
        const vid = compDuration(c);
        if (comp.audio.fitVideo === "extend" && clipMs > vid) {
          const sc = c.scenes.slice();
          sc[sc.length - 1] = {
            ...sc[sc.length - 1],
            durationMs: sc[sc.length - 1].durationMs + (clipMs - vid),
          };
          c = { ...c, scenes: sc };
        }
        audioBuffer = shapeAudio(A.buffer, comp.audio, compDuration(c));
      }
      const blob = await exportMp4(c, {
        onProgress: setProgress,
        signal,
        audioBuffer,
        assets: exportAssets(fm),
      });
      download(blob, `${slug(name)}-${fm}.mp4`);
      flash(
        "ok",
        `Exported ${(blob.size / 1048576).toFixed(1)} MB MP4${audioBuffer ? " with AAC audio" : " (silent)"}. Play it on your phone before posting.`,
      );
    });
  const doStory = (type) =>
    guard(async (signal) => {
      const blobs = await renderSceneStills(comp, {
        format: "story",
        type,
        assets: exportAssets("story"),
        signal,
        onProgress: setProgress,
      });
      setStills({
        type,
        urls: blobs.map((b) => URL.createObjectURL(b)),
        blobs,
      });
      flash("ok", `Rendered ${blobs.length} story frames in order.`);
    });
  const doPoster = (type, set) =>
    guard(async () => {
      const c = set
        ? { ...comp, poster: { ...comp.poster, mode: "set" } }
        : comp;
      const { blobs, overflow } = await renderPosters(c, {
        type,
        assets: exportAssets("poster"),
      });
      if (!blobs.length)
        return flash("error", "Select at least one stanza for the poster.");
      const ext = type === "image/png" ? "png" : "jpg";
      if (blobs.length === 1) download(blobs[0], `${slug(name)}-poster.${ext}`);
      else
        download(
          await zipBlobs(blobs, `${slug(name)}-poster`, ext),
          `${slug(name)}-posters.zip`,
        );
      flash(
        overflow ? "error" : "ok",
        overflow
          ? "Some text was too long to fit legibly on one poster card, so it was left at readable size and clipped. Switch to a multi-card set or select fewer stanzas."
          : `Poster${blobs.length > 1 ? "s" : ""} exported.`,
      );
    });
  const doStillsZip = async () => {
    download(
      await zipBlobs(
        stills.blobs,
        `${slug(name)}-story`,
        stills.type === "image/png" ? "png" : "jpg",
      ),
      `${slug(name)}-story-frames.zip`,
    );
  };

  const S = comp?.scenes[sel] ? sel : 0;
  const scene = comp?.scenes[S];
  const previewW = 270,
    previewH = Math.round((previewW * fmt.h) / fmt.w);
  const tabs =
    mode === "quick"
      ? [
          ["look", "Look"],
          ["full", "Full poem"],
          ["export", "Export"],
        ]
      : [
          ["poem", "Poem"],
          ["scenes", "Scenes"],
          ["look", "Look"],
          ["bg", "Background"],
          ["audio", "Audio"],
          ["story", "Story"],
          ["full", "Full poem"],
          ["poster", "Feed poster"],
          ["project", "Project"],
          ["export", "Export"],
        ];
  const activeTab = tabs.some(([k]) => k === tab) ? tab : tabs[0][0];

  const fullPoem = useMemo(() => {
    if (!comp) return { title: "", stanzas: [] };
    if (source?.poem) return { title: source.title || "", stanzas: source.poem.stanzas };
    return {
      title: comp.scenes.find((x) => x.kind === "title")?.lines?.[0] || "",
      stanzas: comp.scenes.filter((x) => x.kind !== "title").map((x) => x.lines),
    };
  }, [comp, source]);
  const fullPreset = comp?.full?.preset || "balanced";
  const fullHeight = comp?.full?.height || "standard";
  const fullLayout = useMemo(() => {
    if (!comp || activeTab !== "full" || !fullPoem.stanzas.length) return null;
    const cx = document.createElement("canvas").getContext("2d");
    return layoutFullPoem(cx, comp, fullPoem, { preset: fullPreset, height: fullHeight });
  }, [comp?.style, comp?.branding, fullPoem, fullPreset, fullHeight, fontTick, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const fullMissing = useMemo(
    () => (fullLayout ? fullPoemCoverage(fullPoem, fullLayout) : []),
    [fullLayout, fullPoem],
  );
  const fullAssets = (H) =>
    bg && bgBitmap.current ? { bg: bakeBackground(bgBitmap.current, bg, FULL_W, H) } : {};
  useEffect(() => {
    const c = fullCanvasRef.current;
    if (!c || !fullLayout || activeTab !== "full") return;
    const k = 0.34;
    c.width = Math.round(FULL_W * k);
    c.height = Math.round(fullLayout.height * k);
    drawFullPoem(c.getContext("2d"), comp, fullLayout, { assets: fullAssets(fullLayout.height), scale: k });
  }, [fullLayout, bgReady, hasBitmap]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFull_ = (patch) => update((c) => ({ ...c, full: { ...c.full, ...patch } }));
  const doFull = (type, scale) =>
    guard(async () => {
      const r = await renderFullPoem(comp, fullPoem, {
        preset: fullPreset, height: fullHeight, type, scale,
        assets: fullAssets(fullLayout?.height || 1920),
      });
      const ext = type === "image/png" ? "png" : "jpg";
      download(r.blob, `${slug(name)}-full-poem.${ext}`);
      flash("ok", `Exported ${r.width}×${r.height} ${ext.toUpperCase()} with all ${fullPoem.stanzas.flat().length} lines on one image.`);
    });
  const doCover = (type) =>
    guard(async () => {
      const b = await renderReelCover(comp, { type, assets: exportAssets("reel") });
      download(b, `${slug(name)}-cover.${type === "image/png" ? "png" : "jpg"}`);
      flash("ok", "Reel cover exported (1080×1920).");
    });

  const previewBlock = (idPrefix, big) => (
    <div>
      <canvas
        ref={big ? fullRef : canvasRef}
        width={big ? 540 : previewW * 2}
        height={big ? Math.round((540 * fmt.h) / fmt.w) : previewH * 2}
        style={
          big
            ? { height: "min(78vh,100%)", aspectRatio: `${fmt.w}/${fmt.h}` }
            : { width: previewW, height: previewH }
        }
        className="mx-auto rounded-lg border bg-black"
        role="img"
        aria-label="Preview of the current frame"
      />
      <div className="mt-3 flex items-center justify-center gap-2">
        <Btn onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </Btn>
        <Btn
          onClick={() => {
            setPlaying(false);
            setT(0);
          }}
        >
          Restart
        </Btn>
        {!big && <Btn onClick={() => setFull(true)}>Full screen</Btn>}
      </div>
      <label className="pms-lbl mt-2">
        Timeline
        <input
          id={`${idPrefix}-tl`}
          aria-label="Timeline"
          type="range"
          className="w-full"
          style={{ minHeight: 44 }}
          min={0}
          max={Math.max(1, total)}
          value={Math.min(t, total)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
        />
      </label>
      <p className="text-center text-xs" style={{ color: "var(--mute)" }}>
        {(t / 1000).toFixed(1)}s / {(total / 1000).toFixed(1)}s
      </p>
    </div>
  );

  return (
    <main
      className="pms mx-auto min-h-screen max-w-6xl p-4 sm:p-6"
      data-theme={theme}
    >
      <style>{THEME_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Poem Motion Studio</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
            Turn a Tamil poem into a Reel, Story or Poster. Your original
            writing is never modified.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Studio settings"
        >
          <Btn aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>
            Quick Create
          </Btn>
          <Btn
            aria-pressed={mode === "advanced"}
            onClick={() => setMode("advanced")}
          >
            Advanced Studio
          </Btn>
          <select
            aria-label="Theme"
            className="pms-field"
            style={{ width: 120 }}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className="mt-3 rounded-lg px-3 py-2 text-sm"
          style={{
            background: msg.kind === "error" ? "var(--err-bg)" : "var(--ok-bg)",
            color: msg.kind === "error" ? "var(--err-ink)" : "var(--ok-ink)",
          }}
        >
          {msg.text}
        </p>
      )}
      {sourceChanged && (
        <div
          role="alert"
          className="mt-3 rounded-lg p-3 text-sm"
          style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
        >
          The source poem changed after this project was made. Your scenes are
          untouched.
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn onClick={rebuild}>
              Rebuild from the current poem (keeps a copy of this version)
            </Btn>
            <Btn onClick={ackSource}>Keep my scenes</Btn>
          </div>
        </div>
      )}

      {comp ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span lang="ta" className="min-w-0 break-words font-semibold">
            {source?.title || name}
          </span>
          <span style={{ color: "var(--mute)" }}>
            {source?.kind === "manual"
              ? "Your own poem"
              : source?.kind === "writing"
                ? "From your Portfolio (read-only)"
                : "Saved project"}
          </span>
          <Btn
            onClick={() => {
              start(null);
              setProjectId(null);
              setSource(null);
              setRoute(null);
              setPlaying(false);
              listDrafts().then(setDrafts);
            }}
          >
            Start a different poem
          </Btn>
          <span style={{ color: "var(--mute)" }} aria-live="polite">
            {projectId
              ? "Saved to your Admin projects"
              : draftSaved
                ? "Saved on this device only"
                : "Not saved yet"}
          </span>
        </div>
      ) : (
        <section aria-labelledby="start-h" className="mt-4 min-w-0">
          <h2 id="start-h" className="text-xl font-semibold">
            How would you like to start your poem?
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
            You don’t need a Portfolio writing. Nothing is saved to the
            server unless you choose Save project to Admin.
          </p>
          <div
            className="mt-3 grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))" }}
            role="group"
            aria-label="Ways to start"
          >
            {[
              ["write", "Write a poem", "Type it here"],
              ["paste", "Paste a poem", "From Notes, WhatsApp…"],
              ["import", "Import a file", ".txt or .md"],
              ["existing", "Portfolio poem", "Read-only copy"],
              ["continue", "Continue", "Saved on device or Admin"],
            ].map(([k, l, d]) => (
              <button
                key={k}
                type="button"
                className="pms-btn text-left"
                style={{
                  minHeight: 64,
                  display: "block",
                  ...(route === k ? { background: "var(--accent)", color: "var(--accent-ink)" } : {}),
                }}
                aria-pressed={route === k}
                onClick={() => setRoute(k)}
              >
                <span className="block font-semibold">{l}</span>
                <span className="block text-xs opacity-80">{d}</span>
              </button>
            ))}
          </div>

          {(route === "write" || route === "paste" || route === "import") && (
            <div className="pms-card mt-3 space-y-2">
              {route === "paste" && (
                <Btn onClick={pasteFromClipboard}>Paste from clipboard</Btn>
              )}
              {route === "import" && (
                <Field label="Choose a .txt or .md file">
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    className="pms-field"
                    onChange={(e) => onImport(e.target.files?.[0])}
                  />
                </Field>
              )}
              <Field label="Title (optional)">
                <input
                  className="pms-field"
                  lang="ta"
                  value={titleBox}
                  maxLength={300}
                  onChange={(e) => setTitleBox(e.target.value)}
                />
              </Field>
              <Field label={route === "paste" ? "Poem text (paste here)" : "Poem text"}>
                <textarea
                  aria-label="Poem text"
                  className="pms-field"
                  lang="ta"
                  rows={12}
                  value={textBox}
                  placeholder={"ஒரு வரி\nஅடுத்த வரி\n\n(blank line = new stanza)"}
                  style={{ fontSize: 16, lineHeight: 1.7, minHeight: "40vh", whiteSpace: "pre-wrap", resize: "vertical" }}
                  onChange={(e) => setTextBox(e.target.value)}
                />
              </Field>
              <p className="text-xs" style={{ color: "var(--mute)" }}>
                A blank line starts a new stanza. Line breaks are kept exactly
                as you wrote them.
              </p>
              <Btn primary onClick={() => startManual(textBox, titleBox)}>
                Create scenes
              </Btn>
            </div>
          )}

          {route === "existing" && (
            <div className="pms-card mt-3">
              <Field label="Start from a Portfolio poem (read-only)">
                <select
                  id="pms-src"
                  aria-label="Start from a poem"
                  className="pms-field"
                  value=""
                  onChange={(e) => pick(e.target.value)}
                >
                  <option value="">Choose a poem…</option>
                  {writings.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {route === "continue" && (
            <div className="pms-card mt-3 space-y-3">
              <div>
                <h3 className="font-semibold">Saved on this device</h3>
                {drafts.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    No recovery copies on this device.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {drafts.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span lang="ta" className="min-w-0 break-words">
                          {d.name} · {d.lines} lines · {new Date(d.updatedAt).toLocaleString()}
                        </span>
                        <Btn onClick={() => openDraft(d.id)}>Open</Btn>
                        <Btn
                          aria-label={`Delete recovery copy ${d.name}`}
                          onClick={async () => {
                            await deleteDraft(d.id);
                            setDrafts(await listDrafts());
                          }}
                        >
                          Delete
                        </Btn>
                      </li>
                    ))}
                  </ul>
                )}
                {drafts.length > 0 && (
                  <Btn
                    onClick={async () => {
                      await clearDrafts();
                      setDrafts([]);
                    }}
                  >
                    Clear all device copies
                  </Btn>
                )}
                <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
                  These stay in this browser only and are never synced.
                </p>
              </div>
              <Field label="Open a project saved in Admin">
                <select
                  id="pms-proj"
                  aria-label="Open a saved project"
                  className="pms-field"
                  value={projectId || ""}
                  onChange={(e) => e.target.value && openProject(e.target.value)}
                >
                  <option value="">Saved projects ({projects.length})…</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </section>
      )}
      {source?.warnings?.length > 0 && (
        <p className="mt-2 text-sm" style={{ color: "var(--warn-ink)" }}>
          This is a legacy Markdown poem; it was converted for the preview with{" "}
          {source.warnings.length} note(s).
        </p>
      )}

      {!comp ? null : (
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            {previewBlock("main")}
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guide}
                onChange={(e) => setGuide(e.target.checked)}
              />{" "}
              Show Instagram safe zone
            </label>
            <div className="mt-2 flex justify-center gap-2">
              <Btn
                onClick={undo}
                disabled={!hist.canUndo}
                aria-label="Undo"
              >
                Undo
              </Btn>
              <Btn
                onClick={redo}
                disabled={!hist.canRedo}
                aria-label="Redo"
              >
                Redo
              </Btn>
            </div>
          </div>

          <div className="min-w-0">
            <div
              className="pms-tabs"
              role="tablist"
              aria-label="Studio sections"
              style={{ display: "flex", gap: 4, overflowX: "auto", padding: 4 }}
            >
              {tabs.map(([k, l]) => (
                <button
                  key={k}
                  id={`tab-${k}`}
                  role="tab"
                  aria-selected={activeTab === k}
                  aria-controls="pms-panel"
                  className="pms-btn"
                  style={
                    activeTab === k
                      ? {
                          background: "var(--accent)",
                          color: "var(--accent-ink)",
                        }
                      : { border: 0 }
                  }
                  onClick={() => setTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div
              id="pms-panel"
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              className="mt-4 space-y-4"
            >
              {activeTab === "look" && (
                <>
                  <fieldset>
                    <legend className="pms-lbl">Format</legend>
                    <div className="flex flex-wrap gap-2">
                      {["reel", "story", "poster"].map((f) => (
                        <Btn
                          key={f}
                          aria-pressed={comp.format === f}
                          onClick={() => update((c) => ({ ...c, format: f }))}
                        >
                          {f[0].toUpperCase() + f.slice(1)}
                        </Btn>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="pms-lbl">Template</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {TEMPLATES.map((x) => (
                        <button
                          type="button"
                          key={x.id}
                          aria-pressed={comp.templateId === x.id}
                          onClick={() =>
                            update((c) => ({
                              ...defaultComposition({
                                format: c.format,
                                templateId: x.id,
                                scenes: c.scenes,
                                signature: c.branding.signature,
                              }),
                              originalScenes: c.originalScenes,
                              audio: c.audio,
                              poster: c.poster,
                              export: c.export,
                            }))
                          }
                          className="min-h-11 rounded-lg border px-3 py-2 text-left text-sm"
                          style={{
                            background: `linear-gradient(135deg, ${x.bg.a}, ${x.bg.b})`,
                            color: x.style.color,
                            borderColor:
                              comp.templateId === x.id
                                ? "var(--accent)"
                                : "var(--line)",
                            boxShadow:
                              comp.templateId === x.id
                                ? "0 0 0 3px var(--accent)"
                                : "none",
                          }}
                        >
                          <span className="font-semibold">{x.name}</span>
                          <br />
                          <span className="text-xs">{x.mood}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {mode === "advanced" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Font">
                        <select
                          aria-label="Font"
                          className="pms-field"
                          value={comp.style.font}
                          onChange={(e) =>
                            update((c) => {
                              c.style.font = e.target.value;
                              return c;
                            })
                          }
                        >
                          {FONT_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {FONT_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Range
                        label="Font size"
                        value={comp.style.sizePx}
                        min={28}
                        max={140}
                        onChange={(v) =>
                          update((c) => {
                            c.style.sizePx = v;
                            return c;
                          }, "size")
                        }
                        fmt={(v) => `${v}px`}
                      />
                      <Range
                        label="Line height"
                        value={comp.style.lineHeight}
                        min={1.2}
                        max={2.4}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.style.lineHeight = v;
                            return c;
                          }, "lh")
                        }
                        fmt={(v) => v.toFixed(2)}
                      />
                      <Field label="Alignment">
                        <select
                          aria-label="Alignment"
                          className="pms-field"
                          value={comp.style.align}
                          onChange={(e) =>
                            update((c) => {
                              c.style.align = e.target.value;
                              return c;
                            })
                          }
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </Field>
                      <Field label="Vertical position">
                        <select
                          aria-label="Vertical position"
                          className="pms-field"
                          value={comp.style.vAlign}
                          onChange={(e) =>
                            update((c) => {
                              c.style.vAlign = e.target.value;
                              return c;
                            })
                          }
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </Field>
                      <Field label="Text colour">
                        <input
                          aria-label="Text colour"
                          type="color"
                          className="pms-field"
                          value={comp.style.color}
                          onChange={(e) =>
                            update((c) => {
                              c.style.color = e.target.value;
                              return c;
                            }, "color")
                          }
                        />
                      </Field>
                      <Field label="Text appears">
                        <select
                          aria-label="Text appears"
                          className="pms-field"
                          value={comp.motion.textIn}
                          onChange={(e) =>
                            update((c) => {
                              c.motion.textIn = e.target.value;
                              return c;
                            })
                          }
                        >
                          {TEXT_IN.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Background motion">
                        <select
                          aria-label="Background motion"
                          className="pms-field"
                          value={comp.motion.bgMotion}
                          onChange={(e) =>
                            update((c) => {
                              c.motion.bgMotion = e.target.value;
                              return c;
                            })
                          }
                        >
                          {BG_MOTION.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Particles">
                        <select
                          aria-label="Particles"
                          className="pms-field"
                          value={comp.style.particles}
                          onChange={(e) =>
                            update((c) => {
                              c.style.particles = e.target.value;
                              return c;
                            })
                          }
                        >
                          {PARTICLES.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </Field>
                      <Range
                        label="Vignette"
                        value={comp.style.vignette}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.style.vignette = v;
                            return c;
                          }, "vig")
                        }
                        fmt={(v) => v.toFixed(2)}
                      />
                      <Range
                        label="Film grain"
                        value={comp.style.grain}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.style.grain = v;
                            return c;
                          }, "grain")
                        }
                        fmt={(v) => v.toFixed(2)}
                      />
                      <Field label="Signature">
                        <input
                          aria-label="Signature"
                          className="pms-field"
                          value={comp.branding.signature}
                          maxLength={60}
                          onChange={(e) =>
                            update((c) => {
                              c.branding.signature = e.target.value;
                              return c;
                            }, "sig")
                          }
                        />
                      </Field>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={comp.branding.show}
                          onChange={(e) =>
                            update((c) => {
                              c.branding.show = e.target.checked;
                              return c;
                            })
                          }
                        />{" "}
                        Show signature
                      </label>
                    </div>
                  )}
                </>
              )}

              {activeTab === "scenes" && (
                <section aria-label="Scenes">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                      Scenes ({comp.scenes.length})
                    </h2>
                    <Btn
                      onClick={() => {
                        if (comp.originalScenes.length) {
                          setScenes(() => structuredClone(comp.originalScenes));
                          flash(
                            "ok",
                            "Restored the original automatic arrangement.",
                          );
                        }
                      }}
                      disabled={!comp.originalScenes.length}
                    >
                      Restore original arrangement
                    </Btn>
                  </div>
                  {poemMissing.length > 0 && (
                    <p
                      role="alert"
                      className="mt-2 rounded-lg px-3 py-2 text-sm"
                      style={{
                        background: "var(--warn-bg)",
                        color: "var(--warn-ink)",
                      }}
                    >
                      {poemMissing.length} line(s) from the poem are not in any
                      scene: “{poemMissing[0]}”
                      {poemMissing.length > 1 ? "…" : ""}
                    </p>
                  )}
                  <ol className="mt-2 space-y-3">
                    {comp.scenes.map((s, i) => (
                      <li
                        key={s.id}
                        className="pms-card"
                        style={
                          i === S
                            ? {
                                borderColor: "var(--accent)",
                                boxShadow: "0 0 0 2px var(--accent)",
                              }
                            : undefined
                        }
                        aria-current={i === S ? "true" : undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="pms-btn"
                            onClick={() => seekScene(i)}
                            aria-label={`Preview scene ${i + 1}`}
                          >
                            {i === S ? "● " : ""}Scene {i + 1} ·{" "}
                            {s.kind === "title" ? "Title" : "Stanza"} ·{" "}
                            {(s.durationMs / 1000).toFixed(1)}s
                          </button>
                          <div className="flex gap-1">
                            <Btn
                              aria-label={`Move scene ${i + 1} up`}
                              disabled={i === 0}
                              onClick={() => {
                                setScenes((x) => E.moveScene(x, i, -1));
                                setSel(i - 1);
                              }}
                            >
                              ↑
                            </Btn>
                            <Btn
                              aria-label={`Move scene ${i + 1} down`}
                              disabled={i === comp.scenes.length - 1}
                              onClick={() => {
                                setScenes((x) => E.moveScene(x, i, 1));
                                setSel(i + 1);
                              }}
                            >
                              ↓
                            </Btn>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {s.lines.map((l, li) => (
                            <div key={li} className="flex items-center gap-1">
                              <input
                                aria-label={`Scene ${i + 1} line ${li + 1}`}
                                className="pms-field"
                                lang="ta"
                                value={l}
                                maxLength={400}
                                onFocus={() => setSel(i)}
                                onChange={(e) =>
                                  setScenes(
                                    (x) => E.editLine(x, i, li, e.target.value),
                                    `line-${i}-${li}`,
                                  )
                                }
                              />
                              <select
                                aria-label={`Move scene ${i + 1} line ${li + 1} to`}
                                className="pms-field"
                                style={{ width: 92 }}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value !== "")
                                    setScenes((x) =>
                                      E.moveLine(
                                        x,
                                        i,
                                        li,
                                        Number(e.target.value),
                                        1e6,
                                      ),
                                    );
                                }}
                              >
                                <option value="">Move…</option>
                                {comp.scenes.map(
                                  (_, j) =>
                                    j !== i && (
                                      <option key={j} value={j}>
                                        → Scene {j + 1}
                                      </option>
                                    ),
                                )}
                              </select>
                              {li > 0 && (
                                <Btn
                                  aria-label={`Split scene ${i + 1} before line ${li + 1}`}
                                  onClick={() =>
                                    setScenes((x) => E.splitScene(x, i, li))
                                  }
                                >
                                  Split
                                </Btn>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Range
                            label={`Scene ${i + 1} seconds`}
                            value={s.durationMs / 1000}
                            min={3}
                            max={12}
                            step={0.5}
                            onChange={(v) =>
                              setScenes(
                                (x) => E.setDuration(x, i, v * 1000),
                                `dur-${i}`,
                              )
                            }
                            fmt={(v) => `${v}s`}
                          />
                          <Range
                            label={`Scene ${i + 1} text position`}
                            value={s.offsetY || 0}
                            min={-30}
                            max={30}
                            onChange={(v) =>
                              setScenes(
                                (x) =>
                                  E.setScenePresentation(x, i, { offsetY: v }),
                                `off-${i}`,
                              )
                            }
                            fmt={(v) =>
                              v === 0
                                ? "auto"
                                : `${v > 0 ? "↓" : "↑"}${Math.abs(v)}%`
                            }
                          />
                          <Range
                            label={`Scene ${i + 1} text size`}
                            value={s.scale || 1}
                            min={0.6}
                            max={1.4}
                            step={0.05}
                            onChange={(v) =>
                              setScenes(
                                (x) =>
                                  E.setScenePresentation(x, i, { scale: v }),
                                `sc-${i}`,
                              )
                            }
                            fmt={(v) => `${Math.round(v * 100)}%`}
                          />
                          <Field label={`Scene ${i + 1} alignment`}>
                            <select
                              aria-label={`Scene ${i + 1} alignment`}
                              className="pms-field"
                              value={s.align || ""}
                              onChange={(e) =>
                                setScenes((x) =>
                                  E.setScenePresentation(x, i, {
                                    align: e.target.value || null,
                                  }),
                                )
                              }
                            >
                              <option value="">Use style default</option>
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </Field>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {i < comp.scenes.length - 1 && (
                            <Btn
                              onClick={() =>
                                setScenes((x) => E.mergeNext(x, i))
                              }
                            >
                              Merge with next
                            </Btn>
                          )}
                          <Btn
                            onClick={() =>
                              setScenes((x) => E.duplicateScene(x, i))
                            }
                          >
                            Duplicate
                          </Btn>
                          <Btn
                            onClick={() =>
                              setScenes((x) => E.removeScene(x, i))
                            }
                            aria-label={`Remove scene ${i + 1} from the video`}
                          >
                            Remove from video
                          </Btn>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {activeTab === "bg" && (
                <section aria-label="Background" className="space-y-3">
                  <h2 className="text-lg font-semibold">Background</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Templates and colours are in Look. Add a photo for a custom
                    background; Tamil text automatically gets a dark or light
                    veil so it stays readable.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Solid / gradient start">
                      <input
                        aria-label="Background colour A"
                        type="color"
                        className="pms-field"
                        value={comp.style.bg.a}
                        onChange={(e) =>
                          update((c) => {
                            c.style.bg.a = e.target.value;
                            return c;
                          }, "bga")
                        }
                      />
                    </Field>
                    <Field label="Gradient end">
                      <input
                        aria-label="Background colour B"
                        type="color"
                        className="pms-field"
                        value={comp.style.bg.b}
                        onChange={(e) =>
                          update((c) => {
                            c.style.bg.b = e.target.value;
                            c.style.bg.kind = "gradient";
                            return c;
                          }, "bgb")
                        }
                      />
                    </Field>
                    <Btn
                      onClick={() =>
                        update((c) => {
                          c.style.bg.kind = "solid";
                          return c;
                        })
                      }
                    >
                      Use solid colour
                    </Btn>
                    <Field label="Overlay colour">
                      <input
                        aria-label="Overlay colour"
                        type="color"
                        className="pms-field"
                        value={comp.style.overlay.color}
                        onChange={(e) =>
                          update((c) => {
                            c.style.overlay.color = e.target.value;
                            return c;
                          }, "ovc")
                        }
                      />
                    </Field>
                    <Range
                      label="Overlay opacity"
                      value={comp.style.overlay.opacity}
                      min={0}
                      max={0.9}
                      step={0.05}
                      onChange={(v) =>
                        update((c) => {
                          c.style.overlay.opacity = v;
                          return c;
                        }, "ovo")
                      }
                      fmt={(v) => v.toFixed(2)}
                    />
                  </div>
                  <div className="pms-card space-y-3">
                    <Field label="Photo from this device (stays local)">
                      <input
                        aria-label="Choose background photo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        className="pms-field"
                        style={{ paddingTop: 8 }}
                        onChange={(e) => onBgFile(e.target.files?.[0])}
                      />
                    </Field>
                    {bg ? (
                      <>
                        {!hasBitmap && (
                          <p
                            className="text-sm"
                            style={{ color: "var(--warn-ink)" }}
                          >
                            {bg.url
                              ? "Using your saved library image."
                              : "This project's photo isn't on this device. Choose it again."}
                          </p>
                        )}
                        <Range
                          label="Zoom"
                          value={bg.zoom}
                          min={1}
                          max={3}
                          step={0.05}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.zoom = v;
                              return c;
                            }, "bz")
                          }
                          fmt={(v) => `${v.toFixed(2)}×`}
                        />
                        <Range
                          label="Crop position left–right"
                          value={bg.x}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.x = v;
                              return c;
                            }, "bx")
                          }
                          fmt={(v) => `${Math.round(v * 100)}%`}
                        />
                        <Range
                          label="Crop position top–bottom"
                          value={bg.y}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.y = v;
                              return c;
                            }, "by")
                          }
                          fmt={(v) => `${Math.round(v * 100)}%`}
                        />
                        <Range
                          label="Brightness"
                          value={bg.brightness}
                          min={-0.5}
                          max={0.5}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.brightness = v;
                              return c;
                            }, "bb")
                          }
                          fmt={(v) => v.toFixed(2)}
                        />
                        <Range
                          label="Contrast"
                          value={bg.contrast}
                          min={-0.5}
                          max={0.5}
                          step={0.02}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.contrast = v;
                              return c;
                            }, "bc")
                          }
                          fmt={(v) => v.toFixed(2)}
                        />
                        <Range
                          label="Blur"
                          value={bg.blur}
                          min={0}
                          max={40}
                          onChange={(v) =>
                            update((c) => {
                              c.style.bg.image.blur = v;
                              return c;
                            }, "bbl")
                          }
                        />
                        <p className="text-sm" style={{ color: "var(--mute)" }}>
                          Readability veil applied automatically:{" "}
                          {Math.round(scrimPct * 100)}%.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <label className="pms-btn inline-flex cursor-pointer items-center">
                            Save this photo to my image library
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              aria-label="Upload photo to library"
                              onChange={(e) => uploadBg(e.target.files?.[0])}
                            />
                          </label>
                          <Btn
                            onClick={() => {
                              bgBitmap.current?.close?.();
                              bgBitmap.current = null;
                              setHasBitmap(false); setScrimPct(0);
                              update((c) => {
                                delete c.style.bg.image;
                                return c;
                              });
                            }}
                          >
                            Remove photo
                          </Btn>
                        </div>
                        <p className="text-xs" style={{ color: "var(--mute)" }}>
                          Library uploads go to your existing Cloudinary account
                          (max 5 MB). Only photos you own or are licensed to use
                          should be added.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        No photo selected.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {activeTab === "audio" && (
                <section aria-label="Audio" className="space-y-3">
                  <h2 className="text-lg font-semibold">Audio</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Add your own recitation or sound. No music is bundled, and
                    audio never leaves this device. The MP4 gets AAC audio when
                    your browser supports it; otherwise export stays silent.
                  </p>
                  {caps && !caps.aac && (
                    <p className="text-sm" style={{ color: "var(--warn-ink)" }}>
                      This browser cannot encode AAC, so audio can be previewed
                      but won’t be included in the MP4.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="pms-btn inline-flex cursor-pointer items-center">
                      Upload audio
                      <input
                        type="file"
                        accept="audio/*"
                        className="sr-only"
                        aria-label="Upload audio"
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          setAudio(
                            e.target.files[0],
                            e.target.files[0].name.slice(0, 60),
                          )
                        }
                      />
                    </label>
                    <Btn
                      onClick={toggleRecord}
                      aria-pressed={recState === "recording"}
                      disabled={
                        !recOk.ok && recState !== "recording"
                      }
                    >
                      {recState === "recording"
                        ? "■ Stop recording"
                        : "● Record recitation"}
                    </Btn>
                    {audioInfo && <Btn onClick={clearAudio}>Remove audio</Btn>}
                  </div>
                  {!recOk.ok && (
                    <p className="text-sm" style={{ color: "var(--mute)" }}>
                      {recOk.reason}
                    </p>
                  )}
                  {recState === "recording" && (
                    <p role="status" className="text-sm">
                      Recording… speak now. Press stop when finished.
                    </p>
                  )}
                  {audioInfo && (
                    <div className="pms-card space-y-3">
                      <p className="text-sm">
                        {audioInfo.label} · {audioInfo.seconds.toFixed(1)}s ·{" "}
                        {audioInfo.type}
                      </p>
                      {audioInfo.url && (
                        <audio
                          controls
                          src={audioInfo.url}
                          aria-label="Audio playback"
                          className="w-full"
                        />
                      )}
                      <Range
                        label="Trim start (s)"
                        value={comp.audio.trimStartMs / 1000}
                        min={0}
                        max={Math.max(0, audioInfo.seconds - 0.5)}
                        step={0.1}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.trimStartMs = v * 1000;
                            return c;
                          }, "ts")
                        }
                      />
                      <Range
                        label="Trim end (s, 0 = full)"
                        value={comp.audio.trimEndMs / 1000}
                        min={0}
                        max={audioInfo.seconds}
                        step={0.1}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.trimEndMs = v * 1000;
                            return c;
                          }, "te")
                        }
                      />
                      <Range
                        label="Volume"
                        value={comp.audio.volume}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.volume = v;
                            return c;
                          }, "vol")
                        }
                        fmt={(v) => `${Math.round(v * 100)}%`}
                      />
                      <Range
                        label="Fade in (ms)"
                        value={comp.audio.fadeInMs}
                        min={0}
                        max={5000}
                        step={100}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.fadeInMs = v;
                            return c;
                          }, "fi")
                        }
                      />
                      <Range
                        label="Fade out (ms)"
                        value={comp.audio.fadeOutMs}
                        min={0}
                        max={5000}
                        step={100}
                        onChange={(v) =>
                          update((c) => {
                            c.audio.fadeOutMs = v;
                            return c;
                          }, "fo")
                        }
                      />
                      <Field label="If the audio is longer than the video">
                        <select
                          aria-label="Audio length handling"
                          className="pms-field"
                          value={comp.audio.fitVideo}
                          onChange={(e) =>
                            update((c) => {
                              c.audio.fitVideo = e.target.value;
                              return c;
                            })
                          }
                        >
                          <option value="extend">
                            Extend the last scene to fit
                          </option>
                          <option value="keep">
                            Cut the audio at the video end
                          </option>
                        </select>
                      </Field>
                    </div>
                  )}
                </section>
              )}

              {activeTab === "story" && (
                <section aria-label="Story" className="space-y-3">
                  <h2 className="text-lg font-semibold">Story frames</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    One 1080×1920 frame per scene, in order, with your template
                    and background. Post them as an Instagram Story sequence.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      primary
                      disabled={progress !== null}
                      onClick={() => doStory("image/png")}
                    >
                      Render PNG frames
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doStory("image/jpeg")}
                    >
                      Render JPEG frames
                    </Btn>
                  </div>
                  {stills && (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Btn onClick={doStillsZip}>Download all as ZIP</Btn>
                      </div>
                      <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {stills.urls.map((u, i) => (
                          <li key={u}>
                            <img
                              src={u}
                              alt={`Story frame ${i + 1} of ${stills.urls.length}`}
                              className="w-full rounded border"
                            />
                            <a
                              className="mt-1 block min-h-11 py-2 text-center text-sm underline"
                              href={u}
                              download={`${slug(name)}-story-${String(i + 1).padStart(2, "0")}.${stills.type === "image/png" ? "png" : "jpg"}`}
                            >
                              Download {i + 1}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
              )}

              {activeTab === "poem" && (
                <section aria-label="Poem" className="pms-card space-y-3">
                  <h2 className="text-lg font-semibold">Poem text</h2>
                  {source?.kind === "writing" ? (
                    <>
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        This poem comes from your Portfolio and is read-only
                        here. To change the words, start a new poem by pasting
                        a copy, or edit the original in Writings.
                      </p>
                      <pre lang="ta" className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{poemText}</pre>
                    </>
                  ) : source?.poem ? (
                    <>
                      <Field label="Title">
                        <input className="pms-field" lang="ta" value={poemTitle} maxLength={300} onChange={(e) => setPoemTitle(e.target.value)} />
                      </Field>
                      <Field label="Poem text (blank line = new stanza)">
                        <textarea
                          aria-label="Poem text"
                          className="pms-field"
                          lang="ta"
                          rows={14}
                          value={poemText}
                          style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: "pre-wrap", resize: "vertical" }}
                          onChange={(e) => setPoemText(e.target.value)}
                        />
                      </Field>
                      <Btn primary onClick={applyPoemEdit}>
                        Apply and rebuild scenes
                      </Btn>
                      <p className="text-xs" style={{ color: "var(--mute)" }}>
                        Rebuilding replaces your scene edits. You can Undo.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--mute)" }}>
                      This project has no stored poem text to edit.
                    </p>
                  )}
                </section>
              )}

              {activeTab === "full" && (
                <section aria-label="Full poem" className="space-y-3">
                  <h2 className="text-lg font-semibold">Full-poem vertical poster</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    The whole poem on one image. No line, stanza or punctuation
                    is dropped, and text is never made smaller than a readable
                    size.
                  </p>
                  <div role="group" aria-label="Layout" className="flex flex-wrap gap-2">
                    {Object.entries(FULL_PRESETS).map(([k, v]) => (
                      <Btn key={k} aria-pressed={fullPreset === k} onClick={() => setFull_({ preset: k })} title={v.note}>
                        {v.label}
                      </Btn>
                    ))}
                  </div>
                  <div role="group" aria-label="Canvas height" className="flex flex-wrap gap-2">
                    <Btn aria-pressed={fullHeight === "standard"} onClick={() => setFull_({ height: "standard" })}>
                      Standard 1080×1920
                    </Btn>
                    <Btn aria-pressed={fullHeight === "extended"} onClick={() => setFull_({ height: "extended" })}>
                      Extended height
                    </Btn>
                  </div>
                  {fullLayout && (
                    <>
                      <p className="text-sm" aria-live="polite">
                        {fullLayout.width}×{fullLayout.height}px · font size {fullLayout.size}px ·{" "}
                        <strong>
                          {fullLayout.level === "good" ? "Readable" : fullLayout.level === "small" ? "Small but readable" : "Too small"}
                        </strong>
                        {fullLayout.shrunk ? ` (reduced from ${fullLayout.presetSize}px to fit)` : ""}
                      </p>
                      <p className="text-xs" style={{ color: fullMissing.length ? "var(--err-ink)" : "var(--mute)" }}>
                        {fullMissing.length
                          ? `${fullMissing.length} line(s) are missing from this layout; export is blocked.`
                          : `All ${fullPoem.stanzas.flat().length} lines are on the poster.`}
                      </p>
                      {!fullLayout.fits && (
                        <div role="alert" className="rounded-lg p-3 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
                          {fullHeight === "standard" ? (
                            <>
                              This poem is too long to be readable on a single 9:16 image (it would need text smaller than {fullLayout.size}px).
                              Nothing has been cut. Choose what to do:
                              <div className="mt-2 flex flex-wrap gap-2">
                                {fullLayout.suggestedFits && (
                                  <Btn onClick={() => setFull_({ height: "extended" })}>
                                    One taller image (1080×{fullLayout.suggestedHeight}, {fullLayout.suggestedSize}px text)
                                  </Btn>
                                )}
                                {fullPreset !== "compact" && <Btn onClick={() => setFull_({ preset: "compact" })}>Try Compact</Btn>}
                                <Btn onClick={() => { setMode("advanced"); setTab("story"); }}>Split into Story frames</Btn>
                              </div>
                            </>
                          ) : (
                            "This poem is too long for even the tallest single image at a readable size. Use Story frames or the Feed poster card set instead."
                          )}
                        </div>
                      )}
                      <canvas
                        ref={fullCanvasRef}
                        role="img"
                        aria-label="Preview of the full-poem poster"
                        className="mx-auto block max-w-full rounded-lg border bg-black"
                        style={{ width: Math.round(FULL_W * 0.34), height: "auto" }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Btn primary disabled={progress !== null || !fullLayout.fits || fullMissing.length > 0} onClick={() => doFull("image/png", 1)}>
                          PNG
                        </Btn>
                        <Btn disabled={progress !== null || !fullLayout.fits || fullMissing.length > 0} onClick={() => doFull("image/jpeg", 1)}>
                          JPEG
                        </Btn>
                        <Btn disabled={progress !== null || !fullLayout.fits || fullMissing.length > 0 || fullLayout.maxScale < 2} onClick={() => doFull("image/png", 2)}>
                          High-res PNG (2×)
                        </Btn>
                        {fullLayout.maxScale < 2 && (
                          <span className="text-xs" style={{ color: "var(--mute)" }}>2× unavailable: too large for phone canvases.</span>
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}

              {activeTab === "poster" && (
                <section aria-label="Poster" className="space-y-3">
                  <h2 className="text-lg font-semibold">Feed poster (4:5)</h2>
                  <p className="text-sm" style={{ color: "var(--mute)" }}>
                    Choose the stanzas for the poster. Text is never shrunk
                    below a readable size; if it won’t fit, you’ll be told and
                    can make a multi-card set.
                  </p>
                  <fieldset>
                    <legend className="pms-lbl">Stanzas to include</legend>
                    {comp.scenes.map((s, i) =>
                      s.kind === "title" ? null : (
                        <label
                          key={s.id}
                          className="flex min-h-11 items-start gap-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={
                              !comp.poster.sceneIds.length ||
                              comp.poster.sceneIds.includes(s.id)
                            }
                            onChange={(e) =>
                              update((c) => {
                                const all = c.scenes
                                  .filter((x) => x.kind !== "title")
                                  .map((x) => x.id);
                                const cur = c.poster.sceneIds.length
                                  ? c.poster.sceneIds
                                  : all;
                                c.poster.sceneIds = e.target.checked
                                  ? all.filter(
                                      (id) => cur.includes(id) || id === s.id,
                                    )
                                  : cur.filter((id) => id !== s.id);
                                return c;
                              })
                            }
                          />{" "}
                          <span lang="ta">
                            {i}. {s.lines[0]}
                            {s.lines.length > 1 ? " …" : ""}
                          </span>
                        </label>
                      ),
                    )}
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      primary
                      disabled={progress !== null}
                      onClick={() => doPoster("image/png", false)}
                    >
                      Poster PNG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/jpeg", false)}
                    >
                      Poster JPEG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/png", true)}
                    >
                      Multi-card set (PNG ZIP)
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/jpeg", true)}
                    >
                      Multi-card set (JPEG ZIP)
                    </Btn>
                  </div>
                </section>
              )}

              {activeTab === "project" && (
                <section aria-label="Project" className="pms-card">
                  <h2 className="text-lg font-semibold">Project</h2>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      aria-label="Project name"
                      className="pms-field"
                      value={name}
                      maxLength={120}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Btn primary onClick={projectId ? save : () => setCloudDialog(true)}>
                      {projectId ? "Save now" : "Save project to Admin"}
                    </Btn>
                  </div>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--mute)" }}
                    aria-live="polite"
                  >
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "saved"
                        ? "Saved."
                        : saveState === "dirty"
                          ? "Autosaving…"
                          : saveState === "error"
                            ? "Save failed — your work is still on screen and a copy is kept on this device."
                            : projectId
                              ? "Autosave is on."
                              : "Not saved to Admin. A recovery copy is kept on this device only."}
                  </p>
                  {cloudDialog && !projectId && (
                    <div role="alertdialog" aria-labelledby="cloud-h" className="mt-3 rounded-lg border p-3">
                      <p id="cloud-h" className="text-sm font-semibold">Save this project to Admin?</p>
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        This saves your poem and visual composition in your Admin creative-project library. It does not create or publish a Portfolio Writing record.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Btn primary onClick={() => { setCloudDialog(false); save(); }}>Save project to Admin</Btn>
                        <Btn onClick={() => setCloudDialog(false)}>Not now</Btn>
                      </div>
                    </div>
                  )}
                  {projectId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Btn onClick={duplicate}>Duplicate</Btn>
                      <Btn onClick={() => setConfirmDel(true)}>
                        Delete project
                      </Btn>
                    </div>
                  )}
                  {confirmDel && (
                    <div
                      role="alertdialog"
                      aria-labelledby="del-h"
                      className="mt-3 rounded-lg border p-3"
                      style={{ borderColor: "var(--err-ink)" }}
                    >
                      <p id="del-h" className="text-sm font-semibold">
                        Delete “{name}” permanently?
                      </p>
                      <p className="text-sm" style={{ color: "var(--mute)" }}>
                        The original writing is not affected. This cannot be
                        undone.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Btn
                          onClick={remove}
                          style={{
                            background: "var(--err-ink)",
                            color: "var(--err-bg)",
                          }}
                        >
                          Yes, delete project
                        </Btn>
                        <Btn onClick={() => setConfirmDel(false)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeTab === "export" && (
                <section aria-label="Export" className="pms-card space-y-3">
                  <h2 className="text-lg font-semibold">Export</h2>
                  {caps === null && (
                    <p className="text-sm" style={{ color: "var(--mute)" }}>
                      Checking what this device can encode…
                    </p>
                  )}
                  {caps && !caps.mp4 && (
                    <p className="text-sm" style={{ color: "var(--warn-ink)" }}>
                      {caps.reason}
                    </p>
                  )}
                  {caps?.mp4 && (
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      Verified H.264 encoder ({caps.avcString})
                      {caps.aac ? " and AAC audio" : "; AAC audio unavailable"}.
                      Always play the file on your phone before posting.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      primary
                      disabled={
                        !caps?.mp4 ||
                        progress !== null ||
                        comp.format === "poster"
                      }
                      onClick={doVideo}
                    >
                      {progress !== null
                        ? `Working ${Math.round(progress * 100)}%`
                        : `Export ${comp.format === "story" ? "Story" : "Reel"} MP4`}
                    </Btn>
                    {progress !== null && (
                      <Btn onClick={() => abortRef.current?.abort()}>
                        Cancel
                      </Btn>
                    )}
                    <Btn
                      disabled={progress !== null}
                      onClick={() => setTab("full")}
                    >
                      Full-poem poster…
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doCover("image/png")}
                    >
                      Reel cover PNG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => doPoster("image/png", false)}
                    >
                      Export Feed poster PNG
                    </Btn>
                    <Btn
                      disabled={progress !== null}
                      onClick={() => {
                        setTab("story");
                        setMode("advanced");
                        doStory("image/png");
                      }}
                    >
                      Export Story frames (ZIP)
                    </Btn>
                  </div>
                  {comp.format === "poster" && (
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      Switch the format to Reel or Story (Look) to export video.
                    </p>
                  )}
                  {caps && !caps.mp4 && (
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      No MP4 on this device: use Story frames (ZIP) and assemble
                      them in any video app.
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {full && comp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen preview"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black p-3"
          style={{
            paddingTop: "max(12px, env(safe-area-inset-top))",
            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          }}
        >
          <div className="flex w-full justify-between">
            <Btn onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </Btn>
            <Btn onClick={() => setFull(false)} autoFocus>
              Close
            </Btn>
          </div>
          <canvas
            ref={fullRef}
            width={540}
            height={Math.round((540 * fmt.h) / fmt.w)}
            style={{
              height: "min(80dvh,100%)",
              aspectRatio: `${fmt.w}/${fmt.h}`,
            }}
            className="rounded-lg"
            role="img"
            aria-label="Full-screen preview"
          />
        </div>
      )}
    </main>
  );
}
