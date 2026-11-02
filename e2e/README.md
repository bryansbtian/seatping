# Browser Tests

Run `npm run test:e2e` to start isolated API and frontend servers and run Playwright against the dedicated database configured by `TEST_DATABASE_URL` in `.env.test`.

Local and CI runs use eight Playwright workers by default. Test files run concurrently, while tests within each file run sequentially. Override the worker count with `npm run test:e2e -- --workers=4` when needed.

Run `npm run test:coverage` to run the Vitest suite with coverage and a maximum of eight workers. Override the worker limit with `npm run test:coverage -- --maxWorkers=4`. Database-backed test files retain their sequential execution settings. The coverage thresholds remain enforced.

The runner prefers API port 4100 and frontend port 8081. If a default port is occupied, it selects a free port and prints both selected ports before starting the servers. The frontend proxy, allowed origins, and browser base URL use these selected ports. Existing processes keep running.

Set `E2E_API_PORT` or `E2E_FRONTEND_PORT` to prefer different ports. Occupied preferred ports also fall back to free ports, including values loaded from `.env.test`. Set `E2E_BASE_URL` to test an existing server instead of starting managed servers. `npm run test:e2e -- --list` lists tests without starting servers or selecting ports.
