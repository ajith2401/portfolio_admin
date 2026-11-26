"use client";
// Create / edit page for one writing: structured editor, autosave, conflicts, publishing, search panel, preview.
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  checkSeo,
  docToPlainText,
  analyzeWriting,
  canonicalizeDoc,
} from "@/lib/content-contract";
import {
  initialSave,
  saveReducer,
  shouldSave,
  saveDelay,
  saveLabel,
} from "@/lib/editor/autosave";
import {
  BLANK_FORM,
  apiRequest,
  buildSavePayload,
  diffFields,
  errorMessage,
  formFromServer,
  isSavable,
  excerptLine,
} from "@/lib/editor/writing-client";
import { useDialog } from "@/lib/editor/use-dialog";
import SearchSharingPanel from "./SearchSharingPanel";
import PreviewPane from "./PreviewPane";
import LegacyView from "./LegacyView";

const RichEditor = dynamic(
  () => import("../Dashboard/components/editors/RichEditor"),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[60vh] animate-pulse rounded bg-gray-50"
        aria-busy="true"
      />
    ),
  },
);

const CATEGORIES = ["philosophy","poem","article","short story","short writings","politics","cinema","letter","joke"];
const contentKey = (f, doc) =>
  JSON.stringify([f.title, f.category, f.language, f.excerpt, f.tags, f.seo, f.images, doc]);
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
const input =
  "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

