// Client-side helpers for the writing studio. Pure functions (no React) so they can be unit tested.
import { classifyFailure } from "./autosave.js";

export const BLANK_FORM = Object.freeze({
  title: "",
  category: "poem",
  language: "Tamil",
  slug: "",
  excerpt: "",
  tags: [],
  seo: {},
  images: {},
  status: "draft",
});

/** Fields the studio edits. Everything else is server owned and never sent back. */
export function formFromServer(w) {
  return {
    title: w.title || "",
    category: w.category || "poem",
    language: w.language || "Tamil",
    slug: w.slug || "",
    excerpt: w.excerpt || "",
    tags: Array.isArray(w.tags) ? w.tags : [],
    seo: { ...(w.seo || {}) },
    images: { ...(w.images || {}) },
    status: w.status || "draft",
  };
}

const SEO_KEYS = [
  "title",
  "description",
  "ogTitle",
  "ogDescription",
  "ogImage",
  "ogImageAlt",
  "canonicalUrl",
  "twitterCard",
  "twitterTitle",
  "twitterDescription",
  "robots",
];

/** Request body for autosave. Slug and status are NOT included: they only change through explicit actions. */
export function buildSavePayload({ form, doc, version, extra = {} }) {
  const seo = {};
  for (const k of SEO_KEYS)
    if (form.seo?.[k] !== undefined) seo[k] = form.seo[k];
  const images = {};
  for (const k of ["small", "medium", "large", "thumbnail", "alt"])
    if (typeof form.images?.[k] === "string") images[k] = form.images[k];
  return {
    title: form.title,
    category: form.category,
    language: form.language,
    excerpt: form.excerpt,
    tags: form.tags,
    seo,
    images,
    contentFormat: "tiptap",
    content: doc,
    ...(version != null ? { version } : {}),
    ...extra,
  };
}

/** True when the document would be accepted as structured content with something to save. */
export function isSavable({ form, valid }) {
  return Boolean(
    valid && form.title && form.title.trim() && form.category && form.language,
  );
}

export async function apiRequest(
  method,
  url,
  body,
  fetchImpl = globalThis.fetch,
) {
  try {
    const res = await fetchImpl(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      data,
      kind: res.ok ? null : classifyFailure(res.status),
    };
  } catch {
    return { ok: false, status: 0, data: {}, kind: "network" };
  }
}

export const errorMessage = (data) =>
  [data?.error, ...(Array.isArray(data?.details) ? data.details : [])]
    .filter(Boolean)
    .join(": ") || "Request failed";

/** Fields that differ between two writings, for the conflict dialog. */
export function diffFields(local, server) {
  const out = [];
  for (const k of ["title", "category", "language", "excerpt"]) {
    if ((local[k] ?? "") !== (server[k] ?? ""))
      out.push({ field: k, mine: local[k] ?? "", theirs: server[k] ?? "" });
  }
  return out;
}

// An <input> silently deletes newlines, which would glue the words of a stored multi-line excerpt together.
// Show line breaks as a space (same rule as toOneLine, without trimming so typing a trailing space works).
export const excerptLine = (v) =>
  String(v ?? "").replace(/[\s\u2028\u2029]*[\r\n\u2028\u2029]+[\s\u2028\u2029]*/g, " ");
