import { Prisma, type BlogPost } from "@prisma/client";
import { z } from "zod";
import { blogSlug, blogText, newBlogFields, type BlogFields } from "../../shared/blog.js";

export class BlogEditorUpgradeError extends Error {}

export function publicBlogPost(post: BlogPost) {
  const { collaborationState: _state, ...fields } = post;
  return fields;
}

export function currentFields(post: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(newBlogFields()).map((key) => [key, post[key]]));
}

export function validatePublication(fields: BlogFields) {
  if (!fields.title || !fields.author || !blogText(fields.content).trim()) {
    throw new z.ZodError([
      {
        code: "custom",
        path: [],
        message: "Add a title, author, and article content before publishing.",
      },
    ]);
  }
}

export async function articleSlug(
  tx: Prisma.TransactionClient,
  title: string,
  id: string,
  fallback: string,
) {
  const base = blogSlug(title) || fallback;
  let slug = base;
  let suffix = 2;
  while (true) {
    const existing = await tx.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === id) {
      return slug;
    }
    const ending = `-${suffix}`;
    slug = `${base.slice(0, 160 - ending.length).replace(/-+$/g, "")}${ending}`;
    suffix += 1;
  }
}
