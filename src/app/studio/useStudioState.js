// src/app/studio/useStudioState.js
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "./presets";

const STORAGE_KEY = "poetry-studio-v2";
const HISTORY_LIMIT = 50;

// Central studio state: a single settings object with undo/redo history and
// debounced localStorage persistence. `patch` merges partial updates and
// pushes onto the history stack so every change is reversible.
export function useStudioState() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // Undo/redo stacks hold whole snapshots. Kept in refs so pushing history
  // never triggers a re-render on its own.
  const past = useRef([]);
  const future = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  // Load a saved draft once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* ignore corrupt drafts */
    }
    setHydrated(true);
  }, []);

  // Persist drafts (debounced) after hydration.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        /* storage full or unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [settings, hydrated]);

  const patch = useCallback(
    (partial) => {
      setSettings((prev) => {
        past.current.push(prev);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        future.current = [];
        return { ...prev, ...partial };
      });
      syncFlags();
    },
    [syncFlags],
  );

  const undo = useCallback(() => {
    setSettings((prev) => {
      if (past.current.length === 0) return prev;
      const previous = past.current.pop();
      future.current.push(prev);
      syncFlags();
      return previous;
    });
  }, [syncFlags]);

  const redo = useCallback(() => {
    setSettings((prev) => {
      if (future.current.length === 0) return prev;
      const next = future.current.pop();
      past.current.push(prev);
      syncFlags();
      return next;
    });
  }, [syncFlags]);

  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    syncFlags();
    setSettings(DEFAULT_SETTINGS);
  }, [syncFlags]);

  // Keyboard: cmd/ctrl+Z undo, shift for redo.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target;
      const typing =
        el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
      if (typing) return; // let the field handle its own text undo
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { settings, patch, undo, redo, reset, canUndo, canRedo, hydrated };
}
