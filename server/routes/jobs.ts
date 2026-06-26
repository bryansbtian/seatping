
import { Router, type Request, type Response } from "express";
import express from "express";
import { Receiver } from "@upstash/qstash";
import { processNotification, type NotificationJob } from "../lib/notifications.js";

const router = Router();

const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
const receiver =
  currentSigningKey && nextSigningKey
    ? new Receiver({ currentSigningKey, nextSigningKey })
    : null;

router.post(
  "/notify",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req: Request, res: Response) => {
    if (!receiver) {
      return res.status(503).json({ error: "Notification worker not configured" });
    }

    const bodyStr = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

    const signature = req.header("Upstash-Signature") || "";
    try {
      const valid = await receiver.verify({ signature, body: bodyStr });
      if (!valid) return res.status(401).json({ error: "Invalid signature" });
    } catch {
      return res.status(401).json({ error: "Invalid signature" });
    }

    let job: NotificationJob;
    try {
      job = JSON.parse(bodyStr) as NotificationJob;
    } catch {
      return res.status(400).json({ error: "Invalid job payload" });
    }

    try {
      await processNotification(job);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[JOBS] notification send failed:", err?.message || err);
      return res.status(500).json({ error: "Send failed" });
    }
  },
);

export default router;
