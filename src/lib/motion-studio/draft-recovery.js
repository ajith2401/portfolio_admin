// Single-slot crash/close recovery for the open composition (localStorage via an injectable storage). Pure + defensive.
// Complements drafts.js (the IndexedDB list of device copies); this slot is what the "recovered work" banner offers.
//  - versioned envelope, debounced autosave, size-bounded: a draft that does not fit is NOT written (never truncated)
//  - carries a fingerprint of the poem text; a draft whose poem no longer matches its fingerprint is flagged and never
//    restored; corrupt/foreign data is discarded with a message, never half-applied
//  - restoring needs an explicit confirmation and goes through normalizePoemSnapshot/normalizeComposition; it is always
//    detached from any Admin project (projectId dropped), so a restore can never silently overwrite a saved project.
// The fingerprint hashes the same input as poem-hash.js (JSON of the stanzas). poem-hash.js itself uses node:crypto and
// is server-only, so this browser-safe 53-bit hash (cyrb53) is used on the device instead.
import { normalizeComposition, normalizePoemSnapshot } from "./composition.js";
import { compositionIntact } from "./history.js";

export const RECOVERY_KEY = "pms:recovery:v1";
export const RECOVERY_VERSION = 1;
export const MAX_DRAFT_BYTES = 1_500_000; // UTF-16 chars; well under the ~5MB localStorage quota
export const AUTOSAVE_MS = 800;

export function poemFingerprint(stanzas) {
  const s = JSON.stringify(Array.isArray(stanzas) ? stanzas : []);
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(14, "0");
}
/** The poem the draft protects: the composition's own snapshot, else the source's, else the scene lines. */
const poemStanzasOf = (comp, source) =>
  comp?.poem?.stanzas ||
  source?.poem?.stanzas ||
  (comp?.scenes || []).filter((s) => s.kind !== "title").map((s) => s.lines);
const lineCount = (stanzas) => stanzas.reduce((n, st) => n + st.length, 0);

/** Builds the stored envelope (pure). The composition is normalized first; the source keeps only plain fields. */
export function buildDraft({
  composition,
  name = "",
  source = null,
  projectId = null,
  savedAt = Date.now(),
}) {
  const comp = normalizeComposition(composition);
  const src =
    source && typeof source === "object"
      ? {
          id: typeof source.id === "string" ? source.id.slice(0, 64) : null,
          kind: source.kind === "writing" ? "writing" : "manual",
          title:
            typeof source.title === "string" ? source.title.slice(0, 300) : "",
          ...(source.poem ? { poem: normalizePoemSnapshot(source.poem) } : {}),
        }
      : null;
  return {
    v: RECOVERY_VERSION,
    savedAt,
    name: String(name || "").slice(0, 120),
    projectId: typeof projectId === "string" ? projectId.slice(0, 64) : null,
    source: src,
    poemHash: poemFingerprint(poemStanzasOf(comp, src)),
    composition: comp,
  };
}

const defaultStorage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

