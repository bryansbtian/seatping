import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth";

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

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
