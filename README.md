# SeatPing

Virtual queue, reservation, and customer-engagement software for restaurants and service businesses.

SeatPing lets a venue replace paper waitlists and crowded lobbies with QR-code virtual queues, online reservations, multi-channel customer notifications (SMS / WhatsApp / email), a guest CRM, re-engagement campaigns, and a public restaurant page, all driven from one business dashboard.

This README is the onboarding document for engineers joining the project. It covers what the product does, how the code is organized, and how to set it up, run it, and contribute safely.

---

## What SeatPing does

Service businesses (restaurants, cafes, salons, barbershops, clinics) still run on paper waitlists, verbal queues, and disconnected booking tools. That means crowded lobbies, manual texting of customers, no-show guesswork, and no operational data. SeatPing replaces that with a lightweight digital workflow:

- Customers join a queue by scanning a QR code or visiting a public restaurant page, then get notified when it is their turn.
- Customers can book reservations when a location enables them.
- Businesses run live queues and bookings, manage guests, and send marketing campaigns from a single dashboard.
- A small admin console handles manual business activation, featured restaurants, and support tickets.

---

## Main solutions

| Area | What it provides |
| --- | --- |
| Consumer discovery + public pages | Searchable public restaurant pages with banner, photo gallery, menu highlights, reviews, and queue/booking actions. |
| Virtual queue management | QR-code queue entry, live position + ETA, atomic status transitions, recently-left / removed / no-show tracking. |
| Reservation management | Per-location bookings, opening-hours-aware availability, per-hour capacity caps, manage-by-link flow, reminders. |
| Business dashboard | Live queue + reservation control, daily performance metrics, multi-location support, per-location credits. |
| Guest CRM | `GuestProfile` records auto-built from queue + reservation history, deduped by phone/email, with tags and notes. |
| Campaigns + re-engagement | Template-based Email / WhatsApp / SMS campaigns to guest audiences, with scheduling and recurrence. |
| Notifications | SMS (Telnyx), WhatsApp (Kapso), and email (SMTP), sent out-of-band via a job queue. |
| Admin tools | Manual business activation/credits, featured-restaurant curation, support tickets. |

---

## Product overview by user type

### Customers
- Browse and search public restaurant pages.
- Join a queue via QR code or restaurant page; pick a notification channel (SMS / WhatsApp / email).
- Track live queue position and estimated wait; confirm arrival after being admitted.
- Book and manage reservations through a tokenized manage link.
- Optional customer account (`/profile`) for saved restaurants, reservation history, and reviews.

### Businesses
- Manage live queues: admit, remove, mark arrived / no-show.
- Manage reservations across Today / Upcoming / Past / Cancelled / No-show.
- Manage multiple locations, opening hours, timezone, and reservation settings.
- Edit the public restaurant profile (banner, gallery, menu, reviews + replies).
- View the guest CRM and send re-engagement campaigns.
- Operator UI is bilingual (English / Indonesian) for the `/business/*` area.

### Admins
- Internal console at `/admin` (and `/tickets`) behind a server-side admin session.
- Manually activate businesses (toggle trial off), adjust credits, curate featured restaurants, handle tickets.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 5, React Router 6, TanStack Query, Tailwind CSS, shadcn/ui (Radix), Recharts |
| Backend | Node.js, Express 4, TypeScript (run with `tsx`, built with `tsc`) |
| Database | MongoDB via Prisma ORM 6 |
| Auth | JWT in httpOnly cookies, bcrypt password hashing |
| Notifications | Telnyx (SMS), Kapso WhatsApp Cloud API, Nodemailer SMTP (email) |
| Background jobs | Upstash QStash (queue + schedules), Vercel Cron, in-process `setInterval` fallback |
| Infra / services | Cloudinary (images), Google Maps/Places, Upstash Redis (rate limiting), Vercel (hosting), Google Analytics 4 |
| Load testing | k6 (`loadtest/`) |

---

## Repository structure

This is a **single application** (not a monorepo): a Vite React SPA and an Express API live in the same repo and share the same TypeScript toolchain. There is no separate client/server package.

