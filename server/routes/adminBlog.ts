import express from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";
import { assertCloudinaryConfigured } from "../lib/cloudinary.js";
import {
  blogFieldsSchema,
  blogSlug,
  blogText,
  newBlogFields,
  type BlogFields,
} from "../../shared/blog.js";

const router = express.Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }
  next();
});
router.use(requireAdmin);

function failure(res: express.Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.issues[0]?.message || "Invalid article" });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Another article was saved with the same title. Please retry saving.",
        code: "SLUG_CONFLICT",
      });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Post not found" });
    }
  }
  return res.status(500).json({ error: "The blog request failed. Please try again." });
}

router.get("/", async (req, res) => {
  try {
    const query = z
      .object({
        search: z.string().max(240).default(""),
        status: z.enum(["ALL", "DRAFT", "PUBLISHED"]).default("ALL"),
        sort: z.enum(["updated", "newest", "oldest", "title"]).default("updated"),
        category: z.string().max(80).default(""),
        author: z.string().max(120).default(""),
        tag: z.string().max(50).default(""),
      })
      .parse(req.query);
    const where: Prisma.BlogPostWhereInput = {};
    if (query.status !== "ALL") {
      where.status = query.status;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.author) {
      where.author = query.author;
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (query.search.trim()) {
      where.OR = ["title", "author", "category", "slug"].map((key) => ({
        [key]: { contains: query.search.trim(), mode: "insensitive" },
      }));
    }
    let orderBy: Prisma.BlogPostOrderByWithRelationInput = { updatedAt: "desc" };
    if (query.sort === "newest") {
      orderBy = { createdAt: "desc" };
    } else if (query.sort === "oldest") {
      orderBy = { createdAt: "asc" };
    } else if (query.sort === "title") {
      orderBy = { title: "asc" };
    }
    const [posts, counts, metadata] = await Promise.all([
      prisma.blogPost.findMany({ where, orderBy, omit: { content: true } }),
      prisma.blogPost.groupBy({ by: ["status"], _count: true }),
      prisma.blogPost.findMany({ select: { category: true, author: true, tags: true } }),
    ]);
    const stats = { total: 0, drafts: 0, published: 0 };
    for (const count of counts) {
      stats.total += count._count;
      if (count.status === "DRAFT") {
        stats.drafts = count._count;
      } else {
        stats.published = count._count;
      }
    }
    const filters = {
      categories: [...new Set(metadata.map((post) => post.category).filter(Boolean))].sort(),
      authors: [...new Set(metadata.map((post) => post.author).filter(Boolean))].sort(),
      tags: [...new Set(metadata.flatMap((post) => post.tags))].sort(),
    };
    return res.json({ posts, stats, filters });
  } catch (error) {
    return failure(res, error);
  }
});

router.post("/", async (_req, res) => {
  try {
    const post = await prisma.blogPost.create({
      data: {
        ...newBlogFields(),
        slug: `untitled-${randomUUID()}`,
        content: newBlogFields().content,
      },
    });
    return res.status(201).json({ post });
  } catch (error) {
    return failure(res, error);
  }
});

const mediaRequest = z.object({ kind: z.enum(["image", "video"]) }).strict();
router.post("/media/sign", async (req, res) => {
  try {
    const { kind } = mediaRequest.parse(req.body);
    assertCloudinaryConfigured();
    const id = `seatping/blog/${randomUUID()}`;
    const timestamp = Math.round(Date.now() / 1000);
    let allowed_formats = "jpg,jpeg,png,webp,gif";
    if (kind === "video") {
      allowed_formats = "mp4,webm";
    }
    const params = { timestamp, public_id: id, overwrite: false, allowed_formats };
    const signature = cloudinary.utils.api_sign_request(
      params,
      process.env.CLOUDINARY_API_SECRET || "",
    );
    await prisma.blogMedia.create({ data: { id, kind } });
    return res.json({
      upload: {
        ...params,
        signature,
        api_key: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        kind,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure(res, error);
    }
    return res.status(503).json({
      error: "Media uploads are unavailable. Check the Cloudinary configuration and try again.",
    });
  }
});

router.post("/media/commit", async (req, res) => {
  try {
    const { id } = z
      .object({ id: z.string().regex(/^seatping\/blog\/[a-f0-9-]{36}$/) })
      .strict()
      .parse(req.body);
    const media = await prisma.blogMedia.findUnique({ where: { id } });
    if (!media) {
      return res.status(404).json({ error: "Upload not found" });
    }
    assertCloudinaryConfigured();
    const resource = (await cloudinary.api.resource(id, { resource_type: media.kind })) as {
      bytes: number;
      format: string;
      secure_url: string;
      resource_type: string;
    };
    let formats = ["jpg", "jpeg", "png", "webp", "gif"];
    let maxBytes = 10 * 1024 * 1024;
    if (media.kind === "video") {
      formats = ["mp4", "webm"];
      maxBytes = 50 * 1024 * 1024;
    }
    if (
      resource.resource_type !== media.kind ||
      !formats.includes(resource.format) ||
      !Number.isFinite(resource.bytes) ||
      resource.bytes < 1 ||
      resource.bytes > maxBytes ||
      !resource.secure_url.startsWith("https://res.cloudinary.com/")
    ) {
      await cloudinary.uploader.destroy(id, { resource_type: media.kind });
      await prisma.blogMedia.delete({ where: { id } });
      return res.status(400).json({
        error: "Unsupported media or file too large. Images allow 10 MB and videos allow 50 MB.",
      });
    }
    await prisma.blogMedia.update({ where: { id }, data: { url: resource.secure_url } });
    return res.json({ url: resource.secure_url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure(res, error);
    }
    return res
      .status(502)
      .json({ error: "The upload could not be verified. Please retry the upload." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    return res.json({ post });
  } catch (error) {
    return failure(res, error);
  }
});

async function articleSlug(
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

router.put("/:id", async (req, res) => {
  try {
    const { revision, ...fields } = blogFieldsSchema
      .extend({ revision: z.number().int().positive() })
      .parse(req.body);
    let post;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        post = await prisma
          .$transaction(async (tx) => {
            const current = await tx.blogPost.findUnique({ where: { id: req.params.id } });
            if (!current || current.revision !== revision) {
              return null;
            }
            if (current.status === "PUBLISHED") {
              validatePublication(fields);
            }
            return tx.blogPost.update({
              where: { id: current.id, revision },
              data: {
                ...fields,
                slug: await articleSlug(tx, fields.title, current.id, current.slug),
                revision: { increment: 1 },
              },
            });
          })
          .catch((error: unknown) => {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
              return null;
            }
            throw error;
          });
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002" ||
          attempt === 2
        ) {
          throw error;
        }
      }
    }
    if (!post) {
      return res.status(409).json({
        error:
          "This post changed in another tab or was deleted. Your edits are still here. Copy them before reloading.",
        code: "REVISION_CONFLICT",
      });
    }
    return res.json({ post });
  } catch (error) {
    return failure(res, error);
  }
});

router.post("/:id/duplicate", async (req, res) => {
  try {
    const source = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!source) {
      return res.status(404).json({ error: "Post not found" });
    }
    const fields = blogFieldsSchema.parse({
      title: `${source.title.slice(0, 230)} (Copy)`,
      slug: `copy-${randomUUID()}`,
      excerpt: source.excerpt,
      content: source.content,
      coverUrl: source.coverUrl,
      coverAlt: source.coverAlt,
      author: source.author,
      category: source.category,
      categoryColor: source.categoryColor,
      tags: source.tags,
    });
    const post = await prisma.blogPost.create({
      data: { ...fields, slug: fields.slug, content: fields.content },
    });
    return res.status(201).json({ post });
  } catch (error) {
    return failure(res, error);
  }
});

router.post("/:id/status", async (req, res) => {
  try {
    const { status, revision } = z
      .object({ status: z.enum(["DRAFT", "PUBLISHED"]), revision: z.number().int().positive() })
      .strict()
      .parse(req.body);
    const post = await prisma.$transaction(async (tx) => {
      const current = await tx.blogPost.findUnique({ where: { id: req.params.id } });
      if (!current) {
        return null;
      }
      if (status === "PUBLISHED") {
        const fields = blogFieldsSchema.parse(currentFields(current));
        validatePublication(fields);
      }
      let publishedAt = current.publishedAt;
      if (status === "PUBLISHED" && !publishedAt) {
        publishedAt = new Date();
      }
      return tx.blogPost.update({
        where: { id: current.id, revision },
        data: { status, publishedAt, revision: { increment: 1 } },
      });
    });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    return res.json({ post });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(409).json({ error: "Post changed. Reload before changing its status." });
    }
    return failure(res, error);
  }
});

function validatePublication(fields: BlogFields) {
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

function currentFields(post: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(newBlogFields()).map((key) => [key, post[key]]));
}

router.delete("/:id", async (req, res) => {
  try {
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(req.body);
    const result = await prisma.blogPost.deleteMany({ where: { id: req.params.id, revision } });
    if (!result.count) {
      return res
        .status(409)
        .json({ error: "Post changed or was deleted. Reload the list before deleting." });
    }
    return res.json({ success: true });
  } catch (error) {
    return failure(res, error);
  }
});

export default router;
