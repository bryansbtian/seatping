// loadtest/queue-status.js
//
// SCENARIO E — Queue status polling. READ-ONLY. Safe (incl. production, lightly).
//
// Real waiting customers' phones poll GET .../queue/token/:queueToken/status
// every ~2s while on the live waiting screen. On shared venue WiFi / carrier
// CGNAT, dozens of waiters share ONE public IP, so the server EXEMPTS these
// status/eta GETs from the global per-IP limiter:
//
//   CUSTOMER_POLL_EXEMPT_RE = /^\/auth\/business\/[^/]+\/queue\/.+\/(status|eta)$/
//
// This test confirms that exemption holds: many VOLUME polls from a single IP at
// 2s cadence must NOT get 429s. (Without the exemption, the global 200/min/IP
// backstop would start 429ing a busy venue mid-wait.)
//
//   TEST_BUSINESS_USERNAME=demo TEST_QUEUE_TOKEN=<token from a real/seeded join> \
//   npm run loadtest:queue-status
//
// Getting a TEST_QUEUE_TOKEN: run loadtest:queue once (or join the queue in the
// UI) and copy the queueToken from the join response / DB. A valid token returns
// live status; an unknown token returns 200 with {admitted:false,...} and is
// still fine for proving the exemption (the limiter doesn't care about validity).
//
// Tunables: POLL_VUS (default 50), POLL_DURATION (default 1m), POLL_INTERVAL_S (2).

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import {
  BASE_URL,
  TEST_BUSINESS_USERNAME,
  TEST_QUEUE_TOKEN,
  logConfig,
  requireEnv,
} from "./lib/config.js";

const rate429 = new Rate("rate_429");
const pollLatency = new Trend("poll_latency", true);

const VUS = parseInt(__ENV.POLL_VUS || "50", 10);
const DURATION = __ENV.POLL_DURATION || "1m";
const INTERVAL = parseFloat(__ENV.POLL_INTERVAL_S || "2");

export const options = {
  scenarios: {
    poll: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // The whole point: the exemption means effectively ZERO 429s even from one
    // IP at high volume. Any 429 here is a regression in the exemption regex.
    rate_429: ["rate==0"],
    "http_req_failed{expected_response:true}": ["rate<0.02"],
    http_req_duration: ["p(95)<800"],
  },
};

export function setup() {
  logConfig("queue-status polling (read-only)");
  requireEnv("queue-status polling", [
    "TEST_BUSINESS_USERNAME",
    "TEST_QUEUE_TOKEN",
  ]);
}

export default function () {
  const url = `${BASE_URL}/auth/business/${encodeURIComponent(
    TEST_BUSINESS_USERNAME,
  )}/queue/token/${encodeURIComponent(TEST_QUEUE_TOKEN)}/status`;

  const res = http.get(url, { tags: { name: "queue-status" } });

  rate429.add(res.status === 429);
  pollLatency.add(res.timings.duration);

  check(res, {
    "status 200": (r) => r.status === 200,
    "NOT throttled (exemption works)": (r) => r.status !== 429,
  });

  if (res.status === 429) {
    console.error(
      "[queue-status] UNEXPECTED 429 — the poll exemption regex is not matching!",
    );
  }

  sleep(INTERVAL);
}
