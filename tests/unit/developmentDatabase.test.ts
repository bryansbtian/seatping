import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertLocalDevelopmentDatabase,
  guardDevelopmentDatabase,
} from "../../server/lib/developmentDatabase.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Development Database Boundary", () => {
  it.each([
    "postgresql://user:password@localhost:5434/seatping_dev",
    "postgresql://user:password@127.0.0.1:5434/seatping_development",
    "postgresql://user:password@[::1]:5433/seatping_test",
  ])("accepts only an explicitly local development or test database: %s", (url) => {
    expect(assertLocalDevelopmentDatabase(url)).toBe(url);
  });
  it.each([
    undefined,
    "",
    "not-a-url",
    "postgresql://user:password@prod.example.test/seatping_dev",
    "postgresql://user:password@localhost.example.test/seatping_dev",
    "postgresql://user:password@192.168.1.10/seatping_dev",
    "postgresql://user:password@localhost/postgres",
    "postgresql://user:password@localhost/seatping_prod_dev",
    "https://localhost/seatping_dev",
  ])("rejects an unsafe database before a client can connect: %s", (url) => {
    expect(() => assertLocalDevelopmentDatabase(url)).toThrow(/Development/);
  });
  it("checks both runtime and migration connections in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@localhost:5434/seatping_dev");
    vi.stubEnv("DIRECT_URL", "postgresql://user:password@prod.example.test/postgres");
    expect(guardDevelopmentDatabase).toThrow("Development cannot connect");
  });
  it("leaves production configuration to its deployment environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@prod.example.test/postgres");
    expect(guardDevelopmentDatabase).not.toThrow();
  });
});
