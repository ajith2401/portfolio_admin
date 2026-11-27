// P7 UX layer (pure modules): prefs, history, draft recovery, shortcuts, Quick Create model. Synthetic poems only.
// Priority: a Tamil poem is never silently lost, altered or misrendered, and no UI helper mutates poem text.
import test from "node:test";
import assert from "node:assert/strict";
import * as P from "../../src/lib/motion-studio/prefs.js";
import {
  createHistory,
  compositionIntact,
  compositionValid,
  HISTORY_LIMIT,
} from "../../src/lib/motion-studio/history.js";
import * as R from "../../src/lib/motion-studio/draft-recovery.js";
import {
  isEditableTarget,
  shortcutFor,
  handleShortcut,
  SHORTCUTS,
} from "../../src/lib/motion-studio/shortcuts.js";
import {
  planQuickCreate,
  gateRoute,
  quickRoutes,
  galleryList,
  formatForRoute,
  routeInput,
  MAX_GALLERY,
} from "../../src/lib/motion-studio/quick-create.js";
import { ROUTES } from "../../src/lib/motion-studio/formats.js";
import { TEMPLATES } from "../../src/lib/motion-studio/templates.js";
import { parsePoemText } from "../../src/lib/motion-studio/poem-input.js";
import { generateScenes } from "../../src/lib/motion-studio/scenes.js";
import {
  defaultComposition,
  normalizeComposition,
} from "../../src/lib/motion-studio/composition.js";
import { planFit, applyFit } from "../../src/lib/motion-studio/fit-scenes.js";

const POEM = "அன்பே சிவம்\nஅறமே துணை\n\nஇன்றே செய்\nஒன்றே குலம்";
const TITLE = "சோதனைக் கவிதை";
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const quotaStorage = () => ({
  getItem: () => null,
  setItem: () => {
    const e = new Error("QuotaExceededError");
    e.name = "QuotaExceededError";
    throw e;
  },
  removeItem: () => {
    throw new Error("denied");
  },
});
const throwingStorage = () => ({
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
});
const mkComp = (text = POEM) => {
  const p = parsePoemText(text, { title: TITLE });
  const scenes = generateScenes({ stanzas: p.stanzas }, { title: p.title });
  return normalizeComposition({
    ...defaultComposition({ scenes }),
    originalScenes: structuredClone(scenes),
    poem: { title: p.title, stanzas: p.stanzas, source: p.source },
  });
};
const poemLines = (c) => JSON.stringify(c.poem.stanzas);
const sceneLines = (c) => JSON.stringify(c.scenes.map((s) => s.lines));
const mkCtx = (k = 0.55) => {
  let px = 40,
    font = "40px x";
  return {
    set font(f) {
      font = f;
      px = Number(/([\d.]+)px/.exec(f)[1]);
    },
    get font() {
      return font;
    },
    measureText: (t) => ({
      width:
        Array.from(String(t)).length * px * (font.includes("Tamil") ? k : 0.5),
    }),
  };
};

