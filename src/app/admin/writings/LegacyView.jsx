"use client";
// Legacy Markdown writings are shown read-only. Conversion to the structured editor is an explicit,
// confirmed action; the original Markdown is preserved on the server (importedFrom.markdown).
import { createElement, useEffect, useMemo, useState } from "react";
import { docToTree, treeToReact } from "@/lib/editor/doc-render";

export default function LegacyView({ writing, busy, error, onConvert }) {
  const [step, setStep] = useState("view"); // view | review
  const [result, setResult] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [lineBreaks, setLineBreaks] = useState("auto");

  useEffect(() => {
    if (step !== "review") return;
    let live = true;
    import("@/lib/editor/md-import").then((m) => {
      if (live)
        setResult(
          m.markdownToDoc(String(writing.body || ""), {
            category: writing.category,
            lineBreaks,
          }),
        );
    });
    return () => {
      live = false;
    };
  }, [step, writing.body, writing.category, lineBreaks]);

  const tree = useMemo(() => (result ? docToTree(result.doc) : null), [result]);

  return (
    <div className="space-y-4 text-gray-900">
      <div
        role="note"
        className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-900"
      >
        <h2 className="font-semibold text-amber-900">
          Legacy Markdown writing
        </h2>
        <p className="mt-1 text-sm text-amber-900">
          This writing was created with the old Markdown editor. It is shown
          here exactly as stored and has not been changed. You can convert it to
          the new editor when you are ready. The original Markdown is kept as a
          backup.
        </p>
        {step === "view" && (
          <button
            type="button"
            className="mt-3 rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium"
            onClick={() => setStep("review")}
          >
            Convert to the new editor
          </button>
        )}
      </div>

      {step === "view" && (
        <pre
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-4 text-sm"
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
                  <p className="text-sm text-green-700">
                    No problems found. Formatting is carried over as is.
                  </p>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
              <fieldset className="text-sm">
                <legend className="font-semibold">Single line breaks inside a paragraph</legend>
                {[
                  ["auto", "Decide for me (verse keeps its lines, wrapped text is joined)"],
                  ["keep", "Keep line breaks"],
                  ["join", "Join wrapped lines"],
                ].map(([v, label]) => (
                  <label key={v} className="mr-4 mt-1 inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="line-breaks"
                      value={v}
                      checked={lineBreaks === v}
                      onChange={() => {
                        setLineBreaks(v);
                        setResult(null);
                        setConfirmed(false);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-600">
                    Original (Markdown source)
                  </h4>
                  <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-3 text-sm">
                    {writing.body}
                  </pre>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-600">
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
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!confirmed || busy || !tree?.ok}
                  className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
                  onClick={() => onConvert(result.doc, lineBreaks)}
                >
                  {busy ? "Converting…" : "Convert and save"}
                </button>
                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm hover:bg-gray-100"
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
