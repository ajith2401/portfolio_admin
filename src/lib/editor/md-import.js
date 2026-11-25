// Legacy Markdown -> structured document (mdast based). Pure and framework-free so it runs in the
// browser (conversion preview) and on the server (tests, audit script). It never executes or trusts
// the input: unsafe links/images are dropped, raw HTML is kept only as literal text, and everything
// that cannot be represented is reported in `warnings`.
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { isSafeUrl } from "../content-contract/document.js";

export const MAX_IMPORT_CHARS = 2_000_000;
const TEXT_BLOCKS = ["paragraph", "bulletList", "orderedList"];

const short = (s, n = 40) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .slice(0, n);

export const LINE_BREAK_MODES = Object.freeze(["auto", "keep", "join"]);

const TERMINAL = /[.!?…।"'”’)\]]\s*$/u;
const gcount = (t) => [...t].length;

/**
 * Decide what single line breaks inside one Markdown paragraph mean.
 *  - "keep": verse-like (short lines, most of which do not end a sentence) -> hard breaks
 *  - "join": an ordinary wrapped paragraph -> spaces (CommonMark)
 * Joins are always reported, so a person can choose "keep line breaks" for the whole writing.
 */
export function classifyParagraphBreaks(text) {
  const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return "join";
  const lens = lines.map(gcount);
  const max = Math.max(...lens);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const open = lines.slice(0, -1).filter((l) => !TERMINAL.test(l)).length;
  if (max <= 55 && avg <= 40 && open / (lines.length - 1) >= 0.5) return "keep";
  return "join";
}

export function markdownToDoc(markdown, { category, lineBreaks = "auto" } = {}) {
  const warnings = [];
  const seen = new Set();
  const warn = (msg) => {
    if (!seen.has(msg)) {
      seen.add(msg);
      warnings.push(msg);
    }
  };
  const poem = category === "poem";
  const mode = LINE_BREAK_MODES.includes(lineBreaks) ? lineBreaks : "auto";
  let joinedParagraphs = 0;
  let keptParagraphs = 0;
  const ctx = { keep: false };
  let source = String(markdown ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n");
  if (source.length > MAX_IMPORT_CHARS) {
    warn(
      `The text is longer than ${MAX_IMPORT_CHARS} characters; only the first part was imported.`,
    );
    source = source.slice(0, MAX_IMPORT_CHARS);
  }
  const tree = fromMarkdown(source, {
    extensions: [gfmStrikethrough()],
    mdastExtensions: [gfmStrikethroughFromMarkdown()],
  });

  const text = (value, marks) =>
    value
      ? [{ type: "text", text: value, ...(marks.length ? { marks } : {}) }]
      : [];

  const inline = (nodes, marks = []) =>
    (nodes || []).flatMap((n) => {
      switch (n.type) {
        case "text": {
          // Soft line breaks: poems keep them as hard breaks; prose follows CommonMark (a space).
          const parts = n.value.split("\n");
          return parts.flatMap((p, i) => [
            ...text(p, marks),
            ...(i < parts.length - 1
              ? poem || ctx.keep
                ? [{ type: "hardBreak" }]
                : text(" ", marks)
              : []),
          ]);
        }
        case "break":
          return [{ type: "hardBreak" }];
        case "strong":
          return inline(n.children, [...marks, { type: "bold" }]);
        case "emphasis":
          return inline(n.children, [...marks, { type: "italic" }]);
        case "delete":
          return inline(n.children, [...marks, { type: "strike" }]);
        case "inlineCode":
          return text(n.value, [...marks, { type: "code" }]);
        case "link":
          if (!isSafeUrl(n.url)) {
            warn(`Unsafe link removed (its text was kept): ${short(n.url)}`);
            return inline(n.children, marks);
          }
          return inline(n.children, [
            ...marks,
            {
              type: "link",
              attrs: { href: n.url, ...(n.title ? { title: n.title } : {}) },
            },
          ]);
        case "image":
          return []; // lifted to block level by the paragraph handler
        case "html":
          warn(
            `Raw HTML is not supported and was kept as plain text: ${short(n.value)}`,
          );
          return text(n.value, marks);
        default:
          warn(
            `Unsupported inline element "${n.type}" was flattened to plain text.`,
          );
          return n.children
            ? inline(n.children, marks)
            : text(n.value || "", marks);
      }
    });

  const imageNode = (n) => {
    if (!isSafeUrl(n.url)) {
      warn(`Unsafe image removed: ${short(n.url)}`);
      return null;
    }
    if (!n.alt)
      warn("An image has no alt text; add a description in the editor.");
    return {
      type: "image",
      attrs: {
        src: n.url,
        alt: n.alt || "",
        ...(n.title ? { title: n.title } : {}),
      },
    };
  };

  const rawText = (nodes) =>
    (nodes || [])
      .map((c) => (c.type === "text" ? c.value : c.children ? rawText(c.children) : c.type === "break" ? "\n" : "x"))
      .join("");
  const softBreaks = (nodes) =>
    (nodes || []).reduce(
      (a, c) => a + (c.type === "text" ? (c.value.match(/\n/g) || []).length : softBreaks(c.children)),
      0,
    );
  const para = (n) => {
    const out = [];
    ctx.keep = false;
    if (!poem && softBreaks(n.children) > 0) {
      ctx.keep = mode === "keep" || (mode === "auto" && classifyParagraphBreaks(rawText(n.children)) === "keep");
      if (ctx.keep) keptParagraphs += 1;
      else joinedParagraphs += 1;
    }
    const images = n.children.filter((c) => c.type === "image");
    const rest = n.children.filter((c) => c.type !== "image");
    const content = inline(rest);
    if (content.length) out.push({ type: "paragraph", content });
    images.forEach((im) => {
      const x = imageNode(im);
      if (x) out.push(x);
    });
    return out;
  };

  // Containers (quote / list item) only hold paragraphs and lists. Anything else is converted, never lost silently.
  const keepContainerBlocks = (blocks, where) =>
    blocks.flatMap((b) => {
      if (TEXT_BLOCKS.includes(b.type)) return [b];
      if (b.type === "blockquote") {
        warn(`A quote inside ${where} was merged into its parent.`);
        return b.content;
      }
      if (b.type === "heading") {
        warn(`A heading inside ${where} became a bold paragraph.`);
        return [
          {
            type: "paragraph",
            content: (b.content || []).map((c) => ({
              ...c,
              marks: [{ type: "bold" }, ...(c.marks || [])],
            })),
          },
        ];
      }
      if (b.type === "codeBlock") {
        warn(`A code block inside ${where} became a paragraph.`);
        return [{ type: "paragraph", content: b.content || [] }];
      }
      warn(
        `A ${b.type === "image" ? "picture" : "divider"} inside ${where} was removed; place it outside the ${where}.`,
      );
      return [];
    });

  const block = (n) => {
    switch (n.type) {
      case "paragraph":
        return para(n);
      case "heading":
        return [
          {
            type: "heading",
            attrs: { level: n.depth },
            content: inline(n.children),
          },
        ];
      case "blockquote": {
        const inner = keepContainerBlocks(
          (n.children || []).flatMap(block),
          "a quote",
        );
        return [
          {
            type: "blockquote",
            content: inner.length ? inner : [{ type: "paragraph" }],
          },
        ];
      }
      case "list":
        return [
          {
            type: n.ordered ? "orderedList" : "bulletList",
            ...(n.ordered && n.start && n.start !== 1
              ? { attrs: { start: n.start } }
              : {}),
            content: n.children.map((li) => {
              const inner = keepContainerBlocks(
                (li.children || []).flatMap(block),
                "a list item",
              );
              return {
                type: "listItem",
                content: inner.length ? inner : [{ type: "paragraph" }],
              };
            }),
          },
        ];
      case "thematicBreak":
        return [{ type: "horizontalRule" }];
      case "code":
        return [
          {
            type: "codeBlock",
            ...(n.lang ? { attrs: { language: n.lang } } : {}),
            content: text(n.value, []),
          },
        ];
      case "html":
        warn(
          `Raw HTML block is not supported and was kept as plain text: ${short(n.value)}`,
        );
        return [{ type: "paragraph", content: text(n.value, []) }];
      default:
        warn(`Unsupported block "${n.type}" was skipped.`);
        return [];
    }
  };

  let content = tree.children.flatMap(block);
  if (poem) {
    // Consecutive paragraphs (stanzas) become one poem block; headings/images stay outside it.
    const grouped = [];
    for (const b of content) {
      if (b.type === "paragraph") {
        const last = grouped[grouped.length - 1];
        if (last?.type === "poem") last.content.push(b);
        else grouped.push({ type: "poem", content: [b] });
      } else grouped.push(b);
    }
    content = grouped;
  }
  if (joinedParagraphs > 0)
    warn(
      `${joinedParagraphs} paragraph${joinedParagraphs === 1 ? " contains" : "s contain"} single line breaks that were joined into one line; check ${joinedParagraphs === 1 ? "it" : "them"} or choose "Keep line breaks".`,
    );
  if (keptParagraphs > 0 && mode === "auto")
    warn(
      `${keptParagraphs} paragraph${keptParagraphs === 1 ? " looks" : "s look"} like verse, so ${keptParagraphs === 1 ? "its" : "their"} line breaks were kept; check ${keptParagraphs === 1 ? "it" : "them"} or choose "Join wrapped lines".`,
    );
  if (!content.length) content = [{ type: "paragraph" }];
  return { doc: { type: "doc", content }, warnings };
}
