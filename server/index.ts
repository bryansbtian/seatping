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
import stripeRouter from "./routes/stripe.js";
import salesRouter from "./routes/sales.js";
import feedbackRouter from "./routes/feedback.js";
import ticketsRouter from "./routes/tickets.js";
import { runDailyCreditRefillSweep } from "./lib/trial.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "https://www.seatping.biz",
    credentials: true,
  })
);

// 🔴 Mount Stripe BEFORE any body parsers
app.use("/stripe", stripeRouter);

// normal parsers after
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, _res, next) => {
  console.log(`[api] ${req.method} ${req.originalUrl}`);
  next();
});

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/api/sales", salesRouter);
app.use("/api/feedback", feedbackRouter);
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
}

export default app;