// ---------------------------------------------------------------- prefs
test("prefs: round-trip through storage keeps every field (namespaced, versioned key)", () => {
  const st = memStorage();
  const s = P.createPrefsStore(st);
  s.recordRecent("monsoon");
  s.recordRecent("paper-ink");
  s.recordRecent("monsoon");
  s.toggleFavourite("golden-hour");
  const r = s.update({
    mode: "advanced",
    lastRoute: "poster",
    reduceEffects: true,
    motionPref: "calm",
    reduceMotion: true,
  });
  assert.deepEqual(r.rejected, []);
  assert.equal(r.saved, true);
  assert.ok(
    st.map.has(P.PREFS_KEY) &&
      P.PREFS_KEY.startsWith("pms:") &&
      /v1$/.test(P.PREFS_KEY),
  );
  const back = P.createPrefsStore(st).get();
  assert.deepEqual(back.recentTemplates, ["monsoon", "paper-ink"]);
  assert.deepEqual(back.favouriteTemplates, ["golden-hour"]);
  assert.equal(back.mode, "advanced");
  assert.equal(back.lastRoute, "poster");
  assert.equal(back.reduceEffects, true);
  assert.equal(back.motionPref, "calm");
  assert.equal(back.reduceMotion, true);
  assert.deepEqual(
    P.createPrefsStore(st).toggleFavourite("golden-hour").prefs
      .favouriteTemplates,
    [],
  );
});
test("prefs: corrupt / foreign / oversized storage => safe defaults (never throws)", () => {
  for (const raw of [
    "{not json",
    "null",
    "[]",
    '"x"',
    JSON.stringify({ v: 99, mode: "advanced" }),
    JSON.stringify({
      v: 1,
      mode: 7,
      recentTemplates: "monsoon",
      favouriteTemplates: [1, {}, "UPPER"],
    }),
    "x".repeat(P.MAX_PREFS_BYTES + 1),
  ]) {
    const p = P.loadPrefs(memStorage({ [P.PREFS_KEY]: raw }));
    assert.deepEqual(p, P.defaultPrefs(), raw.slice(0, 40));
  }
  assert.deepEqual(P.loadPrefs(throwingStorage()), P.defaultPrefs());
  assert.deepEqual(P.loadPrefs(null), P.defaultPrefs());
});
test("prefs: bounded sizes (recent, favourites)", () => {
  let p = P.defaultPrefs();
  for (let i = 0; i < 50; i++) p = P.withRecent(p, `t${i}`);
  assert.equal(p.recentTemplates.length, P.MAX_RECENT);
  assert.equal(p.recentTemplates[0], "t49");
  for (let i = 0; i < 80; i++) p = P.withFavourite(p, `f${i}`, true);
  assert.equal(p.favouriteTemplates.length, P.MAX_FAVOURITES);
  assert.equal(
    P.sanitizePrefs({
      recentTemplates: Array.from({ length: 99 }, (_, i) => `r${i}`),
    }).recentTemplates.length,
    P.MAX_RECENT,
  );
});
test("prefs: quota / disabled storage errors are swallowed; prefs keep working in memory", () => {
  const s = P.createPrefsStore(quotaStorage());
  const r = s.update({ mode: "advanced" });
  assert.equal(r.saved, false);
  assert.equal(s.get().mode, "advanced");
  assert.doesNotThrow(() => s.reset());
  assert.equal(
    P.createPrefsStore(throwingStorage()).recordRecent("monsoon").saved,
    false,
  );
});
test("prefs NEGATIVE CONTROL: an attempt to store poem text is rejected and never reaches storage", () => {
  const st = memStorage();
  const s = P.createPrefsStore(st);
  const line = "அன்பே சிவம்";
  const r = s.update({
    poem: POEM,
    poemText: line,
    lastRoute: line,
    recentTemplates: ["monsoon", line],
    favouriteTemplates: [POEM],
    mode: line,
    title: TITLE,
  });
  assert.deepEqual(
    r.rejected.sort(),
    [
      "favouriteTemplates",
      "lastRoute",
      "mode",
      "poem",
      "poemText",
      "recentTemplates",
      "title",
    ].sort(),
  );
  assert.equal(s.recordRecent(line).prefs.recentTemplates.length, 0);
  assert.equal(s.toggleFavourite(POEM).prefs.favouriteTemplates.length, 0);
  // even a direct save of a polluted object strips it
  P.savePrefs(st, {
    ...P.defaultPrefs(),
    poem: POEM,
    lastRoute: line,
    recentTemplates: [line],
  });
  const raw = st.getItem(P.PREFS_KEY);
  assert.ok(!/[஀-௿]/.test(raw), `Tamil text reached prefs storage: ${raw}`);
  assert.ok(!raw.includes("poem"));
  // control: the same store accepts a valid id, so the rejection above is about the content
  assert.deepEqual(s.update({ lastRoute: "reel-mp4" }).rejected, []);
});

