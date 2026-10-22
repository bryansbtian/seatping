import { useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { blogExtensions } from "./extensions";
import UploadProgress from "./UploadProgress";
import {
  blogContentSchema,
  safeBlogUrl,
  safeMediaUrl,
  videoEmbedUrl,
  type BlogNode,
} from "@shared/blog";
import { uploadBlogMedia } from "@/lib/blogApi";
import { cn } from "@/lib/utils";
import "./blog.css";

type SlashState = { from: number; to: number; query: string; left: number; top: number };
type BlockAction = { label: string; description: string; run: (editor: Editor) => void };
type Props = {
  content: BlogNode;
  onChange?: (content: BlogNode) => void;
  readOnly?: boolean;
  onUploading?: (uploading: boolean) => void;
  onValidityChange?: (valid: boolean) => void;
};

export default function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  onUploading,
  onValidityChange,
}: Props) {
  const extensions = useMemo(blogExtensions, []);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [active, setActive] = useState(0);
  const [dialog, setDialog] = useState("");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [width, setWidth] = useState(800);
  const [alignment, setAlignment] = useState("center");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<{ items: BlockAction[]; slash: SlashState | null; active: number }>({
    items: [],
    slash: null,
    active: 0,
  });
  const insertRef = useRef<(files: File[], position?: number) => void>(() => {});
  const linkRef = useRef<() => void>(() => {});
  const updateSlash = (editor: Editor) => {
    const { $from, empty } = editor.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, "", "");
    const match = before.match(/^\/([\w ]*)$/);
    if (!empty || !match || $from.parent.type.name !== "paragraph") {
      setSlash(null);
      return;
    }
    const coords = editor.view.coordsAtPos($from.pos);
    setSlash({
      from: $from.pos - match[0].length,
      to: $from.pos,
      query: match[1].toLowerCase(),
      left: Math.min(coords.left, Math.max(8, window.innerWidth - 300)),
      top: Math.min(coords.bottom + 8, Math.max(8, window.innerHeight - 300)),
    });
    setActive(0);
  };
  const editor = useEditor({
    extensions,
    content,
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "blog-content outline-none",
        role: "textbox",
        "aria-label": "Article Body",
        "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) {
          insertRef.current(files);
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!moved && files.length) {
          event.preventDefault();
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          insertRef.current(files, position);
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          linkRef.current();
          return true;
        }
        const menu = menuRef.current;
        if (!menu.slash) {
          return false;
        }
        if (event.key === "Escape") {
          setSlash(null);
          return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          let next = menu.active + 1;
          if (event.key === "ArrowUp") {
            next = menu.active - 1;
          }
          setActive((next + menu.items.length) % Math.max(1, menu.items.length));
          return true;
        }
        if (event.key === "Enter" && menu.items[menu.active]) {
          event.preventDefault();
          choose(menu.items[menu.active]);
          return true;
        }
        return false;
      },
      transformPastedHTML: (html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        for (const element of doc.querySelectorAll("script,style,iframe,object,embed,svg,form")) {
          element.remove();
        }
        for (const element of doc.querySelectorAll("*")) {
          for (const attr of Array.from(element.attributes)) {
            if (attr.name.startsWith("on") || ["srcdoc", "id"].includes(attr.name)) {
              element.removeAttribute(attr.name);
            }
          }
          if (element.hasAttribute("href") && !safeBlogUrl(element.getAttribute("href") || "")) {
            element.removeAttribute("href");
          }
          if (element.hasAttribute("src") && !safeMediaUrl(element.getAttribute("src") || "")) {
            element.remove();
          }
        }
        return doc.body.innerHTML;
      },
    },
    onUpdate: ({ editor }) => {
      const result = blogContentSchema.safeParse(editor.getJSON());
      onValidityChange?.(result.success);
      onChange?.(editor.getJSON() as BlogNode);
      if (result.success) {
        setError("");
      } else {
        setError(
          result.error.issues[0]?.message ||
            "Unsupported content. Undo the last change to continue saving.",
        );
      }
      updateSlash(editor);
    },
    onSelectionUpdate: ({ editor }) => updateSlash(editor),
  });

  function openDialog(kind: string) {
    setError("");
    setDialog(kind);
    setUrl("");
    if (kind === "Image") {
      setAlt("");
      setCaption("");
      setAlignment("center");
    }
    if (kind === "Link") {
      setUrl(String(editor?.getAttributes("link").href || ""));
    }
    if (kind === "Image Settings") {
      const attrs = editor?.getAttributes("image") ?? {};
      setAlt(String(attrs.alt || ""));
      setCaption(String(attrs.caption || ""));
      setAlignment(String(attrs.alignment || "center"));
      setWidth(Number(attrs.width || 800));
    }
  }
  linkRef.current = () => openDialog("Link");

  async function insertFiles(files: File[], position?: number) {
    if (!editor || progress !== null) {
      return;
    }
    setProgress(0);
    setError("");
    onUploading?.(true);
    if (position !== undefined) {
      editor.commands.setTextSelection(position);
    }
    const bookmark = editor.state.selection.getBookmark();
    const maps: import("@tiptap/pm/transform").StepMap[] = [];
    const track = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => {
      maps.push(...transaction.mapping.maps);
    };
    editor.on("transaction", track);
    try {
      const nodes = [];
      for (const file of files) {
        const src = await uploadBlogMedia(file, setProgress);
        if (file.type.startsWith("video/")) {
          nodes.push({ type: "video", attrs: { src, embed: false } });
        } else {
          nodes.push({ type: "image", attrs: { src, alt: "", caption: "", alignment: "center" } });
        }
      }
      if (!editor.isDestroyed) {
        let mapped = bookmark;
        for (const map of maps) {
          mapped = mapped.map(map);
        }
        const selection = mapped.resolve(editor.state.doc);
        editor.chain().focus().insertContentAt(selection.from, nodes).createParagraphNear().run();
        setDialog("");
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      editor.off("transaction", track);
      setProgress(null);
      onUploading?.(false);
    }
  }
  insertRef.current = (files, position) => {
    void insertFiles(files, position);
  };

  const blocks: BlockAction[] = [
    {
      label: "Text",
      description: "Plain paragraph",
      run: (e) => {
        e.chain().focus().setParagraph().run();
      },
    },
    ...([1, 2, 3] as const).map((level) => ({
      label: `Heading ${level}`,
      description: `${"#".repeat(level)} Space`,
      run: (e: Editor) => {
        e.chain().focus().toggleHeading({ level }).run();
      },
    })),
    {
      label: "Bullet List",
      description: "- Space",
      run: (e) => {
        e.chain().focus().toggleBulletList().run();
      },
    },
    {
      label: "Numbered List",
      description: "1. Space",
      run: (e) => {
        e.chain().focus().toggleOrderedList().run();
      },
    },
    {
      label: "Checklist",
      description: "[ ] Space",
      run: (e) => {
        e.chain().focus().toggleTaskList().run();
      },
    },
    {
      label: "Quote",
      description: "> Space",
      run: (e) => {
        e.chain().focus().toggleBlockquote().run();
      },
    },
    {
      label: "Callout",
      description: "Highlight a useful note",
      run: (e) => {
        e.chain()
          .focus()
          .insertContent({ type: "callout", content: [{ type: "paragraph" }] })
          .run();
      },
    },
    {
      label: "Code Block",
      description: "``` Space",
      run: (e) => {
        e.chain().focus().toggleCodeBlock().run();
      },
    },
    {
      label: "Divider",
      description: "---",
      run: (e) => {
        e.chain().focus().setHorizontalRule().run();
      },
    },
    {
      label: "Table",
      description: "Three columns with headers",
      run: (e) => {
        e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    { label: "Image", description: "Upload or insert an image", run: () => openDialog("Image") },
    { label: "Video", description: "Upload, YouTube, or Vimeo", run: () => openDialog("Video") },
  ];
  const items = blocks.filter((block) => block.label.toLowerCase().includes(slash?.query || ""));
  menuRef.current = { items, slash, active };
  function choose(block: BlockAction) {
    if (!editor) {
      return;
    }
    const current = menuRef.current.slash;
    if (current) {
      editor.chain().focus().deleteRange({ from: current.from, to: current.to }).run();
    }
    setSlash(null);
    block.run(editor);
  }
  function applyDialog() {
    if (!editor) {
      return;
    }
    if (dialog === "Link") {
      if (!url.trim()) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else if (safeBlogUrl(url.trim())) {
        if (editor.state.selection.empty && !editor.isActive("link")) {
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: url.trim(),
              marks: [{ type: "link", attrs: { href: url.trim() } }],
            })
            .run();
        } else {
          editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }
      } else {
        setError("Use an http, https, mailto, or tel URL.");
        return;
      }
    } else if (dialog === "Image Settings") {
      editor.chain().focus().updateAttributes("image", { alt, caption, width, alignment }).run();
    } else if (dialog === "Image") {
      if (!safeMediaUrl(url.trim())) {
        setError("Use a secure https image URL.");
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { src: url.trim(), alt, caption, alignment } })
        .createParagraphNear()
        .run();
    } else if (dialog === "Video") {
      const src = videoEmbedUrl(url.trim());
      if (!src) {
        setError("Enter a valid YouTube or Vimeo URL, or upload an MP4 or WebM file.");
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({ type: "video", attrs: { src, embed: true } })
        .createParagraphNear()
        .run();
    }
    setDialog("");
    setError("");
  }
  if (!editor) {
    return null;
  }
  function formatTools() {
    if (!editor) {
      return null;
    }
    return (
      <>
        {["bold", "italic", "underline", "strike", "code"].map((mark) => (
          <Button
            key={mark}
            type="button"
            variant="ghost"
            size="sm"
            aria-label={mark.charAt(0).toUpperCase() + mark.slice(1)}
            aria-pressed={editor.isActive(mark)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleMark(mark).run()}
            className={cn(editor.isActive(mark) && "bg-muted")}
          >
            {markLabels[mark]}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => openDialog("Link")}>
          Link
        </Button>
      </>
    );
  }
  let accept = "image/jpeg,image/png,image/webp,image/gif";
  if (dialog === "Video") {
    accept = "video/mp4,video/webm";
  }
  let dialogTitle = `Insert ${dialog}`;
  if (dialog === "Image Settings") {
    dialogTitle = "Image Settings";
  }
  return (
    <div className="relative min-w-0">
      {!readOnly && (
        <>
          <BubbleMenu editor={editor} options={bubbleOptions}>
            <div
              className="flex flex-wrap rounded-control border bg-white p-1 shadow-lg"
              role="toolbar"
              aria-label="Selected Text Formatting"
            >
              {!editor.isActive("image") && formatTools()}
              {editor.isActive("image") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openDialog("Image Settings")}
                >
                  Image Settings
                </Button>
              )}
            </div>
          </BubbleMenu>
          {editor.isActive("table") && (
            <div
              className="flex flex-wrap gap-1 border-b py-2"
              role="toolbar"
              aria-label="Table Actions"
            >
              {[
                { label: "Add Row", action: () => editor.chain().focus().addRowAfter().run() },
                {
                  label: "Add Column",
                  action: () => editor.chain().focus().addColumnAfter().run(),
                },
                { label: "Remove Row", action: () => editor.chain().focus().deleteRow().run() },
                {
                  label: "Remove Column",
                  action: () => editor.chain().focus().deleteColumn().run(),
                },
                { label: "Merge Cells", action: () => editor.chain().focus().mergeCells().run() },
                { label: "Split Cell", action: () => editor.chain().focus().splitCell().run() },
                { label: "Remove Table", action: () => editor.chain().focus().deleteTable().run() },
              ].map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      <EditorContent editor={editor} />
      {!readOnly && slash && (
        <div
          role="listbox"
          aria-label="Insert Content Block"
          className="fixed z-50 max-h-72 w-72 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl"
          style={{ left: slash.left, top: slash.top }}
        >
          {items.length === 0 && (
            <p className="p-3 text-body text-ink-subtle">No Matching Blocks</p>
          )}
          {items.map((item, index) => (
            <Button
              key={item.label}
              type="button"
              role="option"
              aria-selected={active === index}
              variant="ghost"
              className={cn(
                "h-auto w-full justify-between gap-3 px-3 py-2",
                active === index && "bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <span>{item.label}</span>
              <span className="text-caption font-normal text-ink-subtle">{item.description}</span>
            </Button>
          ))}
        </div>
      )}
      {progress !== null && (
        <div className="my-3">
          <UploadProgress label="Uploading Media" value={progress} />
        </div>
      )}
      {error && (
        <p role="alert" className="my-3 text-body text-destructive">
          {error}
        </p>
      )}
      {!readOnly && (
        <Dialog
          open={Boolean(dialog)}
          onOpenChange={(open) => {
            if (!open && progress === null) {
              setDialog("");
              setError("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>
                Insert supported content securely. Your current selection will be preserved.
              </DialogDescription>
            </DialogHeader>
            {dialog !== "Image Settings" && (
              <div className="space-y-2">
                <Label htmlFor="block-url">URL</Label>
                <Input
                  id="block-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://"
                />
              </div>
            )}
            {["Image", "Image Settings"].includes(dialog) && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="image-alt">Alt Text</Label>
                  <Input
                    id="image-alt"
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="image-caption">Caption</Label>
                  <Input
                    id="image-caption"
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="image-alignment">Alignment</Label>
                  <select
                    id="image-alignment"
                    className="control-md ml-2 rounded-control border px-2"
                    value={alignment}
                    onChange={(event) => setAlignment(event.target.value)}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                {dialog === "Image Settings" && (
                  <div>
                    <Label htmlFor="image-width">Image Width ({width}px)</Label>
                    <input
                      id="image-width"
                      className="mt-2 w-full"
                      type="range"
                      min="160"
                      max="1200"
                      step="10"
                      value={width}
                      onChange={(event) => setWidth(Number(event.target.value))}
                    />
                  </div>
                )}
              </div>
            )}
            {["Image", "Video"].includes(dialog) && (
              <div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={accept}
                  className="sr-only"
                  aria-label={`Upload ${dialog}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void insertFiles([file]);
                    }
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={progress !== null}
                  onClick={() => fileInput.current?.click()}
                >
                  Upload From Computer
                </Button>
                <p className="mt-2 text-caption text-ink-subtle">
                  Images: 10 MB. Videos: 50 MB. You can also paste or drop files into the article.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-body text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={progress !== null}
                onClick={() => setDialog("")}
              >
                Cancel
              </Button>
              <Button type="button" disabled={progress !== null} onClick={applyDialog}>
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
const markLabels: Record<string, string> = {
  bold: "B",
  italic: "I",
  underline: "U",
  strike: "S",
  code: "</>",
};
function message(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Media upload failed. Please try again.";
}

const bubbleOptions = { placement: "top" as const };
