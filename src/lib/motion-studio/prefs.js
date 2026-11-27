// Studio UI preferences (device-only, localStorage via an injectable storage). Pure and defensive:
//  - one namespaced, versioned key; corrupt/foreign/oversized data => safe defaults (never throws)
//  - quota / disabled-storage errors are swallowed (the Studio keeps working, prefs just do not persist)
//  - every field is whitelisted and bounded; values are ids/enums/booleans ONLY, so poem text can never be stored here
//    (an id must match ID_RE, which no Tamil or free text can satisfy; unknown keys are rejected and reported).
import { MOTION_PREFS } from "./animation.js";

export const PREFS_KEY = "pms:prefs:v1";
export const PREFS_VERSION = 1;
export const MAX_RECENT = 8;
export const MAX_FAVOURITES = 24;
export const MAX_PREFS_BYTES = 4096;
export const MODES = Object.freeze(["simple", "advanced"]);
export const MOTION_PREF_VALUES = MOTION_PREFS;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const isPrefId = (v) => typeof v === "string" && ID_RE.test(v);

export const DEFAULT_PREFS = Object.freeze({
  v: PREFS_VERSION,
  recentTemplates: Object.freeze([]),
  favouriteTemplates: Object.freeze([]),
  motionPref: null, // mirror of composition.motion.pref (animation.js MOTION_PREFS)
  reduceMotion: false, // mirror of composition.motion.reduceMotion
  reduceEffects: false,
  mode: "simple",
  lastRoute: null,
});
const KEYS = Object.keys(DEFAULT_PREFS).filter((k) => k !== "v");

const idList = (v, max) => {
  const out = [];
  for (const x of Array.isArray(v) ? v : [])
    if (isPrefId(x) && !out.includes(x)) out.push(x);
  return out.slice(0, max);
};
const FIELD = {
  recentTemplates: (v) =>
    Array.isArray(v)
      ? { ok: true, value: idList(v, MAX_RECENT) }
      : { ok: false },
  favouriteTemplates: (v) =>
    Array.isArray(v)
      ? { ok: true, value: idList(v, MAX_FAVOURITES) }
      : { ok: false },
  motionPref: (v) =>
    v === null || MOTION_PREF_VALUES.includes(v)
      ? { ok: true, value: v }
      : { ok: false },
  reduceMotion: (v) =>
    typeof v === "boolean" ? { ok: true, value: v } : { ok: false },
  reduceEffects: (v) =>
    typeof v === "boolean" ? { ok: true, value: v } : { ok: false },
  mode: (v) => (MODES.includes(v) ? { ok: true, value: v } : { ok: false }),
  lastRoute: (v) =>
    v === null || isPrefId(v) ? { ok: true, value: v } : { ok: false },
};
// a list field rejects the whole write when any entry is not an id (so a poem line can never sneak into a list)
const listHasJunk = (k, v) =>
  (k === "recentTemplates" || k === "favouriteTemplates") &&
  Array.isArray(v) &&
  v.some((x) => !isPrefId(x));

/** Fresh mutable defaults. */
export const defaultPrefs = () => ({
  ...DEFAULT_PREFS,
  recentTemplates: [],
  favouriteTemplates: [],
});

/** Whitelist + bound any object into a valid prefs record (unknown keys dropped, bad values => default). */
export function sanitizePrefs(input) {
  const out = defaultPrefs();
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const k of KEYS) {
    if (!(k in input)) continue;
    const r = FIELD[k](input[k]);
    if (r.ok) out[k] = r.value;
  }
  return out;
}

/** Parse a stored string. Anything not a v1 prefs object (corrupt JSON, other version, too big) => defaults. */
export function parsePrefs(raw) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_PREFS_BYTES)
    return defaultPrefs();
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || o.v !== PREFS_VERSION)
      return defaultPrefs();
    return sanitizePrefs(o);
  } catch {
    return defaultPrefs();
  }
}

const defaultStorage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // a sandboxed iframe throws on the getter itself
  }
};

export function loadPrefs(storage = defaultStorage()) {
  try {
    return parsePrefs(storage?.getItem(PREFS_KEY) ?? null);
  } catch {
    return defaultPrefs();
  }
}

/** Writes a sanitized copy. Returns true when written; quota/disabled errors => false (never throws). */
export function savePrefs(storage, prefs) {
  const clean = sanitizePrefs(prefs);
  const s = JSON.stringify({ v: PREFS_VERSION, ...clean });
  if (s.length > MAX_PREFS_BYTES) return false;
  try {
    if (!storage) return false;
    storage.setItem(PREFS_KEY, s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a patch against the whitelist. Unknown keys and invalid values are REJECTED (reported, not stored):
 * that is how an attempt to store poem text (any key, or free text in an id field) is refused.
 */
export function applyPatch(prefs, patch) {
  const next = sanitizePrefs(prefs),
    rejected = [];
  for (const [k, v] of Object.entries(
    patch && typeof patch === "object" ? patch : {},
  )) {
    if (!FIELD[k] || listHasJunk(k, v)) {
      rejected.push(k);
      continue;
    }
    const r = FIELD[k](v);
    if (r.ok) next[k] = r.value;
    else rejected.push(k);
  }
  return { prefs: next, rejected };
}

/** Most-recent-first, de-duplicated, bounded. A non-id is ignored. */
export const withRecent = (prefs, id) =>
  isPrefId(id)
    ? {
        ...prefs,
        recentTemplates: [
          id,
          ...(prefs.recentTemplates || []).filter((x) => x !== id),
        ].slice(0, MAX_RECENT),
      }
    : prefs;
export function withFavourite(prefs, id, on) {
  if (!isPrefId(id)) return prefs;
  const cur = (prefs.favouriteTemplates || []).filter((x) => x !== id);
  const want = on ?? !(prefs.favouriteTemplates || []).includes(id);
  return {
    ...prefs,
    favouriteTemplates: want ? [id, ...cur].slice(0, MAX_FAVOURITES) : cur,
  };
}

/** A small store bound to one storage. Every mutation persists (best effort) and returns {prefs, rejected, saved}. */
export function createPrefsStore(storage = defaultStorage()) {
  let prefs = loadPrefs(storage);
  const commit = (next, rejected = []) => {
    prefs = sanitizePrefs(next);
    return { prefs, rejected, saved: savePrefs(storage, prefs) };
  };
  return {
    get: () => prefs,
    update: (patch) => {
      const r = applyPatch(prefs, patch);
      return commit(r.prefs, r.rejected);
    },
    recordRecent: (id) => commit(withRecent(prefs, id)),
    toggleFavourite: (id, on) => commit(withFavourite(prefs, id, on)),
    reset: () => {
      prefs = defaultPrefs();
      try {
        storage?.removeItem(PREFS_KEY);
      } catch {
        /* ignore */
      }
      return { prefs, rejected: [], saved: true };
    },
  };
}
