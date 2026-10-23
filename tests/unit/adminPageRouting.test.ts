import express from "express";
import fs from "node:fs";
import path from "node:path";
import { serveApp } from "../helpers/app.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signJwt } from "../../server/lib/auth.js";

vi.mock("../../server/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn().mockResolvedValue(null) },
    featuredRestaurant: { findMany: vi.fn().mockResolvedValue([]) },
    campaignTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../../server/lib/envCheck.js", () => ({ logEnvStatus: vi.fn() }));
vi.mock("../../server/lib/rateLimit.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/rateLimit.js")>();
  return {
    ...actual,
    logRateLimitStatus: vi.fn(),
    rateLimit:
      () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
        next();
      },
  };
});

const PAGE_PATHS = [
  "/admin",
  "/admin/dashboard",
  "/admin/customers",
  "/admin/featured",
  "/admin/templates",
];

let client: Awaited<ReturnType<typeof serveApp>>;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("ADMIN_USERNAME", "test-admin");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "test-only-hash");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const readFile = fs.readFileSync;
  vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
    if (String(file).endsWith("/dist/index.html")) {
      return '<html><head><!-- SEO:START --><!-- SEO:END --></head><body><div id="root"></div></body></html>';
    }
    return readFile(file, options);
  });
  const app = (await import("../../server/index.js")).default;
  client = await serveApp(app);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Admin Page Routing", () => {
  it.each(PAGE_PATHS)("serves the SPA for direct GET requests to %s", async (pagePath) => {
    const response = await client.get(pagePath);

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain('id="root"');
    expect(response.headers["x-robots-tag"]).toBe("noindex, follow");
    expect(response.text).toContain('name="robots" content="noindex, follow"');
    expect(response.text).toContain("<title>Admin | SeatPing</title>");
  });

  it.each([
    "/admin/customer",
    "/admin/featured-restaurants",
    "/admin/campaign-templates",
    "/admin/customer/demo",
    "/admin/unknown",
    "/admin/dashboard/unknown",
  ])("keeps the admin guard for %s", async (apiPath) => {
    const response = await client.get(apiPath);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("keeps authenticated admin API responses as JSON", async () => {
    const token = signJwt({ accountType: "admin", sub: "admin-routing-fixture" });

    for (const apiPath of ["/admin/featured-restaurants", "/admin/campaign-templates"]) {
      const response = await client.get(apiPath).set("Cookie", `sp_auth_admin=${token}`);

      expect(response.status).toBe(200);
      expect(response.type).toBe("application/json");
    }
  });

  it("preserves separate admin authentication for API requests", async () => {
    const token = signJwt({ accountType: "business", sub: "business-routing-fixture" });
    const response = await client
      .get("/admin/featured-restaurants")
      .set("Cookie", `sp_auth_business=${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it.each(PAGE_PATHS)("does not expose non-GET requests to %s as a page", async (pagePath) => {
    const response = await client.post(pagePath);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("keeps exact Vercel page rewrites ahead of the admin API rewrite", () => {
    const config = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { rewrites: Array<{ source: string; destination: string }> };
    const apiIndex = config.rewrites.findIndex((rewrite) => rewrite.source === "/admin/:path*");

    expect(apiIndex).toBeGreaterThan(-1);
    expect(config.rewrites[apiIndex].destination).toBe("/api/server");
    for (const pagePath of PAGE_PATHS) {
      const pageIndex = config.rewrites.findIndex((rewrite) => rewrite.source === pagePath);

      expect(pageIndex).toBeGreaterThan(-1);
      expect(pageIndex).toBeLessThan(apiIndex);
      expect(config.rewrites[pageIndex].destination).toBe("/api/server");
    }
  });

  it("serves admin page paths locally without proxying them to the API", async () => {
    const { default: viteConfig } = await import("../../vite.config.js");
    const config = viteConfig({ command: "serve", mode: "development" });
    const proxyPaths = Object.keys(config.server?.proxy ?? {});
    const matchingProxies = (requestPath: string) => {
      return proxyPaths.filter((proxyPath) => {
        if (proxyPath.startsWith("^")) {
          return new RegExp(proxyPath).test(requestPath);
        }
        return requestPath.startsWith(proxyPath);
      });
    };

    for (const pagePath of PAGE_PATHS) {
      expect(matchingProxies(pagePath)).toEqual([]);
    }
    for (const apiPath of [
      "/admin/customer",
      "/admin/customer?page=1&search=demo",
      "/admin/customer/demo",
      "/admin/featured-restaurants",
      "/admin/campaign-templates",
      "/admin/businesses/search",
      "/admin/update-credits",
    ]) {
      expect(matchingProxies(apiPath)).toHaveLength(1);
    }
  });
});

describe("Blog Page Routing", () => {
  it.each(["/admin/blog", "/admin/blog/new", "/admin/blog/post-1/edit"])(
    "serves %s as an admin page without exposing a public blog",
    async (pagePath) => {
      const response = await client.get(pagePath);
      expect(response.status).toBe(200);
      expect(response.type).toBe("text/html");
    },
  );
  it("keeps the separate blog API protected", async () => {
    const response = await client.get("/api/admin/blog");
    expect(response.status).toBe(401);
    expect(response.type).toBe("application/json");
  });
  it("places blog page and API rewrites before the broad admin rewrite", async () => {
    const config = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { rewrites: { source: string; destination: string }[] };
    const adminIndex = config.rewrites.findIndex((rewrite) => rewrite.source === "/admin/:path*");
    const pages = config.rewrites.findIndex((rewrite) => rewrite.source === "/admin/blog/:path*");
    const apiIndex = config.rewrites.findIndex(
      (rewrite) => rewrite.source === "/api/admin/blog/:path*",
    );
    expect(pages).toBeGreaterThanOrEqual(0);
    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(pages).toBeLessThan(adminIndex);
    expect(config.rewrites[pages].destination).toBe("/api/server");
    expect(config.rewrites[apiIndex].destination).toBe("/api/server");
    const { default: viteConfig } = await import("../../vite.config.js");
    const vite = viteConfig({ command: "serve", mode: "development" });
    expect(vite.server?.proxy?.["/api/admin/blog"]).toBeTruthy();
    expect(vite.server?.proxy?.["/admin/blog"]).toBeUndefined();
  });
});
