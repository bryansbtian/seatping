// loadtest/search.js
//
// SCENARIO A — Search & browse load. READ-ONLY. Production-safe.
//
// Drives the public, unauthenticated read paths a browsing visitor hits:
// restaurant search (DB-heavy, regex match across locations) and address
// suggestions. No data is created, so this is safe to run against production
// in moderation. It is still rate limited (search-restaurants-ip: 60/min, and
// the global 200/min/IP backstop), so from a single source IP you WILL see
// 429s at higher VU counts — that is expected and tracked, not a failure.
//
//   npm run loadtest:search
//   BASE_URL=https://preview.example.com npm run loadtest:search
//
// Tunables (env): SEARCH_VUS (default 10), SEARCH_DURATION (default 1m).

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import {
  BASE_URL,
  TEST_BUSINESS_USERNAME,
  logConfig,
} from "./lib/config.js";

const rate429 = new Rate("rate_429");
const searchLatency = new Trend("search_latency", true);

const VUS = parseInt(__ENV.SEARCH_VUS || "10", 10);
const DURATION = __ENV.SEARCH_DURATION || "1m";

export const options = {
  scenarios: {
    browse: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // Non-429 failures should be rare. 429s are tracked separately because a
    // single-IP load generator legitimately trips the per-IP search limiter.
    "http_req_failed{expected_response:true}": ["rate<0.02"],
    http_req_duration: ["p(95)<800"],
    // Sanity ceiling: if essentially everything is 429, the test told us nothing
    // about throughput — surface that loudly.
    rate_429: ["rate<0.80"],
  },
};

// A spread of realistic-ish search terms plus empty (browse-all).
const TERMS = ["", "pizza", "sushi", "cafe", "bar", "thai", "burger", "grill", "noodle", "taco"];

export function setup() {
  logConfig("search (read-only, production-safe)");
}

export default function () {
  const q = TERMS[Math.floor(Math.random() * TERMS.length)];
  const page = 1 + Math.floor(Math.random() * 2);

  const res = http.get(
    `${BASE_URL}/api/search/restaurants?query=${encodeURIComponent(
      q,
    )}&limit=10&page=${page}`,
    { tags: { name: "search" } },
  );

  rate429.add(res.status === 429);
  searchLatency.add(res.timings.duration);

  check(res, {
    "search ok or throttled": (r) => r.status === 200 || r.status === 429,
    "search not 5xx": (r) => r.status < 500,
  });

  // Occasionally hit the address-suggestion endpoint to mimic a browse session.
  if (TEST_BUSINESS_USERNAME && Math.random() < 0.3) {
    const addr = http.get(
      `${BASE_URL}/auth/business/${encodeURIComponent(
        TEST_BUSINESS_USERNAME,
      )}/addresses`,
      { tags: { name: "addresses" } },
    );
    rate429.add(addr.status === 429);
    check(addr, { "addresses not 5xx": (r) => r.status < 500 });
  }

  sleep(Math.random() * 1.5 + 0.5); // 0.5–2s think time
}