/** Writes one draft. Returns {ok, reason?}. Too large => not written ("too-large"); quota/disabled => "storage". */
export function writeDraft(storage, input) {
  let s;
  try {
    s = JSON.stringify(buildDraft(input));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (s.length > MAX_DRAFT_BYTES) return { ok: false, reason: "too-large" };
  try {
    if (!storage) return { ok: false, reason: "storage" };
    storage.setItem(RECOVERY_KEY, s);
    return { ok: true, bytes: s.length };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

export function clearRecovery(storage = defaultStorage()) {
  try {
    storage?.removeItem(RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}

export const CORRUPT_MESSAGE =
  "A recovery copy on this device was damaged, so it was discarded. Nothing was restored or changed.";
export const MISMATCH_MESSAGE =
  "A recovery copy on this device no longer matches its poem fingerprint, so it cannot be restored safely. Nothing was restored or changed.";

/**
 * Reads the slot. status: "none" | "ok" (restorable) | "corrupt" (discarded from storage) | "mismatch" (flagged; kept
 * until the author discards it, never restored). Never throws.
 */
export function readDraft(storage = defaultStorage()) {
  let raw;
  try {
    raw = storage?.getItem(RECOVERY_KEY) ?? null;
  } catch {
    return { status: "none" };
  }
  if (raw == null) return { status: "none" };
  let d;
  try {
    if (typeof raw !== "string" || raw.length > MAX_DRAFT_BYTES)
      throw new Error("size");
    d = JSON.parse(raw);
    if (
      !d ||
      typeof d !== "object" ||
      d.v !== RECOVERY_VERSION ||
      !Number.isFinite(d.savedAt) ||
      typeof d.poemHash !== "string"
    )
      throw new Error("shape");
    if (!compositionIntact(d.composition)) throw new Error("composition");
  } catch {
    clearRecovery(storage);
    return { status: "corrupt", message: CORRUPT_MESSAGE };
  }
  if (poemFingerprint(poemStanzasOf(d.composition, d.source)) !== d.poemHash)
    return {
      status: "mismatch",
      message: MISMATCH_MESSAGE,
      draft: summarize(d),
    };
  return { status: "ok", draft: d, summary: summarize(d) };
}

/** What the banner shows (never the poem text itself beyond the title). */
export function summarize(d) {
  const stanzas = poemStanzasOf(d.composition, d.source);
  return {
    name: d.name || d.source?.title || "Untitled",
    savedAt: d.savedAt,
    scenes: Array.isArray(d.composition?.scenes)
      ? d.composition.scenes.length
      : 0,
    lines: lineCount(stanzas),
    stanzas: stanzas.length,
    format: d.composition?.format || "reel",
    templateId: d.composition?.templateId || "",
    linkedProject: !!d.projectId,
  };
}

/** Offer the banner only when the draft is newer than the Admin project it came from (or it has none). */
export function isNewerThanProject(draft, projects = []) {
  if (!draft?.projectId) return true;
  const p = (projects || []).find((x) => x?._id === draft.projectId);
  if (!p) return true;
  const t = Date.parse(p.updatedAt);
  return !Number.isFinite(t) || draft.savedAt > t;
}

/**
 * Turns a draft into what the Studio opens. Requires {confirmed:true} (the author's click): without it nothing happens.
 * The result is detached from any Admin project (projectId:null) and re-validated; it is all-or-nothing.
 */
export function planRestore(draft, { confirmed = false } = {}) {
  if (!confirmed) return { ok: false, reason: "needs-confirmation" };
  if (!draft || typeof draft !== "object")
    return { ok: false, reason: "invalid", message: CORRUPT_MESSAGE };
  if (
    poemFingerprint(poemStanzasOf(draft.composition, draft.source)) !==
    draft.poemHash
  )
    return { ok: false, reason: "mismatch", message: MISMATCH_MESSAGE };
  if (!compositionIntact(draft.composition))
    return { ok: false, reason: "invalid", message: CORRUPT_MESSAGE };
  const composition = normalizeComposition(draft.composition);
  const source = draft.source
    ? {
        id: draft.source.id || null,
        kind: draft.source.kind,
        title: draft.source.title || "",
        warnings: [],
        ...(draft.source.poem
          ? { poem: normalizePoemSnapshot(draft.source.poem) }
          : composition.poem
            ? { poem: composition.poem }
            : {}),
      }
    : composition.poem
      ? {
          id: null,
          kind: "manual",
          title: composition.poem.title,
          warnings: [],
          poem: composition.poem,
        }
      : null;
  const s = summarize(draft);
  const message = `Restored “${s.name}” from this device: ${s.scenes} scene${s.scenes === 1 ? "" : "s"}, ${s.lines} line${s.lines === 1 ? "" : "s"}, saved ${new Date(s.savedAt).toLocaleString()}.${s.linkedProject ? " It is an unsaved copy; your Admin project was not changed." : ""}`;
  return {
    ok: true,
    composition,
    source,
    name: draft.name || s.name,
    projectId: null,
    summary: s,
    message,
  };
}

/**
 * Debounced autosaver. schedule(input) restarts the timer; flush() writes now; cancel() drops the pending write;
 * pause/resume stop writes while an unresolved recovery copy must not be overwritten. Timers are injectable.
 */
export function createAutosaver({
  storage = defaultStorage(),
  delayMs = AUTOSAVE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onResult = () => {},
} = {}) {
  let timer = null,
    pending = null,
    paused = false;
  const flush = () => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    if (!pending || paused) return null;
    const r = writeDraft(storage, pending);
    pending = null;
    onResult(r);
    return r;
  };
  return {
    schedule(input) {
      pending = input;
      if (timer != null) clearTimer(timer);
      timer = setTimer(flush, delayMs);
    },
    flush,
    cancel() {
      if (timer != null) clearTimer(timer);
      timer = null;
      pending = null;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    get paused() {
      return paused;
    },
    get pending() {
      return pending != null;
    },
  };
}
