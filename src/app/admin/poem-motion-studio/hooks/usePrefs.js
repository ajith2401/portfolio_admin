"use client";
// Studio preferences (template recents/favourites, mode, last route, motion mirrors). Backed by the pure prefs store
// (localStorage, namespaced + versioned, bounded, never poem text). SSR-safe: defaults until the first effect runs.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPrefsStore, defaultPrefs } from "@/lib/motion-studio/prefs";

const storage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export default function usePrefs() {
  const store = useRef(null);
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    store.current = createPrefsStore(storage());
    let p = store.current.get();
    // one-time migration of the legacy mode key (pms:mode = "quick" | "advanced")
    try {
      const legacy = localStorage.getItem("pms:mode");
      if (legacy) {
        p = store.current.update({
          mode: legacy === "advanced" ? "advanced" : "simple",
        }).prefs;
        localStorage.removeItem("pms:mode");
      }
    } catch {
      /* storage disabled: defaults stay in memory */
    }
    setPrefs(p);
    setLoaded(true);
  }, []);
  const run = useCallback((fn) => {
    if (!store.current) store.current = createPrefsStore(storage());
    const r = fn(store.current);
    setPrefs(r.prefs);
    return r;
  }, []);
  const update = useCallback((patch) => run((s) => s.update(patch)), [run]);
  const recordRecent = useCallback(
    (id) => run((s) => s.recordRecent(id)),
    [run],
  );
  const toggleFavourite = useCallback(
    (id, on) => run((s) => s.toggleFavourite(id, on)),
    [run],
  );
  return { prefs, loaded, update, recordRecent, toggleFavourite };
}
