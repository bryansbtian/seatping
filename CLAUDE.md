# SeatPing

SeatPing is a virtual queue, reservation, guest CRM, and customer engagement platform for
restaurants and service businesses. It helps customers avoid physically waiting in crowded
areas, and helps businesses run queues, bookings, guests, and campaigns from one dashboard.

Do not treat SeatPing as only a waitlist app. The product areas are consumer restaurant
discovery and public restaurant pages, QR code virtual queues, reservation management, the
business dashboard, guest CRM, email, WhatsApp and SMS campaigns, and admin tools for
activation, credits, featured restaurants, and support tickets.

## Architecture

This is one full-stack app, not a monorepo.

- `src/`: React SPA. React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS,
  shadcn/ui, Recharts. Icons come from Hugeicons: import the icon data from
  `@hugeicons/core-free-icons` and render it through `HugeiconsIcon` from `@hugeicons/react`,
  sizing it with Tailwind classes. An icon passed around as data is typed `IconSvgElement`,
  not a component type.
- `server/`: Express API in TypeScript. Routers in `server/routes/`, shared logic in
  `server/lib/`, mounting and cron wiring in `server/index.ts`.
- `shared/`: isomorphic modules used by both halves, such as phone formatting and country
  dial codes. Imported as `@shared/...` from `src/` and by relative path from `server/`.
  Phone display formatting goes through `libphonenumber-js` so landlines and mobiles are
  grouped by each country's own numbering plan.
- `api/server.ts`: the Vercel serverless entry that wraps the Express app.
- `prisma/`: MongoDB schema through Prisma, using `db push` rather than SQL migration files.
- `tests/`, `e2e/`: Vitest projects and Playwright browser tests.

Boundaries that carry weight:

- `src/` must never import from `server/`. The browser bundle must not contain server logic,
  admin auth logic, or admin credentials. Code both halves need goes in `shared/`, which must
  stay free of browser globals and Node built-ins, and may only use isomorphic dependencies.
- Authorization lives in `server/`. Frontend route guards are cosmetic and are never the
  only check.
- MongoDB is the source of truth. Do not reintroduce the deprecated location JSON arrays for
  queue, removed customers, admitted customers, or reservations unless the task is an
  explicit data recovery.

Auth is JWT in httpOnly cookies. Notifications go through Telnyx SMS, Kapso WhatsApp, and
SMTP email. Jobs run on Upstash QStash, Vercel Cron, or a local interval fallback. Hosting is
Vercel.

Prefer simple, well-defined boundaries over unnecessary abstractions or infrastructure.

## Commands

npm is the canonical package manager. Do not use bun.

```bash
npm ci
npx prisma generate
npx prisma db push
npm run dev
npm run lint
npm run build
```

Use `npm ci` for setup and in CI so the install matches `package-lock.json` exactly. Use
`npm install` only to add, remove, or upgrade a dependency, then commit the updated lockfile.
The project builds on Node.js 24, pinned in `.nvmrc` and `package.json` engines.

`npm run dev` starts Vite on port 8080 and the API on port 4000. Browse through
`http://localhost:8080` in local dev. `npm run dev:vite` and `npm run dev:server` start each
half alone. `npm run build` builds the SPA to `dist/` and the server to `dist-server/`, where
the compiled entry is `dist-server/server/index.js`, and `npm run start` runs it.

After changing `prisma/schema.prisma`, always run `npx prisma generate` then
`npx prisma db push`, and restart the dev server.

## Non-Negotiable Style Rules

- Never use em dashes in code, product copy, UI text, emails, or docs. Use commas, periods,
  colons, or parentheses.
- Always use Title Case for user-facing titles, labels, and email preheaders when the
  surrounding copy does.
- Never use ternary operators. Enforced by `no-ternary` in `eslint.config.js`.
- Always wrap every `if`, `else`, `for`, `for...of`, `for...in`, `while`, and `do` body in
  curly braces. Enforced by `curly`.

```ts
// Correct
if (ready) {
  return;
}

// Incorrect
if (ready) return;

// Incorrect
const status = ready ? "Ready" : "Pending";
```

