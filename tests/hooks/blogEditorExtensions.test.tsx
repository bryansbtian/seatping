import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blogExtensions } from "../../shared/blogEditorExtensions.js";
import { blogExtensions as browserExtensions } from "../../src/components/blog/extensions.js";
import { BLOG_ROOTS, createBlogDocument } from "../../shared/blogCollaboration.js";
import { newBlogFields } from "../../shared/blog.js";

const editors: Editor[] = [];

function editor(content: string | Record<string, unknown>, collaborative = false) {
  const instance = new Editor({ extensions: blogExtensions(collaborative), content });
  editors.push(instance);
  return instance;
}

afterEach(() => {
  for (const instance of editors.splice(0)) {
    instance.destroy();
  }
});

describe("Blog Editor Extensions", () => {
  it("converts existing Markdown tables when an editable article opens", async () => {
    const instance = new Editor({
      extensions: browserExtensions(),
      content:
        "<p>Before.</p><p>| Feature | SeatPing |</p><p>|---|---|</p><p>| Check-in | Self-check-in |</p><p>After.</p>",
    });
    editors.push(instance);
    await vi.waitFor(() => expect(instance.isInitialized).toBe(true));
    expect(instance.getJSON().content?.map((node) => node.type)).toEqual([
      "paragraph",
      "table",
      "paragraph",
    ]);
    expect(instance.getHTML()).toContain("<th");
    expect(instance.getText()).toContain("Self-check-in");
  });

  it("leaves read-only articles unchanged and converts only after an editable document change", async () => {
    const instance = new Editor({
      extensions: browserExtensions(),
      editable: false,
      content: "<p>| Feature | SeatPing |</p><p>|---|---|</p><p>| Check-in | Self-check-in |</p>",
    });
    editors.push(instance);
    await vi.waitFor(() => expect(instance.isInitialized).toBe(true));
    instance.commands.insertContentAt(instance.state.doc.content.size, "<p>After.</p>");
    expect(instance.getJSON().content?.some((node) => node.type === "table")).toBe(false);
    instance.setEditable(true);
    instance.commands.setTextSelection(1);
    expect(instance.getJSON().content?.some((node) => node.type === "table")).toBe(false);
    instance.commands.insertContentAt(instance.state.doc.content.size, "<p>Next.</p>");
    expect(instance.getJSON().content?.map((node) => node.type)).toEqual([
      "table",
      "paragraph",
      "paragraph",
    ]);
  });

  it("keeps normal editing and selection updates unchanged", async () => {
    const instance = new Editor({ extensions: browserExtensions(), content: "<p>Guest Guide</p>" });
    editors.push(instance);
    await vi.waitFor(() => expect(instance.isInitialized).toBe(true));
    instance.commands.setTextSelection(1);
    instance.commands.insertContent("A ");
    expect(instance.getJSON().content).toHaveLength(1);
    expect(instance.getText()).toBe("A Guest Guide");
  });

  it("keeps paragraph splits within the shared document roots accepted by the server", () => {
    const document = createBlogDocument({
      ...newBlogFields(),
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
      },
    });
    const instance = new Editor({
      extensions: [...blogExtensions(true), Collaboration.configure({ document })],
    });
    editors.push(instance);
    try {
      instance.commands.setTextSelection(6);
      expect(instance.commands.splitBlock()).toBe(true);
      expect(instance.getJSON().content).toHaveLength(2);
      expect([...document.share.keys()].filter((key) => !BLOG_ROOTS.includes(key))).toEqual([]);
    } finally {
      instance.destroy();
      editors.pop();
      document.destroy();
    }
  });

  it("renders image captions, alignment, and safe media sources", () => {
    const instance = editor({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://images.example.test/cover.jpg",
            alt: "Restaurant",
            caption: "Our Dining Room",
            alignment: "left",
          },
        },
      ],
    });
    const container = document.createElement("div");
    container.innerHTML = instance.getHTML();
    expect(container.querySelector("figure")?.dataset.alignment).toBe("left");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://images.example.test/cover.jpg",
    );
    expect(container.querySelector("img")?.alt).toBe("Restaurant");
    expect(container.querySelector("figcaption")?.textContent).toBe("Our Dining Room");
  });

  it.each(["javascript:alert(1)", null])("clears unsafe image sources: %s", (src) => {
    const instance = editor({ type: "doc", content: [{ type: "image", attrs: { src } }] });
    const container = document.createElement("div");
    container.innerHTML = instance.getHTML();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("");
    expect(container.querySelector("figcaption")?.textContent).toBe("");
    expect(container.querySelector("figure")?.dataset.alignment).toBe("center");
  });

  it("renders supported embeds with a restricted iframe", () => {
    const src = "https://www.youtube-nocookie.com/embed/abcdefghijk";
    const instance = editor({
      type: "doc",
      content: [{ type: "video", attrs: { src, embed: true } }],
    });
    const container = document.createElement("div");
    container.innerHTML = instance.getHTML();
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(src);
    expect(frame?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-presentation",
    );
    expect(frame?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(frame?.getAttribute("title")).toBe("Embedded Video");
  });

  it.each([
    {
      src: "https://media.example.test/video.mp4",
      embed: false,
      expected: "https://media.example.test/video.mp4",
    },
    {
      src: "https://media.example.test/video.mp4",
      embed: true,
      expected: "https://media.example.test/video.mp4",
    },
    { src: "javascript:alert(1)", embed: false, expected: "" },
    { src: null, embed: false, expected: "" },
  ])("renders media safely for $src with embed=$embed", ({ src, embed, expected }) => {
    const instance = editor({ type: "doc", content: [{ type: "video", attrs: { src, embed } }] });
    const container = document.createElement("div");
    container.innerHTML = instance.getHTML();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("video")?.getAttribute("src")).toBe(expected);
    expect(container.querySelector("video")?.hasAttribute("controls")).toBe(true);
  });

  it("parses video and callout blocks and preserves their content", () => {
    const instance = editor(
      '<aside data-callout=""><p>Remember This</p></aside><video src="https://media.example.test/video.mp4"></video>',
    );
    expect(instance.getJSON().content?.map((node) => node.type)).toEqual(["callout", "video"]);
    expect(instance.getHTML()).toContain('<aside data-callout=""><p>Remember This</p></aside>');
    expect(instance.getHTML()).toContain('preload="metadata"');
  });

  it("validates editor links and disables local undo for collaborative documents", () => {
    const instance = editor("<p>Article</p>", true);
    expect(
      instance.extensionManager.extensions.some((extension) => extension.name === "undoRedo"),
    ).toBe(false);
    instance.commands.selectAll();
    expect(instance.commands.setLink({ href: "javascript:alert(1)" })).toBe(false);
    expect(instance.commands.setLink({ href: "https://example.test/article" })).toBe(true);
    expect(instance.getHTML()).toContain('rel="noopener noreferrer nofollow"');
    expect(instance.getHTML()).toContain('target="_blank"');
    expect(
      editor("<p>Article</p>").extensionManager.extensions.some(
        (extension) => extension.name === "undoRedo",
      ),
    ).toBe(true);
  });
});
