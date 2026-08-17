import { describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";

describe("health endpoint", () => {
  it("reports database connectivity as JSON", async () => {
    const res = await (await api()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true, db: "ok" });
  });

  it("serves API routes as JSON rather than an HTML document", async () => {
    const res = await (await api()).get(
      "/api/search/restaurants?query=nothing-matches-this",
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ results: expect.any(Array) });
  });
});
