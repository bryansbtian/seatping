// loadtest/ratelimit.js
//
// SCENARIO D — Rate limiter verification. LOCAL / PREVIEW / STAGING ONLY.
//
// Confirms protected endpoints start returning 429 after their configured
// thresholds. This is a CORRECTNESS test, not a throughput test: it sends
// requests serially from a single VU and asserts the FIRST N succeed (non-429)
// and a request beyond the cap is rejected with 429.
//
// SAFETY:
//   - This sends to write endpoints (login, queue join, reservation create,
//     feedback), so it requires ALLOW_WRITE_LOAD_TEST=true and refuses
//     denylisted prod hosts. Run only against local/preview/staging with
//     notification providers UNSET.
//   - It deliberately uses INVALID credentials for login (so no session is
//     created) and fake .invalid contacts elsewhere.
//   - It targets each limiter just past its threshold, not thousands of times.
//   - NOTE: the in-memory dev limiter is per-process and uses a fixed window;
//     Upstash Redis uses a sliding window. Exact trip counts can differ by ±1
//     near the boundary. With Redis configured the thresholds below are precise.
//
//   ALLOW_WRITE_LOAD_TEST=true BASE_URL=http://localhost:4000 \
//   TEST_BUSINESS_USERNAME=demo TEST_LOCATION_ID=... \
//   npm run loadtest:ratelimit
//
// Toggle individual checks with RL_LOGIN=1 RL_SEARCH=1 RL_QUEUE=1 RL_RES=1
// RL_FEEDBACK=1 (all default on).

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import {
  BASE_URL,
  TEST_BUSINESS_USERNAME,
  TEST_LOCATION_ID,
  TEST_RESERVATION_DATE,
  TEST_RESERVATION_TIME,
  JSON_HEADERS,
  fakeEmail,
  uid,
  assertWriteAllowed,
} from "./lib/config.js";

const passed = new Counter("rl_checks_passed");
const failed = new Counter("rl_checks_failed");

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // Every limiter assertion must pass.
    rl_checks_failed: ["count==0"],
  },
};

const on = (name, def = "1") => (__ENV[name] || def) !== "0";

export function setup() {
  assertWriteAllowed("rate limiter verification");
  return {};
}

// Fire `count` requests, return the array of status codes.
function burst(makeReq, count) {
  const codes = [];
  for (let i = 0; i < count; i++) codes.push(makeReq(i).status);
  return codes;
}

function assertTripsAt(label, codes, threshold) {
  // The first `threshold` responses must NOT be 429; at least one AFTER the
  // threshold must be 429.
  const before = codes.slice(0, threshold);
  const after = codes.slice(threshold);
  const ok =
    before.every((c) => c !== 429) && after.some((c) => c === 429);
  if (ok) {
    passed.add(1);
    console.log(`  ✓ ${label}: 429 after ~${threshold} (codes: ${codes.join(",")})`);
  } else {
    failed.add(1);
    console.error(
      `  ✗ ${label}: expected first ${threshold} non-429 then a 429.\n    codes: ${codes.join(
        ",",
      )}`,
    );
  }
  check(null, { [`${label} trips at threshold`]: () => ok });
}

export default function () {
  console.log("\n[ratelimit] Verifying per-endpoint thresholds...\n");

  // --- D1. Customer login: login-id 5 / 15min (trips before login-ip 10/15min)
  // Uses a single fake login id with a wrong password => 401/400 until 429.
  if (on("RL_LOGIN")) {
    const loginId = `loadtest+${uid()}@seatping-loadtest.invalid`;
    const codes = burst(
      () =>
        http.post(
          `${BASE_URL}/auth/login`,
          JSON.stringify({ emailOrUsername: loginId, password: "wrong-password" }),
          { headers: JSON_HEADERS, tags: { name: "rl-login" } },
        ),
      7, // cap is 5 per id
    );
    assertTripsAt("login (5/15min per id)", codes, 5);
  }

  // --- D2. Search: search-restaurants-ip 60 / 1min (also global 200/min/IP).
  // 65 quick requests from one IP should trip at ~60.
  if (on("RL_SEARCH")) {
    const codes = burst(
      (i) =>
        http.get(`${BASE_URL}/api/search/restaurants?query=rl${i}`, {
          tags: { name: "rl-search" },
        }),
      65,
    );
    assertTripsAt("search (60/min per IP)", codes, 60);
  }

  // --- D3. Feedback: feedback-ip 10 / 1hr (trips before feedback-email 3/hr,
  // but we use unique emails so the IP cap is what we measure... actually the
  // per-email cap (3/hr) is stricter with a FIXED email, so use a fixed email
  // to trip at 3).
  if (on("RL_FEEDBACK")) {
    const email = fakeEmail();
    const codes = burst(
      () =>
        http.post(
          `${BASE_URL}/api/feedback/submit`,
          JSON.stringify({
            email,
            message: "automated rate-limit verification - ignore",
            rating: 5,
          }),
          { headers: JSON_HEADERS, tags: { name: "rl-feedback" } },
        ),
      5, // per-email cap is 3/hr
    );
    assertTripsAt("feedback (3/hr per email)", codes, 3);
  }

  // --- D4. Queue join: queue-join-target 3 / 10min per (location+contact).
  // Reuse ONE fake email at ONE location => trips at 3.
  if (on("RL_QUEUE") && TEST_BUSINESS_USERNAME && TEST_LOCATION_ID) {
    const email = fakeEmail();
    const codes = burst(
      () =>
        http.post(
          `${BASE_URL}/auth/business/${encodeURIComponent(
            TEST_BUSINESS_USERNAME,
          )}/queue`,
          JSON.stringify({
            locationId: TEST_LOCATION_ID,
            firstName: "RL",
            lastName: "Test",
            numGuests: 2,
            notificationMethod: "email",
            email,
          }),
          { headers: JSON_HEADERS, tags: { name: "rl-queue" } },
        ),
      5, // per (location+contact) cap is 3/10min
    );
    assertTripsAt("queue join (3/10min per location+contact)", codes, 3);
  }

  // --- D5. Reservation create: reservation-create-target 3 / 1hr per
  // (location+email). Reuse ONE fake email at ONE location => trips at 3.
  if (
    on("RL_RES") &&
    TEST_BUSINESS_USERNAME &&
    TEST_LOCATION_ID &&
    TEST_RESERVATION_DATE &&
    TEST_RESERVATION_TIME
  ) {
    const email = fakeEmail();
    const codes = burst(
      () =>
        http.post(
          `${BASE_URL}/api/reservations/${encodeURIComponent(
            TEST_BUSINESS_USERNAME,
          )}/${encodeURIComponent(TEST_LOCATION_ID)}`,
          JSON.stringify({
            firstName: "RL",
            lastName: "Test",
            email,
            partySize: 2,
            date: TEST_RESERVATION_DATE,
            time: TEST_RESERVATION_TIME,
          }),
          { headers: JSON_HEADERS, tags: { name: "rl-reservation" } },
        ),
      5, // per (location+email) cap is 3/hr
    );
    // Note: a full slot returns 400 (still non-429), which does not break the
    // assertion — we only require the first 3 to be non-429 and a later 429.
    assertTripsAt("reservation (3/hr per location+email)", codes, 3);
  }

  console.log("\n[ratelimit] Done. See rl_checks_passed / rl_checks_failed.\n");
}
