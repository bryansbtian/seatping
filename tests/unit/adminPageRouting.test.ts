import express from "express";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
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

let app: express.Express;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(express.response, "sendFile").mockImplementation(function () {
    this.type("html").send('<html><body><div id="root"></div></body></html>');
  });
  app = (await import("../../server/index.js")).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Admin Page Routing", () => {
  it.each(PAGE_PATHS)("serves the SPA for direct GET requests to %s", async (pagePath) => {
    const response = await request(app).get(pagePath);

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain('id="root"');
    expect(express.response.sendFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/dist\/index\.html$/),
    );
  });

  it.each([
    "/admin/featured-restaurants",
    "/admin/campaign-templates",
    "/admin/customer/demo",
    "/admin/unknown",
    "/admin/dashboard/unknown",
  ])("keeps the admin guard for %s", async (apiPath) => {
    const response = await request(app).get(apiPath);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("keeps authenticated admin API responses as JSON", async () => {
    const token = signJwt({ accountType: "admin", sub: "admin-routing-fixture" });

    for (const apiPath of ["/admin/featured-restaurants", "/admin/campaign-templates"]) {
      const response = await request(app).get(apiPath).set("Cookie", `sp_auth_admin=${token}`);

      expect(response.status).toBe(200);
      expect(response.type).toBe("application/json");
    }
  });

  it("preserves separate admin authentication for API requests", async () => {
    const token = signJwt({ accountType: "business", sub: "business-routing-fixture" });
    const response = await request(app)
      .get("/admin/featured-restaurants")
      .set("Cookie", `sp_auth_business=${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it.each(PAGE_PATHS)("does not expose non-GET requests to %s as a page", async (pagePath) => {
    const response = await request(app).post(pagePath);

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
      expect(config.rewrites[pageIndex].destination).toBe("/index.html");
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
