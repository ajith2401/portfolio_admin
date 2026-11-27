"use client";
// Full-screen preview modal: focus moves to Close on open, Tab stays inside, Escape closes, and focus returns to
// the "Full screen" button afterwards (shared behaviour from lib/editor/use-dialog.js).
import { useDialog } from "@/lib/editor/use-dialog";

export default function FullscreenDialog({ onClose, children }) {
  const ref = useDialog(onClose);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen preview"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black p-3"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}
