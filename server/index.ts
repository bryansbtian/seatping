import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import stripeRouter from "./routes/stripe";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:8080", // your Vite port
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// 🔎 log every request so 404s are obvious
app.use((req, _res, next) => {
  console.log(`[api] ${req.method} ${req.path}`);
  next();
});

app.use("/auth", authRouter); // <-- must be mounted at /auth
app.use("/admin", adminRouter); // <-- admin routes
app.use("/stripe", stripeRouter); // <-- stripe webhook routes

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
