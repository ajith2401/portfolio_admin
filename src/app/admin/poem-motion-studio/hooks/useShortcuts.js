"use client";
// Global Studio shortcuts. All decisions live in the pure handleShortcut(): never inside text fields, never during IME
// composition. The latest actions are read through a ref so the listener is attached once.
import { useEffect, useRef } from "react";
import { handleShortcut } from "@/lib/motion-studio/shortcuts";

export default function useShortcuts(actions, enabled = true) {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => handleShortcut(e, ref.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