```
seat-ping/
├── api/server.ts            # Vercel serverless entry; lazy-imports the built Express app
├── server/                  # Express API (TypeScript)
│   ├── index.ts             # App wiring: middleware, routers, rate limiting, local cron sweeps
│   ├── routes/              # One router per domain (auth, locations, reservations, campaigns, …)
│   └── lib/                 # Business logic + integrations (prisma, notifications, queueEta, …)
├── src/                     # React SPA
│   ├── App.tsx              # Routes + auth route guards
│   ├── pages/               # Route-level screens
│   ├── components/          # Shared components (ui/ = shadcn primitives)
│   ├── lib/                 # Client helpers (i18n, analytics, api helpers)
│   └── hooks/
├── prisma/schema.prisma     # MongoDB data model
├── scripts/                 # One-off + setup scripts (migrations, seeds, QStash setup)
├── loadtest/                # k6 load-test scenarios
├── public/                  # Static assets
├── index.html               # SPA HTML template (SEO + GA markers injected at build/runtime)
├── vite.config.ts           # Dev server (port 8080) + proxy to the API (port 4000)
└── vercel.json              # Build, rewrites (SPA vs API), and Cron config
```

> Both `package-lock.json` (npm) and `bun.lockb` exist. **npm is canonical** — Vercel and all docs use npm; the bun lockfile is a leftover from the initial scaffold.

---

## Important frontend routes

| Route | Page | Access |
| --- | --- | --- |
| `/` | Customer homepage / discovery | Public |
| `/search`, `/search/:query` | Search results | Public |
| `/:businessUsername/:locationId` | Public restaurant page (queue + booking) | Public |
| `/queue/:businessUsername/:locationId` | Live customer queue status screen | Public (token-gated) |
| `/reservations/manage/:token` | Manage a reservation via emailed link | Public (token-gated) |
| `/login`, `/signup`, `/forgot`, `/reset` | Customer auth | Public |
| `/profile` | Customer account | Customer only |
| `/business` | Business marketing landing | Public (logged-in business redirected to dashboard) |
| `/business/login`, `/business/signup` | Business auth | Public |
| `/business/dashboard` | Live queues + reservations | Business only |
| `/business/guests` | Guest CRM | Business only |
| `/business/campaigns` | Campaigns | Business only |
| `/business/settings` | Locations, hours, profile, language | Business only |
| `/admin` | Admin console | Admin session |
| `/policy`, `/terms`, `/feedback`, `/help`, `/sales` | Static / support | Public |

Route guards live in `src/App.tsx` (`RequireCustomer`, `RequireBusiness`, `BusinessGuestRoute`). The public restaurant route is intentionally last because it is a broad two-segment dynamic match.

---

## Important backend API areas

All mounted in `server/index.ts`. Anything that is a true API route must be registered in **both** `vite.config.ts` (dev proxy) and `vercel.json` (prod rewrites), or the SPA fallback will serve HTML for it.

| Mount | Router | Purpose |
| --- | --- | --- |
| `/auth` | `auth.ts` | Customer/business/admin login + session, profile, queue join/admit/leave, reservations actions, password reset |
| `/admin` | `admin.ts` | Admin console APIs (business + credit management, featured restaurants) — admin session required |
| `/tickets` | `tickets.ts` | Support tickets (public create; admin manage) |
| `/api/locations` | `locations.ts` | Location CRUD, image uploads (Cloudinary) |
| `/api/restaurants` | `restaurants.ts` | Public restaurant profile data |
| `/api/reservations` | `reservations.ts` | Reservation availability + booking |
| `/api/search` | `search.ts` | Restaurant search + suggestions |
| `/api/featured-restaurants` | `featured.ts` | Homepage featured restaurants |
| `/api/guests` | `guests.ts` | Guest CRM |
| `/api/campaigns` | `campaigns.ts` | Campaign + template management |
| `/api/audiences` | `audiences.ts` | Saved audiences for campaigns |
| `/api/feedback`, `/api/sales` | `feedback.ts`, `sales.ts` | Feedback + sales inquiries |
| `/api/jobs` | `jobs.ts` | QStash worker (`POST /api/jobs/notify`). Mounted **before** the JSON body parser for signature verification |
| `/api/cron` | `cron.ts` | `credit-refill`, `reservation-reminders`, `campaigns` — `CRON_SECRET`-protected |
| `/api/health` | inline | Liveness + DB reachability for uptime monitoring |