- Never write comments. This covers every language in the repository, not just TypeScript:
  no explanatory, descriptive, or section comments, and no commented-out code, in `.ts`,
  `.tsx`, `.js`, `.css`, `.html`, `.yml`, `.prisma`, or Markdown files. Exactly two
  exceptions are allowed:
  - `.env` files, including `.env.example`, where comments say which variables are required
    and group them into sections.
  - The `SEO:START` and `SEO:END` markers in `index.html`.

  Nothing else qualifies, toolchain directives included. Do not reach for `eslint-disable`,
  `@ts-expect-error`, or triple slash `/// <reference>` lines. Fix the underlying problem
  instead, or move the setting into `eslint.config.js`, `tsconfig.app.json`,
  `tsconfig.server.json`, or the workflow file, where it is configuration rather than a
  comment. Outside the two exceptions above the repository contains no comments at all.
  Keep it that way.

- Never commit changes, create commits, push branches, or modify git history. The user
  handles all git operations manually.

## Engineering Principles

- Use strict TypeScript and avoid `any`.
- Prefer readable control flow over clever or compact code.
- Keep third-party and vendor-specific logic isolated from core domain logic.
- Keep secrets, credentials, tokens, and sensitive data out of source code, logs, stored
  files, and tests.
- Do not add infrastructure, dependencies, interfaces, or abstractions without a concrete
  need.
- Add tests for meaningful behavior and failure cases.
- Keep changes scoped to the task being implemented. Prefer small, targeted changes over
  broad rewrites, and match the surrounding code style.
- When fixing bugs, trace the full flow across frontend, API route, data model, background
  job, and deployment rewrite before changing only one layer.
- Update documentation when behavior or architecture changes.
- Do not claim unfinished functionality is implemented.

## Routing

Adding or changing a true API route means four edits, not one:

1. Add or update the router under `server/routes/`.
2. Mount it in `server/index.ts`.
3. Add the path to the Vite dev proxy in `vite.config.ts`.
4. Add the path to Vercel rewrites in `vercel.json`.

A route missing from the proxy or the rewrites returns SPA HTML instead of JSON. The public
restaurant route `/:businessUsername/:locationId` is broad and dynamic, so new public routes
can collide with it.

## Auth And Security

- Never commit `.env` files, real secrets, API keys, tokens, provider credentials, or
  production URLs with embedded tokens.
- SeatPing uses separate httpOnly auth cookies for customer, business, and admin sessions.
  Do not merge these session types.
- Admin auth is server-side only. `/admin/*` and admin ticket management must fail closed if
  admin env vars are missing.
- The QStash worker depends on raw body signature verification. Do not move the QStash jobs
  route behind the JSON body parser without preserving that verification.
- Do not log sensitive values. Keep token redaction consistent with `redactUrlSecrets`.
- Analytics must not include names, emails, phone numbers, tokens, message content, or other
  customer-sensitive data.

## Data

- Prisma with MongoDB requires a replica set for transactions. Atlas works by default, but a
  plain local `mongod` may fail transaction-dependent flows.
- For contended writes such as credits, slot counters, queue transitions, or campaign
  recipient deduping, preserve the atomic guards and retry behavior.
- Reservations are auto-confirmed. Do not reintroduce the deprecated reservation pending
  approval flow.
- A location that has dining tables validates reservation availability against real table
  inventory across the full occupancy window, not only the reservation start time. Accepted
  reservations get a `SMART` table assignment, and changes or terminal statuses release it.
  Locations without tables keep the older guest-count behavior.
- `maxReservedGuestsPerHour` is an optional safety cap. Zero means no cap, so read it through
  `effectiveGuestCap` rather than using the raw value as a limit.

## Notifications And Cron

- Notifications stay out of band so user requests return quickly.
- If QStash is configured, use the QStash path. If it is not configured locally, inline
  fire-and-forget behavior is acceptable.
- Paid channels consume credits. Email does not.
- Daily per-recipient notification caps are intentional. Do not bypass them without an
  explicit product decision.
- Sub-daily production schedules use QStash Schedules. Vercel Cron is only daily on the
  current setup.
- When changing cron behavior, check `server/routes/cron.ts`, `server/index.ts`, and
  `vercel.json`.

## UI And Product

Keep SeatPing simple, premium, and operationally truthful. Business-facing UI should reflect
the real product, not marketing-only mockups. When building previews, bento cards,
dashboards, or landing page visuals, reuse or closely derive from real SeatPing components.

