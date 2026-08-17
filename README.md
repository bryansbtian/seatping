# SeatPing

## Introduction

SeatPing is a restaurant discovery and reservation platform that helps diners find restaurants, check availability, join queues, and book tables in one convenient place.

Whether users are planning ahead or looking for a table nearby, SeatPing makes the dining experience simpler from discovery to seating.

## Development Setup

Follow the steps below to run SeatPing locally for development.

Prerequisites: Node.js 18+ and a reachable MongoDB (Atlas, or a local replica set).

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
```

### Test Database (First Time Only)

Database-backed tests never fall back to `DATABASE_URL`. They need a separate local replica set, and they refuse to start if the target equals `DATABASE_URL`, looks like a managed cluster, or has a database name without `test` in it. The suites truncate collections between runs, so this must never point at Atlas.

Skip this if you only run `npm test`, which needs no database.

1. Copy the test environment file:

```bash
cp .env.test.example .env.test
```

2. Start Docker, then create the container. Prisma transactions require a replica set, so a bare `mongod` is not enough:

```bash
docker run -d --name seatping-test-mongo --restart unless-stopped -p 27018:27018 mongo:7 --replSet rs0 --port 27018 --bind_ip_all
```

3. Initialise the replica set and wait for the node to be promoted. The second command must print `PRIMARY` before you continue:

```bash
docker exec seatping-test-mongo mongosh --port 27018 --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27018"}]})'
docker exec seatping-test-mongo mongosh --port 27018 --quiet --eval 'rs.status().members[0].stateStr'
```

On PowerShell, quote the other way around. PowerShell strips embedded double quotes when passing arguments to a native executable, which leaves `mongosh` parsing `rs0` as an identifier instead of a string:

```powershell
docker exec seatping-test-mongo mongosh --port 27018 --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27018'}]})"
docker exec seatping-test-mongo mongosh --port 27018 --quiet --eval "rs.status().members[0].stateStr"
```

4. Create the schema in the test database. Check the datasource line in the output names `seatping_test` at `localhost:27018` before letting it run:

```bash
DATABASE_URL="mongodb://localhost:27018/seatping_test?replicaSet=rs0&directConnection=true" npx prisma db push --skip-generate
```

On PowerShell, set the variable first, and note it only applies to that window:

```powershell
$env:DATABASE_URL = "mongodb://localhost:27018/seatping_test?replicaSet=rs0&directConnection=true"
npx prisma db push --skip-generate
```

The container, replica set config, and schema all persist, so this is a one time setup. See Testing for the day to day commands. Re-run step 4 whenever `prisma/schema.prisma` changes.

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
- Server build goes to `dist-server/`

## CI/CD

- Lint and build CI is handled by GitHub Actions (`.github/workflows/ci.yml`), running on pull requests targeting `main` and pushes to `main`.
- CI runs three jobs. `Lint and Build` runs install (`npm ci`), Prisma client generation, lint, and build. `Tests and Coverage` starts a disposable single node MongoDB replica set container (`docker run ... mongod --replSet rs0`, since a service container cannot override the image command), pushes the Prisma schema to it, and runs `npm run test:coverage`. `End to End` starts the same kind of container and runs `npm run test:e2e`.
- The coverage gate is enforced by Vitest (70% lines, statements, functions, branches). CI fails on a shortfall; the coverage report is uploaded as an artifact.
- The end to end job is pass/fail only. Playwright is not part of the coverage percentage.
- CI never uses production infrastructure for tests: `TEST_DATABASE_URL` points at the ephemeral container, not `secrets.DATABASE_URL`.
- CD is handled by Vercel automatically after merging to `main`. GitHub Actions does not deploy.
- Add `DATABASE_URL` as a GitHub Actions repository secret (Settings > Secrets and variables > Actions). Other CI env vars are safe placeholders defined in the workflow.
- Pull requests should pass CI before merging.

## Testing

Layers use deliberately different amounts of the real application. Unit tests
isolate pure logic, while every database-backed layer runs the real Express
routes, real middleware and real Prisma against a real MongoDB test database.
Only external providers are replaced.

| Command                    | What it runs                           | Needs MongoDB |
| -------------------------- | -------------------------------------- | ------------- |
| `npm test`                 | Unit project only (fast local/CI loop) | No            |
| `npm run test:unit`        | Same as `npm test`                     | No            |
| `npm run test:watch`       | Unit project in watch mode             | No            |
| `npm run test:hooks`       | React hook tests (jsdom)               | No            |
| `npm run test:smoke`       | Read-only checks against a deployment  | No            |
| `npm run test:integration` | API + Prisma + MongoDB flows           | Yes           |
| `npm run test:security`    | Auth and multi-tenant isolation        | Yes           |
| `npm run test:concurrency` | Database invariants under real races   | Yes           |
| `npm run test:jobs`        | Background job idempotency             | Yes           |
| `npm run test:db`          | All four database-backed projects      | Yes           |
| `npm run test:coverage`    | Whole Vitest suite plus coverage gate  | Yes           |
| `npm run test:e2e`         | Playwright browser flows               | Yes           |
| `npm run test:e2e:ui`      | Same suite in the Playwright UI        | Yes           |

## Code Scanning and Dependencies

- Code scanning uses CodeQL advanced setup (`.github/workflows/codeql.yml`), running on pull requests targeting `main`, pushes to `main`, and a weekly schedule. It analyzes JavaScript and TypeScript only, and uses no secrets, database, or build step.
- CodeQL default setup must stay disabled in repository settings, since this repository uses the committed advanced workflow instead.
- Dependency updates are handled by Dependabot (`.github/dependabot.yml`), which opens weekly npm and GitHub Actions pull requests. npm updates are grouped into development and production dependencies.
- Report vulnerabilities privately using `.github/SECURITY.md`. Do not open a public issue.

## Database

- MongoDB is used through Prisma.
- Run `npx prisma generate` after schema changes.
- Run `npx prisma db push` to sync the schema (no SQL migration files).
- MongoDB must be a replica set for Prisma transactions (Atlas works by default; a bare local `mongod` does not).

## Common Commands

| Command               | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | Run Vite + API together                                 |
| `npm run dev:vite`    | Frontend only (port 8080)                               |
| `npm run dev:server`  | API only (port 4000)                                    |
| `npm run build`       | Build SPA (`dist/`) and compile server (`dist-server/`) |
| `npm run start`       | Run the built server in production mode                 |
| `npm run lint`        | ESLint over `.ts`/`.tsx`                                |
| `npx prisma generate` | Regenerate the Prisma client                            |
| `npx prisma db push`  | Sync the schema to MongoDB                              |

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
