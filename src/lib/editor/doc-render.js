// Structured document -> a small element tree, then to an HTML string or React elements.
// This is the single "as published" definition used by the admin preview. It escapes everything and
// only emits tags from a fixed list, so a hostile document can never produce script or event handlers.
import { isSafeUrl, validateDoc } from "../content-contract/document.js";

const MARK_ORDER = ["link", "bold", "italic", "strike", "code"];
const MARK_TAG = { bold: "strong", italic: "em", strike: "s", code: "code" };

const el = (tag, attrs, children) => ({
  tag,
  attrs: attrs || {},
  children: children || [],
});
const txt = (text) => ({ text });

function renderInline(nodes) {
  return (nodes || []).map((n) => {
    if (n.type === "hardBreak") return el("br");
    let out = txt(n.text ?? "");
    const marks = [...(n.marks || [])].sort(
      (a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type),
    );
    for (const m of marks) {
      if (m.type === "link") {
        if (!isSafeUrl(m.attrs?.href)) continue;
        out = el(
          "a",
          {
            href: m.attrs.href,
            rel: "noopener noreferrer nofollow",
            ...(m.attrs.title ? { title: m.attrs.title } : {}),
          },
          [out],
        );
      } else if (MARK_TAG[m.type]) out = el(MARK_TAG[m.type], {}, [out]);
    }
    return out;
  });
}

function renderBlock(n) {
  const kids = () => (n.content || []).map(renderBlock);
  switch (n.type) {
    case "paragraph":
      return el(
        "p",
        n.attrs?.textAlign ? { "data-align": n.attrs.textAlign } : {},
        renderInline(n.content),
      );
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 2));
      return el(`h${level}`, {}, renderInline(n.content));
    }
    case "blockquote":
      return el("blockquote", {}, kids());
    case "bulletList":
      return el("ul", {}, kids());
    case "orderedList":
      return el(
        "ol",
        n.attrs?.start && n.attrs.start !== 1
          ? { start: String(n.attrs.start) }
          : {},
        kids(),
      );
    case "listItem":
      return el("li", {}, kids());
    case "horizontalRule":
      return el("hr");
    case "codeBlock":
      return el("pre", {}, [
        el(
          "code",
          n.attrs?.language && /^[\w+#.-]{1,30}$/.test(n.attrs.language)
            ? { class: `language-${n.attrs.language}` }
            : {},
          renderInline(n.content),
        ),
      ]);
    case "image": {
      if (!isSafeUrl(n.attrs?.src))
        return el("p", {}, [txt("[image removed: unsafe address]")]);
      const img = el("img", {
        src: n.attrs.src,
        alt: n.attrs.alt || "",
        loading: "lazy",
      });
      return el(
        "figure",
        {},
        n.attrs.title
          ? [img, el("figcaption", {}, [txt(n.attrs.title)])]
          : [img],
      );
    }
    case "poem":
      return el(
        "div",
        {
          class: "poem",
          "data-poem": "",
          "data-align": n.attrs?.align === "center" ? "center" : "left",
        },
        kids(),
      );
    default:
      return el("p", {}, [
        txt(`[unsupported: ${String(n.type).slice(0, 30)}]`),
      ]);
  }
}

/** Returns { ok, errors, tree } and never throws; an invalid document renders nothing. */
export function docToTree(doc) {
  const v = validateDoc(doc);
  if (!v.ok) return { ok: false, errors: v.errors, tree: [] };
  return { ok: true, errors: [], tree: (doc.content || []).map(renderBlock) };
}

const VOID = new Set(["br", "hr", "img"]);
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function treeToHtml(nodes) {
  return nodes
    .map((n) => {
      if ("text" in n) return esc(n.text);
      const attrs = Object.entries(n.attrs)
        .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${esc(v)}"`))
        .join("");
      return VOID.has(n.tag)
        ? `<${n.tag}${attrs}>`
        : `<${n.tag}${attrs}>${treeToHtml(n.children)}</${n.tag}>`;
    })
    .join("");
}

export function docToHtml(doc) {
  const { ok, errors, tree } = docToTree(doc);
  return { ok, errors, html: treeToHtml(tree) };
}

/** React renderer over the same tree (client preview). `h` is React.createElement. */
export function treeToReact(nodes, h, keyPrefix = "n") {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    if ("text" in n) return n.text;
    const props = { key };
    for (const [k, v] of Object.entries(n.attrs))
      props[k === "class" ? "className" : k] = v === "" ? true : v;
    return VOID.has(n.tag)
      ? h(n.tag, props)
      : h(n.tag, props, ...treeToReact(n.children, h, `${key}.`));
  });
}
