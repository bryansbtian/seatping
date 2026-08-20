import { beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SMOKE_BASE_URL;

beforeAll(() => {
  if (!baseUrl) {
    throw new Error(
      "SMOKE_BASE_URL is not set. Point it at the deployment to smoke test, " +
        "for example http://localhost:4000 or a staging URL.",
    );
  }
});

function url(path: string): string {
  return `${String(baseUrl).replace(/\/+$/, "")}${path}`;
}

describe("deployment smoke", () => {
  it("serves a healthy /api/health as JSON", async () => {
    const res = await fetch(url("/api/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);

    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  it("returns JSON from an API route rather than the SPA fallback", async () => {
    const res = await fetch(url("/api/health"));
    const contentType = res.headers.get("content-type") ?? "";

    expect(contentType).not.toMatch(/text\/html/);

    const text = await res.text();
    expect(text.trimStart().startsWith("<!DOCTYPE")).toBe(false);
    expect(text).not.toContain('<div id="root"');
  });

  it("serves a public search endpoint as JSON", async () => {
    const res = await fetch(url("/api/search/restaurants?query=smoke-test-no-match"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);

    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
  });
});
