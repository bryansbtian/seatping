# SeatPing

## Introduction

SeatPing is a restaurant discovery and reservation platform that helps diners find restaurants, check availability, join queues, and book tables in one convenient place.

Whether users are planning ahead or looking for a table nearby, SeatPing makes the dining experience simpler from discovery to seating.

## Development Setup

Follow the steps below to run SeatPing locally for development.

Prerequisites: Node.js 18+ and a reachable MongoDB (Atlas, or a local replica set).

```bash
npm install
npx prisma generate
cp .env.example .env
npx prisma db push
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
- Server build goes to `dist-server/`

## CI/CD

- Lint and build CI is handled by GitHub Actions (`.github/workflows/ci.yml`), running on pull requests targeting `main` and pushes to `main`.
- CI runs install (`npm ci`), Prisma client generation (`npx prisma generate`), lint (`npm run lint`), and build (`npm run build`). It does not touch a database.
- CD is handled by Vercel automatically after merging to `main`. GitHub Actions does not deploy.
- Add `DATABASE_URL` as a GitHub Actions repository secret (Settings > Secrets and variables > Actions). Other CI env vars are safe placeholders defined in the workflow.
- Pull requests should pass CI before merging.

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
