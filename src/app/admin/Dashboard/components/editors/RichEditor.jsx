"use client";
// Self-hosted Tiptap editor. Produces exactly the structured document defined by the shared contract.
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useDialog } from "@/lib/editor/use-dialog";
import { buildExtensions } from "@/lib/editor/extensions";
import {
  analyzeWriting,
  canonicalizeDoc,
  docHeadings,
  isSafeUrl,
  validateDoc,
} from "@/lib/content-contract";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const SLASH_ITEMS = [
  {
    id: "h2",
    label: "Heading 2",
    hint: "Section title",
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "Sub-section",
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "ul",
    label: "Bulleted list",
    hint: "",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ol",
    label: "Numbered list",
    hint: "",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Block quote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "poem",
    label: "Poem",
    hint: "Stanzas and line breaks",
    run: (e) => e.chain().focus().togglePoem().run(),
  },
  {
    id: "hr",
    label: "Divider",
    hint: "Horizontal rule",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "image",
    label: "Image",
    hint: "Upload or paste an address",
    run: null,
  },
];

function Btn({ label, active, disabled, onClick, children, shortcut }) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-9 h-9 px-2 rounded text-sm font-medium transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        active
          ? "bg-blue-600 text-white"
          : "bg-transparent text-gray-200 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Dialog({ title, onClose, children }) {
  const ref = useDialog(onClose);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-gray-800 p-5 text-gray-100 shadow-xl"
      >
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const field =
  "w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

function LinkDialog({ initial, onSubmit, onRemove, onClose }) {
  const [href, setHref] = useState(initial || "");
  const ok = !href || isSafeUrl(href);
  return (
    <Dialog title="Link" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (href && ok) onSubmit(href.trim());
        }}
      >
        <label className="mb-1 block text-sm" htmlFor="link-href">
          Address (https://, http://, mailto: or /path)
        </label>
        <input
          id="link-href"
          autoFocus
          className={field}
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="https://"
        />
        {!ok && (
          <p role="alert" className="mt-1 text-sm text-red-400">
            This address is not allowed. Use https, http, mailto or a site path.
          </p>
        )}
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            className="text-sm text-red-300 disabled:opacity-40"
            disabled={!initial}
            onClick={onRemove}
          >
            Remove link
          </button>
          <span className="flex gap-2">
            <button
              type="button"
              className="rounded px-3 py-1.5 text-sm hover:bg-gray-700"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!href || !ok}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Apply
            </button>
          </span>
        </div>
      </form>
    </Dialog>
  );
}

