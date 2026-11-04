import { blogExtensions as sharedExtensions } from "@shared/blogEditorExtensions";
import { safeMediaUrl } from "@shared/blog";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import { markdownTableReplacements } from "@/lib/blogMarkdownTables";

function convertMarkdownTables(editor: Editor) {
  if (!editor.isEditable) {
    return;
  }
  const replacements = markdownTableReplacements(editor.state.doc.content, editor.schema);
  if (!replacements.length) {
    return;
  }
  const transaction = editor.state.tr;
  for (const replacement of replacements.reverse()) {
    transaction.replaceWith(replacement.from, replacement.to, replacement.table);
  }
  editor.view.dispatch(transaction);
}

const MarkdownTables = Extension.create({
  name: "blogMarkdownTables",
  onCreate() {
    convertMarkdownTables(this.editor);
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, state) {
          if (!editor.isEditable || !transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const replacements = markdownTableReplacements(state.doc.content, state.schema);
          if (!replacements.length) {
            return null;
          }
          const transaction = state.tr;
          for (const replacement of replacements.reverse()) {
            transaction.replaceWith(replacement.from, replacement.to, replacement.table);
          }
          return transaction;
        },
      }),
    ];
  },
});

export function blogExtensions(collaborative = false) {
  return [...sharedExtensions(collaborative), MarkdownTables].map((extension) => {
    if (extension.name === "image") {
      return extension.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            caption: {
              default: "",
              parseHTML: (element: HTMLElement) =>
                element.closest("figure")?.querySelector("figcaption")?.textContent || "",
            },
            alignment: {
              default: "center",
              parseHTML: (element: HTMLElement) =>
                element.closest("figure")?.getAttribute("data-alignment") || "center",
            },
          };
        },
      });
    }
    if (extension.name === "video") {
      return extension.extend({
        addAttributes() {
          return {
            src: { default: "", parseHTML: (element: HTMLElement) => element.getAttribute("src") },
            embed: {
              default: false,
              parseHTML: (element: HTMLElement) => element.tagName === "IFRAME",
            },
          };
        },
        parseHTML() {
          return [
            {
              tag: "video[src]",
              getAttrs: (element: HTMLElement) => {
                if (!safeMediaUrl(element.getAttribute("src") || "")) {
                  return false;
                }
                return {};
              },
            },
          ];
        },
      });
    }
    return extension;
  });
}
