import { z } from "zod";
import { getSchema } from "@tiptap/core";
import {
  prosemirrorJSONToYDoc,
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { blogExtensions } from "./blogEditorExtensions.js";
import { blogFieldsSchema, type BlogFields, type BlogPost } from "./blog.js";

export const BLOG_COLORS = [
  "#4f46e5",
  "#059669",
  "#db2777",
  "#0284c7",
  "#9333ea",
  "#d97706",
] as const;
export const BLOG_COFFEES = [
  "Latte",
  "Cappuccino",
  "Espresso",
  "Americano",
  "Mocha",
  "Flat White",
] as const;
export const BLOG_PRESENCE_TTL = 15_000;
export const BLOG_FRAGMENT = "default";
export const BLOG_ROOTS = [BLOG_FRAGMENT, "metadata", "title", "excerpt", "author", "tags"];
const schema = getSchema(blogExtensions(true));
const textFields = ["title", "excerpt", "author"] as const;
const scalarFields = ["slug", "coverUrl", "coverAlt", "category", "categoryColor"] as const;

export function createBlogDocument(fields: BlogFields): Y.Doc {
  const document = prosemirrorJSONToYDoc(schema, fields.content, BLOG_FRAGMENT);
  document.transact(() => {
    for (const key of textFields) {
      document.getText(key).insert(0, fields[key]);
    }
    for (const key of scalarFields) {
      document.getMap("metadata").set(key, fields[key]);
    }
    for (const tag of fields.tags) {
      document.getMap<boolean>("tags").set(tag, true);
    }
  });
  return document;
}

export function readBlogDocument(document: Y.Doc): BlogFields {
  const metadata = document.getMap("metadata");
  const fields = blogFieldsSchema.parse({
    title: document.getText("title").toString(),
    excerpt: document.getText("excerpt").toString(),
    author: document.getText("author").toString(),
    slug: metadata.get("slug"),
    coverUrl: metadata.get("coverUrl"),
    coverAlt: metadata.get("coverAlt"),
    category: metadata.get("category"),
    categoryColor: metadata.get("categoryColor"),
    tags: [...document.getMap<boolean>("tags").keys()],
    content: yXmlFragmentToProseMirrorRootNode(
      document.getXmlFragment(BLOG_FRAGMENT),
      schema,
    ).toJSON() as unknown,
  });
  fields.title = document.getText("title").toString();
  fields.author = document.getText("author").toString();
  const category = metadata.get("category");
  if (typeof category === "string") {
    fields.category = category;
  }
  return fields;
}

export function changeBlogDocument(
  document: Y.Doc,
  next: BlogFields,
  previous: BlogFields,
  replaceContent = false,
): void {
  document.transact(() => {
    for (const key of textFields) {
      if (next[key] === previous[key]) {
        continue;
      }
      const text = document.getText(key);
      const current = text.toString();
      let from = 0;
      while (
        from < current.length &&
        from < next[key].length &&
        current[from] === next[key][from]
      ) {
        from += 1;
      }
      let end = current.length;
      let nextEnd = next[key].length;
      while (end > from && nextEnd > from && current[end - 1] === next[key][nextEnd - 1]) {
        end -= 1;
        nextEnd -= 1;
      }
      text.delete(from, end - from);
      text.insert(from, next[key].slice(from, nextEnd));
    }
    for (const key of scalarFields) {
      if (next[key] !== previous[key]) {
        document.getMap("metadata").set(key, next[key]);
      }
    }
    const tags = document.getMap<boolean>("tags");
    for (const tag of previous.tags) {
      if (!next.tags.includes(tag)) {
        tags.delete(tag);
      }
    }
    for (const tag of next.tags) {
      if (!previous.tags.includes(tag)) {
        tags.set(tag, true);
      }
    }
    if (replaceContent) {
      const fragment = document.getXmlFragment(BLOG_FRAGMENT);
      prosemirrorJSONToYXmlFragment(schema, next.content, fragment);
    }
  });
}

const base64 = z
  .string()
  .min(4)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const blogSyncRequestSchema = z
  .object({
    clientId: z.number().int().min(0).max(0xffffffff),
    vector: base64.max(100_000),
    update: base64.max(2_800_000).optional(),
    awareness: base64.max(8_000),
  })
  .strict();

const id = z
  .object({
    client: z.number().int().min(0).max(0xffffffff),
    clock: z.number().int().nonnegative(),
  })
  .strict();
const relativePosition = z
  .object({
    type: id.nullable().optional(),
    item: id.nullable().optional(),
    tname: z.string().max(80).nullable().optional(),
    assoc: z.number().int().optional(),
  })
  .strict();
export const blogUserSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    color: z.enum(BLOG_COLORS),
    coffee: z.enum(BLOG_COFFEES).default("Latte"),
  })
  .strict();
export const blogAwarenessSchema = z
  .object({
    user: blogUserSchema,
    cursor: z
      .object({ anchor: relativePosition, head: relativePosition })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type BlogUser = z.infer<typeof blogUserSchema>;
export type BlogSyncRequest = z.infer<typeof blogSyncRequestSchema>;
export type BlogPostState = Pick<
  BlogPost,
  "id" | "slug" | "status" | "revision" | "createdAt" | "updatedAt" | "publishedAt"
>;
export type BlogSyncResponse = {
  update: string;
  post: BlogPostState;
  peers: Array<{ clientId: number; awareness: string }>;
};

export const blogSyncResponseSchema = z.object({
  update: base64.max(2_800_000),
  post: z.object({
    id: z.string(),
    slug: z.string(),
    status: z.enum(["DRAFT", "PUBLISHED"]),
    revision: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullable(),
  }),
  peers: z
    .array(z.object({ clientId: z.number().int().nonnegative(), awareness: base64.max(8_000) }))
    .max(64),
});