Use the existing visual style: dark navy, white, subtle borders, clean SaaS feel, rounded
cards and modern spacing. No orange primary CTAs, no overly playful restaurant imagery, and
chair or ping icon treatments stay minimal and consistent.

Inter is the typeface for the whole product, consumer pages and business dashboards alike.
It is loaded from Google Fonts in `src/index.css` and set as `fontFamily.sans` in
`tailwind.config.ts`, with a system fallback stack behind it. Only the 400, 500, 600, and 700
weights are loaded, so do not introduce `font-thin`, `font-light`, `font-extrabold`, or
`font-black`. Infra is gone: do not reintroduce it or the `font-infra` utility. `font-hand`
(Caveat) stays as the one deliberate accent face.

The interface runs on one density and type scale, defined as CSS variables in `src/index.css`
and exposed through `tailwind.config.ts`. Reach for the tokens rather than raw pixel classes:

- Type: `text-title` for card, dialog, and section titles (16/20 medium), `text-label` for
  labels, buttons, table headers, and metadata (13/16 medium), `text-body` for body copy
  (14 regular). `text-caption` stays the badge and footnote size.
- Text hierarchy: `text-ink` for default copy, `text-ink-subtle` for secondary copy.
- Controls: `control-sm`, `control-md`, `control-lg` set the height (28/32/40 on desktop,
  32/36/44 below `sm` so touch targets stay usable), `control-icon` squares off icon buttons,
  and `rounded-control` is the 10px control radius. These are component-layer classes, so a
  call site can still override the height with a plain `h-*` utility.
- Rows: `h-row` or `min-h-row` for data rows (40px), `h-row-lg` or `min-h-row-lg` for list
  rows carrying an avatar or a second line (44px).
- Badges: `h-badge` plus `rounded-badge` (20px tall, 6px radius) with a flat tone fill and
  saturated text, no border. Use the `Badge` variants (`success`, `warning`, `info`, `danger`,
  `neutral`) or `PILL_BASE_CLASS` with a tone from `src/lib/statusStyles.ts`.
- Switches are 24x14 with a 10px thumb and an indigo-600 track when on.

Any new custom Tailwind class name must be registered in the `cn` helper in `src/lib/utils.ts`.
tailwind-merge otherwise reads an unknown `text-*` class as a text colour and silently drops
the real colour beside it. `tests/unit/classNames.test.ts` guards this.

Numeric inputs stay `type="number"` but must not show native spinner arrows (global rule in
`src/index.css`), must not change on mouse wheel (global guard in `src/main.tsx`), must keep
ArrowUp and ArrowDown stepping, and must stay visually blank while editing. Never coerce
`""` to `0` in `onChange`: hold `number | ""` at the form layer, validate required fields on
blur or submit, and normalize to a number (or null or undefined when optional) before saving.

Business operator UI under `/business/*` supports English and Indonesian. Do not hardcode new
business-facing copy without considering the i18n pattern.

## Environment Variables

Do not add a new required environment variable without updating `server/lib/envCheck.ts`,
`README.md`, and any relevant setup or deployment notes. Optional providers should fail
gracefully when unset wherever possible, and a minimal local setup should require only
MongoDB plus the core auth and admin env vars.

## Testing

Vitest is the test runner and Playwright covers browser E2E. `npm test` runs the unit suite
and needs no database. The integration, security, concurrency, and jobs suites require
`TEST_DATABASE_URL` pointing at a dedicated MongoDB replica set, and they refuse to run
against `DATABASE_URL` or a production-looking host. See the Testing section in `README.md`.

Write tests for new code and run them before finishing. They must pass. Report the actual
result, and never describe work as done while a test it added or touched is failing or unrun.

`npm run test:coverage` enforces a 70% global minimum for lines, statements, functions, and
branches. Do not lower these thresholds, exclude application code to raise the number, or
weaken assertions.

## Before Finishing

Run the relevant repository checks and fix all failures:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Run `npm run lint` after editing TypeScript, and `npm run build` before finishing schema,
API, routing, auth, notification, or deployment-related changes.

Review the final diff for unnecessary code, unused dependencies, style violations, secrets,
comments, and accidental scope expansion.

Then summarize what changed, what commands were run, any commands that could not be run, and
any remaining risks or follow-up work.
