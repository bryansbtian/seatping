import "dotenv/config";
import { Client } from "@upstash/qstash";

const base = new URL(
  process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://www.seatping.biz",
);
if (base.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(base.hostname)) {
  throw new Error(
    "Set PUBLIC_BASE_URL to the deployed HTTPS application URL before configuring the schedule",
  );
}
const schedule = {
  scheduleId: "seatping-ticket-email-sync",
  destination: new URL("/api/jobs/notify", base).href,
  cron: "* * * * *",
  body: JSON.stringify({ type: "ticket_email_sync" }),
  headers: { "Content-Type": "application/json" },
  retries: 2,
};
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify({ action: "Create Or Update Ticket Email Sync Schedule", ...schedule }, null, 2),
  );
} else {
  if (!process.env.QSTASH_TOKEN) {
    throw new Error("QSTASH_TOKEN is required to register the schedule");
  }
  const client = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL });
  await client.schedules.create(schedule);
  console.log("Ticket email sync schedule configured");
}
