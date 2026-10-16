import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { chromium } from "playwright";

const options = new Map(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    if (separator === -1) {
      return [argument, "1"];
    }
    return [argument.slice(0, separator), argument.slice(separator + 1)];
  }),
);
const sampleCount = Number(options.get("--samples") || "3");
if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 10) {
  throw new Error("Samples must be an integer between 1 and 10");
}
const beforeDirectory = resolve(
  options.get("--before") || "performance-artifacts/baseline-source/dist",
);
const afterDirectory = resolve(options.get("--after") || "dist");
const output = resolve(
  options.get("--output") || "performance-artifacts/browser-performance-final.json",
);
const baselineOnly = options.has("--baseline-only");

const fixtureRestaurant = {
  locationId: "synthetic-location",
  businessUsername: "synthetic",
  businessName: "Synthetic Restaurant",
  name: "Synthetic Restaurant",
  shortAddress: "Synthetic Area",
  description: "Controlled local performance fixture",
  tagline: null,
  cuisine: "Japanese",
  cuisineTypes: ["Japanese"],
  priceRange: "$$",
  currency: "USD",
  address: "Synthetic Address",
  area: "Synthetic Area",
  city: "Synthetic City",
  country: null,
  bannerImageUrl: null,
  rating: null,
  reviewCount: 0,
  queueEnabled: true,
  reservationsEnabled: true,
  openNow: true,
  locationDisplayName: "Synthetic Area",
  featured: true,
  photos: [],
  menu: [],
  menuUrl: null,
  reviews: [],
  reviewsPage: { nextCursor: null, hasMore: false },
  openingHours: null,
  latitude: null,
  longitude: null,
  googleMapsUrl: null,
  phone: null,
  website: null,
  instagram: null,
};
const fixtureCatalog = Array.from({ length: 10 }, (_, index) => ({
  ...fixtureRestaurant,
  locationId: `synthetic-${index + 1}`,
  name: `Synthetic Restaurant ${index + 1}`,
}));
const fixtureSettings = {
  reservationStartTime: "12:00",
  reservationEndTime: "22:00",
  maxPartySize: 10,
  maxReservedGuestsPerHour: 0,
  bookingWindowDays: 540,
  minNoticeMinutes: 0,
  defaultReservationDurationMinutes: 90,
  reservationHoldMinutes: 15,
  confirmationMode: "auto",
  cancellationPolicy: "",
};
const routes = [
  { name: "home", path: "/", ready: "h1" },
  { name: "search", path: "/search", ready: "article" },
  {
    name: "profile",
    path: "/synthetic/synthetic-location?date=2027-10-16&time=18%3A00&partySize=2",
    ready: "h1",
    text: "Synthetic Restaurant",
  },
  { name: "businessGuestGuard", path: "/business/overview", ready: "text=Business Log In" },
  { name: "adminGuest", path: "/admin", ready: "text=Admin Access" },
];

function fixtureResponse(path) {
  if (path === "/auth/session") {
    return { customer: null, business: null, customerId: null };
  }
  if (path === "/auth/admin/session") {
    return { authenticated: false };
  }
  if (path === "/auth/me") {
    return { user: null };
  }
  if (path === "/auth/business/me" || path === "/auth/business/language") {
    return { error: "Unauthorized" };
  }
  if (path === "/api/featured-restaurants") {
    return { featured: [] };
  }
  if (path === "/api/search/restaurants") {
    return {
      results: fixtureCatalog,
      total: 10,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasMore: false,
      facets: { cuisines: ["Japanese"], locations: ["Synthetic Area"] },
    };
  }
  if (path === "/api/locations/search-suggestions") {
    return { suggestions: [] };
  }
  if (path === "/api/restaurants/synthetic/synthetic-location") {
    return { restaurant: fixtureRestaurant };
  }
  if (path === "/api/restaurants/synthetic/synthetic-location/reviews") {
    return { reviews: [], totalReviews: 0, avgRating: null, nextCursor: null, hasMore: false };
  }
  if (path.endsWith("/settings")) {
    return { settings: fixtureSettings };
  }
  if (path.endsWith("/availability")) {
    return {
      slots: [{ time: "18:00", label: "6:00 PM", available: true, remaining: 2 }],
      availability: { status: "available" },
    };
  }
  return undefined;
}

async function buildMetadata(directory) {
  const assets = [];
  for (const name of (await readdir(resolve(directory, "assets"))).sort()) {
    if (!name.endsWith(".js")) {
      continue;
    }
    const bytes = await readFile(resolve(directory, "assets", name));
    assets.push({
      name,
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
      brotliBytes: brotliCompressSync(bytes).length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      containsRechartsRuntime: /recharts-wrapper|recharts-surface/.test(bytes.toString("utf8")),
    });
  }
  const html = await readFile(resolve(directory, "index.html"));
  return {
    directory,
    htmlSha256: createHash("sha256").update(html).digest("hex"),
    jsRawBytes: assets.reduce((sum, asset) => sum + asset.rawBytes, 0),
    jsGzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    jsBrotliBytes: assets.reduce((sum, asset) => sum + asset.brotliBytes, 0),
    assets,
  };
}

