import { beforeEach } from "vitest";
import { loadTestEnv } from "../helpers/loadTestEnv.js";
import { resetExternalMocks } from "./externalMocks.js";

loadTestEnv();

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mongodb://127.0.0.1:1/unit-tests-must-not-query";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "unit-test-jwt-secret";
process.env.NODE_ENV = "test";

beforeEach(() => {
  resetExternalMocks();
});
