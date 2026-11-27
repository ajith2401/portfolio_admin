"use client";
// Reusable modal sheet: a centred dialog on wide screens, a bottom sheet on narrow ones (CSS in ux-css.js).
// aria-modal, labelled, focus moves in on open, Tab is trapped inside, Escape closes, focus returns to the opener.
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Sheet({
  open,
  title,
  onClose,
  children,
  id = "pms-sheet-dialog",
}) {
  const ref = useRef(null);
  const opener = useRef(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const el = ref.current;
    (
      el?.querySelector("[data-autofocus]") ||
      el?.querySelector(FOCUSABLE) ||
      el
    )?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll(FOCUSABLE)];
      if (!f.length) return e.preventDefault();
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="pms-modal-scrim"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-h`}
        id={id}
        tabIndex={-1}
        className="pms-modal"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${id}-h`} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="pms-btn"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
