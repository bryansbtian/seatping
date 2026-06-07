// ⬅️ add this as the FIRST line so .env is loaded in dev/prod
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// your existing imports...
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import salesRouter from "./routes/sales.js";
import feedbackRouter from "./routes/feedback.js";
import ticketsRouter from "./routes/tickets.js";
import locationsRouter from "./routes/locations.js";
import featuredRouter from "./routes/featured.js";
import restaurantsRouter from "./routes/restaurants.js";
import reservationsRouter from "./routes/reservations.js";
import searchRouter from "./routes/search.js";
import jobsRouter from "./routes/jobs.js";
import cronRouter from "./routes/cron.js";
import { runDailyCreditRefillSweep } from "./lib/trial.js";
import { runReservationReminderSweep } from "./lib/reservationReminders.js";
import { logRateLimitStatus, rateLimit } from "./lib/rateLimit.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Behind Vercel's proxy: trust the first proxy hop so req.ip and
// x-forwarded-for parsing (used by the rate limiter) reflect the real client.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "https://www.seatping.biz",
    credentials: true,
  })
);

// QStash worker is mounted BEFORE the JSON body parser: signature verification
// must run against the raw request bytes (the router parses its own raw body).
app.use("/api/jobs", jobsRouter);

// Body parsers. (Billing is handled manually outside the app — no payment
// webhook needs the raw request body, so parsers can be mounted first.)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, _res, next) => {
  console.log(`[api] ${req.method} ${req.originalUrl}`);
  next();
});

// Global per-IP backstop so no endpoint is ever fully unthrottled. Generous
// enough that normal browsing (the SPA fires several API calls per page) is
// never blocked; it only trips scripted floods. Per-route limiters above this
// stay much stricter. Machine-to-machine routes are exempt: the QStash worker
// (/api/jobs) is mounted before the body parsers and never reaches here, and
// Vercel Cron (/api/cron) is authorized by CRON_SECRET, so we skip it.
const globalLimiter = rateLimit({
  name: "global-ip",
  windowMs: 60 * 1000,
  max: 200,
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/cron") || req.path.startsWith("/api/jobs")) {
    return next();
  }
  return globalLimiter(req, res, next);
});

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/api/sales", salesRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/featured-restaurants", featuredRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/search", searchRouter);
app.use("/api/cron", cronRouter);
app.use("/tickets", ticketsRouter);

// Serve static files from the React app in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));

  // Handle React routing - return all requests to React app
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = Number(process.env.PORT || 4000);

// Only start the server if not in serverless environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
    logRateLimitStatus();
  });

  // Daily credit refill sweep — runs once at startup, then every 24 hours.
  const DAILY_MS = 24 * 60 * 60 * 1000;
  runDailyCreditRefillSweep().catch((err) =>
    console.error("[CREDIT-SWEEP] initial run failed:", err)
  );
  setInterval(() => {
    runDailyCreditRefillSweep().catch((err) =>
      console.error("[CREDIT-SWEEP] scheduled run failed:", err)
    );
  }, DAILY_MS);

  // Reservation reminders — poll every 15 minutes for confirmed bookings that
  // are ~2 hours out and send a one-time reminder. Dedup state is persisted on
  // each reservation, so this is safe across restarts. Runs once at startup too.
  const REMINDER_MS = 15 * 60 * 1000;
  runReservationReminderSweep().catch((err) =>
    console.error("[RESERVATION-REMINDER] initial run failed:", err)
  );
  setInterval(() => {
    runReservationReminderSweep().catch((err) =>
      console.error("[RESERVATION-REMINDER] scheduled run failed:", err)
    );
  }, REMINDER_MS);
}

export default app;
