"use client";
// Legacy Markdown writings are shown read-only. Conversion to the structured editor is an explicit,
// confirmed action; the original Markdown is preserved on the server (importedFrom.markdown).
import { createElement, useEffect, useMemo, useState } from "react";
import { docToTree, treeToReact } from "@/lib/editor/doc-render";

export default function LegacyView({ writing, busy, error, onConvert }) {
  const [step, setStep] = useState("view"); // view | review
  const [result, setResult] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (step !== "review") return;
    let live = true;
    import("@/lib/editor/md-import").then((m) => {
      if (live)
        setResult(
          m.markdownToDoc(String(writing.body || ""), {
            category: writing.category,
          }),
        );
    });
    return () => {
      live = false;
    };
  }, [step, writing.body, writing.category]);

  const tree = useMemo(() => (result ? docToTree(result.doc) : null), [result]);

  return (
    <div className="space-y-4 text-gray-100">
      <div
        role="note"
        className="rounded-lg border border-amber-500 bg-amber-900/30 p-4"
      >
        <h2 className="font-semibold text-amber-100">
          Legacy Markdown writing
        </h2>
        <p className="mt-1 text-sm text-amber-100/90">
          This writing was created with the old Markdown editor. It is shown
          here exactly as stored and has not been changed. You can convert it to
          the new editor when you are ready. The original Markdown is kept as a
          backup.
        </p>
        {step === "view" && (
          <button
            type="button"
            className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium"
            onClick={() => setStep("review")}
          >
            Convert to the new editor
          </button>
        )}
      </div>

      {step === "view" && (
        <pre
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-gray-700 bg-gray-900 p-4 text-sm"
          aria-label="Stored Markdown source"
        >
          {writing.body}
        </pre>
      )}

      {step === "review" && (
        <section aria-label="Review conversion" className="space-y-4">
          {!result ? (
            <p>Preparing the conversion…</p>
          ) : (
            <>
              <div>
                <h3 className="font-semibold">What will change</h3>
                {result.warnings.length === 0 ? (
                  <p className="text-sm text-green-300">
                    No problems found. Formatting is carried over as is.
                  </p>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-200">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-300">
                    Original (Markdown source)
                  </h4>
                  <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded border border-gray-700 bg-gray-900 p-3 text-sm">
                    {writing.body}
                  </pre>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-300">
                    After conversion
                  </h4>
                  <div
                    className="published-preview max-h-[50vh] overflow-auto rounded bg-white p-4 text-gray-900"
                    lang={writing.language === "Tamil" ? "ta" : "en"}
                  >
                    {tree?.ok ? (
                      <div className="published-body space-y-4">
                        {treeToReact(tree.tree, createElement)}
                      </div>
                    ) : (
                      <p className="text-red-700">
                        The converted document is not valid and cannot be saved.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I have compared both versions. Convert this writing; the
                  original Markdown is saved as a backup and this cannot be
                  turned back into Markdown.
                </span>
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!confirmed || busy || !tree?.ok}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
                  onClick={() => onConvert(result.doc)}
                >
                  {busy ? "Converting…" : "Convert and save"}
                </button>
                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm hover:bg-gray-700"
                  onClick={() => {
                    setStep("view");
                    setConfirmed(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