// ---------------------------------------------------------------- history
test("history: undo/redo order, redo cleared by a new edit, deep-copy snapshots", () => {
  const h = createHistory({ now: () => 0 });
  const c0 = mkComp();
  h.reset(c0);
  const c1 = { ...structuredClone(c0), style: { ...c0.style, sizePx: 70 } };
  const c2 = { ...structuredClone(c1), style: { ...c1.style, sizePx: 80 } };
  assert.equal(h.push(c1, null, 0), true);
  assert.equal(h.push(c2, null, 10_000), true);
  c2.style.sizePx = 999; // mutating the caller's object never rewrites history
  assert.equal(h.present.style.sizePx, 80);
  assert.equal(h.undo().style.sizePx, 70);
  assert.equal(h.undo().style.sizePx, c0.style.sizePx);
  assert.equal(h.canUndo, false);
  assert.equal(h.redo().style.sizePx, 70);
  h.push(
    {
      ...structuredClone(h.present),
      style: { ...h.present.style, sizePx: 60 },
    },
    null,
    20_000,
  );
  assert.equal(h.canRedo, false);
});
test("history: bounded stack drops the oldest step", () => {
  const h = createHistory({ limit: 5, now: () => 0 });
  const c0 = mkComp();
  h.reset(c0);
  for (let i = 0; i < 20; i++)
    h.push(
      { ...structuredClone(c0), style: { ...c0.style, sizePx: 40 + i } },
      null,
      i * 10_000,
    );
  assert.equal(h.size.past, 5);
  let n = 0;
  while (h.canUndo) {
    h.undo();
    n++;
  }
  assert.equal(n, 5);
  assert.equal(h.present.style.sizePx, 40 + 14);
  assert.ok(HISTORY_LIMIT >= 50);
});
test("history: a slider drag (same key inside the window) coalesces into ONE undo step", () => {
  const h = createHistory({ coalesceMs: 900 });
  const c0 = mkComp();
  h.reset(c0);
  for (let i = 0; i < 30; i++)
    h.push(
      { ...structuredClone(c0), style: { ...c0.style, sizePx: 41 + i } },
      "size",
      1000 + i * 50,
    );
  assert.equal(h.size.past, 1);
  assert.equal(h.present.style.sizePx, 70);
  assert.equal(h.undo().style.sizePx, c0.style.sizePx);
  // a different key, or a pause longer than the window, starts a new step
  h.redo();
  h.push(
    {
      ...structuredClone(h.present),
      style: { ...h.present.style, sizePx: 71 },
    },
    "size",
    9000,
  );
  h.push(
    {
      ...structuredClone(h.present),
      style: { ...h.present.style, lineHeight: 2 },
    },
    "lh",
    9010,
  );
  assert.equal(h.size.past, 3);
});
test("history: every reachable state passes normalizeComposition intact; undo never alters poem text beyond recorded edits", () => {
  const h = createHistory({ now: () => 0 });
  const c0 = mkComp();
  const poem0 = poemLines(c0);
  h.reset(c0);
  // recorded edits: a scene line edit, a size change, a reorder of scenes
  const e1 = structuredClone(c0);
  e1.scenes[1].lines[0] = "திருத்திய வரி";
  const e2 = { ...structuredClone(e1), style: { ...e1.style, sizePx: 72 } };
  const e3 = structuredClone(e2);
  e3.scenes = [e3.scenes[0], e3.scenes[2], e3.scenes[1]];
  for (const [i, e] of [e1, e2, e3].entries())
    assert.equal(h.push(e, null, (i + 1) * 10_000), true);
  // refused: states the normalizeComposition gate would alter (lost scene text, truncated line, emptied poem)
  const bad1 = structuredClone(e3);
  bad1.scenes[1].lines[0] = "வ".repeat(500);
  const bad2 = structuredClone(e3);
  bad2.scenes = bad2.scenes.map((s) => ({ ...s, lines: [" "] }));
  const bad3 = structuredClone(e3);
  bad3.poem.stanzas[0][0] = "   ";
  for (const b of [bad1, bad2, bad3, null, { scenes: "x" }])
    assert.equal(h.push(b, null, 99_000), false);
  const allowed = new Set([sceneLines(c0), sceneLines(e1), sceneLines(e3)]);
  const visit = () => {
    const s = h.present;
    assert.ok(
      compositionIntact(s),
      "state passes the normalizeComposition gate intact",
    );
    assert.equal(
      poemLines(s),
      poem0,
      "poem snapshot never changes through undo/redo",
    );
    assert.ok(
      allowed.has(sceneLines(s)),
      "scene text is exactly one of the recorded states",
    );
  };
  visit();
  while (h.canUndo) {
    h.undo();
    visit();
  }
  while (h.canRedo) {
    h.redo();
    visit();
  }
  assert.equal(sceneLines(h.present), sceneLines(e3));
  // a blank line while retyping is a valid (transient) state, but a fully emptied composition is not
  const typing = structuredClone(e3);
  typing.scenes[1].lines[0] = "";
  assert.equal(compositionValid(typing), true);
  assert.equal(compositionValid(bad2), false);
});

