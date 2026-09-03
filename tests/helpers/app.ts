import type { Express } from "express";
import http from "node:http";
import supertest from "supertest";

let cached: Express | null = null;

export async function getApp(): Promise<Express> {
  if (cached) {
    return cached;
  }
  const mod = await import("../../server/index.js");
  cached = mod.default as Express;
  return cached;
}

const servers = new Set<http.Server>();

export async function serveApp(app: Express) {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  server.unref();
  servers.add(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }
  return supertest(`http://127.0.0.1:${address.port}`);
}

export async function closeTestServers(): Promise<void> {
  const open = [...servers];
  servers.clear();
  await Promise.all(
    open.map((server) => {
      return new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      });
    }),
  );
}

let agent: Awaited<ReturnType<typeof serveApp>> | null = null;

export async function api() {
  if (agent) {
    return agent;
  }
  agent = await serveApp(await getApp());
  return agent;
}

let ipCounter = 0;

export function freshTestIp(): string {
  ipCounter += 1;
  const third = Math.floor(ipCounter / 254) % 254;
  const fourth = (ipCounter % 254) + 1;
  return `198.18.${third}.${fourth}`;
}

const IP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type IpMethod = (typeof IP_METHODS)[number];

export type IpScopedApi = Record<IpMethod, (url: string) => supertest.Test>;

export async function apiFromIp(ip: string = freshTestIp()): Promise<IpScopedApi> {
  const agentForIp = await api();
  const scoped = {} as IpScopedApi;
  for (const method of IP_METHODS) {
    scoped[method] = (url: string) => agentForIp[method](url).set("X-Forwarded-For", ip);
  }
  return scoped;
}
