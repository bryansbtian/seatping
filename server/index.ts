// ⬅️ add this as the FIRST line so .env is loaded in dev/prod
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// your existing imports...
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import stripeRouter from "./routes/stripe";
import salesRouter from "./routes/sales";
import feedbackRouter from "./routes/feedback";

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
app.use("/sales", salesRouter);
app.use("/feedback", feedbackRouter);

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
}

export default app;
