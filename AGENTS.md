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
- `prisma/`: PostgreSQL schema through Prisma, with SQL migrations under `prisma/migrations/`.
- `tests/`, `e2e/`: Vitest projects and Playwright browser tests.

Boundaries that carry weight:

- `src/` must never import from `server/`. The browser bundle must not contain server logic,
  admin auth logic, or admin credentials. Code both halves need goes in `shared/`, which must
  stay free of browser globals and Node built-ins, and may only use isomorphic dependencies.
- Authorization lives in `server/`. Frontend route guards are cosmetic and are never the
  only check.
- PostgreSQL is the source of truth. Do not reintroduce the deprecated location JSON arrays for
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
npx prisma migrate deploy
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

After changing `prisma/schema.prisma`, always run `npx prisma migrate dev --name <change>`,
which regenerates the client and applies the migration, then restart the dev server. Use
`npx prisma migrate deploy` to apply committed migrations elsewhere. Commit the generated
migration directory.

## Non-Negotiable Style Rules

- Never use em dashes in code, product copy, UI text, emails, or docs. Use commas, periods,
  colons, or parentheses. Campaign signatures are an exception: em dashes are allowed in
  campaign signature text, template seed signatures, and the matching parsing logic and
  test fixtures. Preserve existing campaign signatures unless the user requests a change.
- Always use Title Case for user-facing titles, labels, and email preheaders when the
  surrounding copy does.
- Never use ternary operators. Enforced by `no-ternary` in `eslint.config.js`.
- Always wrap every `if`, `else`, `for`, `for...of`, `for...in`, `while`, and `do` body in
  curly braces. Enforced by `curly`.

```ts
if (ready) {
  return;
}
```

- Never write comments. This covers every language in the repository, not just TypeScript:
  no explanatory, descriptive, or section comments, and no commented-out code, in `.ts`,
  `.tsx`, `.js`, `.css`, `.html`, `.yml`, `.prisma`, `.sql`, `.env`, or Markdown files.
  The only exceptions are:
  - Environment files, including `.env.example` and `.env.test.example`, where comments
    explain variables and group them into sections.
  - The `SEO:START` and `SEO:END` markers used by `index.html`, its server-side SEO renderer,
    and its tests.

  Nothing else qualifies, toolchain directives included. Do not reach for `eslint-disable`,
  `@ts-expect-error`, or triple slash `/// <reference>` lines. Fix the underlying problem
  instead, or move the setting into `eslint.config.js`, `tsconfig.app.json`,
  `tsconfig.server.json`, or the workflow file, where it is configuration rather than a
  comment. Keep new and edited code free of comments outside the exceptions above.

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
- Do not modify `README.md` unless a new feature requires additional setup steps for new developers.
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

- Prisma transactions work against any PostgreSQL instance, so no replica set setup is needed.
  `DATABASE_URL` is the pooled runtime connection and `DIRECT_URL` is the direct connection
  migrations use. Both are required.
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

Edit actions that display an icon use Hugeicons `Edit03Icon`, matching the restaurant review
Edit action.
Render it with `HugeiconsIcon` and `className="size-4"` throughout the product.

Every new page that fetches data must show an accessible skeleton loader while its initial
request is pending. Reuse `Skeleton`, `ListSkeleton`, or `RouteLoading` and match the final
content layout. Full-height cards must have skeletons that fill the available content area,
using `ListSkeleton` with `fill` where appropriate. Show a no-data state only after the
request settles, and keep request failures distinct from successful empty results.
Skeleton rows and cards must remain fully visible at every breakpoint. Render only the
complete items that fit, distribute spare space between them, and update their count or
layout when the container resizes. Never hide a partially rendered skeleton at a card edge
or grow the page just to fit placeholder rows.

Buttons and pills on every new or updated page must follow the Business Portal design.
Use the shared `Button` component and its existing variants and sizes for actions and
filters. Use `Badge` tone variants or the shared status pill styles for status labels.
Filter and Sort action triggers use the shared `FilterButton` and `SortButton` components
from `src/components/ui/collection-controls.tsx`. These use the borderless ghost style and
consistent icons. Label the filter action `Filter`, never `Filters` or `All Filters`.
Reuse the existing control height, radius, typography, spacing, hover, focus, and disabled
states. Do not introduce custom button colors, pill shapes, or competing control styles.
Preserve the existing grouped, segmented tab design for page navigation and date ranges,
including Campaigns, Reviews, Performance, and Floor modes. These intentional tab controls
are separate from action buttons, filters, and status pills. Do not replace them with
individual outlined buttons when standardizing controls.

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

