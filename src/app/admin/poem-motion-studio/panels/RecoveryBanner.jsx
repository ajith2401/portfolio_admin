"use client";
// "Recovered work" banner. Restoring needs an explicit click and always opens an unsaved copy (never an Admin project).
import { Btn } from "../studio-ui";

export default function RecoveryBanner({
  offer,
  onRestore,
  onDiscard,
  onDismiss,
}) {
  if (!offer) return null;
  if (offer.status !== "ok")
    return (
      <div
        role="alert"
        className="mt-3 rounded-lg p-3 text-sm"
        style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
      >
        <p>{offer.message}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {offer.status === "mismatch" ? (
            <Btn onClick={onDiscard}>Discard recovered work</Btn>
          ) : (
            <Btn onClick={onDismiss}>Dismiss</Btn>
          )}
        </div>
      </div>
    );
  const s = offer.summary;
  return (
    <section
      aria-label="Recovered work"
      className="mt-3 rounded-lg p-3 text-sm"
      style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
    >
      <p>
        <strong>Unsaved work was found on this device:</strong>{" "}
        <span lang="ta" className="break-words">
          “{s.name}”
        </span>{" "}
        · {s.scenes} scene{s.scenes === 1 ? "" : "s"} · {s.lines} line
        {s.lines === 1 ? "" : "s"} · {new Date(s.savedAt).toLocaleString()}
        {s.linkedProject
          ? " · newer than its Admin project (restoring opens an unsaved copy; the project is not changed)"
          : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn primary onClick={onRestore}>
          Restore recovered work
        </Btn>
        <Btn onClick={onDiscard}>Discard recovered work</Btn>
      </div>
    </section>
  );
}