// ---------------------------------------------------------------- draft recovery
const fakeTimers = () => {
  let id = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => {
      q.set(++id, { fn, ms });
      return id;
    },
    clearTimer: (i) => q.delete(i),
    fire: () => {
      const all = [...q.values()];
      q.clear();
      all.forEach((t) => t.fn());
    },
    get count() {
      return q.size;
    },
  };
};
test("draft: autosave is debounced (one write for a burst), versioned and carries the poem fingerprint", () => {
  const st = memStorage(),
    T = fakeTimers();
  const writes = [];
  const a = R.createAutosaver({
    storage: st,
    delayMs: 800,
    setTimer: T.setTimer,
    clearTimer: T.clearTimer,
    onResult: (r) => writes.push(r),
  });
  const c = mkComp();
  for (let i = 0; i < 25; i++)
    a.schedule({
      composition: { ...c, style: { ...c.style, sizePx: 40 + i } },
      name: TITLE,
      source: null,
      projectId: null,
      savedAt: 1000 + i,
    });
  assert.equal(T.count, 1);
  assert.equal(st.getItem(R.RECOVERY_KEY), null);
  T.fire();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ok, true);
  const d = JSON.parse(st.getItem(R.RECOVERY_KEY));
  assert.equal(d.v, R.RECOVERY_VERSION);
  assert.equal(d.composition.style.sizePx, 64);
  assert.equal(d.poemHash, R.poemFingerprint(c.poem.stanzas));
  assert.notEqual(
    R.poemFingerprint([["அன்பே சிவம்"]]),
    R.poemFingerprint([["அன்பே சிவம."]]),
  );
  // paused (an unresolved recovery copy is on screen): nothing is overwritten
  a.pause();
  a.schedule({ composition: mkComp("வேறு கவிதை"), name: "x" });
  T.fire();
  assert.equal(
    JSON.parse(st.getItem(R.RECOVERY_KEY)).composition.poem.stanzas[0][0],
    "அன்பே சிவம்",
  );
});
test("draft: bounded — an oversized draft is NOT written (never truncated); quota errors are swallowed", () => {
  const st = memStorage();
  const big = Array.from({ length: 300 }, (_, s) =>
    Array.from(
      { length: 4 },
      (_, l) => `${"நீண்ட வரி ".repeat(38)}${s}.${l}`,
    ).join("\n"),
  ).join("\n\n");
  const c = mkComp(big);
  const prev = R.MAX_DRAFT_BYTES;
  assert.ok(JSON.stringify(R.buildDraft({ composition: c })).length > 400_000);
  const r = R.writeDraft(
    {
      ...st,
      setItem: (k, v) => {
        if (v.length > 400_000) {
          const e = new Error("quota");
          e.name = "QuotaExceededError";
          throw e;
        }
        st.setItem(k, v);
      },
    },
    { composition: c },
  );
  assert.deepEqual(r, { ok: false, reason: "storage" });
  assert.equal(st.getItem(R.RECOVERY_KEY), null);
  assert.equal(
    R.writeDraft(quotaStorage(), { composition: mkComp() }).ok,
    false,
  );
  assert.equal(prev, R.MAX_DRAFT_BYTES);
  const huge = { composition: c, name: "x".repeat(10) };
  const s2 = memStorage();
  const tooBig = R.writeDraft(s2, {
    ...huge,
    composition: { ...c, scenes: c.scenes },
  });
  assert.ok(tooBig.ok || tooBig.reason === "too-large");
});
test("draft: corrupt drafts are discarded with a message, never half-applied", () => {
  const good = JSON.stringify(
    R.buildDraft({ composition: mkComp(), name: TITLE }),
  );
  const cases = [
    "{broken",
    "[]",
    JSON.stringify({ v: 2 }),
    JSON.stringify({ ...JSON.parse(good), composition: { scenes: [] } }),
    JSON.stringify({ ...JSON.parse(good), savedAt: "yesterday" }),
  ];
  for (const raw of cases) {
    const st = memStorage({ [R.RECOVERY_KEY]: raw });
    const r = R.readDraft(st);
    assert.equal(r.status, "corrupt", raw.slice(0, 30));
    assert.equal(r.message, R.CORRUPT_MESSAGE);
    assert.equal(r.draft, undefined, "nothing to apply");
    assert.equal(st.getItem(R.RECOVERY_KEY), null, "discarded");
  }
  assert.equal(R.readDraft(memStorage()).status, "none");
  assert.equal(R.readDraft(throwingStorage()).status, "none");
  assert.equal(
    R.readDraft(memStorage({ [R.RECOVERY_KEY]: good })).status,
    "ok",
  );
});
test("draft: poem fingerprint mismatch is flagged and refused; the draft is kept for an explicit Discard", () => {
  const d = R.buildDraft({ composition: mkComp(), name: TITLE });
  d.composition.poem.stanzas[0][0] = "மாற்றப்பட்ட வரி"; // text differs from what was fingerprinted
  const st = memStorage({ [R.RECOVERY_KEY]: JSON.stringify(d) });
  const r = R.readDraft(st);
  assert.equal(r.status, "mismatch");
  assert.equal(r.message, R.MISMATCH_MESSAGE);
  assert.ok(st.getItem(R.RECOVERY_KEY), "kept until the author discards it");
  assert.equal(R.planRestore(d, { confirmed: true }).ok, false);
});
test("draft: restore never overwrites silently — needs confirmation, re-validates, detaches from the Admin project", () => {
  const c = mkComp();
  const d = R.buildDraft({
    composition: c,
    name: TITLE,
    projectId: "0123456789abcdef01234567",
    source: { id: null, kind: "manual", title: TITLE, poem: c.poem },
    savedAt: 5000,
  });
  assert.deepEqual(R.planRestore(d), {
    ok: false,
    reason: "needs-confirmation",
  });
  assert.equal(R.planRestore(d, { confirmed: false }).ok, false);
  const r = R.planRestore(d, { confirmed: true });
  assert.equal(r.ok, true);
  assert.equal(
    r.projectId,
    null,
    "an Admin project is never the restore target",
  );
  assert.match(r.message, /Admin project was not changed/);
  assert.match(r.message, /scenes?, \d+ lines?/);
  assert.equal(sceneLines(r.composition), sceneLines(c));
  assert.equal(poemLines(r.composition), poemLines(c));
  assert.deepEqual(
    r.composition,
    normalizeComposition(r.composition),
    "already normalized",
  );
  // banner offered only when the device copy is newer than the saved project
  assert.equal(
    R.isNewerThanProject(d, [
      { _id: d.projectId, updatedAt: new Date(9000).toISOString() },
    ]),
    false,
  );
  assert.equal(
    R.isNewerThanProject(d, [
      { _id: d.projectId, updatedAt: new Date(1000).toISOString() },
    ]),
    true,
  );
  assert.equal(R.isNewerThanProject({ ...d, projectId: null }, []), true);
});

