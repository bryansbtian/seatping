// loadtest/smoke.js
//
// SMOKE TEST — read-only, tiny load. Safe to run anywhere, including production.
//
// Verifies the deployment is up and the core public read endpoints respond with
// 2xx before you bother running the heavier scenarios. Sends a handful of
// requests from a single VU.
//
//   npm run loadtest:smoke
//   BASE_URL=https://preview.example.com npm run loadtest:smoke
//
// No data is created.

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, TEST_BUSINESS_USERNAME, logConfig } from "./lib/config.js";

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    // Smoke must be effectively perfect; any failure means the env is broken.
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export function setup() {
  logConfig("smoke (read-only, production-safe)");
}

export default function () {
  // 1. Search endpoint with an empty query (returns all / first page).
  const search = http.get(`${BASE_URL}/api/search/restaurants?query=&limit=5`, {
    tags: { name: "search" },
  });
  check(search, {
    "search 200": (r) => r.status === 200,
    "search returns json": (r) =>
      (r.headers["Content-Type"] || "").includes("application/json"),
  });

  // 2. Public business addresses (only if a username is provided).
  if (TEST_BUSINESS_USERNAME) {
    const addr = http.get(
      `${BASE_URL}/auth/business/${encodeURIComponent(
        TEST_BUSINESS_USERNAME,
      )}/addresses`,
      { tags: { name: "addresses" } },
    );
    check(addr, { "addresses <500": (r) => r.status < 500 });
  }

  // 3. Session probe (should be 200 with an unauthenticated body, never 5xx).
  const session = http.get(`${BASE_URL}/auth/session`, {
    tags: { name: "session" },
  });
  check(session, { "session <500": (r) => r.status < 500 });

  sleep(1);
}
