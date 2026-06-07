# SeatPing Load Testing

Repeatable [k6](https://k6.io) load tests for the SeatPing public API. They help
answer: **can SeatPing handle realistic traffic without breaking search, queue
joins, reservations, rate limiting, notification safety, or MongoDB
performance?**

> **k6 was chosen** over Artillery/Locust because it is a single static binary
> (no runtime to install), scripts are plain JS, it has first-class thresholds
> and per-tag metrics, and it handles thousands of VUs on a laptop. No project
> dependency is added — k6 runs the scripts directly.

---

## TL;DR safety rules

| Test | Writes data? | Safe on production? | Where to run |
|------|:---:|:---:|---|
| `loadtest:smoke` | No | ✅ Yes (tiny) | anywhere |
| `loadtest:search` | No | ✅ Yes (read-only, in moderation) | anywhere |
| `loadtest:queue-status` | No | ✅ Yes (read-only) | anywhere |
| `loadtest:reservation` | **Yes** | ❌ **No** | local / preview / staging |
| `loadtest:queue` | **Yes** | ❌ **No** | local / preview / staging |
| `loadtest:ratelimit` | **Yes** | ❌ **No** | local / preview / staging |

Write tests **refuse to run** unless you pass `ALLOW_WRITE_LOAD_TEST=true`, and
they **hard-abort** if `BASE_URL` matches `PROD_URL_DENY`. Set `PROD_URL_DENY`
to your real domain(s) so the guard actually protects you.

**Before any write test, confirm the target environment has notification
provider keys UNSET** (`TELNYX_API_KEY`, WhatsApp, email/Resend, and ideally
`QSTASH_TOKEN`). With those unset, SeatPing's senders no-op, so no real SMS,
WhatsApp, or email is sent and no business credits are spent.

---

## Install k6

```bash
brew install k6            # macOS
# or: https://grafana.com/docs/k6/latest/set-up/install-k6/
k6 version                 # confirm it's installed
```

## Configure

k6 reads configuration from environment variables (`__ENV`). Copy the example
and fill it in:

```bash
cp loadtest/.env.loadtest.example loadtest/my.env
# edit loadtest/my.env
set -a; source loadtest/my.env; set +a   # export into your shell
```

Or pass vars inline: `k6 run -e BASE_URL=... loadtest/search.js`.

### Environment variables

| Var | Used by | Meaning |
|-----|---------|---------|
| `BASE_URL` | all | Target base URL. Default `http://localhost:4000`. |
| `LOAD_TEST_MODE` | all | Label only (`local`/`preview`/`staging`). Does not relax safety. |
| `TEST_BUSINESS_USERNAME` | most | A test business username. |
| `TEST_LOCATION_ID` | reservation, queue, ratelimit | A test location id (queue + reservations enabled). |
| `TEST_QUEUE_TOKEN` | queue-status | A `queueToken` from a join, for the polling test. |
| `TEST_RESERVATION_DATE` | reservation, ratelimit | Future date `YYYY-MM-DD` for the contended slot. |
| `TEST_RESERVATION_TIME` | reservation, ratelimit | Time `HH:MM` for the contended slot. |
| `ALLOW_WRITE_LOAD_TEST` | write tests | Must be `true` or the write test aborts. |
| `PROD_URL_DENY` | write tests | Comma-separated prod host substrings that are always blocked. |

Per-test tunables (VUs/duration) are documented at the top of each script, e.g.
`SEARCH_VUS`, `RES_VUS`, `QUEUE_VUS`, `POLL_VUS`.

---

## The tests

### A. `loadtest:search` — search & browse (read-only) ✅ prod-safe
Drives `GET /api/search/restaurants` (DB-heavy regex match) plus address
suggestions with a pool of search terms and think-time. Measures latency, error
rate, and 429 rate.

```bash
npm run loadtest:search
SEARCH_VUS=25 SEARCH_DURATION=2m npm run loadtest:search
```
Expect some 429s at higher VU counts from a single IP (the `search-restaurants-ip`
60/min and global 200/min limiters) — those are **tracked, not failures**.

### B. `loadtest:reservation` — reservation contention (WRITE) ❌ local/preview only
Many VUs book the **same location + date + time** to prove the atomic per-hour
capacity guard prevents overbooking. Creates real reservation rows.

```bash
ALLOW_WRITE_LOAD_TEST=true npm run loadtest:reservation
RES_VUS=80 RES_PARTY_SIZE=2 npm run loadtest:reservation
```
k6 can't read your DB, so it reports `created_total` (HTTP 200s) and
`created_guests` (sum of accepted party sizes). **Overbooking check:**
`created_guests` must be `<= maxReservedGuestsPerHour` for that slot. Everything
past the cap should come back `400 fully booked`. Any `5xx` = bug.

### C. `loadtest:queue` — queue join contention (WRITE) ❌ local/preview only
Many VUs join the **same** location's queue fast. Exercises `QueueEntry`
creation, queue-join limiters, and the notification hand-off — **without real
sends**: it always uses `notificationMethod="email"` with fake `.invalid`
addresses (email queue notifications don't consume credits), and relies on
provider keys being unset so the send no-ops.

```bash
ALLOW_WRITE_LOAD_TEST=true npm run loadtest:queue
QUEUE_VUS=50 QUEUE_ITERATIONS=200 npm run loadtest:queue
```
Verify: `queue_joined_total` == new `QueueEntry` rows; provider dashboards show
**zero** sends; business **credits unchanged**. Per-IP 429s after ~60 joins from
one IP are expected.

### D. `loadtest:ratelimit` — limiter verification (WRITE) ❌ local/preview only
Serially confirms each protected endpoint returns 429 after its threshold.
Correctness test, low volume. Uses invalid logins and fake contacts.

```bash
ALLOW_WRITE_LOAD_TEST=true npm run loadtest:ratelimit
# disable individual checks: RL_SEARCH=0 RL_LOGIN=0 RL_QUEUE=0 RL_RES=0 RL_FEEDBACK=0
```
Asserts (with Redis configured these are exact; the in-memory dev limiter can be
±1 at the boundary):

| Endpoint | Limiter under test | Trips at |
|----------|--------------------|:---:|
| `POST /auth/login` | `login-id` | 5 / 15 min per id |
| `GET /api/search/restaurants` | `search-restaurants-ip` | 60 / min per IP |
| `POST /api/feedback/submit` | `feedback-email` | 3 / hr per email |
| `POST .../queue` | `queue-join-target` | 3 / 10 min per location+contact |
| `POST /api/reservations/...` | `reservation-create-target` | 3 / hr per location+email |

### E. `loadtest:queue-status` — polling exemption (read-only) ✅ prod-safe
Many VUs poll `GET .../queue/token/:token/status` every 2s from one IP,
confirming the global-limiter **exemption** for status/eta GETs holds (busy
venues on shared WiFi must not get 429'd mid-wait).

```bash
TEST_QUEUE_TOKEN=<token> npm run loadtest:queue-status
POLL_VUS=100 POLL_DURATION=2m npm run loadtest:queue-status
```
**Threshold is `rate_429 == 0`.** Any 429 here is a regression in the exemption
regex.

### `loadtest:smoke` — quick health check (read-only) ✅ prod-safe
One VU, a few requests, verifies the env is up before heavier runs.

```bash
npm run loadtest:smoke
BASE_URL=https://preview.example.com npm run loadtest:smoke
```

---

## Interpreting results

k6 prints a summary per run. Key lines:

- `http_req_duration` — look at `p(95)` (and `p(99)`). Targets below.
- `http_req_failed` — share of failed requests. Note our scripts tag expected
  responses so genuine errors are separated from intentional 429s.
- Custom metrics: `rate_429`, `created_total`/`created_guests`,
  `queue_joined_total`, `rl_checks_passed`/`rl_checks_failed`, `server_errors`.
- A run **fails** (non-zero exit) if any `thresholds` line shows ✗.

### Starting thresholds (tune to your infra)

| Metric | Target |
|--------|--------|
| p95 response time (reads) | < 800 ms |
| p95 response time (writes) | < 2000 ms |
| Non-429 error rate | < 2% |
| Server errors (`5xx`) on write tests | **0** |
| Reservation overbooking | **0** (`created_guests <= cap`) |
| Queue-status polling 429s | **0** |
| Rate-limit checks failed | **0** |

### "System is healthy" looks like
- Smoke + search: all 2xx (plus expected 429s only at high single-IP volume),
  p95 within target, no 5xx.
- Reservation: no 5xx; `created_guests` never exceeds the slot cap; surplus
  requests get `400 fully booked`.
- Queue: no 5xx; rows created == `queue_joined_total`; zero real notifications;
  credits unchanged.
- Rate limiter: `rl_checks_failed == 0`.
- Queue-status: `rate_429 == 0`.

---

## What to watch while a test runs

**Vercel logs** (`vercel logs` / dashboard):
- `[rate-limit] backend=redis` on boot (NOT the in-memory fallback banner — in
  prod-like envs that warning means limits aren't globally consistent).
- `[api] METHOD /path` request lines for throughput.
- Function duration / timeouts (reservations and queue do multiple DB ops).
- Any unhandled errors / 5xx.

**MongoDB Atlas metrics:**
- Connections (watch for exhaustion under high write concurrency).
- Operation latency / slow queries — search does a regex scan; if p95 climbs,
  consider indexes on the searched fields.
- For reservation contention: confirm the `SlotCounter` increments are the
  bottleneck-free atomic path (no overbooked rows).

**Upstash Redis (rate limiting + QStash):**
- Redis: command throughput and latency; the sliding-window limiter does a few
  ops per limited request. Watch for throttling on your Upstash plan.
- QStash (if enabled): message volume — for write tests it should stay near
  zero if providers are stubbed/unset; a spike means notifications are actually
  being dispatched (stop and re-check your env!).

---

## Cleaning up test data
Write tests create rows tagged with obvious markers: emails
`loadtest+...@seatping-loadtest.invalid`, names `Load Test...`, reservation note
"automated load test - safe to delete". After a run, delete those `Reservation`
and `QueueEntry` rows for `TEST_LOCATION_ID`. Prefer a disposable seeded
location so cleanup is trivial.
