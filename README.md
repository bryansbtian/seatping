# SeatPing

## Introduction

SeatPing is a restaurant discovery and reservation platform that helps diners find restaurants, check availability, join queues, and book tables in one convenient place.

Whether users are planning ahead or looking for a table nearby, SeatPing makes the dining experience simpler from discovery to seating.

## Development Setup

```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
```

### Test Database (First Time Only)

Skip this if you only run `npm test`, which needs no database.

1. Copy the test environment file:

```bash
cp .env.test.example .env.test
```

2. Start Docker, then create the container:

```bash
docker run -d --name seatping-test-postgres --restart unless-stopped -p 5433:5432 -e POSTGRES_PASSWORD=seatping -e POSTGRES_DB=seatping_test postgres:17
```

3. Create the schema in the test database. Check the datasource line in the output names `seatping_test` at `localhost:5433` before letting it run:

```bash
DATABASE_URL="postgresql://postgres:seatping@localhost:5433/seatping_test" DIRECT_URL="postgresql://postgres:seatping@localhost:5433/seatping_test" npx prisma migrate deploy
```

On PowerShell, set the variables first, and note they only apply to that window:

```powershell
$env:DATABASE_URL = "postgresql://postgres:seatping@localhost:5433/seatping_test"
$env:DIRECT_URL = $env:DATABASE_URL
npx prisma migrate deploy
```

## Run Locally

```bash
npm run dev
```

- Frontend runs on port 8080
- API runs on port 4000
- Vite proxies API requests (`/auth`, `/api/*`, `/admin/*`, `/tickets`) to the backend, so you only browse `http://localhost:8080`

Run the halves separately:

```bash
npm run dev:vite     # frontend only (port 8080)
npm run dev:server   # API only (port 4000)
```

## Build

```bash
npm run build
npm run start
```

- Frontend build goes to `dist/`
- Server build goes to `dist-server/`, with the entry point at `dist-server/server/index.js`

## Testing

| Command                    | What it runs                           | Needs Postgres |
| -------------------------- | -------------------------------------- | -------------- |
| `npm test`                 | Unit project only (fast local/CI loop) | No             |
| `npm run test:unit`        | Same as `npm test`                     | No             |
| `npm run test:watch`       | Unit project in watch mode             | No             |
| `npm run test:hooks`       | React hook tests (jsdom)               | No             |
| `npm run test:smoke`       | Read-only checks against a deployment  | No             |
| `npm run test:integration` | API + Prisma + Postgres flows          | Yes            |
| `npm run test:security`    | Auth and multi-tenant isolation        | Yes            |
| `npm run test:concurrency` | Database invariants under real races   | Yes            |
| `npm run test:jobs`        | Background job idempotency             | Yes            |
| `npm run test:db`          | All four database-backed projects      | Yes            |
| `npm run test:coverage`    | Whole Vitest suite plus coverage gate  | Yes            |
| `npm run test:e2e`         | Playwright browser flows               | Yes            |
| `npm run test:e2e:ui`      | Same suite in the Playwright UI        | Yes            |

## Common Commands

| Command                  | What it does                                            |
| ------------------------ | ------------------------------------------------------- |
| `npm run dev`            | Run Vite + API together                                 |
| `npm run dev:vite`       | Frontend only (port 8080)                               |
| `npm run dev:server`     | API only (port 4000)                                    |
| `npm run build`          | Build SPA (`dist/`) and compile server (`dist-server/`) |
| `npm run start`          | Run the built server in production mode                 |
| `npm run lint`           | ESLint over `.ts`/`.tsx`                                |
| `npm run format:check`   | Prettier, verification only                             |
| `npm run typecheck`      | `tsc --noEmit` over app and server                      |
| `npm run test:coverage`  | Tests with the coverage gate                            |
| `npx prisma generate`    | Regenerate the Prisma client                            |
| `npx prisma migrate dev` | Create and apply a migration from the schema            |

## Development Notes

- Frontend code is in `src/`
- Backend code is in `server/`
- Vercel entry is `api/server.ts`
- Prisma schema is `prisma/schema.prisma`
- When adding a true API route, register the path in the backend (`server/index.ts`), the Vite dev proxy (`vite.config.ts`), and the Vercel rewrites (`vercel.json`). Missing any of these makes the SPA serve HTML for that path.
- Restart the dev server after Prisma schema/client changes.

## Contribution Rules

- Create a new branch from `main` for every change.
- Do not commit directly to `main`.
- Open a pull request into `main` when the change is ready.
- Keep pull requests small, focused, and easy to review.
- Run `npm run lint` before opening a pull request when possible.
- Run `npm run build` after schema, API, routing, auth, or deployment changes.
- Do not create commits unless explicitly asked.
- Before finishing, summarize what changed, what commands were run, what commands could not be run, and any remaining risks.
