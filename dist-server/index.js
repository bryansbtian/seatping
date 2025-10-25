import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import stripeRouter from "./routes/stripe.js";
import salesRouter from "./routes/sales.js";
import feedbackRouter from "./routes/feedback.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "https://www.seatping.biz",
    credentials: true,
  })
);
app.use("/stripe", stripeRouter);
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
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
const PORT = Number(process.env.PORT || 4000);

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });
}
export default app;
