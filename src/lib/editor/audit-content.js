// Pure, read-only audit of writing documents for the structured-editor migration.
// No I/O: takes plain objects, returns findings. Used by scripts/audit-content-compat.mjs.
import { markdownToDoc } from "./md-import.js";
import { validateSlug } from "../content-contract/slug.js";
import { suggestLanguage, countWords } from "../content-contract/text.js";
import { validateDoc } from "../content-contract/document.js";

export const SHORT_BODY_WORDS = 20;

export function auditWritings(docs) {
  const report = { total: docs.length, perDoc: [], summary: {} };
  const slugOwners = new Map();
  for (const d of docs) {
    if (d.slug) {
      const k = String(d.slug);
      slugOwners.set(k, [...(slugOwners.get(k) || []), String(d._id)]);
    }
  }
  const bump = (k) => (report.summary[k] = (report.summary[k] || 0) + 1);

  for (const d of docs) {
    const issues = [];
    const structured = d.contentFormat === "tiptap";
    const text = structured ? "" : String(d.body ?? "");
    if (structured) {
      const v = validateDoc(d.content);
      if (!v.valid) issues.push({ code: "invalid-structured-content", detail: String(v.errors?.[0] ?? "") });
    } else {
      if (!text.trim()) issues.push({ code: "empty-body" });
      else {
        const r = markdownToDoc(text, { category: d.category });
        for (const w of r.warnings) issues.push({ code: "import-warning", detail: w });
        if (countWords(text) < SHORT_BODY_WORDS) issues.push({ code: "short-body", detail: `${countWords(text)} words` });
      }
    }
    if (!d.slug) issues.push({ code: "missing-slug" });
    else {
      const sv = validateSlug(d.slug);
      if (sv && sv.valid === false) issues.push({ code: "invalid-slug", detail: String(sv.error ?? sv.reason ?? d.slug) });
      if ((slugOwners.get(String(d.slug)) || []).length > 1) issues.push({ code: "duplicate-slug", detail: String(d.slug) });
    }
    const sample = structured ? "" : text;
    if (sample.trim().length > 40 && d.language && suggestLanguage(sample) !== d.language) {
      issues.push({ code: "language-mismatch", detail: `labelled ${d.language}, text looks ${suggestLanguage(sample)}` });
    }
    for (const i of issues) bump(i.code);
    if (issues.length) report.perDoc.push({ id: String(d._id), title: d.title, status: d.status, issues });
  }
  report.summary.docsWithIssues = report.perDoc.length;
  return report;
}

const LOCAL = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;
export function checkUriAllowed(uri, { allowRemote = false } = {}) {
  if (LOCAL.test(uri)) return { ok: true };
  if (allowRemote) return { ok: true, remote: true };
  return { ok: false, reason: "Refusing non-local MongoDB URI. Pass --allow-remote to override." };
}