async function staticServer(directory, port) {
  const cached = new Map();
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      let file = resolve(directory, `.${path}`);
      if (file !== directory && !file.startsWith(`${directory}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      let exists = false;
      try {
        exists = (await stat(file)).isFile();
      } catch {
        exists = false;
      }
      if (!exists) {
        if (extname(path)) {
          response.writeHead(404).end();
          return;
        }
        file = resolve(directory, "index.html");
      }
      let content = cached.get(file);
      if (!content) {
        content = gzipSync(await readFile(file));
        cached.set(file, content);
      }
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".jpeg": "image/jpeg",
      };
      response.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Encoding": "gzip",
        "Content-Length": content.length,
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((complete, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", complete);
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((complete, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          complete();
        });
        server.closeAllConnections();
      }),
  };
}

async function measureRoute(browser, origin, route, enforceIsolation, chartAssets) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: "cellular3g",
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Performance.enable");
    const apiCounts = {};
    const jsResponses = new Map();
    const jsTransfer = new Map();
    const failures = [];
    let blockedExternalRequests = 0;
    page.on("pageerror", (error) => failures.push(error.name));
    cdp.on("Network.responseReceived", ({ requestId, response }) => {
      const url = new URL(response.url);
      if (url.origin === origin && url.pathname.endsWith(".js")) {
        jsResponses.set(requestId, url.pathname);
      }
    });
    cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
      if (jsResponses.has(requestId)) {
        jsTransfer.set(requestId, encodedDataLength);
      }
    });
    await context.route("**/*", async (requestRoute) => {
      const url = new URL(requestRoute.request().url());
      if (url.origin !== origin) {
        blockedExternalRequests += 1;
        await requestRoute.abort();
        return;
      }
      const fixture = fixtureResponse(url.pathname);
      if (fixture) {
        apiCounts[url.pathname] = (apiCounts[url.pathname] || 0) + 1;
        let status = 200;
        if (url.pathname.startsWith("/auth/business/")) {
          status = 401;
        }
        await requestRoute.fulfill({ status, json: fixture });
        return;
      }
      if (/^\/(?:auth|api|tickets|admin)\//.test(url.pathname)) {
        throw new Error("Unexpected API request in synthetic browser benchmark");
      }
      await requestRoute.continue();
    });
    await page.addInitScript(() => {
      window.__seatpingMeasurements = { lcpMs: null, cls: 0, longTasksMs: [] };
      let shiftSessionStart = 0;
      let lastShift = 0;
      let shiftSessionValue = 0;
      const observations = {
        "largest-contentful-paint": (entries) => {
          for (const entry of entries) {
            window.__seatpingMeasurements.lcpMs = entry.startTime;
          }
        },
        "layout-shift": (entries) => {
          for (const entry of entries) {
            if (!entry.hadRecentInput) {
              if (
                shiftSessionValue > 0 &&
                entry.startTime - lastShift < 1000 &&
                entry.startTime - shiftSessionStart < 5000
              ) {
                shiftSessionValue += entry.value;
              } else {
                shiftSessionStart = entry.startTime;
                shiftSessionValue = entry.value;
              }
              lastShift = entry.startTime;
              window.__seatpingMeasurements.cls = Math.max(
                window.__seatpingMeasurements.cls,
                shiftSessionValue,
              );
            }
          }
        },
        longtask: (entries) => {
          for (const entry of entries) {
            window.__seatpingMeasurements.longTasksMs.push(entry.duration);
          }
        },
      };
      for (const [type, observe] of Object.entries(observations)) {
        if (PerformanceObserver.supportedEntryTypes.includes(type)) {
          new PerformanceObserver((list) => observe(list.getEntries())).observe({
            type,
            buffered: true,
          });
        }
      }
    });
    const started = performance.now();
    await page.goto(`${origin}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    let ready = page.locator(route.ready).first();
    if (route.text) {
      ready = ready.filter({ hasText: route.text });
    }
    await ready.waitFor({ state: "visible", timeout: 60_000 });
    const routeDomReadyMs = performance.now() - started;
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const browserMetrics = await page.evaluate(() => {
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .map((entry) => ({
          file: new URL(entry.name).pathname,
          decodedBodyBytes: entry.decodedBodySize,
          encodedBodyBytes: entry.encodedBodySize,
          transferBytes: entry.transferSize,
        }));
      return {
        ...window.__seatpingMeasurements,
        supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
        resources,
        domContentLoadedMs: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd,
      };
    });
    const { metrics } = await cdp.send("Performance.getMetrics");
    const scriptDuration = metrics.find((metric) => metric.name === "ScriptDuration")?.value;
    const fetchedScripts = [...new Set(jsResponses.values())].sort();
    const unrelatedChunks = fetchedScripts.filter(
      (path) => /\/(?:Business|Admin|Floor|Campaign)|recharts/i.test(path) || chartAssets.has(path),
    );
    if (enforceIsolation && route.name === "home" && unrelatedChunks.length > 0) {
      throw new Error("Consumer landing eagerly loaded unrelated business chunks");
    }
    if (failures.length > 0) {
      throw new Error(`Browser benchmark encountered ${failures.length} application errors`);
    }
    if (fetchedScripts.length === 0) {
      throw new Error("No JavaScript resource measurements were captured");
    }
    let scriptExecutionMs = null;
    if (typeof scriptDuration === "number") {
      scriptExecutionMs = scriptDuration * 1000;
    }
    let syntheticCls = null;
    if (browserMetrics.supportedEntryTypes.includes("layout-shift")) {
      syntheticCls = browserMetrics.cls;
    }
    return {
      route: route.name,
      routeDomReadyMs,
      domContentLoadedMs: browserMetrics.domContentLoadedMs,
      scriptExecutionMs,
      jsDecodedBodyBytes: browserMetrics.resources.reduce(
        (sum, resource) => sum + resource.decodedBodyBytes,
        0,
      ),
      jsEncodedBodyBytes: browserMetrics.resources.reduce(
        (sum, resource) => sum + resource.encodedBodyBytes,
        0,
      ),
      jsTransferBytesIncludingHeaders: [...jsTransfer.values()].reduce(
        (sum, bytes) => sum + bytes,
        0,
      ),
      apiRequestCount: Object.values(apiCounts).reduce((sum, count) => sum + count, 0),
      apiCounts,
      fetchedScripts,
      unrelatedChunks,
      blockedExternalRequests,
      syntheticLcpMs: browserMetrics.lcpMs,
      syntheticCls,
      longTaskCount: browserMetrics.longTasksMs.length,
      longTaskTotalMs: browserMetrics.longTasksMs.reduce((sum, duration) => sum + duration, 0),
      resources: browserMetrics.resources,
    };
  } finally {
    await context.close();
  }
}

function median(values) {
  const sorted = values
    .filter((value) => typeof value === "number")
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return "Not Measured";
  }
  return sorted[Math.floor(sorted.length / 2)];
}

