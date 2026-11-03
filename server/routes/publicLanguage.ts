import { Router } from "express";
import { requestPublicLanguage } from "../lib/publicLanguage.js";

const router = Router();

router.get("/", (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.vary("Cookie");
  res.vary("X-Vercel-IP-Country");
  return res.json({ language: requestPublicLanguage(req) });
});

export default router;
