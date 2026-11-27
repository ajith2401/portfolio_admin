"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, errorMessage } from "@/lib/editor/writing-client";
import { poemFromWriting } from "@/lib/motion-studio/poem";
import { generateScenes } from "@/lib/motion-studio/scenes";
import { TEMPLATES } from "@/lib/motion-studio/templates";
import { ensureFonts, canvasMeasure } from "@/lib/motion-studio/font-ready";
import { defaultComposition, normalizeComposition, motionPrefsOf, MAX_SCENES } from "@/lib/motion-studio/composition";
import { drawFrame, compDuration, setFontFamilies } from "@/lib/motion-studio/render";
import { FORMATS, safeRect } from "@/lib/motion-studio/safe-zone";
import { runBundle } from "@/lib/motion-studio/bundle";
import { detectCapabilities, canvasLease, exportMp4, renderSceneStills, renderPosters, renderFullPoem, renderReelCover, renderQuote, exportQuoteMp4, renderCarousel, zipBlobs } from "@/lib/motion-studio/export";
import * as E from "@/lib/motion-studio/scene-edit";
import { bakeBackground, readabilityScrim, decodeImageFile } from "@/lib/motion-studio/background";
import { decodeAudio, shapeAudio, startRecording, recordingSupport } from "@/lib/motion-studio/audio";
import { FONT_CSS } from "./fonts";
import { VERIFIED_FONT_IDS, fontReviewOf, CANDIDATE_EXPORT_WARNING } from "@/lib/motion-studio/font-registry";
import AudioPanel from "./panels/AudioPanel";
import BackgroundPanel from "./panels/BackgroundPanel";
import ExportPanel from "./panels/ExportPanel";
import FullPoemPanel from "./panels/FullPoemPanel";
import LookPanel from "./panels/LookPanel";
import PoemPanel from "./panels/PoemPanel";
import PosterPanel from "./panels/PosterPanel";
import ProjectPanel from "./panels/ProjectPanel";
import ScenesPanel from "./panels/ScenesPanel";
import { ReadabilityNotice } from "./panels/FitScenesDialog";
import StoryPanel from "./panels/StoryPanel";
import QuickCreate, { QuickCreateCheck } from "./panels/QuickCreate";
import RecoveryBanner from "./panels/RecoveryBanner";
import ShortcutHelp from "./panels/ShortcutHelp";
import { UX_CSS } from "./panels/ux-css";
import useHistory from "./hooks/useHistory";
import usePrefs from "./hooks/usePrefs";
import useRecovery from "./hooks/useRecovery";
import useShortcuts from "./hooks/useShortcuts";
import { StudioContext } from "./studio-context";
import { Btn, Field, download, slug } from "./studio-ui";
import { parsePoemText, poemToText, importPoemFile } from "@/lib/motion-studio/poem-input";
import { layoutFullPoem, drawFullPoem, validateFullPoem, FULL_W } from "@/lib/motion-studio/full-poem";
import { saveDraft, loadDraft, listDrafts, deleteDraft, clearDrafts, newDraftId } from "@/lib/motion-studio/drafts";
import { routeById } from "@/lib/motion-studio/formats";
import { formatForRoute, tabForRoute } from "@/lib/motion-studio/quick-create";

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
.pms-tabs .pms-btn{flex:0 0 auto;white-space:nowrap}
.pms-handle,.pms-grip{display:none}
@media (max-width:1023px){
.pms-sheet{position:fixed;left:0;right:0;bottom:var(--kb,0px);z-index:30;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-bottom:0;border-radius:16px 16px 0 0;box-shadow:0 -8px 24px rgba(0,0,0,.18);max-height:min(62dvh,calc(var(--vvh,100dvh)*.62));padding-bottom:env(safe-area-inset-bottom)}
.pms-sheet [role=tabpanel]{overflow-y:auto;overscroll-behavior:contain;padding:0 12px 12px;margin-top:8px}
.pms-sheet[data-open=false] [role=tabpanel]{display:none}
.pms-handle{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:44px;width:100%;justify-content:center;font-size:12px;font-weight:600;color:var(--mute);background:transparent;border:0}
.pms-grip{display:block;width:40px;height:4px;border-radius:2px;background:var(--line)}
.pms-tabs{padding-bottom:0}
.pms[data-sheet=open]{padding-bottom:calc(62dvh + 16px)}
.pms[data-sheet=open] canvas[aria-label^=Preview]{height:34dvh!important;width:auto!important;aspect-ratio:9/16}
.pms[data-sheet=closed]{padding-bottom:calc(120px + env(safe-area-inset-bottom))}
}
@media (min-width:1024px){.pms-tabs{border-bottom:1px solid var(--line)}}
@media (prefers-reduced-motion:reduce){.pms *{scroll-behavior:auto!important}}
`;
export default function MotionStudio() {
  const [theme, setTheme] = useState("system");
  const P = usePrefs();
  const mode = P.prefs.mode === "advanced" ? "advanced" : "quick"; // "quick" = Simple: fewer tabs, same composition
  const setMode = useCallback((m) => P.update({ mode: m === "advanced" ? "advanced" : "simple" }), [P.update]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState("scenes");
  const [writings, setWritings] = useState([]);
  const [source, setSource] = useState(null);
  const [scrimPct, setScrimPct] = useState(0);
  const [hasBitmap, setHasBitmap] = useState(false);
  const [recOk, setRecOk] = useState({ ok: true });
  const [projectId, setProjectId] = useState(null);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [msg, setMsg] = useState(null);
  const hist = useHistory({
    onRefused: (why) => setMsg({ kind: "error", text: why === "open" ? "This composition could not be opened intact (a scene line is too long or a scene has too many lines), so nothing was changed." : "That change was not applied because it would have altered or dropped poem text. Nothing was changed." }),
  });
  const [qc, setQc] = useState(null); // the output chosen in Quick Create (its pre-export check is shown)
  const [help, setHelp] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);
  const [listed, setListed] = useState(false);
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
  const parsedEdit = useMemo(() => parsePoemText(poemText, { title: poemTitle }), [poemText, poemTitle]);
  const parsedBox = useMemo(() => parsePoemText(textBox, { title: titleBox }), [textBox, titleBox]);
  const mainRef = useRef(null);
  const [wide, setWide] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [vv, setVv] = useState({ kb: 0, h: 0 });
  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // three panes need ~1000px of CONTENT width (the admin sidebar eats 240px of the viewport), so measure the container
    const f = () => setWide(el.clientWidth >= 1056);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const f = () => setVv({ kb: Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)), h: Math.round(v.height) });
    f();
    v.addEventListener("resize", f);
    v.addEventListener("scroll", f);
    return () => { v.removeEventListener("resize", f); v.removeEventListener("scroll", f); };
  }, []);
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

  // ---- history-backed edits (validated; rapid edits sharing a key coalesce into one undo step)
  const commit = hist.commit;
  const update = (fn, key) => comp && commit(fn(structuredClone(comp)), key);
  const setScenes = (fn, key) =>
    update((c) => ({ ...c, scenes: fn(c.scenes) }), key);
  const start = (c) => {
    if (!hist.reset(c)) return false;
    if (!c) setQc(null);
    // normalizeComposition replaced a font (unreviewed candidate / display-only): say so, never silently
    if (c?.notices) flash("error", Object.values(c.notices).join(" "));
    return true;
  };
  const { undo, redo } = hist;

  useEffect(() => {
    setFontFamilies(FONT_CSS);
    setRecOk(recordingSupport());
    detectCapabilities().then(setCaps);
    try {
      const th = localStorage.getItem("pms:theme");
      if (th) setTheme(th);
      localStorage.removeItem("pms:draft"); // legacy key; recovery now lives in IndexedDB
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("pms:theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    (async () => {
      const [w, p] = await Promise.all([
        apiRequest("GET", "/api/writings?category=poem&limit=100"),
        apiRequest("GET", "/api/motion-projects"),
      ]);
      if (w.ok) setWritings(w.data.writings || []);
      else flash("error", errorMessage(w.data) || "Could not load poems");
      if (p.ok) setProjects(p.data.projects || []);
      setListed(true);
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
          // verified faces always; a candidate only when this composition draws with it (never fetched otherwise)
          [...VERIFIED_FONT_IDS, comp.style.font, comp.style.titleFont]
            .filter((id, i, a) => id && FONT_CSS[id] && a.indexOf(id) === i)
            .map((id) =>
              document.fonts.load(`500 40px ${FONT_CSS[id]}`, "தமிழ் Aa"),
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

  // ---- loading a poem (look: optional {format, templateId, motion} chosen in Quick Create)
  const withLook = (scenes, { motion, ...look } = {}) => {
    const d = defaultComposition({ scenes, ...look });
    return motion ? { ...d, motion: { ...d.motion, ...motion } } : d;
  };
  const pick = async (id, look = {}) => {
    if (!id) return false;
    const r = await apiRequest("GET", `/api/writings/${id}`);
    if (!r.ok)
      return flash("error", errorMessage(r.data) || "Could not load poem");
    const poem = poemFromWriting(r.data);
    if (!poem.stanzas.length)
      return flash("error", "This writing has no poem lines to animate."), false;
    const scenes = generateScenes(poem, { title: r.data.title });
    if (!start({ ...withLook(scenes, look), originalScenes: structuredClone(scenes) })) return false;
    draftId.current = null;
    setSource({
      id,
      kind: "writing",
      title: r.data.title,
      warnings: poem.warnings,
      version: r.data.version ?? null,
      poem: { stanzas: poem.stanzas },
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
    return true;
  };
  // The poem record kept with a project: stanzas plus the verbatim source and blank-line structure.
  const poemRecord = (p) => ({ title: p.title, stanzas: p.stanzas, source: p.source, blank: p.blank, trailingBlank: p.trailingBlank });
  // Returns scenes, or null after showing an inline error. Nothing is ever cut to fit.
  const scenesFor = (p) => {
    if (!p.ok) { flash("error", p.issues[0].message); return null; }
    const scenes = generateScenes({ stanzas: p.stanzas }, { title: p.title });
    if (scenes.length > MAX_SCENES) { flash("error", `This poem needs ${scenes.length} scenes; the limit is ${MAX_SCENES}. Nothing was cut. Split it into several poems.`); return null; }
    return scenes;
  };
  const startManual = (text, title, look = {}) => {
    const p = parsePoemText(text, { title });
    if (!p.stanzas.length)
      return flash("error", "Write or paste at least one line of the poem first."), false;
    const scenes = scenesFor(p);
    if (!scenes) return false; // the whole text stays in the box
    if (!start({ ...withLook(scenes, look), originalScenes: structuredClone(scenes), poem: poemRecord(p) })) return false;
    draftId.current = null;
    setSource({ id: null, kind: "manual", title: p.title, warnings: [], poem: poemRecord(p) });
    setName(p.title || "Untitled poem");
    setProjectId(null);
    setT(0);
    setSel(0);
    setSourceChanged(false);
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
    flash(
      "ok",
      `Created ${scenes.length} scenes from ${p.lineCount} lines. Nothing was saved to your Portfolio or Admin; a recovery copy stays on this device.`,
    );
    return true;
  };
  // Quick Create: the same creation path, with the chosen output's format and look (and the author's motion feel)
  const quickCreate = async (choice, { routeId, templateId }) => {
    const r = routeById(routeId);
    const motion = motionPrefsOf({ pref: P.prefs.motionPref, reduceMotion: P.prefs.reduceMotion });
    const look = { format: formatForRoute(r), templateId, ...(Object.keys(motion).length ? { motion } : {}) };
    const ok = choice.kind === "writing" ? await pick(choice.id, look) : startManual(choice.text, choice.title, look);
    if (!ok) return;
    P.recordRecent(templateId);
    P.update({ lastRoute: routeId });
    setQc({ routeId });
    setTab(tabForRoute(r));
  };
  const recovery = useRecovery({
    comp, name, source, projectId, projects, projectsReady: listed,
    onRestore: (plan) => {
      if (!start(plan.composition)) return;
      loadedRef.current = false;
      bgBitmap.current = null;
      setHasBitmap(false);
      draftId.current = null;
      setName(plan.name);
      setProjectId(null);
      setSource(plan.source);
      setT(0);
      setSel(0);
      flash("ok", plan.message);
    },
  });
  // mirror the author's motion feel / reduce-motion choice so the next Quick Create starts with it (ids/flags only)
  const motionKey = comp ? `${comp.motion?.pref || ""}|${comp.motion?.reduceMotion === true}` : "";
  useEffect(() => {
    if (!comp) return;
    const m = motionPrefsOf(comp.motion);
    P.update({ motionPref: m.pref || null, reduceMotion: m.reduceMotion === true });
  }, [motionKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
      setTextBox(poemToText(p)); // the full imported text, never a truncated copy
      setTitleBox(p.title);
      setRoute("import");
      if (!p.ok) flash("error", `Imported “${file.name}” in full, but it cannot be turned into scenes yet: ${p.issues[0].message}`);
      else flash("ok", `Imported “${file.name}” as text only. Review it, then choose Create scenes.`);
    } catch (e) {
      flash("error", e?.message || "Could not import that file.");
    }
  };
  const openDraft = async (id) => {
    const d = await loadDraft(id);
    if (!d) return flash("error", "That recovery copy could not be opened.");
    if (!start(normalizeComposition(d.composition))) return;
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
    draftId.current = d.id;
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
    const scenes = scenesFor(p);
    if (!scenes) return; // your edited text stays in the box; the current scenes are unchanged
    setSource((x) => ({ ...x, title: p.title, poem: poemRecord(p) }));
    update((c) => ({
      ...c,
      scenes,
      originalScenes: structuredClone(scenes),
      poem: poemRecord(p),
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
    const c = normalizeComposition(r.data.project.composition);
    if (!start(c)) return;
    loadedRef.current = false;
    bgBitmap.current = null;
    setHasBitmap(false);
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
          ? { id: null, kind: "manual", title: c.poem.title, warnings: [], poem: c.poem }
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
  // Exact faces (family+weight, with the poem's own text so the Tamil subset loads) must be ready before any measuring.
  const fontsReady = () =>
    ensureFonts(
      comp,
      { poemText: [fullPoem.title, ...fullPoem.stanzas.flat()].join("\n"), title: fullPoem.title },
      { measure: canvasMeasure() },
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
      // a candidate (unreviewed) font: the export succeeded, but the result always carries the review warning
      if (fontReviewOf(comp))
        setMsg((m) => ({
          kind: "error",
          text: `${m?.text ? m.text + " " : ""}Font review: unreviewed. ${CANDIDATE_EXPORT_WARNING}`,
        }));
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
  // the composition a video route encodes (+ shaped audio): shared by the single MP4 export and the bundle
  const videoSetup = (fm) => {
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
    return { c, audioBuffer };
  };
  const doVideo = () =>
    guard(async (signal) => {
      const fm = comp.format === "poster" ? "reel" : comp.format;
      const { c, audioBuffer } = videoSetup(fm);
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
  const doCarousel = (type) =>
    guard(async () => {
      const { blobs } = await renderCarousel(comp, { type, assets: exportAssets("poster") });
      const ext = type === "image/png" ? "png" : "jpg";
      download(await zipBlobs(blobs, `${slug(name)}-carousel`, ext), `${slug(name)}-carousel.zip`);
      flash("ok", `Feed carousel exported: ${blobs.length} numbered cards (cover, poem, end).`);
    });
  // Quote = EXCERPT only: the file name and the message say so; it is never reported as the complete poem.
  const doQuote = (selection, format, kind) =>
    guard(async (signal) => {
      const r = kind === "video"
        ? await exportQuoteMp4(comp, fullPoem, selection, { format, signal, onProgress: setProgress, assets: exportAssets(format) })
        : await renderQuote(comp, fullPoem, selection, { format, type: "image/png", assets: exportAssets(format) });
      download(r.blob, `${slug(name)}-quote-excerpt-${r.format}.${kind === "video" ? "mp4" : "png"}`);
      flash("ok", `Quote exported as an EXCERPT: ${r.coverage.selected} of ${r.coverage.total} lines (not the complete poem).`);
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
  const three = wide && mode === "advanced"; // desktop 3-pane: poem + scenes live in the left pane
  const tabsShown = three ? tabs.filter(([k]) => k !== "poem" && k !== "scenes") : tabs;
  const activeTab = tabsShown.some(([k]) => k === tab) ? tab : tabsShown[0][0];

  const fullPoem = useMemo(() => {
    if (!comp) return { title: "", stanzas: [] };
    if (source?.poem) return { title: source.title || "", stanzas: source.poem.stanzas, blank: source.poem.blank, source: source.poem.source };
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
  const fullCheck = useMemo(
    () => (fullLayout ? validateFullPoem(fullPoem, fullLayout) : null),
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
  const fullMissing = fullCheck ? fullCheck.messages : [];
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
  // ---- Export all (bundle): every route is validated from scratch on EVERY run (Retry never reuses a result), one
  // route at a time, canvases released between routes. A refused route stops the bundle unless the author confirmed
  // "continue without failed routes"; the manifest always lists it.
  const bundleInput = (route) =>
    route.id === "full-poem" ? { poem: fullPoem, preset: fullPreset, height: fullHeight } : { poem: fullPoem };
  const runBundleExport = async ({ routeIds, preset, continueOnFailure = false }) => {
    setPlaying(false);
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress(0);
    setMsg(null);
    const fullH = new Map();
    const probeMeasure = () => Object.assign(document.createElement("canvas"), { width: 16, height: 16 }).getContext("2d");
    try {
      const items = routeIds.map(routeById).filter(Boolean).map((route) => ({ route, input: bundleInput(route) }));
      const r = await runBundle({
        items,
        comp,
        poem: fullPoem,
        preset,
        generatedAt: new Date().toISOString(),
        stem: slug(name),
        measureCtx: probeMeasure(),
        continueOnFailure,
        signal: ac.signal,
        onProgress: (p) => p.phase === "render" && setProgress(p.fraction),
        release: () => canvasLease.releaseAll(),
        live: () => canvasLease.live(),
        preflight: async (route, input) => {
          if (route.kind === "video" && !caps?.mp4) return { ok: false, messages: [caps?.reason || "This device cannot encode MP4 video."] };
          const c = route.kind === "video" ? videoSetup(route.format).c : comp;
          await ensureFonts(
            c,
            { poemText: [fullPoem.title, ...fullPoem.stanzas.flat(), comp.poster?.endText || ""].join("\n"), title: fullPoem.title },
            { measure: canvasMeasure() },
          );
          const v = route.validate(probeMeasure(), c, input);
          if (route.id === "full-poem" && v.layout?.height) fullH.set(route.id, v.layout.height);
          return v;
        },
        render: (route, input, { preset: p, signal, onProgress }) => {
          if (route.kind === "video") {
            const { c, audioBuffer } = videoSetup(route.format);
            return route.render(c, input, { preset: p, signal, onProgress, audioBuffer, assets: exportAssets(route.format) });
          }
          if (route.id === "full-poem") return route.render(comp, input, { preset: p, type: "image/png", assets: fullAssets(fullH.get(route.id) || 1920) });
          return route.render(comp, input, { preset: p, type: "image/png", signal, onProgress, assets: exportAssets(route.format) });
        },
      });
      if (r.zip) download(new Blob([r.zip], { type: "application/zip" }), `${slug(name)}-bundle.zip`);
      if (r.zip && fontReviewOf(comp)) flash("error", `Font review: unreviewed. ${CANDIDATE_EXPORT_WARNING}`);
      return r;
    } catch (e) {
      canvasLease.releaseAll();
      if (e?.name === "AbortError") return { cancelled: true };
      return { error: e?.message || String(e) };
    } finally {
      setProgress(null);
    }
  };

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

  // a template sets its own text animation, but the author's motion feel / reduce-motion choice is kept
  const withMotionPrefs = (d, m) => ({ ...d, motion: { ...d.motion, ...motionPrefsOf(m) } });
  const pickTemplate = (id) => {
    P.recordRecent(id);
    return update((c) => ({
      ...withMotionPrefs(defaultComposition({ format: c.format, templateId: id, scenes: c.scenes, signature: c.branding.signature, branding: c.branding }), c.motion),
      originalScenes: c.originalScenes,
      audio: c.audio,
      poster: c.poster,
      export: c.export,
      ...(c.material ? { material: c.material } : {}),
    }));
  };
  // ---- keyboard shortcuts (never inside text fields; see lib/motion-studio/shortcuts.js)
  useShortcuts({
    undo: () => comp && undo(),
    redo: () => comp && redo(),
    save: () => {
      if (!comp) return;
      if (projectId) save();
      else flash("ok", "Ctrl/Cmd+S saves a project that is already in Admin. Use Save project to Admin once first.");
    },
    help: () => setHelp((h) => !h),
  });
  const scenesPanel = comp ? <ScenesPanel /> : null;
  const poemPanel = comp ? <PoemPanel /> : null;

  const studio = {
    S,
    abortRef,
    applyPoemEdit,
    audioInfo,
    bg,
    bgBitmap,
    caps,
    clearAudio,
    cloudDialog,
    comp,
    confirmDel,
    doCarousel,
    doCover,
    runBundleExport,
    bundleInput,
    doQuote,
    doFull,
    doPoster,
    doStillsZip,
    doStory,
    doVideo,
    duplicate,
    flash,
    fontTick,
    fullCanvasRef,
    fullCheck,
    fontsReady,
    fullHeight,
    fullLayout,
    fullMissing,
    fullPoem,
    fullPreset,
    hasBitmap,
    mode,
    name,
    onBgFile,
    parsedEdit,
    pickTemplate,
    poemMissing,
    poemText,
    poemTitle,
    progress,
    projectId,
    recOk,
    recState,
    remove,
    save,
    saveState,
    scrimPct,
    seekScene,
    setAudio,
    setCloudDialog,
    setConfirmDel,
    setFull_,
    setHasBitmap,
    setMode,
    setName,
    setPoemText,
    setPoemTitle,
    setScenes,
    setScrimPct,
    setSel,
    setTab,
    source,
    stills,
    toggleRecord,
    update,
    uploadBg,
  };

  return (
    <StudioContext.Provider value={studio}>
    <main
      ref={mainRef}
      className="pms mx-auto min-h-screen max-w-6xl p-4 sm:p-6 xl:max-w-[1600px]"
      data-sheet={comp ? (sheetOpen ? "open" : "closed") : undefined}
      data-theme={theme}
      data-reduce-ui={P.prefs.reduceEffects ? "true" : undefined}
    >
      <style>{THEME_CSS + UX_CSS}</style>
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
          <Btn aria-pressed={mode === "quick"} onClick={() => setMode("quick")} title="Simple: the essential tabs. Switching never changes your work.">
            Simple
          </Btn>
          <Btn
            aria-pressed={mode === "advanced"}
            onClick={() => setMode("advanced")}
          >
            Advanced Studio
          </Btn>
          <Btn onClick={() => setHelp(true)} aria-haspopup="dialog">Shortcuts</Btn>
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
      {!comp && <RecoveryBanner offer={recovery.offer} onRestore={recovery.restore} onDiscard={recovery.discard} onDismiss={recovery.dismiss} />}
      <ShortcutHelp open={help} onClose={closeHelp} reduceUi={P.prefs.reduceEffects} onReduceUi={(v) => P.update({ reduceEffects: v })} />
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
              ["quick", "Quick Create", "Poem, output, look"],
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

          {route === "quick" && <QuickCreate writings={writings} prefs={P.prefs} onFavourite={P.toggleFavourite} onCreate={quickCreate} />}
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
                A blank line starts a new stanza. Line breaks, indentation and
                spaces are kept exactly as you wrote them.
              </p>
              {!parsedBox.ok && (
                <div id="pms-input-error" role="alert" className="rounded-lg p-3 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
                  <strong>Your full text is kept here, but scenes cannot be made yet.</strong>
                  <ul className="mt-1 list-disc pl-5">
                    {parsedBox.issues.slice(0, 5).map((i, k) => <li key={k}>{i.message}</li>)}
                  </ul>
                </div>
              )}
              <Btn primary disabled={!parsedBox.ok} onClick={() => startManual(textBox, titleBox)}>
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
        <div className={`mt-5 grid gap-6 ${three ? "grid-cols-[280px_minmax(270px,1fr)_360px]" : "grid-cols-[minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]"}`}>
          {three && (
            <div className="min-w-0 space-y-4" aria-label="Source poem and scenes" role="region">
              {poemPanel}
              {scenesPanel}
            </div>
          )}
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            {previewBlock("main")}
            <ReadabilityNotice />
            {qc && <QuickCreateCheck routeId={qc.routeId} onDone={() => setQc(null)} />}
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

          <div className="min-w-0 pms-sheet" onKeyDown={(e) => e.key === "Escape" && sheetOpen && setSheetOpen(false)} data-open={sheetOpen ? "true" : "false"} style={{ "--kb": `${vv.kb}px`, "--vvh": vv.h ? `${vv.h}px` : "100dvh" }}>
            <button type="button" className="pms-handle" aria-expanded={sheetOpen} aria-controls="pms-panel" onClick={() => setSheetOpen((o) => !o)}>
              <span aria-hidden="true" className="pms-grip" />
              {sheetOpen ? "Hide panel to see the full preview" : "Show editing panel"}
            </button>
            <div
              className="pms-tabs"
              role="tablist"
              aria-label="Studio sections"
              style={{ display: "flex", gap: 4, overflowX: "auto", padding: 4 }}
            >
              {tabsShown.map(([k, l]) => (
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
                  onClick={() => { setTab(k); setSheetOpen(activeTab === k && sheetOpen ? false : true); }}
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
              {activeTab === "look" && <LookPanel />}

              {activeTab === "scenes" && scenesPanel}

              {activeTab === "bg" && <BackgroundPanel />}

              {activeTab === "audio" && <AudioPanel />}

              {activeTab === "story" && <StoryPanel />}

              {activeTab === "poem" && poemPanel}

              {activeTab === "full" && <FullPoemPanel />}

              {activeTab === "poster" && <PosterPanel />}

              {activeTab === "project" && <ProjectPanel />}

              {activeTab === "export" && <ExportPanel />}
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
    </StudioContext.Provider>
  );
}
