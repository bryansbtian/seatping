import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { prisma } from "../lib/prisma.js";
import { BlogCollaborationError, synchronizeBlog } from "../lib/blogCollaboration.js";
import { blogSyncRequestSchema } from "../../shared/blogCollaboration.js";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }
  next();
});
router.use(rateLimit({ name: "blog-collaboration", windowMs: 60_000, max: 1200 }));
router.use(requireAdmin);

function owner(req: Request): string {
  const auth = (req as Request & { auth?: { sub?: unknown } }).auth;
  if (typeof auth?.sub !== "string") {
    throw new BlogCollaborationError("Sign in again to edit this article.", 401);
  }
  return auth.sub;
}

function failure(res: Response, error: unknown) {
  if (error instanceof BlogCollaborationError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "The shared editing request is invalid." });
  }
  return res
    .status(503)
    .json({ error: "Shared editing is unavailable. Your changes remain in this tab." });
}

const postId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
router.get("/:id", async (req, res) => {
  try {
    return res.json(await synchronizeBlog(postId.parse(req.params.id), owner(req)));
  } catch (error) {
    return failure(res, error);
  }
});
router.post("/:id", async (req, res) => {
  try {
    return res.json(
      await synchronizeBlog(
        postId.parse(req.params.id),
        owner(req),
        blogSyncRequestSchema.parse(req.body),
      ),
    );
  } catch (error) {
    return failure(res, error);
  }
});
router.delete("/:id/:clientId", async (req, res) => {
  try {
    const id = postId.parse(req.params.id);
    const clientId = z
      .string()
      .regex(/^\d{1,10}$/)
      .parse(req.params.clientId);
    await prisma.blogEditorPresence.deleteMany({
      where: { postId: id, clientId, owner: owner(req) },
    });
    return res.json({ ok: true });
  } catch (error) {
    return failure(res, error);
  }
});
export default router;
