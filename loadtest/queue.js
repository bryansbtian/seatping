// loadtest/queue.js
//
// SCENARIO C — Queue join contention. WRITE TEST. LOCAL / PREVIEW / STAGING ONLY.
//
// Simulates many customers joining the SAME location's queue quickly. Exercises
// QueueEntry creation, the queue-join rate limiters, and the notification
// hand-off path — WITHOUT sending anything real.
//
// SAFETY — why this does not send SMS/WhatsApp/email:
//   - We always join with notificationMethod="email" using a fake .invalid
//     address. Per SeatPing's design, email queue notifications do NOT consume
//     business credits (only SMS/WhatsApp do), so no credits are spent.
//   - The target env MUST have notification provider keys unset (no TELNYX_*,
//     no WhatsApp, no email provider). With QStash unset the send runs inline
//     and each provider no-ops when its keys are missing, so nothing leaves the
//     box. CONFIRM THIS before running.
//   - Requires ALLOW_WRITE_LOAD_TEST=true and refuses denylisted prod hosts.
//
// RATE LIMIT BEHAVIOR (expected, not a failure):
//   - queue-join per (location+contact): 3 per 10 min. Each VU uses a UNIQUE
//     fake contact, so this limiter does NOT trip during normal contention.
//   - queue-join per IP: 60/hr. From a single load-generator IP you WILL hit
//     this after ~60 joins; 429s beyond that are expected and tracked.
//
//   ALLOW_WRITE_LOAD_TEST=true \
//   BASE_URL=http://localhost:4000 \
//   TEST_BUSINESS_USERNAME=demo TEST_LOCATION_ID=... \
//   npm run loadtest:queue
//
// Tunables: QUEUE_VUS (default 30), QUEUE_ITERATIONS (default 120).

import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import {
  BASE_URL,
  TEST_BUSINESS_USERNAME,
  TEST_LOCATION_ID,
  JSON_HEADERS,
  fakeEmail,
  uid,
  assertWriteAllowed,
  requireEnv,
} from "./lib/config.js";

const joined = new Counter("queue_joined_total");
const rate429 = new Rate("rate_429");
const serverErrors = new Counter("server_errors");
const closedOrDisabled = new Counter("queue_closed_total");

const VUS = parseInt(__ENV.QUEUE_VUS || "30", 10);
const ITERATIONS = parseInt(__ENV.QUEUE_ITERATIONS || "120", 10);

export const options = {
  scenarios: {
    join: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "2m",
    },
  },
  thresholds: {
    server_errors: ["count==0"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  assertWriteAllowed("queue join contention");
  requireEnv("queue join contention", [
    "TEST_BUSINESS_USERNAME",
    "TEST_LOCATION_ID",
  ]);
  return {};
}

export default function () {
  // Unique email per join => the per-(location+contact) limiter (3/10min) is not
  // the thing under test here; we are testing concurrent entry creation + the
  // per-IP backstop. Email method => no credits spent, no real send.
  const body = JSON.stringify({
    locationId: TEST_LOCATION_ID,
    firstName: "Load",
    lastName: `Test-${uid()}`,
    numGuests: 1 + Math.floor(Math.random() * 4),
    notificationMethod: "email",
    email: fakeEmail(),
  });

  const res = http.post(
    `${BASE_URL}/auth/business/${encodeURIComponent(
      TEST_BUSINESS_USERNAME,
    )}/queue`,
    body,
    { headers: JSON_HEADERS, tags: { name: "queue-join" } },
  );

  rate429.add(res.status === 429);

  if (res.status === 200) {
    joined.add(1);
  } else if (res.status === 400 || res.status === 404) {
    // Location closed / queue disabled / invalid — surface but don't fail hard;
    // the operator should ensure the test location is open for a real run.
    closedOrDisabled.add(1);
  } else if (res.status >= 500) {
    serverErrors.add(1);
    console.error(`[queue] 5xx: ${res.status} ${res.body}`);
  }

  check(res, {
    "no server error": (r) => r.status < 500,
    "expected status (200/400/404/429)": (r) =>
      [200, 400, 404, 429].includes(r.status),
  });
}

export function teardown() {
  console.log(
    "\n[queue] Verify: QueueEntry rows created == queue_joined_total; no real\n" +
      "SMS/WhatsApp/email was sent (check provider dashboards show zero); and\n" +
      "business credits are UNCHANGED (email method must not spend credits).\n" +
      "Then delete the test QueueEntry rows for TEST_LOCATION_ID.\n",
  );
}
