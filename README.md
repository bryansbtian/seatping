# SeatPing

## Introduction

SeatPing is a restaurant discovery and reservation platform that helps diners find restaurants, check availability, join queues, and book tables in one convenient place.

Whether users are planning ahead or looking for a table nearby, SeatPing makes the dining experience simpler from discovery to seating.

## Development Setup

Follow the steps below to run SeatPing locally for development.

Prerequisites: Node.js 24 (the version CI and Vercel build on, pinned in `.nvmrc` and
`package.json` engines) and a reachable MongoDB (Atlas, or a local replica set).

```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma db push
```

`npm ci` installs exactly what `package-lock.json` records, so every machine and CI get the
same tree. Use `npm install` only to add, remove, or upgrade a dependency, and commit the
updated lockfile.

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

## Database

- MongoDB is used through Prisma.
- Run `npx prisma generate` after schema changes.
- Run `npx prisma db push` to sync the schema (no SQL migration files).
- MongoDB must be a replica set for Prisma transactions (Atlas works by default; a bare local `mongod` does not).

## Common Commands

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | Run Vite + API together                                 |
| `npm run dev:vite`      | Frontend only (port 8080)                               |
| `npm run dev:server`    | API only (port 4000)                                    |
| `npm run build`         | Build SPA (`dist/`) and compile server (`dist-server/`) |
| `npm run start`         | Run the built server in production mode                 |
| `npm run lint`          | ESLint over `.ts`/`.tsx`                                |
| `npm run format:check`  | Prettier, verification only                             |
| `npm run typecheck`     | `tsc --noEmit` over app and server                      |
| `npm run test:coverage` | Tests with the coverage gate                            |
| `npx prisma generate`   | Regenerate the Prisma client                            |
| `npx prisma db push`    | Sync the schema to MongoDB                              |

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
