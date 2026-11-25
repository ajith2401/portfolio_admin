"use client";
// Search & Sharing: SEO fields (seo.*), live checks, Google and social previews, slug and language.
import { useMemo, useState } from "react";
import {
  SEO_LIMITS,
  checkSeo,
  countGraphemes,
  resolveWritingSeo,
  suggestLanguage,
  isSafeUrl,
} from "@/lib/content-contract";

const input =
  "w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ id, label, hint, counter, limit, children }) {
  const over = limit && counter > limit;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-gray-200">
          {label}
        </label>
        {counter != null && (
          <span
            className={`text-xs ${over ? "text-amber-300" : "text-gray-400"}`}
            aria-live="polite"
          >
            {counter}
            {limit ? ` / ${limit}` : ""}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const LEVEL_STYLE = {
  error: "border-red-500 text-red-200",
  warning: "border-amber-500 text-amber-200",
  info: "border-gray-600 text-gray-300",
};

export default function SearchSharingPanel({
  writing,
  form,
  setForm,
  doc,
  plainText,
  onSlugApply,
  slugBusy,
  disabled,
}) {
  const [slugDraft, setSlugDraft] = useState(null);
  const seo = form.seo || {};
  const setSeo = (patch) =>
    setForm((f) => ({ ...f, seo: { ...f.seo, ...patch } }));
  const setImages = (patch) =>
    setForm((f) => ({ ...f, images: { ...f.images, ...patch } }));

  const model = useMemo(
    () => ({
      title: form.title,
      slug: writing?.slug || form.slug,
      language: form.language,
      category: form.category,
      excerpt: form.excerpt,
      seo: form.seo,
      images: form.images,
      contentFormat: "tiptap",
      content: doc,
      publishedAt: writing?.publishedAt,
    }),
    [form, doc, writing],
  );
  const resolved = useMemo(() => resolveWritingSeo(model), [model]);
  const checks = useMemo(() => checkSeo(model), [model]);

  const suggested = useMemo(
    () => (plainText ? suggestLanguage(plainText) : null),
    [plainText],
  );
  const currentSlug = writing?.slug || "";
  const slugValue = slugDraft ?? currentSlug;
  const published = writing?.status === "published";
  const host = (() => {
    try {
      return new URL(resolved.canonical).host;
    } catch {
      return "";
    }
  })();
  const crumbs = (() => {
    try {
      return new URL(resolved.canonical).pathname;
    } catch {
      return "";
    }
  })();

  return (
    <div className="space-y-5 text-gray-100">
      <section aria-labelledby="ss-checks">
        <h3
          id="ss-checks"
          className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400"
        >
          Checks
        </h3>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li
              key={c.id}
              className={`rounded border-l-4 bg-gray-800 px-3 py-1.5 text-sm ${LEVEL_STYLE[c.level]}`}
            >
              <span className="mr-2 text-xs font-semibold uppercase">
                {c.level === "error" ? "Blocks publishing" : c.level}
              </span>
              {c.message}
            </li>
          ))}
          {checks.length === 0 && (
            <li className="text-sm text-green-300">Nothing to fix.</li>
          )}
        </ul>
        <p className="mt-1 text-xs text-gray-400">
          Only items marked “Blocks publishing” stop you from publishing.
        </p>
      </section>

      <section
        aria-labelledby="ss-google"
        className="rounded-lg bg-white p-4 text-left"
      >
        <h3
          id="ss-google"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          How it may look on Google
        </h3>
        <div className="text-xs text-gray-600">
          {host}
          <span className="text-gray-600">
            {" "}
            › {crumbs.split("/").filter(Boolean).join(" › ")}
          </span>
        </div>
        <div
          lang={resolved.lang}
          className="text-lg leading-snug text-[#1a0dab]"
        >
          {resolved.title}
        </div>
        <div
          lang={resolved.lang}
          className="text-sm leading-snug text-[#4d5156]"
        >
          {resolved.description}
        </div>
      </section>

      <section
        aria-labelledby="ss-social"
        className="overflow-hidden rounded-lg border border-gray-600 bg-gray-800"
      >
        <h3
          id="ss-social"
          className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          Social card
        </h3>
        <div className="m-3 overflow-hidden rounded-lg border border-gray-600 bg-gray-900">
          {resolved.og.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolved.og.image}
              alt={resolved.og.imageAlt}
              className="aspect-[1.91/1] w-full bg-gray-700 object-cover"
            />
          ) : (
            <div className="flex aspect-[1.91/1] items-center justify-center bg-gray-700 text-sm text-gray-400">
              No image
            </div>
          )}
          <div className="p-3" lang={resolved.lang}>
            <div className="text-xs uppercase text-gray-400">{host}</div>
            <div className="font-semibold">{resolved.og.title}</div>
            <div className="line-clamp-2 text-sm text-gray-300">
              {resolved.og.description}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-label="Search fields">
        <Field
          id="seo-title"
          label="Search title"
          counter={countGraphemes(seo.title || resolved.title)}
          limit={SEO_LIMITS.title}
          hint="Leave empty to use the title of the work."
        >
          <input
            id="seo-title"
            className={input}
            value={seo.title || ""}
            disabled={disabled}
            onChange={(e) => setSeo({ title: e.target.value })}
            lang={form.language === "Tamil" ? "ta" : undefined}
          />
        </Field>
        <Field
          id="seo-desc"
          label="Search description"
          counter={countGraphemes(seo.description || resolved.description)}
          limit={SEO_LIMITS.description}
          hint="Leave empty to generate one from the text."
        >
          <textarea
            id="seo-desc"
            rows={3}
            className={input}
            value={seo.description || ""}
            disabled={disabled}
            onChange={(e) => setSeo({ description: e.target.value })}
            lang={form.language === "Tamil" ? "ta" : undefined}
          />
        </Field>
        <Field id="seo-ogtitle" label="Social title (optional)">
          <input
            id="seo-ogtitle"
            className={input}
            value={seo.ogTitle || ""}
            disabled={disabled}
            onChange={(e) => setSeo({ ogTitle: e.target.value })}
          />
        </Field>
        <Field id="seo-ogdesc" label="Social description (optional)">
          <textarea
            id="seo-ogdesc"
            rows={2}
            className={input}
            value={seo.ogDescription || ""}
            disabled={disabled}
            onChange={(e) => setSeo({ ogDescription: e.target.value })}
          />
        </Field>
        <Field
          id="seo-ogimage"
          label="Social card image address"
          hint={
            form.images?.large
              ? "Leave empty to use the featured image."
              : "Paste an https address or a site path."
          }
        >
          <input
            id="seo-ogimage"
            className={input}
            value={seo.ogImage || ""}
            disabled={disabled}
            onChange={(e) => setSeo({ ogImage: e.target.value })}
            placeholder="https://"
          />
          {seo.ogImage && !isSafeUrl(seo.ogImage) && (
            <p role="alert" className="mt-1 text-xs text-red-300">
              This address is not allowed.
            </p>
          )}
        </Field>
        {form.images?.large && (
          <button
            type="button"
            className="text-sm text-blue-300 underline disabled:opacity-40"
            disabled={disabled}
            onClick={() => setSeo({ ogImage: form.images.large })}
          >
            Use the featured image for the social card
          </button>
        )}
        <Field
          id="img-alt-text"
          label="Image alt text"
          hint="Describes the featured / social image. Required for accessibility."
        >
          <input
            id="img-alt-text"
            className={input}
            value={form.images?.alt || seo.ogImageAlt || ""}
            disabled={disabled}
            onChange={(e) => {
              setImages({ alt: e.target.value });
              setSeo({ ogImageAlt: e.target.value });
            }}
          />
        </Field>
        <Field
          id="seo-canonical"
          label="Canonical address (advanced)"
          hint="Must be on this site; otherwise the automatic address is used."
        >
          <input
            id="seo-canonical"
            className={input}
            value={seo.canonicalUrl || ""}
            disabled={disabled}
            onChange={(e) => setSeo({ canonicalUrl: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={seo.robots?.index === false}
            onChange={(e) =>
              setSeo({
                robots: {
                  ...(seo.robots || {}),
                  index: e.target.checked ? false : true,
                },
              })
            }
          />
          Hide this writing from search engines
        </label>
      </section>

      <section aria-labelledby="ss-lang" className="space-y-2">
        <h3
          id="ss-lang"
          className="text-sm font-semibold uppercase tracking-wide text-gray-400"
        >
          Language
        </h3>
        <select
          aria-label="Content language"
          className={input}
          value={form.language}
          disabled={disabled}
          onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
        >
          <option>Tamil</option>
          <option>English</option>
        </select>
        {suggested && suggested !== form.language && (
          <p className="text-sm text-amber-200" role="status">
            The text looks like {suggested}.{" "}
            <button
              type="button"
              className="underline"
              disabled={disabled}
              onClick={() => setForm((f) => ({ ...f, language: suggested }))}
            >
              Switch to {suggested}
            </button>
          </p>
        )}
      </section>

      <section aria-labelledby="ss-slug" className="space-y-2">
        <h3
          id="ss-slug"
          className="text-sm font-semibold uppercase tracking-wide text-gray-400"
        >
          Web address (slug)
        </h3>
        {!currentSlug ? (
          <p className="text-sm text-gray-400">
            The address is created from the title when you first save. Editing
            the title later never changes it.
          </p>
        ) : (
          <>
            <input
              aria-label="Slug"
              className={input}
              value={slugValue}
              disabled={disabled || slugBusy}
              onChange={(e) => setSlugDraft(e.target.value)}
            />
            {slugDraft != null && slugDraft !== currentSlug && (
              <div className="space-y-2">
                {published && (
                  <p
                    role="alert"
                    className="rounded bg-amber-900/40 p-2 text-sm text-amber-100"
                  >
                    This writing is published. Changing the address keeps the
                    old one as a redirect, but links shared elsewhere may take
                    time to update.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={slugBusy || disabled}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm disabled:opacity-40"
                    onClick={async () => {
                      const ok = await onSlugApply(slugDraft);
                      if (ok) setSlugDraft(null);
                    }}
                  >
                    {slugBusy ? "Changing…" : "Change address"}
                  </button>
                  <button
                    type="button"
                    className="rounded px-3 py-1.5 text-sm hover:bg-gray-700"
                    onClick={() => setSlugDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {(writing?.slugHistory || []).length > 0 && (
              <p className="text-xs text-gray-400">
                Previous addresses (redirected):{" "}
                {(writing.slugHistory || []).map((h) => h.slug || h).join(", ")}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