Resizable textareas must allow vertical resizing and must not shrink below their default
height. Set matching initial and minimum heights, preserve the minimum at every breakpoint,
and prevent horizontal resizing from overflowing the layout.

All mobile dialogs across the repository must follow the Ticket Details modal in Admin
Ticket Management (`src/pages/Admin.tsx`) as the approved design reference. Reuse the shared
Dialog or AlertDialog components and `modalMobileClasses` instead of creating separate
mobile modal designs. Keep headers left aligned unless the user explicitly requests a
centered header, reserve space for the close button beside the title, and wrap long titles,
identifiers, and contact information. The centered Campaign Template Review header is an
intentional exception, with the status pill below the title on mobile and beside the title
on desktop. Apply the same mobile layout and typography to custom dialog shells.

- Mobile below `sm`: preserve `modalMobileClasses`, with 16px viewport gutters, a maximum
  width of 448px, 16px padding, 16px corner radius, and a maximum height of 85dvh. Scroll
  vertically inside the dialog and never overflow horizontally. Stack form fields and footer
  actions in one column, with 8px between actions.
- Desktop: use 24px padding, 16px corner radius, a maximum height of 85dvh, and a maximum
  width of 672px for standard forms. Use a wider dialog only when its content requires it.
  Arrange related fields in two columns where useful and align footer actions to the right.
- On desktop: use `text-title font-medium` for dialog and section titles
  (16px/20px, weight 500), `text-body` for descriptions and content (14px/20px, weight 400),
  `text-label font-medium` for labels and actions (13px/16px, weight 500), and `text-caption`
  for supporting metadata. Use `text-ink` and `text-ink-subtle` for hierarchy.
- Mobile dialogs and sheets inherit the smaller type tokens scoped to `role="dialog"`
  and `role="alertdialog"` in `src/index.css`: 15px titles, 13px body text and input values,
  12px labels and actions, and 11px supporting metadata. Keep titles, labels, and actions
  at weight 500 and body text at weight 400. Reuse the shared type classes so custom
  dialog shells inherit this scale without changing typography outside mobile dialogs.
- Mobile modal inputs and dropdowns use compact 32px controls with `text-body` (13px,
  weight 400), matching Ticket Details and Edit Customer. Action buttons use 32px controls
  with `text-label font-medium` (12px, weight 500). Keep 8px between labels and controls,
  16px between fields, and 20px between form sections. Preserve multiline textarea minimum
  heights and desktop control sizing. Do not make controls taller than the compact type
  scale requires.
- Stacked modal footer buttons must retain their full control height. Use `shrink-0`
  and apply `flex-1` only to horizontal desktop rows, never to mobile column actions.
- Chat dialogs may keep their composer fixed within the dialog while the message thread
  scrolls independently. Keep a reachable close control, a visible composer, and a usable
  thread at narrow widths and short viewport heights.
- Dialog navigation uses the shared `Tabs`, `TabsList`, and `TabsTrigger` components.
  Match Business Campaigns with one full-width pale gray rounded track, equal-width tabs,
  a navy (`bg-slate-900`) active tab with white text, muted inactive text, no active shadow,
  and the shared focus states.
  Keep labels at `text-label font-medium` on desktop and mobile, with the shared control
  heights and 4px track padding. Preserve arrow-key navigation and visible focus.

Mobile operational lists must follow the Business Campaigns History row layout. Keep the
item title and its status or channel badges on one line, with the title taking the remaining
width and badges retaining their full size. Use `min-w-0`, `truncate`, and a shrinking title
to show an ellipsis instead of wrapping or overflowing. Keep the full title available in the
detail view and its `title` attribute. Place secondary metadata below in `text-caption`,
truncate long metadata, and keep dates or supplementary results on a compact subsequent
line. Use `text-body font-medium` for item names and the shared badge tones and sizes.
Preserve the existing desktop layout when adapting a list for mobile.

Blog authoring stays on the main article canvas. Keep the title, excerpt, author, editable
category pill, cover controls, and incremental footer tags there instead of adding an article
settings sidebar. Category colors use shared badge tones and persist with the article. Generate
slugs from titles with unique suffixes when necessary, and derive cover alt text from the uploaded
filename without its extension.

## Environment Variables

Do not add a new required environment variable without updating `server/lib/envCheck.ts`,
`README.md`, and any relevant setup or deployment notes. Optional providers should fail
gracefully when unset wherever possible, and a minimal local setup should require only
PostgreSQL plus the core auth and admin env vars.

## Testing

Vitest is the test runner and Playwright covers browser E2E. `npm test` runs the unit suite
and needs no database. The integration, security, concurrency, and jobs suites require
`TEST_DATABASE_URL` pointing at a dedicated local PostgreSQL, and they refuse to run
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
