import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { configureE2ePorts } from "../../scripts/e2e-ports.js";

const servers: Server[] = [];

async function occupyPort(): Promise<number> {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP port");
  }
  return address.port;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("E2E Port Selection", () => {
  it("selects distinct free ports when both defaults are occupied", async () => {
    const api = await occupyPort();
    const frontend = await occupyPort();
    const environment: NodeJS.ProcessEnv = {};

    await configureE2ePorts(environment, { E2E_API_PORT: api, E2E_FRONTEND_PORT: frontend });

    expect(Number(environment.E2E_API_PORT)).toBeGreaterThan(0);
    expect(Number(environment.E2E_FRONTEND_PORT)).toBeGreaterThan(0);
    expect(environment.E2E_API_PORT).not.toBe(String(api));
    expect(environment.E2E_FRONTEND_PORT).not.toBe(String(frontend));
    expect(environment.E2E_API_PORT).not.toBe(environment.E2E_FRONTEND_PORT);
    expect(servers.every((server) => server.listening)).toBe(true);
  });

  it("selects free ports when the local test environment pins an occupied port", async () => {
    const occupied = await occupyPort();
    const environment = { E2E_FRONTEND_PORT: String(occupied) };

    await configureE2ePorts(environment, { E2E_API_PORT: occupied, E2E_FRONTEND_PORT: occupied });

    expect(environment.E2E_FRONTEND_PORT).not.toBe(String(occupied));
    expect(Number(environment.E2E_FRONTEND_PORT)).toBeGreaterThan(0);
  });

  it("preserves free explicitly configured ports and releases reservations", async () => {
    const first = await occupyPort();
    const second = await occupyPort();
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    const environment = { E2E_API_PORT: String(first), E2E_FRONTEND_PORT: String(second) };

    await configureE2ePorts(environment);
    await configureE2ePorts(environment);

    expect(environment).toEqual({ E2E_API_PORT: String(first), E2E_FRONTEND_PORT: String(second) });
  });

  it.each(["0", "-1", "65536", "abc", "4100.5", ""])(
    "rejects an invalid explicit port %s",
    async (value) => {
      await expect(configureE2ePorts({ E2E_API_PORT: value })).rejects.toThrow(
        "E2E_API_PORT must be an integer between 1 and 65535",
      );
    },
  );

  it("leaves settings unchanged and releases reservations after invalid frontend configuration", async () => {
    const api = await occupyPort();
    await new Promise<void>((resolve) => servers[0].close(() => resolve()));
    const environment = { E2E_API_PORT: String(api), E2E_FRONTEND_PORT: "invalid" };

    await expect(configureE2ePorts(environment)).rejects.toThrow("E2E_FRONTEND_PORT");
    expect(environment).toEqual({ E2E_API_PORT: String(api), E2E_FRONTEND_PORT: "invalid" });
    environment.E2E_FRONTEND_PORT = String(api);
    await configureE2ePorts(environment);
    expect(environment.E2E_API_PORT).toBe(String(api));
    expect(environment.E2E_FRONTEND_PORT).not.toBe(String(api));
  });
});
