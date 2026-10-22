import { Extension, Node, mergeAttributes, textblockTypeInputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { safeBlogUrl, safeMediaUrl, videoEmbedUrl } from "@shared/blog";

const BlogImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: "",
        parseHTML: (element) =>
          element.closest("figure")?.querySelector("figcaption")?.textContent || "",
      },
      alignment: {
        default: "center",
        parseHTML: (element) =>
          element.closest("figure")?.getAttribute("data-alignment") || "center",
      },
    };
  },
  renderHTML({ node }) {
    const { src, alt, title, width, height, caption, alignment } = node.attrs;
    let safeSrc = "";
    if (typeof src === "string" && safeMediaUrl(src)) {
      safeSrc = src;
    }
    return [
      "figure",
      { "data-blog-image": "", "data-alignment": alignment },
      ["img", { src: safeSrc, alt, title, width, height }],
      ["figcaption", {}, String(caption || "")],
    ];
  },
});

const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "", parseHTML: (element) => element.getAttribute("src") },
      embed: { default: false, parseHTML: (element) => element.tagName === "IFRAME" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "video[src]",
        getAttrs: (element) => {
          if (!safeMediaUrl(element.getAttribute("src") || "")) {
            return false;
          }
          return {};
        },
      },
    ];
  },
  renderHTML({ node }) {
    const { src, embed } = node.attrs;
    if (embed && videoEmbedUrl(String(src)) === src) {
      return [
        "div",
        { "data-blog-video": "" },
        [
          "iframe",
          {
            src,
            title: "Embedded Video",
            loading: "lazy",
            allowfullscreen: "true",
            referrerpolicy: "strict-origin-when-cross-origin",
            sandbox: "allow-scripts allow-same-origin allow-presentation",
            allow: "fullscreen; picture-in-picture",
          },
        ],
      ];
    }
    let safeSrc = "";
    if (typeof src === "string" && safeMediaUrl(src)) {
      safeSrc = src;
    }
    return ["video", { src: safeSrc, controls: "", preload: "metadata" }];
  },
});
const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
});

const MarkdownBlocks = Extension.create({
  name: "blogMarkdownBlocks",
  addInputRules() {
    return [textblockTypeInputRule({ find: /^```$/, type: this.editor.schema.nodes.codeBlock })];
  },
});

export function blogExtensions() {
  return [
    MarkdownBlocks,
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => safeBlogUrl(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    BlogImage.configure({ allowBase64: false }),
    Video,
    Callout,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Placeholder.configure({
      placeholder: "Write your story. Type / for blocks, or use Markdown shortcuts…",
    }),
  ];
}
