// server/routes/jobs.ts
//
// QStash worker endpoint. When QStash is configured, enqueueNotification()
// publishes jobs that QStash delivers here as POST /api/jobs/notify with
// at-least-once semantics + automatic retries. We verify the QStash signature
// (so the endpoint can't be abused to send arbitrary messages), then run the
// same dispatcher used by the inline dev path.
//
// Raw body: signature verification must run against the exact bytes QStash
// signed, so this router parses the body as raw and is mounted BEFORE the global
// express.json() in server/index.ts.

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
      // No signing keys configured — QStash isn't in use, so nothing legitimately
      // calls this route (the inline fallback sends directly). Reject.
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
      // Non-2xx tells QStash to retry the delivery.
      console.error("[JOBS] notification send failed:", err?.message || err);
      return res.status(500).json({ error: "Send failed" });
    }
  },
);

export default router;
