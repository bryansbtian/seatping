// loadtest/lib/config.js
//
// Shared configuration + safety guards for all SeatPing k6 load tests.
//
// k6 reads environment via `__ENV`. Pass vars with `-e KEY=value` or export them
// in your shell before running. This module centralises:
//   - reading the standard SeatPing test env vars (with safe defaults),
//   - detecting whether BASE_URL "looks like production",
//   - guarding write-heavy tests behind an explicit opt-in flag.
//
// IMPORTANT: nothing here ever talks to the database directly. These scripts
// only exercise the public HTTP API exactly as a real client would.

import exec from "k6/execution";

// ---------------------------------------------------------------------------
// Raw env
// ---------------------------------------------------------------------------
export const BASE_URL = (__ENV.BASE_URL || "http://localhost:4000").replace(
  /\/+$/,
  "",
);

export const TEST_BUSINESS_USERNAME = __ENV.TEST_BUSINESS_USERNAME || "";
export const TEST_LOCATION_ID = __ENV.TEST_LOCATION_ID || "";
export const TEST_QUEUE_TOKEN = __ENV.TEST_QUEUE_TOKEN || "";
export const TEST_RESERVATION_DATE = __ENV.TEST_RESERVATION_DATE || "";
export const TEST_RESERVATION_TIME = __ENV.TEST_RESERVATION_TIME || "";

// LOAD_TEST_MODE is a free-form label ("local" | "preview" | "staging") used
// only for logging/reporting context. It does NOT relax any safety guard.
export const LOAD_TEST_MODE = __ENV.LOAD_TEST_MODE || "local";

// Explicit opt-in required by every test that creates data (reservations,
// queue entries, logins, feedback). Absent => write tests refuse to run.
export const ALLOW_WRITE_LOAD_TEST =
  String(__ENV.ALLOW_WRITE_LOAD_TEST || "").toLowerCase() === "true";

// Comma-separated list of host substrings that are ALWAYS treated as
// production and can never be targeted by a write test, even with the opt-in
// flag set. Override per-project, e.g.
//   -e PROD_URL_DENY=seatping.com,app.seatping.com
export const PROD_URL_DENY = (__ENV.PROD_URL_DENY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Host classification
// ---------------------------------------------------------------------------
function hostOf(url) {
  // k6 has no URL global; parse the authority section manually.
  const m = /^https?:\/\/([^/]+)/i.exec(url);
  return m ? m[1].toLowerCase() : "";
}

/** True when BASE_URL is clearly a local dev target. */
export function isLocalHost() {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)(:\d+)?$/i.test(
    hostOf(BASE_URL),
  );
}

/** True when BASE_URL matches the explicit production denylist. */
export function isDenylistedProd() {
  const host = hostOf(BASE_URL);
  return PROD_URL_DENY.some((deny) => host.includes(deny));
}

/**
 * Heuristic: anything that is NOT localhost is "remote" and treated as
 * potentially sensitive. We only *hard block* denylisted prod hosts; other
 * remote hosts (preview/staging) get a loud warning and still require the
 * write opt-in.
 */
export function looksRemote() {
  return !isLocalHost();
}

// ---------------------------------------------------------------------------
// Guards (call these from a test's setup()).
// ---------------------------------------------------------------------------

/** Abort the whole test run with a clear banner. */
function abort(msg) {
  // exec.test.abort stops every VU immediately and exits non-zero.
  exec.test.abort(`\n\n!!! LOAD TEST ABORTED !!!\n${msg}\n`);
}

function banner(lines) {
  const bar = "=".repeat(72);
  console.log(`\n${bar}\n${lines.join("\n")}\n${bar}\n`);
}

/**
 * Print the resolved configuration once at the start of a run. Read-only tests
 * call this; write tests call assertWriteAllowed (which calls this too).
 */
export function logConfig(testName) {
  banner([
    `SeatPing load test: ${testName}`,
    `  BASE_URL        = ${BASE_URL}`,
    `  LOAD_TEST_MODE  = ${LOAD_TEST_MODE}`,
    `  local target?   = ${isLocalHost() ? "yes" : "NO (remote)"}`,
    `  business/loc    = ${TEST_BUSINESS_USERNAME || "(unset)"} / ${
      TEST_LOCATION_ID || "(unset)"
    }`,
  ]);
}

/**
 * Gate for WRITE tests (reservation create, queue join, login, feedback).
 * Order of checks:
 *   1. Denylisted production host  -> hard abort, no override possible.
 *   2. Missing ALLOW_WRITE_LOAD_TEST=true -> abort with instructions.
 *   3. Remote (non-local) target   -> loud warning, continue (it's preview/staging).
 */
export function assertWriteAllowed(testName) {
  logConfig(testName);

  if (isDenylistedProd()) {
    abort(
      [
        `BASE_URL (${BASE_URL}) matches the production denylist (PROD_URL_DENY).`,
        `Write load tests must NEVER run against production.`,
        `Point BASE_URL at a local/preview/staging environment instead.`,
      ].join("\n"),
    );
  }

  if (!ALLOW_WRITE_LOAD_TEST) {
    abort(
      [
        `"${testName}" CREATES DATA (reservations / queue entries / logins / feedback).`,
        `Refusing to run without explicit opt-in.`,
        ``,
        `If you are targeting a local/preview/staging env (NOT production), re-run with:`,
        `    -e ALLOW_WRITE_LOAD_TEST=true`,
        ``,
        `Also confirm notification provider keys (TELNYX_*, WhatsApp, email) are`,
        `UNSET in that environment so no real SMS/WhatsApp/email is sent.`,
      ].join("\n"),
    );
  }

  if (looksRemote()) {
    banner([
      `⚠️  WRITE LOAD TEST AGAINST A REMOTE TARGET ⚠️`,
      `  ${BASE_URL}`,
      `  This is allowed (ALLOW_WRITE_LOAD_TEST=true) but make sure it is a`,
      `  PREVIEW/STAGING deployment and NOT production, and that notification`,
      `  providers are disabled there. Real customers/credits must not be affected.`,
    ]);
  }
}

/** Require a set of env vars or abort with a precise list of what's missing. */
export function requireEnv(testName, names) {
  const missing = names.filter((n) => !(__ENV[n] && String(__ENV[n]).trim()));
  if (missing.length) {
    abort(
      [
        `"${testName}" needs these env vars but they are unset:`,
        ...missing.map((n) => `    - ${n}`),
        ``,
        `See loadtest/README.md for how to obtain them with fake test data.`,
      ].join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Unique-ish suffix so generated test data never collides across VUs/iters. */
export function uid() {
  return `${Date.now().toString(36)}-${exec.vu.idInTest}-${exec.vu.iterationInInstance}-${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`;
}

/** A clearly-fake email that is easy to identify and purge later. */
export function fakeEmail() {
  return `loadtest+${uid()}@seatping-loadtest.invalid`;
}

/** A clearly-fake (non-routable) phone-ish string for queue join validation. */
export function fakePhone() {
  // 555-01xx range is reserved for fictional use; keep it obviously fake.
  const n = 1000 + Math.floor(Math.random() * 8999);
  return `+1555010${n}`;
}

export const JSON_HEADERS = { "Content-Type": "application/json" };
