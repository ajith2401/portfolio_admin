"use client";
// Content library + editorial dashboard: counts by status, filters, search, drafts first.
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/editor/writing-client";

const CATEGORIES = ["philosophy", "poem", "article", "short story", "short writings", "politics", "cinema", "letter", "joke"];
const input = "rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
const BADGE = { draft: "bg-amber-700", published: "bg-green-700", archived: "bg-gray-600" };

export default function Library() {
  const [filters, setFilters] = useState({ status: "", category: "", language: "", search: "" });
  const [debounced, setDebounced] = useState(filters.search);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ writings: [], pagination: { total: 0, pages: 1 } });
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { const t = setTimeout(() => setDebounced(filters.search), 300); return () => clearTimeout(t); }, [filters.search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const s of ["draft", "published", "archived"]) {
        const r = await apiRequest("GET", `/api/writings?view=library&status=${s}&limit=1`);
        out[s] = r.ok ? r.data.pagination.total : null;
      }
      if (alive) setCounts(out);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ view: "library", page: String(page), limit: "20" });
    if (filters.status) q.set("status", filters.status);
    if (filters.category) q.set("category", filters.category);
    if (filters.language) q.set("language", filters.language);
    if (debounced.trim()) q.set("search", debounced.trim());
    apiRequest("GET", `/api/writings?${q}`).then((r) => {
      if (!alive) return;
      if (r.ok) { setData(r.data); setError(""); } else setError(r.status === 401 ? "Please sign in again." : "Could not load writings.");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [filters.status, filters.category, filters.language, debounced, page]);

  const set = (k) => (e) => { setLoading(true); setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-6 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Writings</h1>
          <Link href="/admin/writings/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium">New writing</Link>
        </div>

        <ul className="mb-5 grid grid-cols-3 gap-3" aria-label="Totals">
          {["draft", "published", "archived"].map((s) => (
            <li key={s}>
              <button type="button" onClick={() => { setPage(1); setFilters((f) => ({ ...f, status: f.status === s ? "" : s })); }} aria-pressed={filters.status === s} className={`w-full rounded-lg border p-3 text-left ${filters.status === s ? "border-blue-500 bg-gray-800" : "border-gray-700 bg-gray-800/60"}`}>
                <div className="text-2xl font-semibold">{counts?.[s] ?? "–"}</div>
                <div className="text-xs uppercase tracking-wide text-gray-400">{s === "draft" ? "Drafts" : s}</div>
              </button>
            </li>
          ))}
        </ul>

        <div className="mb-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="lib-search">Search</label>
          <input id="lib-search" type="search" placeholder="Search titles and text" className={`${input} min-w-[12rem] flex-1`} value={filters.search} onChange={set("search")} />
          <label className="sr-only" htmlFor="lib-cat">Category</label>
          <select id="lib-cat" className={input} value={filters.category} onChange={set("category")}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <label className="sr-only" htmlFor="lib-lang">Language</label>
          <select id="lib-lang" className={input} value={filters.language} onChange={set("language")}><option value="">All languages</option><option>Tamil</option><option>English</option></select>
          <label className="sr-only" htmlFor="lib-status">Status</label>
          <select id="lib-status" className={input} value={filters.status} onChange={set("status")}><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
        </div>

        {error && <p role="alert" className="mb-3 text-red-300">{error}</p>}
        <ul className="divide-y divide-gray-700 rounded-lg border border-gray-700 bg-gray-800/60" aria-busy={loading}>
          {data.writings.map((w) => (
            <li key={w._id}>
              <Link href={`/admin/writings/${w._id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-gray-800">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${BADGE[w.status] || "bg-gray-600"}`}>{w.status}</span>
                <span className="min-w-0 flex-1 truncate font-medium" lang={w.language === "Tamil" ? "ta" : undefined}>{w.title || "Untitled"}</span>
                {w.contentFormat !== "tiptap" && <span className="rounded border border-amber-500 px-1.5 text-xs text-amber-200">Legacy</span>}
                <span className="text-xs text-gray-400">{w.category} · {w.language}</span>
                <span className="text-xs text-gray-500">{w.wordCount ? `${w.wordCount} words · ` : ""}{w.updatedAt ? new Date(w.updatedAt).toLocaleDateString() : ""}</span>
              </Link>
            </li>
          ))}
          {!loading && data.writings.length === 0 && <li className="px-4 py-8 text-center text-gray-400">No writings match.</li>}
        </ul>

        {data.pagination.pages > 1 && (
          <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Pages">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40">Previous</button>
            <span>Page {data.pagination.current || page} of {data.pagination.pages}</span>
            <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="rounded px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40">Next</button>
          </nav>
        )}
      </div>
    </div>
  );
}
