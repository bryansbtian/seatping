// scripts/setup-qstash-schedules.ts
//
// Ensures the QStash Schedules that drive sub-daily background work in
// production exist. Vercel Hobby crons are limited to once per day, so only the
// daily credit-refill sweep runs as a native Vercel Cron (vercel.json -> crons);
// the other two sweeps are driven by QStash Schedules that POST the
// CRON_SECRET-protected endpoints:
//
//   /api/cron/reservation-reminders  hourly   (matches the pre-existing schedule;
//                                              reminders target bookings <= 120 min
//                                              out and dedupe via reminderEmailSentAt,
//                                              so hourly cannot miss or double-send)
//   /api/cron/campaigns              every 5 min (campaign sends are due-time based;
//                                              the cadence only bounds how late after
//                                              the chosen minute a send can start)
//
// Matching is by destination URL: if any schedule already posts to the endpoint
// (whatever its id or cadence), it is left untouched — this never duplicates or
// alters a schedule that is already live. It only creates what is missing.
//
// Auth: the `Authorization: Bearer <CRON_SECRET>` header is forwarded by QStash
// to the endpoint (the SDK turns plain headers into Upstash-Forward-* headers),
// so the cron routes authorize these calls exactly like Vercel Cron's.
//
// QStash free-tier quota note: campaigns every 5 min is 288 deliveries/day,
// hourly reminders 24/day; both share the 500/day free quota with notification
// publishes. Upgrade the QStash plan if notification volume grows.
//
// Usage (needs QSTASH_TOKEN, CRON_SECRET, and optionally QSTASH_URL +
// PUBLIC_BASE_URL in the environment):
//   npx tsx --env-file=.env scripts/setup-qstash-schedules.ts           # dry-run: list + plan
//   npx tsx --env-file=.env scripts/setup-qstash-schedules.ts --apply   # create missing schedules

import { Client } from "@upstash/qstash";

const APPLY = process.argv.includes("--apply");

const token = process.env.QSTASH_TOKEN;
const cronSecret = process.env.CRON_SECRET;
if (!token) {
  console.error("QSTASH_TOKEN is not set.");
  process.exit(1);
}
if (!cronSecret) {
  console.error("CRON_SECRET is not set (the schedules would be unauthorized).");
  process.exit(1);
}

// Same base-URL convention as the notification worker (server/lib/notifications.ts).
const base = (
  process.env.PUBLIC_BASE_URL ||
  process.env.FRONTEND_URL ||
  "https://www.seatping.biz"
).replace(/\/$/, "");

const qstash = new Client({
  token,
  ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
});

const WANTED = [
  {
    scheduleId: "seatping-reservation-reminders",
    destination: `${base}/api/cron/reservation-reminders`,
    cron: "0 * * * *",
  },
  {
    scheduleId: "seatping-campaigns",
    destination: `${base}/api/cron/campaigns`,
    cron: "*/5 * * * *",
  },
] as const;

async function main() {
  const existing = await qstash.schedules.list();
  console.log(`Existing schedules (${existing.length}):`);
  for (const s of existing) {
    console.log(
      `  ${s.scheduleId}  cron="${s.cron}"  -> ${s.destination}` +
        (s.isPaused ? "  [PAUSED]" : ""),
    );
  }

  for (const w of WANTED) {
    const current = existing.find((s) => s.destination === w.destination);
    console.log(`\n${w.destination}`);
    if (current) {
      console.log(
        `  ok — already scheduled (${current.scheduleId}, cron="${current.cron}"), leaving as-is`,
      );
      continue;
    }
    console.log(`  MISSING — would create ${w.scheduleId} with cron="${w.cron}"`);
    if (!APPLY) continue;
    await qstash.schedules.create({
      scheduleId: w.scheduleId,
      destination: w.destination,
      cron: w.cron,
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
      // A failed sweep is fully covered by the next tick (both sweeps are
      // idempotent), so one retry is plenty.
      retries: 1,
    });
    console.log("  created.");
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to create missing schedules.");
  }
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
