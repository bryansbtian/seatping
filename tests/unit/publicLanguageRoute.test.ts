import express from "express";
import cookieParser from "cookie-parser";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serveApp } from "../helpers/app.js";
import publicLanguageRouter from "../../server/routes/publicLanguage.js";
import { PUBLIC_LANGUAGE_COOKIE } from "../../shared/publicLanguage.js";

const app = express();
app.use(cookieParser());
app.use("/api/language", publicLanguageRouter);
const client = await serveApp(app);

describe("Public Language Endpoint", () => {
  it.each(["ID", "id", " ID "])("selects Indonesian for the country header %s", async (country) => {
    const response = await client.get("/api/language").set("x-vercel-ip-country", country);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ language: "id" });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers.vary).toContain("Cookie");
    expect(response.headers.vary).toContain("X-Vercel-IP-Country");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it.each(["US", "SG", "GB", "ZZ", "", "ID,US"])("defaults to English for %s", async (country) => {
    const response = await client.get("/api/language").set("x-vercel-ip-country", country);
    expect(response.body).toEqual({ language: "en" });
  });

  it("defaults to English locally when no country header exists", async () => {
    expect((await client.get("/api/language")).body).toEqual({ language: "en" });
  });

  it.each([
    ["en", "ID"],
    ["id", "US"],
  ])("honors manual %s over country %s", async (language, country) => {
    const response = await client
      .get("/api/language")
      .set("Cookie", `${PUBLIC_LANGUAGE_COOKIE}=${language}`)
      .set("x-vercel-ip-country", country);
    expect(response.body).toEqual({ language });
  });

  it("ignores malformed preferences and unrelated auth cookies", async () => {
    const response = await client
      .get("/api/language")
      .set("Cookie", `${PUBLIC_LANGUAGE_COOKIE}=fr; seatping.business.lang=en`)
      .set("x-vercel-ip-country", "ID");
    expect(response.body).toEqual({ language: "id" });
  });

  it("also works without cookie middleware", async () => {
    const bare = express();
    bare.use("/api/language", publicLanguageRouter);
    const bareClient = await serveApp(bare);
    expect((await bareClient.get("/api/language")).body).toEqual({ language: "en" });
  });

  it("wires the API through Express, Vite, and Vercel", () => {
    const server = readFileSync(new URL("../../server/index.ts", import.meta.url), "utf8");
    const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
    const vercel: { rewrites: { source: string; destination: string }[] } = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    );
    expect(server).toContain('app.use("/api/language", publicLanguageRouter)');
    expect(vite).toContain('"/api/language": { target: apiTarget, changeOrigin: true }');
    expect(vercel.rewrites.find((route) => route.source === "/api/language")?.destination).toBe(
      "/api/server",
    );
  });
});
