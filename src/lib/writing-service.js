// Server-side write planning for writings. Pure (no database, no Next imports) so it is unit-testable.
// Every write route goes through buildWritingChanges(): it whitelists fields, validates structured
// content, enforces optimistic concurrency and computes status/publishedAt/slug ONLY through the
// shared contract helpers (planTransition, planSlugChange).
import {
  validateDoc,
  canonicalizeDoc,
  docToPlainText,
  planTransition,
  planSlugChange,
  generateSlug,
  ensureUniqueSlug,
  validateSlug,
  checkSeo,
  isSafeUrl,
  hasContent,
} from "./content-contract/index.js";
import { markdownToDoc } from "./editor/md-import.js";

export const WRITING_LIMITS = Object.freeze({
  contentBytes: 2_000_000,
  depth: 40,
  nodes: 50_000,
  bodyChars: 1_000_000,
});
export const CATEGORIES = [
  "philosophy",
  "poem",
  "article",
  "short story",
  "short writings",
  "politics",
  "cinema",
  "letter",
  "joke",
];
export const LANGUAGES = ["Tamil", "English"];
const SEO_STRING_LIMITS = {
  title: 160,
  description: 400,
  ogTitle: 160,
  ogDescription: 400,
  twitterTitle: 160,
  twitterDescription: 400,
  focusKeyword: 100,
  ogImageAlt: 300,
};

/** Plain-text field: strips tags and control characters, NFC-normalises, trims, caps length. */
export function cleanPlainText(value, max = 500) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .normalize("NFC")
    .trim()
    .slice(0, max);
}

/** Cheap structural guard run BEFORE recursion-based validators (iterative: cannot overflow the stack). */
export function checkDocShape(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content))
    return ["content must be an object"];
  let nodes = 0;
  const stack = [[content, 1]];
  while (stack.length) {
    const [n, depth] = stack.pop();
    if (!n || typeof n !== "object" || Array.isArray(n))
      return ["content contains an invalid node"];
    nodes += 1;
    if (nodes > WRITING_LIMITS.nodes)
      return [`content has more than ${WRITING_LIMITS.nodes} nodes`];
    if (depth > WRITING_LIMITS.depth)
      return [`content is nested deeper than ${WRITING_LIMITS.depth} levels`];
    for (const key of Object.keys(n)) {
      if (
        key === "__proto__" ||
        key === "constructor" ||
        key.startsWith("$") ||
        key.includes(".")
      )
        errors.push(`content contains a forbidden key "${key.slice(0, 20)}"`);
    }
    if (n.content !== undefined && !Array.isArray(n.content))
      return ["content.content must be an array"];
    if (n.marks !== undefined && !Array.isArray(n.marks))
      return ["marks must be an array"];
    if (n.text !== undefined && typeof n.text !== "string")
      return ["text must be a string"];
    if (
      n.attrs !== undefined &&
      (typeof n.attrs !== "object" ||
        n.attrs === null ||
        Array.isArray(n.attrs))
    )
      return ["attrs must be an object"];
    for (const c of n.content || []) stack.push([c, depth + 1]);
    for (const m of n.marks || [])
      if (!m || typeof m !== "object") return ["invalid mark"];
  }
  return errors.slice(0, 5);
}

/** Canonicalise + validate against the shared schema. Returns { ok, errors, doc }. */
export function validateStructuredContent(content) {
  let size = 0;
  try {
    size = JSON.stringify(content)?.length ?? 0;
  } catch {
    return { ok: false, errors: ["content is not serialisable"], doc: null };
  }
  if (size > WRITING_LIMITS.contentBytes)
    return { ok: false, errors: ["content is too large"], doc: null };
  const shape = checkDocShape(content);
  if (shape.length) return { ok: false, errors: shape, doc: null };
  let doc;
  try {
    doc = canonicalizeDoc(JSON.parse(JSON.stringify(content)));
  } catch {
    return {
      ok: false,
      errors: ["content could not be normalised"],
      doc: null,
    };
  }
  const result = validateDoc(doc);
  return {
    ok: result.ok,
    errors: result.errors.slice(0, 10),
    doc: result.ok ? doc : null,
  };
}

