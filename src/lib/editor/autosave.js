// Pure autosave state machine (no timers, no fetch) so it can be unit tested.
// status: clean | dirty | invalid | saving | saved | offline | error | conflict
export const initialSave = (version = null) => ({
  status: "clean",
  version,
  dirtyWhileSaving: false,
  online: true,
  error: null,
  attempts: 0,
  lastSavedAt: null,
});

export function classifyFailure(httpStatus) {
  if (httpStatus === 0 || httpStatus == null) return "network";
  if (httpStatus === 409) return "conflict";
  if (httpStatus === 428) return "conflict"; // missing version: treat as stale client
  if (httpStatus === 422 || httpStatus === 400) return "validation";
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  if (httpStatus === 429) return "rate";
  return "server";
}

export function saveReducer(s, ev) {
  switch (ev.type) {
    case "EDIT": {
      if (s.status === "conflict") return s; // never overwrite until the user resolves it
      const status = ev.valid === false ? "invalid" : s.status === "saving" ? "saving" : s.online ? "dirty" : "offline";
      return { ...s, status, dirtyWhileSaving: s.status === "saving" ? true : s.dirtyWhileSaving, error: null };
    }
    case "SAVE_START":
      return { ...s, status: "saving", dirtyWhileSaving: false, error: null };
    case "SAVE_OK":
      return {
        ...s,
        version: ev.version,
        attempts: 0,
        error: null,
        lastSavedAt: ev.at ?? null,
        status: s.dirtyWhileSaving ? "dirty" : "saved",
        dirtyWhileSaving: false,
      };
    case "SAVE_FAIL": {
      const kind = ev.kind;
      if (kind === "conflict") return { ...s, status: "conflict", error: ev.message || "Changed elsewhere", attempts: 0 };
      if (kind === "network") return { ...s, status: s.online ? "error" : "offline", error: "Could not reach the server", attempts: s.attempts + 1 };
      if (kind === "validation") return { ...s, status: "invalid", error: ev.message || "Fix the highlighted problems", attempts: 0 };
      return { ...s, status: "error", error: ev.message || "Save failed", attempts: s.attempts + 1 };
    }
    case "OFFLINE":
      return { ...s, online: false, status: s.status === "dirty" || s.status === "error" ? "offline" : s.status };
    case "ONLINE":
      return { ...s, online: true, status: s.status === "offline" ? "dirty" : s.status };
    case "RESOLVED": // user reloaded the server copy or chose to keep theirs on top of a fresh version
      return { ...s, status: ev.keepLocal ? "dirty" : "clean", version: ev.version, error: null, attempts: 0, dirtyWhileSaving: false };
    default:
      return s;
  }
}

/** Whether a debounced save should run now. Invalid, conflicted, offline and in-flight states never save. */
export const shouldSave = (s) => s.status === "dirty" || (s.status === "error" && s.attempts < 5);

/** Debounce delay: quick for the first save, backing off after failures (capped). */
export const saveDelay = (s, base = 1500) => Math.min(base * 2 ** Math.max(0, s.attempts), 30000);

export const saveLabel = (s) =>
  ({
    clean: "No changes",
    dirty: "Unsaved changes",
    invalid: "Not saved: needs attention",
    saving: "Saving…",
    saved: "Saved",
    offline: "Offline: will save when you reconnect",
    error: "Save failed: retrying",
    conflict: "Conflict: changed elsewhere",
  })[s.status] || "";