---

## Data model overview

Defined in `prisma/schema.prisma` (MongoDB). Key models:

- **User** — customer accounts. Some activity (reservations history, saved restaurants) is still stored inline as JSON.
- **Business** — venue account. Manual billing: every business starts on a 7-day trial with 300 base credits and 1 location; an admin activates it by turning `trial` off (which anchors the monthly credit refill via `creditsStartedAt`). No plans/Stripe.
- **Location** — a branch of a business. Holds address + Google Places data, opening hours, reservation settings, public `restaurantProfile`, banner image, and per-location credits.
- **Photo / Review / FeaturedRestaurant** — gallery images, customer reviews (+ owner reply), admin-curated homepage features.
- **QueueEntry** — one row per waitlist ticket. Lifecycle (`WAITING → ADMITTED → ARRIVED / NO_SHOW / REMOVED / LEFT`) is a set of atomic, status-guarded updates, so concurrent admits/leaves can't lose or double-process entries.
- **Reservation** — one booking, looked up by indexed `manageToken`. Auto-confirmed on creation (the old PENDING approval flow was removed).
- **SlotCounter** — atomic per-hour capacity counter; a guarded `$inc` enforces `maxReservedGuestsPerHour`, so simultaneous bookings can never overbook.
- **GuestProfile** — guest CRM record, auto-built from `QueueEntry` + `Reservation` rows, deduped by normalized phone/email. Counts are recomputed from source rows so they never drift. Carries marketing opt-in/opt-out per channel.
- **Campaign suite** — `CampaignTemplate`, `Campaign`, `CampaignRun`, `CampaignRecipient`, `CampaignDeliveryLog`, plus `SavedAudience`. Every send must use a template; recurring sends keep a per-run history with idempotent recipient dedup.
- **Ticket** — support tickets.

### Concurrency notes
Contended single-document writes (location credits, slot counters) are wrapped in `withWriteRetry` (`server/lib/dbRetry.ts`) to absorb MongoDB write conflicts (`P2034`) under load.

The legacy `queue` / `admittedCustomers` / `removedCustomers` / `reservations` JSON arrays were removed from the `Location` schema once the model migration was verified in production (Phase 7). Their raw values still exist in older Mongo documents (unmapped) and could be recovered by re-adding the fields. `scripts/migrate-to-models.ts` performed the original JSON-to-model migration and is retained as a historical record (idempotent, never deletes data).

---

## Authentication overview

