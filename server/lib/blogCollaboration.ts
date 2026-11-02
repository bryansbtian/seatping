import { Prisma, type BlogPost } from "@prisma/client";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import { createDecoder, readVarUint, readVarString } from "lib0/decoding";
import { prisma } from "./prisma.js";
import { articleSlug, currentFields, validatePublication } from "./blogPosts.js";
import { blogFieldsSchema } from "../../shared/blog.js";
import {
  BLOG_PRESENCE_TTL,
  BLOG_ROOTS,
  blogAwarenessSchema,
  createBlogDocument,
  readBlogDocument,
  type BlogSyncRequest,
  type BlogSyncResponse,
} from "../../shared/blogCollaboration.js";

export class BlogCollaborationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function state(post: BlogPost): BlogSyncResponse["post"] {
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    revision: post.revision,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}

function openDocument(post: BlogPost): Y.Doc {
  if (!post.collaborationState) {
    return createBlogDocument(blogFieldsSchema.parse(currentFields(post)));
  }
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, post.collaborationState);
    return document;
  } catch {
    document.destroy();
    throw new BlogCollaborationError("Shared editing could not be opened. Please retry.", 500);
  }
}

export function validateBlogAwareness(encoded: string, clientId: number): Uint8Array {
  try {
    const bytes = fromBase64(encoded);
    const decoder = createDecoder(bytes);
    if (readVarUint(decoder) !== 1 || readVarUint(decoder) !== clientId) {
      throw new Error("Invalid presence owner");
    }
    readVarUint(decoder);
    const value: unknown = JSON.parse(readVarString(decoder));
    blogAwarenessSchema.parse(value);
    if (decoder.pos !== bytes.length) {
      throw new Error("Invalid presence data");
    }
    return bytes;
  } catch {
    throw new BlogCollaborationError("The shared editing presence is invalid.");
  }
}

export async function synchronizeBlog(
  postId: string,
  owner: string,
  request?: BlogSyncRequest,
): Promise<BlogSyncResponse> {
  let presence: Uint8Array | undefined;
  if (request) {
    presence = validateBlogAwareness(request.awareness, request.clientId);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "blog_posts" WHERE "id" = ${postId} FOR UPDATE`;
          let post = await tx.blogPost.findUnique({ where: { id: postId } });
          if (!post) {
            throw new BlogCollaborationError("This article was deleted or is unavailable.", 404);
          }
          const document = openDocument(post);
          try {
            let changed = false;
            document.on("update", () => {
              changed = true;
            });
            if (request?.update) {
              try {
                Y.applyUpdate(document, fromBase64(request.update));
                if ([...document.share.keys()].some((key) => !BLOG_ROOTS.includes(key))) {
                  throw new Error("Invalid shared field");
                }
              } catch {
                throw new BlogCollaborationError(
                  "The shared article update is invalid. Your edits remain in this tab.",
                );
              }
            }
            if (!post.collaborationState || changed) {
              let fields;
              try {
                fields = blogFieldsSchema.parse(readBlogDocument(document));
                if (post.status === "PUBLISHED") {
                  validatePublication(fields);
                }
              } catch {
                throw new BlogCollaborationError(
                  "Check the article fields and content before syncing your changes.",
                );
              }
              let slug = post.slug;
              if (!post.publishedAt) {
                slug = await articleSlug(tx, fields.title, post.id, post.slug);
              }
              if (document.getMap("metadata").get("slug") !== slug) {
                document.getMap("metadata").set("slug", slug);
              }
              const encoded = Y.encodeStateAsUpdate(document);
              if (encoded.byteLength > 2_000_000) {
                throw new BlogCollaborationError(
                  "This article is too large to sync. Shorten its content and retry.",
                  413,
                );
              }
              let revision = post.revision;
              let updatedAt = post.updatedAt;
              if (changed) {
                revision += 1;
                updatedAt = new Date();
              }
              post = await tx.blogPost.update({
                where: { id: post.id },
                data: { ...fields, slug, collaborationState: encoded, revision, updatedAt },
              });
            }
            const now = new Date();
            const since = new Date(now.getTime() - BLOG_PRESENCE_TTL);
            await tx.blogEditorPresence.deleteMany({
              where: { postId, lastSeenAt: { lt: since } },
            });
            if (request && presence) {
              const current = await tx.blogEditorPresence.findUnique({
                where: { postId_clientId: { postId, clientId: String(request.clientId) } },
              });
              if (current && current.owner !== owner) {
                throw new BlogCollaborationError(
                  "Open the article again to start a new editing session.",
                  409,
                );
              }
              await tx.blogEditorPresence.upsert({
                where: { postId_clientId: { postId, clientId: String(request.clientId) } },
                create: {
                  postId,
                  clientId: String(request.clientId),
                  owner,
                  state: presence,
                  lastSeenAt: now,
                },
                update: { state: presence, lastSeenAt: now },
              });
            }
            const peers = await tx.blogEditorPresence.findMany({
              where: { postId, lastSeenAt: { gte: since } },
              select: { clientId: true, state: true },
              take: 64,
            });
            let vector: Uint8Array | undefined;
            if (request) {
              vector = fromBase64(request.vector);
            }
            let update: Uint8Array;
            try {
              update = Y.encodeStateAsUpdate(document, vector);
            } catch {
              throw new BlogCollaborationError(
                "The shared article version is invalid. Please reopen this article.",
              );
            }
            return {
              update: toBase64(update),
              post: state(post),
              peers: peers.map((peer) => ({
                clientId: Number(peer.clientId),
                awareness: toBase64(peer.state),
              })),
            };
          } finally {
            document.destroy();
          }
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code) &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new BlogCollaborationError("Shared editing is busy. Please retry.", 503);
}
