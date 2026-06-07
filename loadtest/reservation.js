// loadtest/reservation.js
//
// SCENARIO B — Reservation contention. WRITE TEST. LOCAL / PREVIEW / STAGING ONLY.
//
// Simulates many users trying to book the SAME location at the SAME date+time,
// to prove the atomic per-hour capacity guard (tryReserveCapacity) prevents
// overbooking under concurrency. Every VU requests a small party for the exact
// same slot; the server should accept bookings only up to the configured
// maxReservedGuestsPerHour and reject the rest with a 400 "fully booked".
//
// SAFETY:
//   - Requires ALLOW_WRITE_LOAD_TEST=true (it creates real DB rows).
//   - Hard-refuses denylisted production hosts (PROD_URL_DENY).
//   - Creates reservations, so the target env MUST have notification providers
//     unset (no TELNYX_*, WhatsApp, or email keys) — confirmation emails will
//     then no-op. Reservations are email-only; use a fake .invalid address.
//   - Use a FUTURE TEST_RESERVATION_DATE/TIME and a throwaway test location.
//
//   ALLOW_WRITE_LOAD_TEST=true \
//   BASE_URL=http://localhost:4000 \
//   TEST_BUSINESS_USERNAME=demo TEST_LOCATION_ID=... \
//   TEST_RESERVATION_DATE=2026-12-31 TEST_RESERVATION_TIME=19:00 \
//   npm run loadtest:reservation
//
// HOW OVERBOOKING IS VERIFIED:
//   k6 cannot read your DB, so this records `created_total` (HTTP 200) and
//   `created_guests` (sum of party sizes that succeeded). After the run, compare
//   created_guests against that location's maxReservedGuestsPerHour for the
//   slot: created_guests MUST be <= the cap. Also spot-check the DB row count.
//   Any HTTP 5xx, or created_guests exceeding the cap, indicates a real bug.

import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import {
  BASE_URL,
  TEST_BUSINESS_USERNAME,
  TEST_LOCATION_ID,
  TEST_RESERVATION_DATE,
  TEST_RESERVATION_TIME,
  JSON_HEADERS,
  fakeEmail,
  assertWriteAllowed,
  requireEnv,
} from "./lib/config.js";

const createdTotal = new Counter("created_total");
const createdGuests = new Counter("created_guests");
const fullyBooked = new Counter("fully_booked_total");
const rate429 = new Rate("rate_429");
const serverErrors = new Counter("server_errors");

// Party size per VU. Keep small so the cap is reached gradually (good contention).
const PARTY_SIZE = parseInt(__ENV.RES_PARTY_SIZE || "2", 10);
// Number of concurrent bookers slamming the single slot.
const VUS = parseInt(__ENV.RES_VUS || "50", 10);
const ITERATIONS = parseInt(__ENV.RES_ITERATIONS || "200", 10);

export const options = {
  scenarios: {
    contention: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "2m",
    },
  },
  thresholds: {
    // The ONLY hard correctness gate that k6 can assert by itself: never a 5xx.
    server_errors: ["count==0"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  assertWriteAllowed("reservation contention");
  requireEnv("reservation contention", [
    "TEST_BUSINESS_USERNAME",
    "TEST_LOCATION_ID",
    "TEST_RESERVATION_DATE",
    "TEST_RESERVATION_TIME",
  ]);
  return {};
}

export default function () {
  const body = JSON.stringify({
    firstName: "Load",
    lastName: "Test",
    email: fakeEmail(),
    partySize: PARTY_SIZE,
    date: TEST_RESERVATION_DATE,
    time: TEST_RESERVATION_TIME,
    notes: "automated load test - safe to delete",
  });

  const res = http.post(
    `${BASE_URL}/api/reservations/${encodeURIComponent(
      TEST_BUSINESS_USERNAME,
    )}/${encodeURIComponent(TEST_LOCATION_ID)}`,
    body,
    { headers: JSON_HEADERS, tags: { name: "reservation-create" } },
  );

  rate429.add(res.status === 429);

  if (res.status === 200) {
    createdTotal.add(1);
    createdGuests.add(PARTY_SIZE);
  } else if (res.status === 400) {
    // Expected once the slot is full ("fully booked") or for validation errors.
    fullyBooked.add(1);
  } else if (res.status >= 500) {
    serverErrors.add(1);
    console.error(`[reservation] 5xx: ${res.status} ${res.body}`);
  }

  check(res, {
    "no server error": (r) => r.status < 500,
    "expected status (200/400/429)": (r) =>
      r.status === 200 || r.status === 400 || r.status === 429,
  });
}

export function teardown() {
  console.log(
    "\n[reservation] Compare created_guests against this slot's " +
      "maxReservedGuestsPerHour. created_guests MUST be <= the cap (no overbooking).\n" +
      "Then delete the test rows for TEST_LOCATION_ID at the test date/time.\n",
  );
}