function sanitizeSeo(seo) {
  const set = {};
  const errors = [];
  if (seo === null || typeof seo !== "object" || Array.isArray(seo))
    return { set, errors: ["seo must be an object"] };
  for (const [key, max] of Object.entries(SEO_STRING_LIMITS)) {
    if (seo[key] === undefined) continue;
    if (typeof seo[key] !== "string") errors.push(`seo.${key} must be text`);
    else set[`seo.${key}`] = cleanPlainText(seo[key], max);
  }
  if (seo.canonicalUrl !== undefined) {
    const v =
      typeof seo.canonicalUrl === "string" ? seo.canonicalUrl.trim() : null;
    if (
      v === null ||
      (v &&
        !(/^https?:\/\//i.test(v) && isSafeUrl(v, { allowRelative: false })))
    )
      errors.push("seo.canonicalUrl must be an http(s) address");
    else set["seo.canonicalUrl"] = v;
  }
  if (seo.ogImage !== undefined) {
    const v = typeof seo.ogImage === "string" ? seo.ogImage.trim() : null;
    if (v === null || (v && !isSafeUrl(v)))
      errors.push("seo.ogImage must be an http(s) or site-relative address");
    else set["seo.ogImage"] = v;
  }
  if (seo.twitterCard !== undefined) {
    if (seo.twitterCard === "" || seo.twitterCard === null)
      set["seo.twitterCard"] = undefined;
    else if (["summary", "summary_large_image"].includes(seo.twitterCard))
      set["seo.twitterCard"] = seo.twitterCard;
    else errors.push("seo.twitterCard is invalid");
  }
  if (seo.robots !== undefined) {
    if (!seo.robots || typeof seo.robots !== "object")
      errors.push("seo.robots must be an object");
    else
      for (const k of ["index", "follow"]) {
        if (seo.robots[k] === undefined) continue;
        if (typeof seo.robots[k] !== "boolean")
          errors.push(`seo.robots.${k} must be true or false`);
        else set[`seo.robots.${k}`] = seo.robots[k];
      }
  }
  return { set, errors };
}

function sanitizeImages(images) {
  const set = {};
  const errors = [];
  if (!images || typeof images !== "object" || Array.isArray(images))
    return { set, errors: ["images must be an object"] };
  for (const k of ["small", "medium", "large", "thumbnail"]) {
    if (images[k] === undefined) continue;
    if (images[k] === "" || images[k] === null) set[`images.${k}`] = undefined;
    else if (typeof images[k] === "string" && isSafeUrl(images[k]))
      set[`images.${k}`] = images[k].trim();
    else errors.push(`images.${k} must be an http(s) or site-relative address`);
  }
  if (images.alt !== undefined)
    set["images.alt"] = cleanPlainText(String(images.alt ?? ""), 300);
  return { set, errors };
}

/** Apply { "a.b": v } style paths to a clone (used to evaluate contract helpers on the would-be document). */
export function applyPaths(base, paths) {
  const out = structuredClone(base);
  for (const [path, value] of Object.entries(paths)) {
    const keys = path.split(".");
    let cur = out;
    for (const k of keys.slice(0, -1)) {
      if (cur[k] === null || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    if (value === undefined) delete cur[keys.at(-1)];
    else cur[keys.at(-1)] = value;
  }
  return out;
}

const fail = (status, errors, extra = {}) => ({
  ok: false,
  status,
  errors: [].concat(errors),
  ...extra,
});

/**
 * input    untrusted request body
 * existing plain object of the stored writing, or null when creating
 * helpers  { exists(slug, excludeId) -> Promise<boolean>, sanitizeBody(markdown) -> string, now }
 * Returns { ok:true, set, warnings, transition?, slugChange?, converted?, merged } or
 *         { ok:false, status, errors, conflict? }
 */
export async function buildWritingChanges({ input, existing, helpers }) {
  const { exists, sanitizeBody = (s) => s, now = new Date() } = helpers;
  const isCreate = !existing;
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail(400, "Request body must be a JSON object.");
  const errors = [];
  const warnings = [];
  const set = {};

  // --- optimistic concurrency -------------------------------------------------------------
  if (!isCreate) {
    const stored = Number.isInteger(existing.version) ? existing.version : 1;
    if (!Number.isInteger(input.version))
      return fail(
        428,
        "The current version of this writing is required to save it.",
        { currentVersion: stored },
      );
    if (input.version !== stored)
      return fail(
        409,
        "This writing was changed elsewhere. Reload before saving.",
        {
          conflict: true,
          currentVersion: stored,
        },
      );
  }

  // --- plain fields -----------------------------------------------------------------------
  if (input.title !== undefined || isCreate) {
    const title = cleanPlainText(input.title, 200);
    if (!title) errors.push("Title is required.");
    else set.title = title;
  }
  if (input.excerpt !== undefined)
    set.excerpt = cleanPlainText(input.excerpt, 500);
  if (input.metaDescription !== undefined)
    set.metaDescription = cleanPlainText(input.metaDescription, 160);
  if (input.category !== undefined || isCreate) {
    if (!CATEGORIES.includes(input.category))
      errors.push("Category is invalid or missing.");
    else set.category = input.category;
  }
  if (input.language !== undefined) {
    if (!LANGUAGES.includes(input.language))
      errors.push("Language must be Tamil or English.");
    else set.language = input.language;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 10)
      errors.push("Tags must be a list of at most 10.");
    else
      set.tags = input.tags
        .map((t) => cleanPlainText(String(t), 40).toLowerCase())
        .filter(Boolean);
  }
  for (const flag of ["featured", "trending"]) {
    if (input[flag] === undefined) continue;
    if (typeof input[flag] !== "boolean")
      errors.push(`${flag} must be true or false.`);
    else set[flag] = input[flag];
  }
  if (input.seo !== undefined) {
    const r = sanitizeSeo(input.seo);
    errors.push(...r.errors);
    Object.assign(set, r.set);
  }
  if (input.images !== undefined) {
    const r = sanitizeImages(input.images);
    errors.push(...r.errors);
    Object.assign(set, r.set);
  }

  // --- content ----------------------------------------------------------------------------
  const storedFormat = isCreate
    ? null
    : existing.contentFormat === "tiptap"
      ? "tiptap"
      : "markdown";
  const wantsFormat =
    input.contentFormat ??
    (input.content !== undefined ? "tiptap" : (storedFormat ?? "markdown"));
  if (!["markdown", "tiptap"].includes(wantsFormat))
    errors.push("contentFormat is invalid.");
  let converted = false;
  if (storedFormat === "tiptap" && wantsFormat === "markdown")
    return fail(422, [
      "A structured writing cannot be saved back to Markdown.",
    ]);
  if (storedFormat === "markdown" && wantsFormat === "tiptap") {
    // Explicit, confirmed conversion only. The original Markdown is preserved server-side.
    if (input.confirmConversion !== true)
      return fail(422, [
        "Converting a Markdown writing requires explicit confirmation (confirmConversion: true).",
      ]);
    converted = true;
  }
  if (wantsFormat === "tiptap") {
    if (input.content === undefined) {
      if (isCreate || converted) errors.push("Structured content is required.");
    } else {
      const v = validateStructuredContent(input.content);
      if (!v.ok)
        return fail(
          422,
          v.errors.map((e) => `content: ${e}`),
        );
      set.contentFormat = "tiptap";
      set.content = v.doc;
      set.body = docToPlainText(v.doc); // derived; the model recomputes it as well
    }
    if (input.body !== undefined && !isCreate)
      warnings.push("body is derived from content and was ignored.");
  } else if (input.body !== undefined) {
    if (
      typeof input.body !== "string" ||
      input.body.length > WRITING_LIMITS.bodyChars
    )
      errors.push("body must be text of reasonable length.");
    else set.body = sanitizeBody(input.body);
  }
  if (converted && existing) {
    const original = String(existing.body ?? "");
    const importerWarnings = markdownToDoc(original, {
      category: set.category ?? existing.category,
    }).warnings;
    set.importedFrom = {
      markdown: existing.importedFrom?.markdown ?? original,
      importedAt: now,
      warnings: importerWarnings.slice(0, 50).map((w) => w.slice(0, 300)),
    };
  }
  if (isCreate && wantsFormat === "markdown" && !String(set.body ?? "").trim())
    errors.push("Content is required.");
  if (errors.length) return fail(422, errors);

  // --- slug (explicit only; title edits never change it) ------------------------------------
  const base = isCreate
    ? { status: "draft", slugHistory: [], ...set }
    : existing;
  let slugChange = null;
  if (isCreate) {
    let candidate =
      input.slug !== undefined && input.slug !== ""
        ? generateSlug(input.slug)
        : generateSlug(set.title);
    if (!candidate) candidate = `writing-${now.getTime().toString(36)}`;
    const check = validateSlug(candidate);
    if (!check.valid) return fail(422, `slug: ${check.reason}`);
    const unique = await ensureUniqueSlug(candidate, (s) => exists(s, null));
    set.slug = unique;
    base.slug = unique;
  } else if (input.slug !== undefined && input.slug !== existing.slug) {
    const candidate = generateSlug(input.slug);
    const planned = planSlugChange(existing, candidate, now);
    if (!planned.ok)
      return fail(
        422,
        planned.errors.map((e) => `slug: ${e}`),
      );
    if (await exists(candidate, existing._id))
      return fail(409, ["Another writing already uses this slug."], {
        slugTaken: true,
      });
    Object.assign(set, planned.set);
    slugChange = {
      from: existing.slug,
      to: candidate,
      publishedUrlChanged: planned.publishedUrlChanged,
    };
  }

  // --- status / publishedAt (only through planTransition) -------------------------------------
  const wouldBe = applyPaths(base, set);
  let transition = null;
  if (input.status !== undefined) {
    const planned = planTransition(wouldBe, input.status, now);
    if (!planned.ok) return fail(422, planned.errors);
    Object.assign(set, planned.set);
    if (planned.set.status)
      transition = { from: wouldBe.status || "draft", to: planned.set.status };
  }
  const merged = applyPaths(base, set);

  // --- publish-blocking checks: only 'error' level SEO items block ---------------------------
  if (merged.status === "published") {
    const dup =
      Boolean(merged.slug) &&
      (await exists(merged.slug, existing?._id ?? null));
    const blocking = checkSeo(merged, { duplicateSlug: dup }).filter(
      (i) => i.level === "error",
    );
    if (blocking.length)
      return fail(
        422,
        blocking.map((i) => i.message),
      );
    if (!hasContent(merged))
      return fail(422, "Content is required to publish.");
  }

  if (!isCreate)
    set.version =
      (Number.isInteger(existing.version) ? existing.version : 1) + 1;
  return { ok: true, set, warnings, transition, slugChange, converted, merged };
}

/** Fields safe to return to anonymous callers (no rating e-mails, no revisions, no import backups). */
export function toPublicShape(writing) {
  const w =
    typeof writing?.toObject === "function"
      ? writing.toObject()
      : { ...writing };
  delete w.ratings;
  delete w.revisions;
  delete w.importedFrom;
  delete w.slugHistory;
  delete w.__v;
  return w;
}
