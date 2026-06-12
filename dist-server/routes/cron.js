// server/routes/cron.ts
//
// Serverless-friendly scheduled jobs, triggered by Vercel Cron (see the `crons`
// block in vercel.json). The previous setInterval-based sweeps in
// server/index.ts never run on Vercel (no long-lived process), so credit refills
// and reservation reminders silently never fired in production. These HTTP
// endpoints run the same sweep functions on a schedule instead.
//
// Protection: Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET env var is set, so we require that header. Without the
// secret configured the endpoints refuse to run.
import { Router } from "express";
import { runReservationReminderSweep } from "../lib/reservationReminders.js";
import { runDailyCreditRefillSweep } from "../lib/trial.js";
import { runDueCampaignsSweep } from "../lib/campaignRunner.js";
const router = Router();
function authorized(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret)
        return false;
    const header = req.header("authorization") || "";
    return header === `Bearer ${secret}`;
}
router.all("/reservation-reminders", async (req, res) => {
    if (!authorized(req))
        return res.status(401).json({ error: "Unauthorized" });
    try {
        await runReservationReminderSweep();
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("[CRON] reservation-reminders failed:", err?.message || err);
        return res.status(500).json({ error: "Sweep failed" });
    }
});
router.all("/credit-refill", async (req, res) => {
    if (!authorized(req))
        return res.status(401).json({ error: "Unauthorized" });
    try {
        await runDailyCreditRefillSweep();
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("[CRON] credit-refill failed:", err?.message || err);
        return res.status(500).json({ error: "Sweep failed" });
    }
});
// Scheduled + recurring campaign dispatch. Should run frequently (e.g. every
// few minutes) so scheduled sends fire close to their chosen time.
router.all("/campaigns", async (req, res) => {
    if (!authorized(req))
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const result = await runDueCampaignsSweep();
        return res.json({ ok: true, ...result });
    }
    catch (err) {
        console.error("[CRON] campaigns failed:", err?.message || err);
        return res.status(500).json({ error: "Sweep failed" });
    }
});
export default router;
