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
