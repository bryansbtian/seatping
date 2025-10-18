// ⬅️ add this as the FIRST line so .env is loaded in dev/prod
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// your existing imports...
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import stripeRouter from "./routes/stripe";
import salesRouter from "./routes/sales";
import feedbackRouter from "./routes/feedback";

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

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
