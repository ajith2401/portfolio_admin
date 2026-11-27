"use client";
// Crash/close recovery slot (localStorage) + the "recovered work" banner state.
//  - autosaves the open composition (debounced, bounded, versioned, poem fingerprint) and flushes on page hide
//  - on load, an intact draft newer than its Admin project is OFFERED (Restore / Discard); nothing happens without a
//    click. While the offer is unresolved the autosaver is paused, so the recovered copy is never overwritten.
//  - corrupt drafts are discarded with a message; a fingerprint mismatch is flagged and can only be discarded.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearRecovery,
  createAutosaver,
  isNewerThanProject,
  planRestore,
  readDraft,
} from "@/lib/motion-studio/draft-recovery";

const ls = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export default function useRecovery({
  comp,
  name,
  source,
  projectId,
  projects,
  projectsReady,
  onRestore,
}) {
  const saver = useRef(null);
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    const a = createAutosaver({ storage: ls() });
    saver.current = a;
    const r = readDraft(ls());
    if (r.status !== "none") {
      setOffer(r);
      if (r.status !== "corrupt") a.pause();
    }
    const onHide = () => a.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      a.flush();
    };
  }, []);
  // an intact copy that is OLDER than its saved Admin project is not offered (the project already has newer work)
  const stale = offer?.status === "ok" && projectsReady && !isNewerThanProject(offer.draft, projects);
  useEffect(() => {
    if (stale) saver.current?.resume();
  }, [stale]);
  useEffect(() => {
    if (!comp || !saver.current || saver.current.paused) return;
    saver.current.schedule({
      composition: comp,
      name,
      source,
      projectId,
      savedAt: Date.now(),
    });
  }, [comp, name, source, projectId]);

  const resolve = () => {
    setOffer(null);
    saver.current?.resume();
  };
  const restore = useCallback(() => {
    if (offer?.status !== "ok") return;
    const plan = planRestore(offer.draft, { confirmed: true });
    if (!plan.ok) {
      setOffer({ status: "corrupt", message: plan.message });
      return;
    }
    onRestore(plan);
    resolve();
  }, [offer, onRestore]);
  const discard = useCallback(() => {
    clearRecovery(ls());
    resolve();
  }, []);
  const dismiss = useCallback(() => resolve(), []);
  const visible = stale ? null :
    offer && (offer.status !== "ok" || projectsReady) ? offer : null;
  return { offer: visible, restore, discard, dismiss };
}
