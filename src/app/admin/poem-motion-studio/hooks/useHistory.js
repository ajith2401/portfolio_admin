"use client";
// React binding for the pure, validated undo/redo history (src/lib/motion-studio/history.js).
// commit() records an edit (same key inside the coalescing window = one undo step); a state that would not survive
// normalizeComposition intact is refused and reported through onRefused, never applied silently.
import { useCallback, useEffect, useRef, useState } from "react";
import { createHistory } from "@/lib/motion-studio/history";

export default function useHistory({ onRefused } = {}) {
  const [h] = useState(() => createHistory());
  const [, bump] = useState(0);
  const refused = useRef(onRefused);
  useEffect(() => {
    refused.current = onRefused;
  });
  const commit = useCallback(
    (next, key) => {
      if (!h.present) return false;
      const ok = h.push(next, key || null);
      if (!ok) refused.current?.("edit");
      bump((n) => n + 1);
      return ok;
    },
    [h],
  );
  const reset = useCallback(
    (c) => {
      const ok = h.reset(c);
      if (!ok) refused.current?.("open");
      bump((n) => n + 1);
      return ok;
    },
    [h],
  );
  const undo = useCallback(() => {
    h.undo();
    bump((n) => n + 1);
  }, [h]);
  const redo = useCallback(() => {
    h.redo();
    bump((n) => n + 1);
  }, [h]);
  return {
    present: h.present,
    canUndo: h.canUndo,
    canRedo: h.canRedo,
    commit,
    reset,
    undo,
    redo,
  };
}
