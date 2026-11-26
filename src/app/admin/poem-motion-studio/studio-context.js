"use client";
import { createContext, useContext } from "react";

// Shared Motion Studio state/actions. MotionStudio builds the value once per
// render; each panel under ./panels reads what it needs via useStudio().
export const StudioContext = createContext(null);

export function useStudio() {
  const v = useContext(StudioContext);
  if (!v) throw new Error("useStudio must be used inside <StudioContext.Provider>");
  return v;
}
