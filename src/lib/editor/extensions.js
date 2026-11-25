// Tiptap extension set. It must produce exactly the node and mark set of the shared contract
// (NODE_SPEC / MARK_SPEC); tests/editor/extensions.test.mjs enforces that. Nothing else is enabled.
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { isSafeUrl } from "./../content-contract/document.js";

/** A poem is a block of stanzas (paragraphs); lines inside a stanza are hard breaks. */
export const Poem = Node.create({
  name: "poem",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return {
      align: {
        default: "left",
        parseHTML: (el) => (el.getAttribute("data-align") === "center" ? "center" : "left"),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-poem]" }];
  },
  renderHTML({ node }) {
    return ["div", { "data-poem": "", class: "poem", "data-align": node.attrs.align }, 0];
  },
  addCommands() {
    return {
      togglePoem:
        () =>
        ({ commands, editor }) =>
          editor.isActive("poem") ? commands.lift("poem") : commands.wrapIn("poem"),
      setPoemAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes("poem", { align: align === "center" ? "center" : "left" }),
    };
  },
});

export function buildExtensions({ placeholder = "Start writing…", forSchema = false } = {}) {
  const exts = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      blockquote: false,
      listItem: false,
      underline: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeUrl(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
    }),
    // Contract: blockquote and list items hold paragraphs and lists only.
    ...constrained(),
    Image.configure({ inline: false, allowBase64: false }),
    Poem,
  ];
  if (!forSchema) {
    exts.push(Placeholder.configure({ placeholder }), CharacterCount);
  }
  return exts;
}

import Blockquote from "@tiptap/extension-blockquote";
import ListItem from "@tiptap/extension-list-item";
function constrained() {
  return [
    Blockquote.extend({ content: "(paragraph | bulletList | orderedList)+" }),
    ListItem.extend({ content: "paragraph (paragraph | bulletList | orderedList)*" }),
  ];
}
export { mergeAttributes };
