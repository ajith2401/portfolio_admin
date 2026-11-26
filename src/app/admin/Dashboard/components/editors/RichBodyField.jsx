"use client";
// Rich-editor body for Tech Blog posts and Projects. Emits { contentFormat: 'tiptap', doc }; the server derives the plain-text field.
import { useMemo } from "react";
import dynamic from "next/dynamic";

const RichEditor = dynamic(() => import("./RichEditor"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-md bg-gray-100" aria-busy="true" />,
});

export default function RichBodyField({ doc, language, onChange }) {
  const initialDoc = useMemo(() => doc || undefined, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-md border border-gray-300 bg-white">
      <RichEditor
        initialDoc={initialDoc}
        language={language}
        onChange={(next) => onChange({ contentFormat: "tiptap", doc: next?.doc ?? next })}
      />
    </div>
  );
}

/** Convert legacy Markdown to a document (conversion is explicit; the original text stays until saved). */
export async function convertMarkdown(markdown) {
  const { markdownToDoc } = await import("@/lib/editor/md-import");
  const res = markdownToDoc(String(markdown || ""));
  return res.doc || res;
}
