import { isPrivatePath } from "../shared/pageMeta.js";
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import { syncTicketInbox } from "./lib/ticketInbox.js";
import adminBlogRouter from "./routes/adminBlog.js";
import publicBlogRouter from "./routes/publicBlog.js";
import { createBlogPagesRouter, sitemapRouter } from "./routes/blogPages.js";
import adminCustomersRouter from "./routes/adminCustomers.js";
import demoRouter from "./routes/demo.js";
import feedbackRouter from "./routes/feedback.js";
import ticketsRouter from "./routes/tickets.js";
import locationsRouter from "./routes/locations.js";
import featuredRouter from "./routes/featured.js";
import restaurantsRouter from "./routes/restaurants.js";
import reservationsRouter from "./routes/reservations.js";
import floorRouter from "./routes/floor.js";
import performanceRouter from "./routes/performance.js";
import searchRouter from "./routes/search.js";
import guestsRouter from "./routes/guests.js";
import campaignsRouter from "./routes/campaigns.js";
import audiencesRouter from "./routes/audiences.js";
import jobsRouter from "./routes/jobs.js";
import cronRouter from "./routes/cron.js";
import { runDailyCreditRefillSweep } from "./lib/trial.js";
import { runReservationReminderSweep } from "./lib/reservationReminders.js";
import { runDueCampaignsSweep } from "./lib/campaignRunner.js";
import { logRateLimitStatus, rateLimit } from "./lib/rateLimit.js";
import { logEnvStatus } from "./lib/envCheck.js";
import { injectSeo } from "./lib/pageMeta.js";
import { createSeoPagesRouter } from "./routes/seoPages.js";
import { prisma } from "./lib/prisma.js";

logEnvStatus();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "https://www.seatping.biz",
    credentials: true,
  }),
);

app.use((req, res, next) => {
  if (isPrivatePath(req.path)) {
    res.set("X-Robots-Tag", "noindex, follow");
  }
  next();
});

app.use("/api/jobs", jobsRouter);

app.use("/api/admin/blog", express.json({ limit: "1mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

function maskLongHex(value: string): string {
  return value.replace(/[0-9a-f]{32,}/gi, (m) => `${m.slice(0, 6)}…`);
}

function redactUrlSecrets(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) {
    return maskLongHex(url);
  }

  const pathPart = url.slice(0, queryStart);
  let query = url.slice(queryStart + 1);
  let fragment = "";
  const fragmentStart = query.indexOf("#");
  if (fragmentStart !== -1) {
    fragment = query.slice(fragmentStart);
    query = query.slice(0, fragmentStart);
  }

  const redactedQuery = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) {
        return pair;
      }
      const key = pair.slice(0, eq);
      if (!key.toLowerCase().includes("token")) {
        return pair;
      }
      return `${key}=[redacted]`;
    })
    .join("&");

  return maskLongHex(`${pathPart}?${redactedQuery}${fragment}`);
}

app.use((req, _res, next) => {
  console.log("[api] %s %s", req.method, redactUrlSecrets(req.originalUrl));
  next();
});

const globalLimiter = rateLimit({
  name: "global-ip",
  windowMs: 60 * 1000,
  max: 200,
});

const CUSTOMER_POLL_EXEMPT_RE = /^\/auth\/business\/[^/]+\/queue\/.+\/(status|eta)$/;

app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/cron") ||
    req.path.startsWith("/api/jobs") ||
    (req.method === "GET" && CUSTOMER_POLL_EXEMPT_RE.test(req.path))
  ) {
    return next();
  }
  return globalLimiter(req, res, next);
});

app.get("/api/health", async (_req, res) => {
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2500));
  try {
    const result = await Promise.race([
      prisma.business.findFirst({ select: { id: true } }).then(() => "ok" as const),
      timeout,
    ]);
    if (result === "ok") {
      return res.json({ ok: true, db: "ok" });
    }
    return res.status(503).json({ ok: false, db: "timeout" });
  } catch {
    return res.status(503).json({ ok: false, db: "error" });
  }
});

app.use("/auth", authRouter);
if (process.env.NODE_ENV === "production") {
  app.get(
    [
      "/admin",
      "/admin/dashboard",
      "/admin/customers",
      "/admin/featured",
      "/admin/templates",
      "/admin/blog",
      "/admin/blog/new",
      "/admin/blog/:id/edit",
    ],
    (req, res) => {
      res.set("X-Robots-Tag", "noindex, follow");
      res.set("Cache-Control", "no-store");
      res
        .type("html")
        .send(
          injectSeo(
            fs.readFileSync(path.join(__dirname, "../../dist/index.html"), "utf-8"),
            req.path,
          ),
        );
    },
  );
}
app.use("/api/admin/blog", adminBlogRouter);
app.use("/api/blog", publicBlogRouter);
app.use(sitemapRouter);
app.use("/admin/customer", adminCustomersRouter);
app.use("/admin", adminRouter);
app.use("/api/demo", demoRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/featured-restaurants", featuredRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/floor", floorRouter);
app.use("/api/performance", performanceRouter);
app.use("/api/search", searchRouter);
app.use("/api/guests", guestsRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/audiences", audiencesRouter);
app.use("/api/cron", cronRouter);
app.use("/tickets", ticketsRouter);

const distPath = path.join(__dirname, "../../dist");
function pageTemplate(): string {
  if (process.env.NODE_ENV === "production") {
    return fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
  }
  return fs.readFileSync(path.resolve("index.html"), "utf-8");
}
app.use(createBlogPagesRouter(pageTemplate));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath, { index: false }));
}
app.use(createSeoPagesRouter(pageTemplate));

const PORT = Number(process.env.PORT || 4000);

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
    logRateLimitStatus();
  });
}

if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "development") {
  const DAILY_MS = 24 * 60 * 60 * 1000;
  runDailyCreditRefillSweep().catch((err) =>
    console.error("[CREDIT-SWEEP] initial run failed:", err),
  );
  setInterval(() => {
    runDailyCreditRefillSweep().catch((err) =>
      console.error("[CREDIT-SWEEP] scheduled run failed:", err),
    );
  }, DAILY_MS);

  const REMINDER_MS = 15 * 60 * 1000;
  runReservationReminderSweep().catch((err) =>
    console.error("[RESERVATION-REMINDER] initial run failed:", err),
  );
  setInterval(() => {
    runReservationReminderSweep().catch((err) =>
      console.error("[RESERVATION-REMINDER] scheduled run failed:", err),
    );
  }, REMINDER_MS);

  setInterval(() => {
    void syncTicketInbox().catch(() => console.error("[TICKET-EMAIL] sync failed"));
  }, 60 * 1000);

  const CAMPAIGN_SWEEP_MS = 60 * 1000;
  setInterval(() => {
    runDueCampaignsSweep().catch((err) =>
      console.error("[CAMPAIGN-SWEEP] scheduled run failed:", err),
    );
  }, CAMPAIGN_SWEEP_MS);
}

export default app;
