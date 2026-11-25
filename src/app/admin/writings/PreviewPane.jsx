"use client";
// "As published" preview. Uses the same element tree builder as the HTML renderer
// (src/lib/editor/doc-render.js); every string is escaped and only fixed tags are produced.
import { createElement, useMemo } from "react";
import { docToTree, treeToReact } from "@/lib/editor/doc-render";

export default function PreviewPane({
  title,
  language,
  category,
  doc,
  excerpt,
}) {
  const { ok, errors, tree } = useMemo(() => docToTree(doc), [doc]);
  return (
    <article
      className="published-preview mx-auto max-w-2xl rounded-lg bg-white p-6 text-gray-900"
      lang={language === "Tamil" ? "ta" : "en"}
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {category}
      </p>
      <h1 className="mb-2 text-3xl font-bold">{title || "Untitled"}</h1>
      {excerpt && <p className="mb-4 text-gray-600">{excerpt}</p>}
      {ok ? (
        <div className="published-body space-y-4 leading-relaxed">
          {treeToReact(tree, createElement)}
        </div>
      ) : (
        <p role="alert" className="text-red-700">
          The document has a problem and cannot be previewed: {errors[0]}
        </p>
      )}
    </article>
  );
}
