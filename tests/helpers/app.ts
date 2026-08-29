import type { Express } from "express";
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

export async function api() {
  const app = await getApp();
  return supertest(app);
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
  const agent = await api();
  const scoped = {} as IpScopedApi;
  for (const method of IP_METHODS) {
    scoped[method] = (url: string) => agent[method](url).set("X-Forwarded-For", ip);
  }
  return scoped;
}