function ImageDialog({ initial, onSubmit, onClose, onUpload }) {
  const [src, setSrc] = useState(initial?.src || "");
  const [alt, setAlt] = useState(initial?.alt || "");
  const [caption, setCaption] = useState(initial?.title || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const srcOk = !src || isSafeUrl(src);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      setSrc(await onUpload(file));
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={initial?.src ? "Image details" : "Insert image"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (src && srcOk)
            onSubmit({
              src: src.trim(),
              alt: alt.trim(),
              title: caption.trim(),
            });
        }}
        className="space-y-3"
      >
        {!initial?.src && (
          <div>
            <label htmlFor="img-file" className="mb-1 block text-sm">
              Upload (JPEG, PNG, WEBP or GIF, up to 5 MB)
            </label>
            <input
              id="img-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0])}
              className="text-sm"
            />
          </div>
        )}
        <div>
          <label htmlFor="img-src" className="mb-1 block text-sm">
            Image address
          </label>
          <input
            id="img-src"
            className={field}
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder="https://"
          />
          {!srcOk && (
            <p role="alert" className="mt-1 text-sm text-red-400">
              This address is not allowed.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="img-alt" className="mb-1 block text-sm">
            Alt text (describes the image for screen readers and search)
          </label>
          <input
            id="img-alt"
            className={field}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            autoFocus={!!initial?.src}
          />
          {!alt.trim() && (
            <p role="status" className="mt-1 text-sm text-amber-300">
              No alt text. The image will be inaccessible to people using screen
              readers. You can still insert it.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="img-cap" className="mb-1 block text-sm">
            Caption (optional)
          </label>
          <input
            id="img-cap"
            className={field}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm hover:bg-gray-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!src || !srcOk || busy}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Save image"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

async function uploadImageFile(file) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/upload-image", {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "Upload failed");
  const url =
    data?.imageUrls?.large || data?.imageUrls?.medium || data?.imageUrls?.small;
  if (!url) throw new Error("Upload returned no address");
  return url;
}

export default function RichEditor({
  initialDoc,
  language,
  onChange,
  onEditor,
  disabled = false,
  className = "",
}) {
  const [dialog, setDialog] = useState(null); // { type: 'link' | 'image', edit? }
  const [fullscreen, setFullscreen] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [stats, setStats] = useState({ wordCount: 0, readTime: 0 });
  const [outline, setOutline] = useState([]);
  const [problems, setProblems] = useState([]);
  const [floating, setFloating] = useState(null);
  const [slash, setSlash] = useState(null); // { query, top, left }
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef({ items: [], open: false });
  const slashIndexRef = useRef(0);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () => buildExtensions({ placeholder: "Start writing…" }),
    [],
  );

  const filteredSlash = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.toLowerCase();
    return SLASH_ITEMS.filter(
      (i) => !q || i.label.toLowerCase().includes(q) || i.id.includes(q),
    );
  }, [slash]);
  useEffect(() => {
    slashRef.current = {
      items: filteredSlash,
      open: !!slash && filteredSlash.length > 0,
    };
    slashIndexRef.current = slashIndex;
  });

  const recompute = useCallback((editor) => {
    const json = canonicalizeDoc(editor.getJSON());
    const v = validateDoc(json);
    const a = analyzeWriting({ contentFormat: "tiptap", content: json });
    // Derived panels and the parent's copy are low priority. Marking them as a transition keeps a burst of
    // keystrokes (paste, speech input, a fast typist) from stacking synchronous renders until React aborts
    // with "Maximum update depth exceeded", which silently dropped the last characters.
    startTransition(() => {
      setStats({ wordCount: a.wordCount, readTime: a.readTime });
      setOutline(docHeadings(json));
      setProblems(v.ok ? [] : v.errors);
      onChangeRef.current?.({
        doc: json,
        valid: v.ok,
        errors: v.errors,
        stats: a,
      });
    });
  }, []);

  const updateOverlays = useCallback((editor) => {
    const { state, view } = editor;
    const { from, to, empty, $from } = state.selection;
    if (view.composing) {
      setFloating(null);
      setSlash(null);
      return;
    } // never disturb an IME composition
    // Not constructor.name: class names are minified in production builds, which hid this toolbar.
    if (!empty && !state.selection.node && $from.parent.inlineContent) {
      const a = view.coordsAtPos(from),
        b = view.coordsAtPos(to);
      setFloating({
        top: Math.max(8, Math.min(a.top, b.top) - 48),
        left: Math.max(8, (a.left + b.right) / 2 - 130),
      });
    } else setFloating(null);
    const parent = $from.parent;
    if (
      empty &&
      parent.type.name === "paragraph" &&
      /^\/[\p{L}\p{N}]*$/u.test(parent.textContent) &&
      $from.parentOffset === parent.content.size
    ) {
      const c = view.coordsAtPos(from);
      const query = parent.textContent.slice(1);
      setSlash((prev) => {
        if (prev?.query !== query) setSlashIndex(0);
        return { query, top: c.bottom + 6, left: c.left };
      });
    } else setSlash(null);
  }, []);

  const runSlash = useCallback((item, editor) => {
    const { $from } = editor.state.selection;
    editor
      .chain()
      .focus()
      .deleteRange({ from: $from.start(), to: $from.end() })
      .run();
    if (item.id === "image") setDialog({ type: "image" });
    else item.run(editor);
  }, []);

  const editor = useEditor({
    extensions,
    content: initialDoc && initialDoc.type === "doc" ? initialDoc : EMPTY_DOC,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "rich-editor-content max-w-none min-h-[60vh] focus:outline-none px-4 py-3 text-gray-100",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Writing content",
        ...(language === "Tamil" ? { lang: "ta" } : {}),
        spellcheck: "true",
      },
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false; // IME safe
        const s = slashRef.current;
        if (s.open) {
          if (event.key === "ArrowDown") {
            setSlashIndex((i) => (i + 1) % s.items.length);
            return true;
          }
          if (event.key === "ArrowUp") {
            setSlashIndex((i) => (i - 1 + s.items.length) % s.items.length);
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            const item = s.items[slashIndexRef.current] || s.items[0];
            if (item && editorRef.current) {
              runSlash(item, editorRef.current);
              return true;
            }
          }
          if (event.key === "Escape") {
            setSlash(null);
            return true;
          }
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          setDialog({ type: "link" });
          return true;
        }
        return false;
      },
      handleDoubleClickOn(view, pos, node) {
        if (node.type.name === "image") {
          setDialog({ type: "image", edit: true });
          return true;
        }
        return false;
      },
      // Pasted files are ignored: images go through the upload dialog so they are validated.
      handlePaste: (view, event) => Boolean(event.clipboardData?.files?.length),
    },
    onUpdate: ({ editor: ed }) => {
      recompute(ed);
      updateOverlays(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => updateOverlays(ed),
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
      recompute(ed);
      onEditor?.(ed);
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e) => e.key === "Escape" && !dialog && setFullscreen(false);
    window.addEventListener("keydown", h);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", h);
    };
  }, [fullscreen, dialog]);

  useEffect(() => {
    const hide = () => setFloating(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  if (!editor)
    return (
      <div
        className="min-h-[60vh] animate-pulse rounded bg-gray-800/50"
        aria-busy="true"
      />
    );

  const active = (n, a) => editor.isActive(n, a);
  const imageSel = editor.isActive("image")
    ? editor.getAttributes("image")
    : null;
  const linkHref = editor.isActive("link")
    ? editor.getAttributes("link").href
    : "";

  const jumpToHeading = (index) => {
    let i = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        if (i++ === index) {
          editor
            .chain()
            .focus()
            .setTextSelection(pos + 1)
            .scrollIntoView()
            .run();
          return false;
        }
      }
      return true;
    });
  };

  const inlineTools = (
    <>
      <Btn
        label="Bold"
        shortcut="Ctrl/Cmd+B"
        active={active("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={disabled}
      >
        <b>B</b>
      </Btn>
      <Btn
        label="Italic"
        shortcut="Ctrl/Cmd+I"
        active={active("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={disabled}
      >
        <i>I</i>
      </Btn>
      <Btn
        label="Strikethrough"
        shortcut="Ctrl/Cmd+Shift+S"
        active={active("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={disabled}
      >
        <s>S</s>
      </Btn>
      <Btn
        label="Inline code"
        shortcut="Ctrl/Cmd+E"
        active={active("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={disabled}
      >
        {"</>"}
      </Btn>
      <Btn
        label="Link"
        shortcut="Ctrl/Cmd+K"
        active={active("link")}
        onClick={() => setDialog({ type: "link" })}
        disabled={disabled}
      >
        Link
      </Btn>
    </>
  );

  return (
    <div
      className={`${fullscreen ? "fixed inset-0 z-50 flex flex-col bg-gray-900" : "relative rounded-lg border border-gray-700 bg-gray-900"} ${className}`}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-gray-700 bg-gray-800 p-1.5"
      >
        {inlineTools}
        <span className="mx-1 h-6 w-px bg-gray-600" aria-hidden="true" />
        <Btn
          label="Heading 2"
          active={active("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={disabled}
        >
          H2
        </Btn>
        <Btn
          label="Heading 3"
          active={active("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          disabled={disabled}
        >
          H3
        </Btn>
        <Btn
          label="Bulleted list"
          active={active("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
        >
          • List
        </Btn>
        <Btn
          label="Numbered list"
          active={active("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
        >
          1. List
        </Btn>
        <Btn
          label="Quote"
          active={active("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
        >
          “ ”
        </Btn>
        <Btn
          label="Poem block"
          active={active("poem")}
          onClick={() => editor.chain().focus().togglePoem().run()}
          disabled={disabled}
        >
          Poem
        </Btn>
        {active("poem") && (
          <>
            <Btn
              label="Align poem left"
              active={editor.getAttributes("poem").align !== "center"}
              onClick={() => editor.chain().focus().setPoemAlign("left").run()}
              disabled={disabled}
            >
              ⇤
            </Btn>
            <Btn
              label="Center poem"
              active={editor.getAttributes("poem").align === "center"}
              onClick={() =>
                editor.chain().focus().setPoemAlign("center").run()
              }
              disabled={disabled}
            >
              ↔
            </Btn>
          </>
        )}
        <Btn
          label="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          disabled={disabled}
        >
          ―
        </Btn>
        <Btn
          label={imageSel ? "Edit image details" : "Insert image"}
          onClick={() => setDialog({ type: "image", edit: !!imageSel })}
          disabled={disabled}
        >
          Image
        </Btn>
        <span className="mx-1 h-6 w-px bg-gray-600" aria-hidden="true" />
        <Btn
          label="Undo"
          shortcut="Ctrl/Cmd+Z"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !editor.can().undo()}
        >
          ↶
        </Btn>
        <Btn
          label="Redo"
          shortcut="Ctrl/Cmd+Shift+Z"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !editor.can().redo()}
        >
          ↷
        </Btn>
        <span className="ml-auto flex items-center gap-1">
          <Btn
            label={showOutline ? "Hide outline" : "Show outline"}
            active={showOutline}
            onClick={() => setShowOutline((v) => !v)}
          >
            Outline
          </Btn>
          <Btn
            label={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            active={fullscreen}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? "Exit" : "Full"}
          </Btn>
        </span>
      </div>

      <div
        className={`flex min-h-0 flex-1 ${fullscreen ? "overflow-hidden" : ""}`}
      >
        <div
          className={`min-w-0 flex-1 ${fullscreen ? "overflow-y-auto" : ""}`}
        >
          <div className={fullscreen ? "mx-auto max-w-3xl" : ""}>
            <EditorContent editor={editor} />
          </div>
        </div>
        {showOutline && (
          <nav
            aria-label="Document outline"
            className="hidden w-56 shrink-0 overflow-y-auto border-l border-gray-700 p-3 text-sm md:block"
          >
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Outline
            </h3>
            {outline.length === 0 ? (
              <p className="text-gray-400">Headings you add appear here.</p>
            ) : (
              <ul className="space-y-1">
                {outline.map((h, i) => (
                  <li
                    key={i}
                    style={{
                      paddingLeft: `${(Math.max(1, h.level) - 1) * 10}px`,
                    }}
                  >
                    <button
                      type="button"
                      className="w-full truncate text-left text-gray-300 hover:text-white"
                      onClick={() => jumpToHeading(i)}
                    >
                      {h.text || "(empty heading)"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-700 px-3 py-1.5 text-xs text-gray-400"
        aria-live="polite"
      >
        <span>
          {stats.wordCount} {stats.wordCount === 1 ? "word" : "words"}
        </span>
        <span>
          {stats.wordCount === 0
            ? "—"
            : stats.readTime <= 1
              ? "under 1 min read"
              : `${stats.readTime} min read`}
        </span>
        {problems.length > 0 && (
          <span role="alert" className="text-red-300">
            Document problem: {problems[0]}
          </span>
        )}
      </div>

      {floating && !disabled && (
        <div
          role="toolbar"
          aria-label="Selection formatting"
          style={{ position: "fixed", top: floating.top, left: floating.left }}
          className="z-[60] flex gap-1 rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg"
        >
          {inlineTools}
        </div>
      )}

      {slash && filteredSlash.length > 0 && (
        <ul
          role="listbox"
          aria-label="Insert block"
          style={{ position: "fixed", top: slash.top, left: slash.left }}
          className="z-[60] max-h-72 w-60 overflow-y-auto rounded-md border border-gray-600 bg-gray-800 py-1 shadow-lg"
        >
          {filteredSlash.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === slashIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runSlash(item, editor)}
                className={`flex w-full flex-col px-3 py-1.5 text-left text-sm ${i === slashIndex ? "bg-blue-600 text-white" : "text-gray-200 hover:bg-gray-700"}`}
              >
                <span>{item.label}</span>
                {item.hint && (
                  <span className="text-xs opacity-70">{item.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog?.type === "link" && (
        <LinkDialog
          initial={linkHref}
          onClose={() => {
            setDialog(null);
            editor.commands.focus();
          }}
          onRemove={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            setDialog(null);
          }}
          onSubmit={(href) => {
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href })
              .run();
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "image" && (
        <ImageDialog
          initial={dialog.edit ? imageSel : null}
          onUpload={uploadImageFile}
          onClose={() => {
            setDialog(null);
            editor.commands.focus();
          }}
          onSubmit={(attrs) => {
            if (dialog.edit)
              editor.chain().focus().updateAttributes("image", attrs).run();
            else editor.chain().focus().setImage(attrs).run();
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
