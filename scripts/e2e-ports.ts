import { createServer, type Server } from "node:net";

export async function configureE2ePorts(
  environment: NodeJS.ProcessEnv,
  defaults = { E2E_API_PORT: 4100, E2E_FRONTEND_PORT: 8081 },
): Promise<void> {
  const reservations: Server[] = [];
  const selected: NodeJS.ProcessEnv = {};
  try {
    for (const [name, preferredPort] of Object.entries(defaults)) {
      const configuredPort = environment[name];
      const port = Number(configuredPort ?? preferredPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be an integer between 1 and 65535`);
      }
      const server = createServer();
      reservations.push(server);
      try {
        await listen(server, port);
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EADDRINUSE") {
          throw error;
        }
        await listen(server, 0);
      }
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error(`Could not select a port for ${name}`);
      }
      selected[name] = String(address.port);
    }
    Object.assign(environment, selected);
  } finally {
    await Promise.all(
      reservations.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}