async function measureCohort(browser, directory, port, enforceIsolation) {
  const build = await buildMetadata(directory);
  const chartAssets = new Set(
    build.assets
      .filter((asset) => asset.containsRechartsRuntime)
      .map((asset) => `/assets/${asset.name}`),
  );
  const server = await staticServer(directory, port);
  const samples = [];
  try {
    for (let index = 0; index < sampleCount; index++) {
      for (const route of routes) {
        samples.push({
          sample: index + 1,
          ...(await measureRoute(browser, server.origin, route, enforceIsolation, chartAssets)),
        });
        let cohort = "before";
        if (enforceIsolation) {
          cohort = "after";
        }
        process.stdout.write(`Measured ${cohort} ${route.name} sample ${index + 1}\n`);
      }
    }
  } finally {
    await server.close();
  }
  const summary = routes.map((route) => {
    const measurements = samples.filter((sample) => sample.route === route.name);
    return {
      route: route.name,
      samples: measurements.length,
      routeDomReadyP50Ms: median(measurements.map((sample) => sample.routeDomReadyMs)),
      scriptExecutionP50Ms: median(measurements.map((sample) => sample.scriptExecutionMs)),
      jsDecodedBodyBytes: measurements[0].jsDecodedBodyBytes,
      jsEncodedBodyBytes: measurements[0].jsEncodedBodyBytes,
      jsTransferBytesIncludingHeadersP50: median(
        measurements.map((sample) => sample.jsTransferBytesIncludingHeaders),
      ),
      apiRequestCount: measurements[0].apiRequestCount,
      syntheticLcpP50Ms: median(measurements.map((sample) => sample.syntheticLcpMs)),
      syntheticClsP50: median(measurements.map((sample) => sample.syntheticCls)),
    };
  });
  return { build, summary, samples };
}

const browser = await chromium.launch({ headless: true });
try {
  const report = {
    event: "seatping.synthetic.browser",
    capturedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    browser: browser.version(),
    protocol: {
      samplesPerRoutePerCohort: sampleCount,
      fixture:
        "10 synthetic restaurant cards, no reviews, anonymous session, no private customer data",
      viewport: "390x844, device scale factor 1, mobile touch",
      network: "CDP 150ms latency, 1.6Mbps down, 750kbps up, fresh context and disabled HTTP cache",
      cpu: "CDP 4x throttling",
      server: "Local HTTP, gzip level 6, no-store, SPA history fallback",
      api: "Immediate in-browser synthetic anonymous fixture responses, no API or database server",
      assets: "All remote images, fonts and analytics blocked; local branding assets permitted",
      lcp: "Synthetic local text and branding conditions, remote hero/profile images blocked; not field Web Vitals",
      script:
        "CDP ScriptDuration includes all script execution through idle observation, not isolated parsing cost",
      order:
        "Sequential before cohort then after cohort; machine noise and cohort order may affect timings",
    },
    before: await measureCohort(browser, beforeDirectory, 8193, false),
    productionMetrics: "Not Measured",
    isolatedJsParseMs: "Not Measured",
    databaseQueries: "Not Measured",
    databasePoolBehavior: "Not Measured",
  };
  if (!baselineOnly) {
    report.after = await measureCohort(browser, afterDirectory, 8194, true);
  }
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ output, before: report.before.summary, after: report.after?.summary }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