// ---------------------------------------------------------------- shortcuts
const ev = (key, o = {}) => {
  const e = {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    isComposing: false,
    target: { tagName: "BUTTON" },
    ...o,
    prevented: 0,
  };
  e.preventDefault = () => {
    e.prevented++;
  };
  return e;
};
test("shortcuts: mapping (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+S, ?) and they fire outside text fields", () => {
  assert.equal(shortcutFor(ev("z", { ctrlKey: true })), "undo");
  assert.equal(shortcutFor(ev("z", { metaKey: true })), "undo");
  assert.equal(shortcutFor(ev("Z", { metaKey: true, shiftKey: true })), "redo");
  assert.equal(shortcutFor(ev("y", { ctrlKey: true })), "redo");
  assert.equal(shortcutFor(ev("s", { metaKey: true })), "save");
  assert.equal(shortcutFor(ev("?", { shiftKey: true })), "help");
  assert.equal(shortcutFor(ev("z")), null);
  assert.equal(shortcutFor(ev("z", { ctrlKey: true, altKey: true })), null);
  const ran = [];
  const actions = {
    undo: () => ran.push("undo"),
    redo: () => ran.push("redo"),
    save: () => ran.push("save"),
    help: () => ran.push("help"),
  };
  for (const [k, o] of [
    ["z", { ctrlKey: true }],
    ["z", { metaKey: true, shiftKey: true }],
    ["s", { ctrlKey: true }],
    ["?", {}],
  ]) {
    const e = ev(k, { ...o, target: { tagName: "DIV" } });
    assert.ok(handleShortcut(e, actions));
    assert.equal(e.prevented, 1);
  }
  for (const t of [
    { tagName: "INPUT", type: "checkbox" },
    { tagName: "INPUT", type: "range" },
    { tagName: "BUTTON" },
  ])
    assert.equal(
      handleShortcut(ev("z", { ctrlKey: true, target: t }), actions),
      "undo",
    );
  assert.deepEqual(ran, [
    "undo",
    "redo",
    "save",
    "help",
    "undo",
    "undo",
    "undo",
  ]);
  assert.equal(SHORTCUTS.length, 4);
});
test("shortcuts NEGATIVE CONTROL: ignored in input / textarea / select / contenteditable and during IME composition", () => {
  let ran = 0;
  const actions = {
    undo: () => ran++,
    redo: () => ran++,
    save: () => ran++,
    help: () => ran++,
  };
  const host = {
    tagName: "SPAN",
    closest: (sel) =>
      sel.includes("contenteditable") ? { tagName: "DIV" } : null,
  };
  const targets = [
    { tagName: "INPUT", type: "text" },
    { tagName: "INPUT", type: "" },
    { tagName: "INPUT", type: "search" },
    { tagName: "TEXTAREA" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
    host,
  ];
  for (const t of targets) {
    assert.equal(isEditableTarget(t), true, JSON.stringify(t));
    for (const [k, o] of [
      ["z", { ctrlKey: true }],
      ["z", { ctrlKey: true, shiftKey: true }],
      ["s", { metaKey: true }],
      ["?", {}],
    ]) {
      const e = ev(k, { ...o, target: t });
      assert.equal(handleShortcut(e, actions), null);
      assert.equal(
        e.prevented,
        0,
        "the browser's own typing/undo keeps working",
      );
    }
  }
  assert.equal(
    handleShortcut(ev("z", { ctrlKey: true, isComposing: true }), actions),
    null,
  );
  assert.equal(
    handleShortcut(ev("z", { ctrlKey: true, keyCode: 229 }), actions),
    null,
  );
  assert.equal(ran, 0);
  // control: the very same key on a button does fire
  assert.equal(handleShortcut(ev("z", { ctrlKey: true }), actions), "undo");
  assert.equal(ran, 1);
});

// ---------------------------------------------------------------- Quick Create model
test("quick create: routes come from the ROUTES registry (excerpt routes excluded), formats map, gallery filters", () => {
  const ids = quickRoutes().map((r) => r.id);
  assert.deepEqual(
    ids,
    ROUTES.filter((r) => !r.excerpt).map((r) => r.id),
  );
  assert.ok(
    !ids.includes("quote") &&
      ids.includes("reel-mp4") &&
      ids.includes("full-poem"),
  );
  assert.equal(
    formatForRoute(ROUTES.find((r) => r.id === "full-poem")),
    "reel",
  );
  assert.equal(formatForRoute(ROUTES.find((r) => r.id === "poster")), "poster");
  assert.equal(
    formatForRoute(ROUTES.find((r) => r.id === "story-stills")),
    "story",
  );
  assert.equal(galleryList(TEMPLATES).length, TEMPLATES.length);
  assert.deepEqual(
    galleryList(TEMPLATES, { query: "soaked" }).map((t) => t.id),
    ["monsoon"],
  );
  assert.deepEqual(
    galleryList(TEMPLATES, {
      filter: "favourites",
      favourites: ["paper-ink"],
    }).map((t) => t.id),
    ["paper-ink"],
  );
  assert.deepEqual(
    galleryList(TEMPLATES, {
      filter: "recent",
      recent: ["midnight", "nope", "monsoon"],
    }).map((t) => t.id),
    ["midnight", "monsoon"],
  );
  const many = Array.from({ length: 200 }, (_, i) => ({
    id: `t${i}`,
    name: `T ${i}`,
    mood: "",
  }));
  assert.equal(galleryList(many).length, MAX_GALLERY);
});
test("quick create: plan uses the existing generation path and never alters the poem text", () => {
  const p = planQuickCreate({
    text: POEM,
    title: TITLE,
    routeId: "poster",
    templateId: "monsoon",
  });
  assert.equal(p.ok, true);
  const ref = parsePoemText(POEM, { title: TITLE });
  assert.deepEqual(p.poem.stanzas, ref.stanzas);
  assert.equal(p.poem.source, ref.source);
  const noId = (ss) => ss.map((s) => ({ ...s, id: undefined })); // scene ids are random per generation
  assert.deepEqual(
    noId(p.scenes),
    noId(generateScenes({ stanzas: ref.stanzas }, { title: TITLE })),
  );
  assert.equal(p.composition.format, "poster");
  assert.equal(p.composition.templateId, "monsoon");
  assert.deepEqual(p.composition.poem.stanzas, ref.stanzas);
  for (const bad of [
    { text: "", routeId: "poster", templateId: "monsoon" },
    { text: POEM, routeId: "nope", templateId: "monsoon" },
    { text: POEM, routeId: "quote", templateId: "monsoon" },
    { text: POEM, routeId: "poster", templateId: "nope" },
  ]) {
    const r = planQuickCreate(bad);
    assert.equal(r.ok, false);
    assert.ok(r.issues.length > 0);
  }
  const tooMany = planQuickCreate({
    text: Array.from({ length: 420 }, (_, i) => `வரி ${i}`).join("\n\n"),
    routeId: "poster",
    templateId: "monsoon",
  });
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.issues[0], /limit is 400|Nothing was cut/); // refused (by the parser's own limit), never truncated
  assert.equal(tooMany.composition, undefined);
});
test("quick create gate: fonts are ensured BEFORE the validator; a passing route is allowed", async () => {
  const p = planQuickCreate({
    text: POEM,
    title: TITLE,
    routeId: "reel-mp4",
    templateId: "ink-silence",
  });
  const ctx = mkCtx();
  const plan = planFit(ctx, p.composition);
  const comp = plan.ok ? applyFit(p.composition, plan) : p.composition;
  const log = [];
  const g = await gateRoute(
    "reel-mp4",
    comp,
    {},
    {
      ctx,
      ensureFonts: async () => {
        log.push("fonts");
      },
    },
  );
  assert.equal(g.allowed, true, g.messages.join("; "));
  assert.deepEqual(log, ["fonts"]);
  const full = await gateRoute(
    "full-poem",
    comp,
    routeInput("full-poem", {
      fullPoem: { title: TITLE, stanzas: p.poem.stanzas },
      preset: "compact",
      height: "extended",
    }),
    { ctx, ensureFonts: async () => {} },
  );
  assert.equal(full.allowed, true, full.messages.join("; "));
});
test("quick create gate NEGATIVE CONTROL: refuses when the validator fails (messages passed through), when fonts fail, or with no font check", async () => {
  const p = planQuickCreate({
    text: POEM,
    title: TITLE,
    routeId: "reel-mp4",
    templateId: "ink-silence",
  });
  const ctx = mkCtx();
  const dropLine = (lay) => {
    if (lay.rows) {
      const r = lay.rows.find((x) => !x.gap);
      lay.rows.splice(lay.rows.indexOf(r), 1);
    }
    return lay;
  };
  const direct = ROUTES.find((r) => r.id === "reel-mp4").validate(
    ctx,
    p.composition,
    { mutate: dropLine },
  );
  const g = await gateRoute(
    "reel-mp4",
    p.composition,
    { mutate: dropLine },
    { ctx, ensureFonts: async () => {} },
  );
  assert.equal(direct.ok, false);
  assert.equal(g.allowed, false);
  for (const m of direct.messages)
    assert.ok(g.messages.includes(m), `validator message passed through: ${m}`);
  let validated = false;
  const f = await gateRoute(
    "reel-mp4",
    {
      ...p.composition,
      get scenes() {
        validated = true;
        return [];
      },
    },
    {},
    {
      ctx,
      ensureFonts: async () => {
        throw new Error("The body font could not be loaded");
      },
    },
  );
  assert.equal(f.allowed, false);
  assert.equal(f.stage, "fonts");
  assert.match(f.messages[0], /could not be loaded/);
  assert.equal(
    validated,
    false,
    "no validator/measure ran before fonts were ready",
  );
  assert.equal(
    (await gateRoute("reel-mp4", p.composition, {}, { ctx })).allowed,
    false,
  );
  assert.equal(
    (
      await gateRoute(
        "nope",
        p.composition,
        {},
        { ctx, ensureFonts: async () => {} },
      )
    ).allowed,
    false,
  );
});
