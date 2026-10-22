import { z } from "zod";

export function safeBlogUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function safeMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function videoEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    let id: string | null = null;
    if (["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
      id = url.searchParams.get("v");
      if (url.pathname.startsWith("/embed/")) {
        id = url.pathname.split("/")[2];
      }
    } else if (url.hostname === "youtu.be") {
      id = url.pathname.slice(1);
    }
    if (id && /^[\w-]{11}$/.test(id)) {
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)) {
      const match = url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/);
      if (match) {
        return `https://player.vimeo.com/video/${match[1]}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function blogSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");
}

export function blogCoverAlt(filename: string): string {
  return blogSlug(filename.replace(/\.[^.]+$/, "")) || "cover-image";
}

export const blogCategoryColors = ["info", "success", "warning", "danger", "neutral"] as const;

const scalar = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.number().int().min(1).max(3000)).max(20),
]);
export type BlogNode = {
  type: string;
  text?: string;
  attrs?: Record<string, z.infer<typeof scalar>>;
  marks?: { type: string; attrs?: Record<string, z.infer<typeof scalar>> }[];
  content?: BlogNode[];
};

const nodeSchema = z.lazy(() =>
  z
    .object({
      type: z.string(),
      text: z.string().max(200000).optional(),
      attrs: z.record(scalar).optional(),
      marks: z
        .array(
          z
            .object({
              type: z.enum(["bold", "italic", "underline", "strike", "code", "link"]),
              attrs: z.record(scalar).optional(),
            })
            .strict(),
        )
        .max(6)
        .optional(),
      content: z.array(nodeSchema).max(3000).optional(),
    })
    .strict(),
) as z.ZodType<BlogNode>;

const attributes: Record<string, string[]> = {
  doc: [],
  text: [],
  paragraph: ["textAlign"],
  heading: ["level", "textAlign"],
  bulletList: [],
  orderedList: ["start", "type"],
  listItem: [],
  taskList: [],
  taskItem: ["checked"],
  blockquote: [],
  callout: [],
  codeBlock: ["language"],
  hardBreak: [],
  horizontalRule: [],
  table: [],
  tableRow: [],
  tableCell: ["colspan", "rowspan", "colwidth", "align"],
  tableHeader: ["colspan", "rowspan", "colwidth", "align"],
  image: ["src", "alt", "title", "caption", "width", "height", "alignment"],
  video: ["src", "embed"],
};
const blockTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
  "codeBlock",
  "horizontalRule",
  "table",
  "image",
  "video",
];
const children: Record<string, string[]> = {
  doc: blockTypes,
  paragraph: ["text", "hardBreak"],
  heading: ["text", "hardBreak"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: blockTypes,
  taskList: ["taskItem"],
  taskItem: blockTypes,
  blockquote: blockTypes,
  callout: blockTypes,
  codeBlock: ["text"],
  table: ["tableRow"],
  tableRow: ["tableCell", "tableHeader"],
  tableCell: blockTypes,
  tableHeader: blockTypes,
};

const validatedContentSchema = nodeSchema.superRefine((root, context) => {
  let count = 0;
  function invalid(message: string) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
  }
  function visit(node: BlogNode, depth: number) {
    count += 1;
    if (depth > 25 || count > 5000) {
      invalid("Article is too complex");
      return;
    }
    const allowed = attributes[node.type];
    if (!allowed) {
      invalid("Unsupported content block");
      return;
    }
    const attrs = node.attrs ?? {};
    if (Object.keys(attrs).some((key) => !allowed.includes(key))) {
      invalid("Unsupported content attributes");
    }
    if (node.type === "text") {
      if (!node.text || node.content) {
        invalid("Invalid text node");
      }
    } else if (node.text !== undefined) {
      invalid("Text must be inside a text node");
    }
    if (node.type === "heading" && ![1, 2, 3].includes(Number(attrs.level))) {
      invalid("Only headings H1 through H3 are supported");
    }
    if (
      attrs.textAlign &&
      !["left", "center", "right", "justify"].includes(String(attrs.textAlign))
    ) {
      invalid("Invalid text alignment");
    }
    if (node.type === "taskItem" && typeof attrs.checked !== "boolean") {
      invalid("Invalid checkbox");
    }
    for (const key of ["colspan", "rowspan", "start", "width", "height"]) {
      const value = attrs[key];
      if (
        value !== undefined &&
        value !== null &&
        (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 3000)
      ) {
        invalid("Invalid dimensions or list start");
      }
    }
    if (attrs.alignment && !["left", "center", "right"].includes(String(attrs.alignment))) {
      invalid("Invalid image alignment");
    }
    if (attrs.align && !["left", "center", "right", "justify"].includes(String(attrs.align))) {
      invalid("Invalid cell alignment");
    }
    if (node.type === "image" && (typeof attrs.src !== "string" || !safeMediaUrl(attrs.src))) {
      invalid("Images require a secure URL");
    }
    if (node.type === "video") {
      if (typeof attrs.src !== "string" || !safeMediaUrl(attrs.src)) {
        invalid("Videos require a secure URL");
      } else if (attrs.embed === true && videoEmbedUrl(attrs.src) !== attrs.src) {
        invalid("Only YouTube and Vimeo embeds are supported");
      } else if (
        attrs.embed !== true &&
        !/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(attrs.src)
      ) {
        invalid("Uploaded videos must use managed storage");
      }
      if (typeof attrs.embed !== "boolean") {
        invalid("Invalid video type");
      }
    }
    for (const mark of node.marks ?? []) {
      if (node.type !== "text") {
        invalid("Formatting must be applied to text");
      }
      if (mark.type === "link") {
        if (
          Object.keys(mark.attrs ?? {}).some(
            (key) => !["href", "target", "rel", "class", "title"].includes(key),
          ) ||
          typeof mark.attrs?.href !== "string" ||
          !safeBlogUrl(mark.attrs.href)
        ) {
          invalid("Invalid link");
        }
        if (mark.attrs?.target && !["_blank", "_self"].includes(String(mark.attrs.target))) {
          invalid("Invalid link target");
        }
        if (mark.attrs?.class) {
          invalid("Custom link styles are unsupported");
        }
      } else if (Object.keys(mark.attrs ?? {}).length) {
        invalid("Unsupported formatting attributes");
      }
    }
    const allowedChildren = children[node.type] ?? [];
    if ((node.content ?? []).some((child) => !allowedChildren.includes(child.type))) {
      invalid("Invalid block structure");
    }
    if (
      [
        "doc",
        "listItem",
        "taskItem",
        "tableCell",
        "tableHeader",
        "blockquote",
        "callout",
        "table",
        "tableRow",
        "bulletList",
        "orderedList",
        "taskList",
      ].includes(node.type) &&
      !node.content?.length
    ) {
      invalid("This block requires content");
    }
    for (const child of node.content ?? []) {
      visit(child, depth + 1);
    }
  }
  if (root.type !== "doc") {
    invalid("Article must be a document");
  }
  visit(root, 0);
});

export const blogContentSchema = z.preprocess((value, context) => {
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    count += 1;
    if (count > 5000 || current.depth > 25) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Article is too complex" });
      return z.NEVER;
    }
    if (
      current.value &&
      typeof current.value === "object" &&
      "content" in current.value &&
      Array.isArray(current.value.content)
    ) {
      for (const child of current.value.content) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return value;
}, validatedContentSchema);

export const blogFieldsSchema = z
  .object({
    title: z.string().trim().max(240),
    slug: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    excerpt: z.string().max(1000),
    content: blogContentSchema,
    coverUrl: z
      .string()
      .max(2000)
      .refine((value) => value === "" || safeMediaUrl(value)),
    coverAlt: z.string().max(500),
    author: z.string().trim().max(120),
    category: z.string().trim().max(80),
    categoryColor: z.enum(blogCategoryColors).default("info"),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
  })
  .strict();
export type BlogFields = z.infer<typeof blogFieldsSchema>;
export type BlogPost = BlogFields & {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
export const emptyBlogContent: BlogNode = { type: "doc", content: [{ type: "paragraph" }] };
export function newBlogFields(): BlogFields {
  return {
    title: "",
    slug: "untitled",
    excerpt: "",
    content: structuredClone(emptyBlogContent),
    coverUrl: "",
    coverAlt: "",
    author: "SeatPing Team",
    category: "",
    categoryColor: "info",
    tags: [],
  };
}
export function blogText(node: BlogNode): string {
  if (node.text) {
    return node.text;
  }
  return (node.content ?? []).map(blogText).join(" ");
}
export function readingMinutes(node: BlogNode): number {
  return Math.max(1, Math.ceil(blogText(node).trim().split(/\s+/).filter(Boolean).length / 200));
}
