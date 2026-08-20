import { Router, type Request, type Response } from "express";
import expressRateLimit from "express-rate-limit";
import { runReservationReminderSweep } from "../lib/reservationReminders.js";
import { runDailyCreditRefillSweep } from "../lib/trial.js";
import { runDueCampaignsSweep } from "../lib/campaignRunner.js";
import { rateLimit, MINUTES } from "../lib/rateLimit.js";

const router = Router();

const cronBurstLimiter = expressRateLimit({
  windowMs: MINUTES(1),
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(
  rateLimit({
    name: "cron-ip",
    windowMs: MINUTES(1),
    max: 30,
  }),
);

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = req.header("authorization") || "";
  return header === `Bearer ${secret}`;
}

router.all("/reservation-reminders", cronBurstLimiter, async (req: Request, res: Response) => {
  if (!authorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    await runReservationReminderSweep();
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[CRON] reservation-reminders failed:", err?.message || err);
    return res.status(500).json({ error: "Sweep failed" });
  }
});

router.all("/credit-refill", cronBurstLimiter, async (req: Request, res: Response) => {
  if (!authorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    await runDailyCreditRefillSweep();
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[CRON] credit-refill failed:", err?.message || err);
    return res.status(500).json({ error: "Sweep failed" });
  }
});

router.all("/campaigns", cronBurstLimiter, async (req: Request, res: Response) => {
  if (!authorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await runDueCampaignsSweep();
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[CRON] campaigns failed:", err?.message || err);
    return res.status(500).json({ error: "Sweep failed" });
  }
});

export default router;
