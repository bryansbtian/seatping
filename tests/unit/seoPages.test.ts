import express from "express";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serveApp } from "../helpers/app.js";
import { createSeoPagesRouter } from "../../server/routes/seoPages.js";
import { injectSeo } from "../../server/lib/pageMeta.js";
import {
  PUBLIC_PAGE_COPY,
  SITE_URL,
  INDEXABLE_STATIC_PATHS,
  metaForPath,
} from "../../shared/pageMeta.js";
import { prisma } from "../../server/lib/prisma.js";

vi.mock("../../server/lib/prisma.js", () => ({
  prisma: { business: { findUnique: vi.fn() }, location: { findFirst: vi.fn() } },
}));
const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const app = express();
app.use(createSeoPagesRouter(() => template));
const client = await serveApp(app);
beforeEach(() => vi.resetAllMocks());

describe("Public SEO HTML", () => {
  it("returns unique initial metadata for static public pages on the canonical host", async () => {
    const descriptions = new Set<string>();
    const titles = new Set<string>();
    for (const [path, copy] of Object.entries(PUBLIC_PAGE_COPY)) {
      if (path === "/blog") {
        continue;
      }
      const response = await client.get(`${path}?tracking=discarded`);
      expect(response.status).toBe(200);
      expect(response.text).toContain(`rel="canonical" href="${SITE_URL}${path}"`);
      expect(response.text).toContain(`name="description" content="${copy.description}"`);
      expect(response.text).toContain('name="twitter:card" content="summary_large_image"');
      expect(response.text.match(/<title>/g)).toHaveLength(1);
      descriptions.add(copy.description);
      titles.add(copy.title);
    }
    expect(descriptions.size).toBe(Object.keys(PUBLIC_PAGE_COPY).length - 1);
    expect(titles.size).toBe(descriptions.size);
  });
  it.each(["/", "/business"])("serves platform metadata and navigation at %s", async (path) => {
    const response = await client.get(path);
    expect(response.text).toContain('href="/blog"');
    expect(response.text).not.toContain('id="platform-title"');
    expect(response.text.match(/<h1>/g)).toHaveLength(1);
    expect(response.text.match(/type="application\/ld\+json"/g)).toHaveLength(1);
    const data = metaForPath(path).structuredData!;
    expect(JSON.stringify(data)).toContain('"@type":"SoftwareApplication"');
    expect(JSON.stringify(data)).toContain('"@type":"Organization"');
    expect(JSON.stringify(data)).toContain('"@type":"WebSite"');
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|offers|review/);
  });
  it.each([
    "/admin",
    "/admin/blog/new",
    "/business/overview",
    "/business/login",
    "/business/signup",
    "/profile",
    "/queue/example/abc",
    "/reservations/manage/private-token",
    "/login",
    "/signup",
    "/forgot",
    "/reset",
    "/search/sushi",
  ])("restricts indexing at %s", async (path) => {
    const response = await client.get(path);
    expect(response.headers["x-robots-tag"]).toBe("noindex, follow");
    expect(response.text).toContain('name="robots" content="noindex, follow"');
    expect(INDEXABLE_STATIC_PATHS).not.toContain(path);
    expect(response.text).not.toContain("private-token");
  });
  it("leaves unmatched API requests to Express instead of returning SPA HTML", async () => {
    for (const path of [
      "/api/campaigns/missing/cancel",
      "/auth/unknown",
      "/tickets/unknown/action",
    ]) {
      expect((await client.get(path)).status).toBe(404);
    }
  });
  it("serves a noindex 404 for unknown paths", async () => {
    for (const path of ["/missing", "/missing/nested/path", "/unknown/not-an-id"]) {
      const response = await client.get(path);
      expect(response.status).toBe(404);
      expect(response.headers["x-robots-tag"]).toContain("noindex");
    }
  });
  it("keeps literal dollar replacement strings and escapes injected titles safely", () => {
    const html = injectSeo(template, "/", { ...metaForPath("/"), title: "$& $` $' <script>" });
    expect(html).toContain("$&amp; $` $' &lt;script&gt;");
    expect(html.match(/SEO:START/g)).toHaveLength(1);
  });
  it("routes HTML through Express on Vercel and keeps the dynamic sitemap", () => {
    const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(
      config.rewrites.find((route: { source: string }) => route.source === "/:path*").destination,
    ).toBe("/api/server");
    for (const source of ["/", "/blog", "/blog/:path*", "/sitemap.xml", "/business", "/admin"]) {
      expect(
        config.rewrites.find((route: { source: string }) => route.source === source).destination,
      ).toBe("/api/server");
    }
    expect(readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8")).toContain(
      `Sitemap: ${SITE_URL}/sitemap.xml`,
    );
    expect(injectSeo(template, "/terms")).not.toContain('"@type": "Organization"');
  });
});

describe("Restaurant SEO", () => {
  const id = "clabcdefghijklmno123456789";
  beforeEach(() => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "business",
      name: "Cafe",
      username: "cafe",
    });
    vi.mocked(prisma.location.findFirst).mockResolvedValue({
      name: "Cafe",
      address: "Main Street",
      isPublished: true,
      restaurantProfile: { displayName: "Cafe & Dining", description: "Fresh seasonal food." },
    });
  });
  it("renders published restaurant metadata and canonicalizes legacy profile URLs", async () => {
    const response = await client.get(`/restaurants/cafe/${id}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain("<h1>Cafe &amp; Dining</h1>");
    expect(response.text).toContain(`rel="canonical" href="${SITE_URL}/cafe/${id}"`);
    expect(response.text).toContain("Fresh seasonal food.");
    expect(response.headers["x-robots-tag"]).toBeUndefined();
  });
  it("does not publish private restaurant details in initial HTML", async () => {
    vi.mocked(prisma.location.findFirst).mockResolvedValue({
      isPublished: false,
      restaurantProfile: { description: "Private details" },
    });
    const response = await client.get(`/cafe/${id}`);
    expect(response.headers["x-robots-tag"]).toContain("noindex");
    expect(response.text).not.toContain("Private details");
  });
  it("distinguishes missing restaurants from database failures", async () => {
    vi.mocked(prisma.location.findFirst).mockResolvedValue(null);
    expect((await client.get(`/cafe/${id}`)).status).toBe(404);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);
    expect((await client.get(`/cafe/${id}`)).status).toBe(404);
    vi.mocked(prisma.business.findUnique).mockRejectedValue(new Error("unavailable"));
    expect((await client.get(`/cafe/${id}`)).status).toBe(503);
  });
});
