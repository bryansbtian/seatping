import { Router } from "express";
import {
  findPublicBlog,
  listPublicBlog,
  publicBlogQuery,
  relatedPublicBlog,
} from "../lib/publicBlog.js";

const router = Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/", async (req, res) => {
  const query = publicBlogQuery.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: "Invalid blog query." });
  }
  try {
    return res.json(await listPublicBlog(query.data));
  } catch {
    return res.status(503).json({ error: "Unable to load articles. Please try again." });
  }
});
router.get("/:slug/related", async (req, res) => {
  try {
    const posts = await relatedPublicBlog(req.params.slug);
    if (!posts) {
      return res.status(404).json({ error: "Article not found." });
    }
    return res.json({ posts });
  } catch {
    return res.status(503).json({ error: "Unable to load related articles. Please try again." });
  }
});
router.get("/:slug", async (req, res) => {
  try {
    const post = await findPublicBlog(req.params.slug);
    if (!post) {
      return res.status(404).json({ error: "Article not found." });
    }
    return res.json({ post });
  } catch {
    return res.status(503).json({ error: "Unable to load this article. Please try again." });
  }
});
export default router;
