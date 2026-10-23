import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { blogFieldsSchema, readingMinutes } from "../../shared/blog.js";
import {
  type PublicBlogList,
  type PublicBlogPost,
  type PublicBlogSummary,
} from "../../shared/publicBlog.js";

export const publicBlogQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  category: z.string().max(80).default(""),
});

const publicSelect = {
  title: true,
  slug: true,
  excerpt: true,
  content: true,
  coverUrl: true,
  coverAlt: true,
  author: true,
  category: true,
  categoryColor: true,
  tags: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.BlogPostSelect;

export function publishedBlogWhere(): Prisma.BlogPostWhereInput {
  return { status: "PUBLISHED", publishedAt: { lte: new Date() } };
}

function serialize(
  post: Prisma.BlogPostGetPayload<{ select: typeof publicSelect }>,
): PublicBlogPost {
  const { publishedAt, updatedAt, ...fields } = post;
  if (!publishedAt) {
    throw new Error("Article has no publication date");
  }
  return {
    ...blogFieldsSchema.parse(fields),
    publishedAt: publishedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export async function listPublicBlog(
  query: z.infer<typeof publicBlogQuery>,
): Promise<PublicBlogList> {
  const published = publishedBlogWhere();
  const where = { ...published };
  if (query.category) {
    where.category = query.category;
  }
  const [posts, total, categories] = await prisma.$transaction([
    prisma.blogPost.findMany({
      where,
      select: publicSelect,
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
      skip: (query.page - 1) * 12,
      take: 12,
    }),
    prisma.blogPost.count({ where }),
    prisma.blogPost.findMany({
      where: published,
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  return {
    posts: posts.map((post) => {
      const { content, ...summary } = serialize(post);
      return { ...summary, readingMinutes: readingMinutes(content) };
    }),
    categories: categories.map((post) => post.category).filter(Boolean),
    page: query.page,
    totalPages: Math.ceil(total / 12),
  };
}

export async function findPublicBlog(slug: string): Promise<PublicBlogPost | null> {
  const post = await prisma.blogPost.findFirst({
    where: { ...publishedBlogWhere(), slug },
    select: publicSelect,
  });
  if (!post) {
    return null;
  }
  return serialize(post);
}

export async function relatedPublicBlog(slug: string): Promise<PublicBlogSummary[] | null> {
  const post = await findPublicBlog(slug);
  if (!post) {
    return null;
  }
  const where = { ...publishedBlogWhere(), slug: { not: slug } };
  let related = await prisma.blogPost.findMany({
    where: { ...where, category: post.category },
    select: publicSelect,
    orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
    take: 2,
  });
  if (related.length < 2) {
    const more = await prisma.blogPost.findMany({
      where: { ...where, category: { not: post.category } },
      select: publicSelect,
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
      take: 2 - related.length,
    });
    related = [...related, ...more];
  }
  return related.map((item) => {
    const { content, ...summary } = serialize(item);
    return { ...summary, readingMinutes: readingMinutes(content) };
  });
}