function ConflictDialog({
  serverCopy,
  mine,
  onReload,
  onKeepMine,
  onCompare,
  loading,
  onDismiss,
}) {
  const dialogRef = useDialog(onDismiss);
  const diffs = serverCopy ? diffFields(mine, serverCopy) : null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="w-full max-w-lg rounded-lg bg-gray-50 p-5 text-gray-900 shadow-xl"
      >
        <h2 id="conflict-title" className="text-lg font-semibold">
          This writing was changed elsewhere
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Someone (or another tab) saved a newer version. Nothing of yours has
          been overwritten. Autosave is paused until you choose.
        </p>
        {diffs && (
          <div className="mt-3 max-h-48 overflow-auto rounded bg-white p-3 text-sm">
            {diffs.length === 0 ? (
              <p>
                Title, category, language and excerpt are the same. The text or
                search fields differ.
              </p>
            ) : (
              diffs.map((d) => (
                <div key={d.field} className="mb-2">
                  <strong>{d.field}</strong>
                  <div className="text-red-700">Yours: {String(d.mine)}</div>
                  <div className="text-green-700">
                    Saved version: {String(d.theirs)}
                  </div>
                </div>
              ))
            )}
            <p className="mt-2 text-gray-500">
              Saved version:{" "}
              {serverCopy.wordCount ?? analyzeWriting(serverCopy).wordCount}{" "}
              words.
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!serverCopy && (
            <button
              type="button"
              className="rounded px-3 py-1.5 text-sm hover:bg-gray-100"
              disabled={loading}
              onClick={onCompare}
            >
              Compare
            </button>
          )}
          <button
            type="button"
            className="rounded bg-gray-200 px-3 py-1.5 text-sm"
            disabled={loading}
            onClick={onReload}
          >
            Discard mine and reload
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={loading || !serverCopy}
            onClick={onKeepMine}
            title={serverCopy ? "" : "Compare first"}
          >
            Keep mine and overwrite
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WritingStudio({ id: routeId }) {
  const isNew = routeId === "new";
  const [id, setId] = useState(isNew ? null : routeId);
  // The id this page instance already holds in memory. After the first autosave creates the draft the URL is
  // replaced with /admin/writings/<id>; that must NOT refetch and remount the editor (it would drop focus and
  // could overwrite text typed meanwhile).
  const knownId = useRef(isNew ? null : routeId);
  const editorRef = useRef(null);
  const pendingFocus = useRef(false);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState("");
  const [writing, setWriting] = useState(null); // server copy of meta
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [docState, setDocState] = useState({
    doc: EMPTY_DOC,
    valid: true,
    errors: [],
    stats: { wordCount: 0, readTime: 0 },
  });
  const [editorKey, setEditorKey] = useState(0);
  const [tab, setTab] = useState("write");
  const [conflictOpen, setConflictOpen] = useState(true);
  const [notice, setNotice] = useState([]);
  const [busy, setBusy] = useState(false);
  const [convertError, setConvertError] = useState("");
  const [serverCopy, setServerCopy] = useState(null);
  const [slugBusy, setSlugBusy] = useState(false);
  const [save, dispatch] = useReducer(saveReducer, undefined, () =>
    initialSave(null),
  );

  const live = useRef({});
  useEffect(() => {
    live.current = {
      form,
      doc: docState.doc,
      valid: docState.valid,
      id,
      version: save.version,
      save,
    };
  });
  const hydrated = useRef(false);
  // Fingerprint of the last saved/loaded editable content. Only a real difference marks the page dirty,
  // so saving (which updates slug/status/version) can never retrigger autosave.
  const baseline = useRef(contentKey(BLANK_FORM, EMPTY_DOC));

  const hydrate = useCallback((w) => {
    setWriting(w);
    setForm(formFromServer(w));
    const doc =
      w.contentFormat === "tiptap" && w.content?.type === "doc"
        ? canonicalizeDoc(w.content)
        : EMPTY_DOC;
    baseline.current = contentKey(formFromServer(w), doc);
    setDocState({
      doc,
      valid: true,
      errors: [],
      stats: analyzeWriting({ contentFormat: "tiptap", content: doc }),
    });
    setEditorKey((k) => k + 1);
    dispatch({ type: "RESOLVED", version: w.version ?? 1, keepLocal: false });
  }, []);

  // Load
  useEffect(() => {
    if (isNew) {
      hydrated.current = true;
      return;
    }
    if (knownId.current === routeId && hydrated.current) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      const r = await apiRequest("GET", `/api/writings/${routeId}`);
      if (!alive) return;
      if (!r.ok)
        setLoadError(
          r.status === 404
            ? "This writing does not exist."
            : "Could not load this writing.",
        );
      else {
        hydrate(r.data);
        hydrated.current = true;
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [isNew, routeId, hydrate]);

  const legacy = writing && writing.contentFormat !== "tiptap";

  // Core save. `extra` carries explicit actions (status changes) so they ride on the same versioned request.
  const doSave = useCallback(async (extra = {}) => {
    const cur = live.current;
    if (!isSavable({ form: cur.form, valid: cur.valid })) {
      dispatch({ type: "EDIT", valid: false });
      return { ok: false, local: true };
    }
    dispatch({ type: "SAVE_START" });
    const savedKey = contentKey(cur.form, cur.doc);
    const payload = buildSavePayload({
      form: cur.form,
      doc: cur.doc,
      version: cur.id ? cur.version : undefined,
      extra,
    });
    const r = cur.id
      ? await apiRequest("PUT", `/api/writings/${cur.id}`, payload)
      : await apiRequest("POST", "/api/writings", payload);
    if (r.ok) {
      const d = r.data;
      if (!cur.id) {
        knownId.current = d._id;
        setId(d._id);
        window.history.replaceState(null, "", `/admin/writings/${d._id}`);
      }
      setWriting((w) => ({ ...(w || {}), ...d }));
      setForm((f) => ({
        ...f,
        slug: d.slug ?? f.slug,
        status: d.status ?? f.status,
      }));
      baseline.current = savedKey;
      dispatch({
        type: "SAVE_OK",
        version: d.version ?? (cur.version || 0) + 1,
        at: Date.now(),
      });
      // An edit can land between building the payload and the response (live.current is refreshed after commit,
      // so the payload may be one keystroke behind). If the editor has moved past what was saved, stay dirty.
      const now = live.current;
      if (contentKey(now.form, now.doc) !== savedKey)
        dispatch({
          type: "EDIT",
          valid: isSavable({ form: now.form, valid: now.valid }),
        });
      const msgs = [...(d.warnings || [])];
      if (d.revalidate?.warning) msgs.push(d.revalidate.warning);
      if (msgs.length) setNotice(msgs);
      return { ok: true, data: d };
    }
    if (r.kind === "conflict") {
      dispatch({
        type: "SAVE_FAIL",
        kind: "conflict",
        message: errorMessage(r.data),
      });
    } else {
      dispatch({
        type: "SAVE_FAIL",
        kind: r.kind,
        message: errorMessage(r.data),
      });
    }
    return { ok: false, kind: r.kind, data: r.data };
  }, []);

  // Autosave (debounced; only when valid; never during conflict/offline/legacy)
  useEffect(() => {
    if (!hydrated.current || legacy || !shouldSave(save)) return;
    const t = setTimeout(() => doSave(), saveDelay(save));
    return () => clearTimeout(t);
  }, [save, doSave, legacy]);

  // Mark dirty on any form / document change
  useEffect(() => {
    if (!hydrated.current || legacy) return;
    if (contentKey(form, docState.doc) === baseline.current) return;
    dispatch({
      type: "EDIT",
      valid: isSavable({ form, valid: docState.valid }),
    });
  }, [form, docState.doc, docState.valid, legacy]);

  // Connectivity + leave warning
  useEffect(() => {
    const on = () => dispatch({ type: "ONLINE" });
    const off = () => dispatch({ type: "OFFLINE" });
    const beforeUnload = (e) => {
      if (
        ["dirty", "saving", "offline", "error", "invalid"].includes(
          live.current.save.status,
        )
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("beforeunload", beforeUnload);
    if (!navigator.onLine) off();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const plainText = useMemo(() => docToPlainText(docState.doc), [docState.doc]);
  const seoModel = useMemo(
    () => ({
      ...form,
      slug: writing?.slug || form.slug,
      contentFormat: "tiptap",
      content: docState.doc,
    }),
    [form, writing, docState.doc],
  );
  const checks = useMemo(() => checkSeo(seoModel), [seoModel]);
  const blockers = checks.filter((c) => c.level === "error");
  const status = writing?.status || "draft";

  const transition = async (to) => {
    if (to === "published" && blockers.length) {
      setNotice(blockers.map((b) => b.message));
      setTab("search");
      return;
    }
    setBusy(true);
    const r = await doSave({ status: to });
    setBusy(false);
    if (!r.ok && !r.local) setNotice([errorMessage(r.data)]);
    else if (!r.ok)
      setNotice([
        "Add a title and fix document problems before changing status.",
      ]);
    else if (to === "published")
      setNotice((n) => ["Published.", ...n.filter((x) => x !== "Published.")]);
  };

  const applySlug = async (slug) => {
    setSlugBusy(true);
    const r = await doSave({ slug });
    setSlugBusy(false);
    if (!r.ok) {
      setNotice([errorMessage(r.data)]);
      return false;
    }
    return true;
  };

  const convert = async (doc, lineBreaks = "auto") => {
    setBusy(true);
    setConvertError("");
    const r = await apiRequest("PUT", `/api/writings/${id}`, {
      ...buildSavePayload({ form, doc, version: save.version }),
      confirmConversion: true,
      conversionLineBreaks: lineBreaks,
    });
    setBusy(false);
    if (!r.ok) {
      setConvertError(errorMessage(r.data));
      return;
    }
    hydrate(r.data);
    setNotice(["Converted. The original Markdown is kept as a backup."]);
  };

  // Conflict handling
  const loadServerCopy = async () => {
    const r = await apiRequest("GET", `/api/writings/${id}`);
    if (!r.ok) {
      setNotice(["Could not load the saved version."]);
      return null;
    }
    return r.data;
  };
  const onCompare = async () => {
    const s = await loadServerCopy();
    if (s) setServerCopy(s);
  };
  const onReload = async () => {
    const s = await loadServerCopy();
    if (s) {
      hydrate(s);
      setServerCopy(null);
    }
  };
  const onKeepMine = () => {
    dispatch({
      type: "RESOLVED",
      version: serverCopy.version ?? 1,
      keepLocal: true,
    });
    setWriting((w) => ({ ...w, version: serverCopy.version }));
    setServerCopy(null);
  };

  useEffect(() => {
    if (save.status === "conflict") setConflictOpen(true);
  }, [save.status]);

  const onEditorChange = useCallback((s) => setDocState(s), []);

  // Move focus into the real editor, retrying while it mounts or is replaced (hydration, reconfiguration).
  const focusEditor = useCallback(() => {
    pendingFocus.current = true;
    let tries = 0;
    const attempt = () => {
      if (!pendingFocus.current) return;
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed) {
        ed.commands.focus("end");
        const el = ed.view?.dom;
        if (el && document.activeElement === el) {
          pendingFocus.current = false;
          return;
        }
      }
      if (++tries < 40) setTimeout(attempt, 50);
      else pendingFocus.current = false;
    };
    attempt();
  }, []);
  const onEditorReady = useCallback((ed) => {
    editorRef.current = ed;
    if (pendingFocus.current && ed && !ed.isDestroyed) {
      ed.commands.focus("end");
      if (document.activeElement === ed.view?.dom) pendingFocus.current = false;
    }
  }, []);
  const onCategoryChange = (e) => {
    const category = e.target.value;
    setForm((f) => ({ ...f, category }));
    if (category !== "poem") return;
    const ed = editorRef.current;
    // An empty page becomes a poem block; existing text is never rewritten by changing the category.
    if (ed && !ed.isDestroyed && ed.getText().trim() === "" && !ed.isActive("poem")) ed.commands.togglePoem();
    focusEditor();
  };

  if (loading)
    return (
      <div className="p-8 text-gray-600" aria-busy="true">
        Loading…
      </div>
    );
  if (loadError)
    return (
      <div className="p-8 text-red-700" role="alert">
        {loadError}{" "}
        <Link className="underline" href="/admin/writings">
          Back to library
        </Link>
      </div>
    );

  const disabled = save.status === "conflict";

  return (
    <div className="min-h-screen bg-white pb-16 text-gray-900">
      <h1 className="sr-only">Writing studio</h1>
      <header className="sticky top-14 z-10 border-b lg:top-0 border-gray-200 bg-gray-50 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Link
            href="/admin/writings"
            className="text-sm text-blue-700 underline"
          >
            Library
          </Link>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${status === "published" ? "bg-emerald-100 text-emerald-800" : status === "archived" ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-800"}`}
          >
            {status}
          </span>
          <span
            role="status"
            aria-live="polite"
            className={`text-sm ${save.status === "error" || save.status === "conflict" || save.status === "invalid" ? "text-red-700" : "text-gray-600"}`}
          >
            {legacy ? "Legacy Markdown (read-only)" : saveLabel(save)}
            {save.error && !legacy ? `: ${save.error}` : ""}
          </span>
          {save.status === "conflict" && !conflictOpen && (
            <button
              type="button"
              className="rounded bg-red-700 text-white px-3 py-1.5 text-sm"
              onClick={() => setConflictOpen(true)}
            >
              Resolve conflict
            </button>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            {!legacy && id && (
              <>
                {status !== "published" && (
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => transition("published")}
                    className="rounded bg-green-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                  >
                    Publish
                  </button>
                )}
                {status === "published" && (
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => transition("draft")}
                    className="rounded bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                  >
                    Unpublish
                  </button>
                )}
                {status !== "archived" && (
                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => transition("archived")}
                    className="rounded bg-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Archive
                  </button>
                )}
              </>
            )}
            {!legacy && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => doSave()}
                className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Save now
              </button>
            )}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4">
        {notice.length > 0 && (
          <div
            role="status"
            className="mb-3 flex items-start justify-between gap-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <ul className="list-disc pl-5">
              {notice.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice([])}
            >
              ✕
            </button>
          </div>
        )}

        <label htmlFor="w-title" className="sr-only">
          Title
        </label>
        <input
          id="w-title"
          value={form.title}
          disabled={legacy || disabled}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Title"
          lang={form.language === "Tamil" ? "ta" : undefined}
          className="mb-3 w-full border-0 border-b border-gray-200 bg-transparent px-1 py-2 text-3xl font-bold text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0"
          maxLength={200}
        />

        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="w-cat" className="mb-1 block text-xs text-gray-500">
              Category
            </label>
            <select
              id="w-cat"
              className={input}
              value={form.category}
              disabled={legacy || disabled}
              onChange={onCategoryChange}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="w-excerpt"
              className="mb-1 block text-xs text-gray-500"
            >
              Excerpt (optional)
            </label>
            <input
              id="w-excerpt"
              className={input}
              value={excerptLine(form.excerpt)}
              disabled={legacy || disabled}
              maxLength={500}
              onChange={(e) =>
                setForm((f) => ({ ...f, excerpt: e.target.value }))
              }
            />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Sections"
          className="mb-3 flex gap-1 border-b border-gray-200"
        >
          {[
            ["write", "Write"],
            ["preview", "Preview"],
            ["search", "Search & Sharing"],
          ].map(([k, label]) => (
            <button
              key={k}
              id={`tab-${k}`}
              role="tab"
              type="button"
              aria-selected={tab === k}
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              onKeyDown={(e) => {
                // WAI-ARIA tabs: arrows move between tabs, Home/End jump to the ends.
                const keys = ["write", "preview", "search"];
                const i = keys.indexOf(k);
                let n = -1;
                if (e.key === "ArrowRight") n = (i + 1) % keys.length;
                else if (e.key === "ArrowLeft") n = (i + keys.length - 1) % keys.length;
                else if (e.key === "Home") n = 0;
                else if (e.key === "End") n = keys.length - 1;
                if (n < 0) return;
                e.preventDefault();
                setTab(keys[n]);
                document.getElementById(`tab-${keys[n]}`)?.focus();
              }}
              className={`px-4 py-2 text-sm ${tab === k ? "border-b-2 border-blue-600 font-medium text-blue-700" : "text-gray-500 hover:text-gray-200"}`}
            >
              {label}
              {k === "search" && blockers.length > 0 ? " •" : ""}
            </button>
          ))}
        </div>

        {legacy ? (
          tab === "write" || tab === "preview" ? (
            <LegacyView
              writing={writing}
              busy={busy}
              error={convertError}
              onConvert={convert}
            />
          ) : (
            <p className="text-sm text-gray-600">
              Convert this writing to edit its search and sharing fields.
            </p>
          )
        ) : (
          <>
            <div hidden={tab !== "write"}>
              <RichEditor
                key={editorKey}
                initialDoc={docState.doc}
                language={form.language}
                disabled={disabled}
                onChange={onEditorChange}
                onEditor={onEditorReady}
              />
              {!id && (
                <p className="mt-2 text-xs text-gray-500">
                  A draft is created automatically once you add a title and some
                  text.
                </p>
              )}
            </div>
            {tab === "preview" && (
              <PreviewPane
                title={form.title}
                language={form.language}
                category={form.category}
                excerpt={form.excerpt}
                doc={docState.doc}
              />
            )}
            {tab === "search" && (
              <SearchSharingPanel
                writing={writing}
                form={form}
                setForm={setForm}
                doc={docState.doc}
                plainText={plainText}
                onSlugApply={applySlug}
                slugBusy={slugBusy}
                disabled={disabled}
              />
            )}
          </>
        )}
      </div>

      {save.status === "conflict" && conflictOpen && (
        <ConflictDialog
          serverCopy={serverCopy}
          mine={form}
          loading={busy}
          onReload={onReload}
          onKeepMine={onKeepMine}
          onCompare={onCompare}
          onDismiss={() => setConflictOpen(false)}
        />
      )}
    </div>
  );
}