- JWT (HS256, `JWT_SECRET`, default `7d` expiry) stored in **httpOnly cookies**. Logic in `server/lib/auth.ts`.
- **Three separate cookies** so sessions can coexist in one browser: `sp_auth_customer`, `sp_auth_business`, `sp_auth_admin`. A customer token can never pass a business gate and vice versa.
- Middleware: `requireCustomer`, `requireBusiness`, `requireAdmin` (`requireAccountType`).
- Passwords are bcrypt-hashed. Admin login validates against `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (no admin password is shipped in the frontend bundle); `/admin/*` and `/tickets/*` fail closed if those are unset.
- The SPA reads session state from `GET /auth/session` and gates routes client-side; the server enforces real authorization on every protected endpoint.

---

## Notification system overview

Notifications are dispatched **out-of-band** so user requests return immediately (`server/lib/notifications.ts`).

- Channels: **SMS via Telnyx**, **WhatsApp via Kapso** (WhatsApp Cloud API), **email via SMTP** (Nodemailer; defaults to a Porkbun host).
- When QStash is configured, notifications are published to a queue and delivered via the signature-verified worker `POST /api/jobs/notify` with retries. Without QStash, they fall back to fire-and-forget inline sends (fine for local dev).
- A daily per-recipient cap (`NOTIFY_DAILY_MAX_PER_RECIPIENT`, default 20 per channel) backstops against notification bombing.
- Credits are consumed for paid channels (SMS/WhatsApp), not for email.

---

## Background jobs and cron overview

| Job | Endpoint | Production cadence | Local fallback |
| --- | --- | --- | --- |
| Credit refill | `/api/cron/credit-refill` | Daily (native Vercel Cron, `vercel.json`) | `setInterval` every 24h |
| Reservation reminders | `/api/cron/reservation-reminders` | Hourly (QStash Schedule) | `setInterval` every 15m |
| Campaign dispatch | `/api/cron/campaigns` | Every 5m (QStash Schedule) | `setInterval` every 1m |

- Cron endpoints are protected by `CRON_SECRET` (sent as `Authorization: Bearer <CRON_SECRET>`).
- Sub-daily schedules use **QStash Schedules** rather than Vercel Cron, because the Vercel Hobby plan only allows once-per-day crons.
- The in-process `setInterval` sweeps in `server/index.ts` only run on long-lived/local servers (skipped when `VERCEL=1`).
- `scripts/setup-qstash-schedules.ts` verifies/creates the QStash Schedules. Dry run by default; add `--apply` to create missing ones. Re-run after rotating `CRON_SECRET` (delete the old schedules in the Upstash console first).

---

## Environment variables

Copy the table into a local `.env`. Use placeholder values; never commit real secrets.

### Required (core)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB connection string (Atlas or local). |
| `JWT_SECRET` | Secret for signing auth JWTs. |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`). Optional; defaults to `7d`. |
| `ADMIN_USERNAME` | Admin console username. |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password (see below). |
| `EMAIL_PASSWORD` | SMTP password for the email sender. |
| `CLIENT_ORIGIN` | Allowed CORS origin (the frontend URL). |
| `FRONTEND_URL` | Public frontend origin, used to build links in messages. |

### Notification + media providers (optional; feature no-ops when unset)

| Variable | Purpose |
| --- | --- |
| `TELNYX_API_KEY`, `TELNYX_PHONE_NUMBER` | SMS sending. |
| `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `KAPSO_WABA_ID` | WhatsApp sending. |
| `EMAIL_HOST`, `EMAIL_USER` | SMTP host/user (defaults exist in `email.ts`). |
| `EMAIL_TLS_INSECURE` | `1` to skip TLS cert validation (temporary escape hatch). |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image uploads. |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps/Places autocomplete (client-side). |

### Scalability + scheduling (optional locally; required in production)

| Variable | Purpose |
| --- | --- |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `QSTASH_URL` | Async notification delivery + scheduled crons. Without them, notifications send inline. |
| `CRON_SECRET` | Authorizes the cron endpoints. Required for crons to run. |
| `PUBLIC_BASE_URL` | Public origin QStash calls back to (defaults to `FRONTEND_URL`). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Production-grade distributed rate limiting. Falls back to in-memory locally. |
| `NOTIFY_DAILY_MAX_PER_RECIPIENT` | Per-recipient daily message cap (default `20`). |
| `DB_MAX_POOL_SIZE` | MongoDB pool bound per instance (default `10`). |

### Analytics (optional)

| Variable | Purpose |
| --- | --- |
| `VITE_GA_MEASUREMENT_ID` | GA4 measurement ID (`G-XXXXXXXXXX`). No-ops when unset; only non-sensitive page metadata is ever sent. |

### Runtime

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `production`. Controls static serving + secure cookies. |
| `PORT` | API port (default `4000`). |

> In production, `server/lib/envCheck.ts` logs (does not crash on) any missing required vars at cold start. Watch the Vercel logs after deploy.

Generate the admin password hash:

```bash
node -e 'console.log(require("bcrypt").hashSync(process.argv[1],12))' 'your-password'
```

---

## Local setup

Prerequisites: **Node.js 18+** and a reachable **MongoDB** (Atlas free tier or a local replica set — Prisma + MongoDB requires a replica set for transactions).

```bash
# 1. Install dependencies
npm install

# 2. Generate the Prisma client
npx prisma generate

# 3. Create your .env (see the Environment variables section) and set at minimum:
#    DATABASE_URL, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH

# 4. Sync the schema to your database (MongoDB uses db push, not SQL migrations)
npx prisma db push
```

### Run development

```bash
npm run dev
```

This runs the Vite dev server and the API together (via `concurrently`):

- Frontend: http://localhost:8080
- API: http://localhost:4000

Vite proxies `/auth`, `/api/*`, `/admin/*`, and `/tickets` to the API on port 4000 (see `vite.config.ts`), so you only browse the frontend URL. You can also run the halves separately with `npm run dev:vite` and `npm run dev:server`.

> Note: the API dev server runs on port **4000**. If you have an existing dev server on another port, leave it running.

### Build for production

```bash
npm run build      # vite build -> dist/, then tsc -> dist-server/
npm run start      # NODE_ENV=production node dist-server/index.js
```

On Vercel, `api/server.ts` lazy-imports `dist-server/index.js` and serves the API as a serverless function; the SPA in `dist/` is served statically with route-aware SEO injection.

---

## Scripts

### npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run Vite + API together (dev). |
| `npm run dev:vite` | Vite dev server only (port 8080). |
| `npm run dev:server` | API only via `tsx watch` (port 4000). |
| `npm run build` | Build SPA (`dist/`) and compile server (`dist-server/`). |
| `npm run start` | Run the built server in production mode. |
| `npm run lint` | ESLint over `.ts`/`.tsx`. |
| `npm run preview` | Preview the built SPA. |
| `npm run loadtest:*` | k6 load-test scenarios (`smoke`, `search`, `reservation`, `queue`, `queue-status`, `ratelimit`). |

### Operational scripts (`scripts/`, run with `tsx`)

| Script | Purpose |
| --- | --- |
| `setup-qstash-schedules.ts` | Verify/create QStash Schedules. `--apply` to create missing. |
| `seed-campaign-templates.ts` | Seed SeatPing-provided campaign templates. |
| `backfill-guests.ts` | Backfill `GuestProfile` rows from history. |
| `migrate-to-models.ts` | Historical JSON-to-model migration (idempotent; dry run, then `--commit`). |
| `migrate-pending-reservations.ts` | Migrate legacy PENDING reservations to CONFIRMED. |

Run with the env loaded, e.g.:

```bash
npx tsx --env-file=.env scripts/setup-qstash-schedules.ts          # dry run
npx tsx --env-file=.env scripts/setup-qstash-schedules.ts --apply  # create missing
```

---

## Database setup notes

- The datasource is **MongoDB**. Prisma does **not** use SQL-style migration files here — use `npx prisma db push` to sync the schema, and `npx prisma generate` after any schema change (the dev/build flows also depend on the generated client).
- Prisma + MongoDB requires a **replica set** for transactions/atomic operations. Atlas provides this out of the box; a bare local `mongod` does not.
- `vercel.json` runs `npx prisma generate` as part of the install command, so production builds always regenerate the client.

---

## External services (required vs optional)

| Service | Required? | Used for |
| --- | --- | --- |
| MongoDB (Atlas) | Required | Primary database. |
| Prisma | Required (tooling) | ORM + client generation. |
| Cloudinary | Optional | Location banner + gallery image uploads. |
| Google Maps / Places | Optional | Address autocomplete + map links. |
| Telnyx | Optional | SMS notifications. |
| Kapso (WhatsApp Cloud API) | Optional | WhatsApp notifications + campaigns. |
| SMTP (Nodemailer) | Required for email | Email notifications + password reset. |
| Upstash QStash | Optional (recommended in prod) | Async notification delivery + sub-daily schedules. |
| Upstash Redis | Optional (required in prod) | Distributed rate limiting + notification caps. |
| Vercel | Optional | Hosting, serverless API, daily Cron. |
| Google Analytics 4 | Optional | Product analytics. |

Everything optional fails gracefully when unset, so a minimal local setup needs only MongoDB + the core env vars.

---

## Common development workflows

- **Add an API route:** create/extend a router in `server/routes/`, mount it in `server/index.ts`, then register the path in **both** `vite.config.ts` (dev proxy) and `vercel.json` (prod rewrite). Missing either makes the SPA serve HTML for that path.
- **Change the data model:** edit `prisma/schema.prisma`, then `npx prisma generate` and `npx prisma db push`. Restart the dev server after generating.
- **Add a page/route:** add the page under `src/pages/`, wire it in `src/App.tsx`, and add a guard (`RequireBusiness` / `RequireCustomer`) if it is protected.
- **Work on notifications:** edit `server/lib/notifications.ts` and the channel libs (`whatsapp.ts`, `email.ts`); test the inline path locally (no QStash needed).
- **Load test:** `npm run loadtest:smoke` (see `loadtest/README.md` and `.env.loadtest.example`).

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| API calls return HTML instead of JSON | Route not registered in `vite.config.ts` proxy and/or `vercel.json` rewrites. |
| `JWT_SECRET is not set` on login | `.env` missing `JWT_SECRET`; restart the API after editing `.env`. |
| Schema changes not reflected | Run `npx prisma generate` (and `npx prisma db push`), then restart the dev server. |
| Prisma transaction / replica-set errors | Local MongoDB is not a replica set; use Atlas or a local replica set. |
| Admin login always fails | `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` unset or hash mismatch. |
| Notifications never arrive locally | Expected without provider keys; SMS/WhatsApp/email no-op when their env vars are unset. |
| Crons don't run in production | `CRON_SECRET` unset, or QStash Schedules not created (`setup-qstash-schedules.ts --apply`). |
| Rate limiting feels too loose in prod | `UPSTASH_REDIS_*` unset → per-instance in-memory limiter only. |

---

## Deployment notes

- Deployed on **Vercel**. `vercel.json` defines the build (`npm run build`), install (`npm install && npx prisma generate`), rewrites (API paths → `api/server.ts`, everything else → the SPA), the daily Cron, and the API function limits (1024 MB, 60s).
- `/business` and `/business/*` are routed through the server so crawlers get business-specific SEO/OG previews; the rest of the SPA is static.
- Set all required env vars in the Vercel project before the first deploy; `envCheck.ts` will flag missing ones in the logs.
- Sub-daily crons require QStash Schedules (Hobby plan caps native crons at daily).

---

## Security notes

- Never commit `.env` or real secrets. Use placeholders in docs.
- Admin auth is server-side only; no admin credentials are in the frontend bundle. `/admin/*` and `/tickets/*` fail closed without `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`.
- Auth cookies are httpOnly, `sameSite=lax`, and `secure` in production.
- The QStash worker verifies request signatures against the raw body (mounted before the JSON parser) — do not move it.
- Request logging redacts tokens from URLs (`redactUrlSecrets` in `server/index.ts`); keep new logging consistent.
- Rate limiting is layered: a global per-IP backstop plus stricter per-route limiters. Read-only customer queue polling is intentionally exempted so a busy venue on shared WiFi isn't throttled.
- Analytics only ever sends non-sensitive metadata (page path, channel, opaque `location_id`) — never names, phone numbers, emails, tokens, or message content.

---

## Contribution guidelines

- **Branch** off `main`; do not commit directly to `main`.
- **Lint** before pushing: `npm run lint`.
- **Match the surrounding style.** The codebase favors small, well-commented modules; keep comments explaining the *why*.
- **Copy/UI text:** avoid em dashes; use commas, periods, or colons.
- **Keep API routes in sync** across `server/index.ts`, `vite.config.ts`, and `vercel.json`.
- After schema changes, run `npx prisma generate` and verify the build (`npm run build`) before opening a PR.
- Don't introduce new required env vars without adding them to `envCheck.ts` and this README.

---

## Notes / open questions

- **No automated test suite / script.** There are unit tests next to source (`server/lib/*.test.ts`, e.g. `operatingHours.test.ts`, `campaignWhatsapp.test.ts`) but no `test` npm script or configured runner. Onboarding engineers should confirm the intended runner (e.g. `vitest`/`node --test`) before relying on `npm test`.
- **Two lockfiles** (`package-lock.json` + `bun.lockb`). npm is treated as canonical; the bun lockfile is a scaffold leftover and could be removed.
- **`package.json` name is still `vite_react_shadcn_ts`** (from the initial template) rather than `seatping`.
- Some customer activity (reservation history, saved restaurants) is still stored as inline JSON on the `User` model rather than dedicated rows.
