import { afterEach, describe, expect, it } from "vitest";
import {
  UnsafeTestDatabaseError,
  assertSafeTestDatabaseUrl,
  databaseNameFromUrl,
  resetApprovedTestDatabaseUrl,
} from "../helpers/db.js";

const SAFE = "postgresql://postgres:pw@localhost:5433/seatping_test?schema=public";

afterEach(() => {
  resetApprovedTestDatabaseUrl();
  delete process.env.DATABASE_URL;
});

describe("test database safety guard", () => {
  it("accepts a local database whose name marks it as a test target", () => {
    expect(assertSafeTestDatabaseUrl(SAFE)).toBe(SAFE);
  });

  it("refuses a missing or blank URL", () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertSafeTestDatabaseUrl("   ")).toThrow(UnsafeTestDatabaseError);
  });

  it("refuses a URL identical to the application database", () => {
    process.env.DATABASE_URL = SAFE;

    expect(() => assertSafeTestDatabaseUrl(SAFE)).toThrow(/identical to DATABASE_URL/);
  });

  it("refuses managed cluster hosts", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://user:pw@db.abcdefgh.supabase.co:5432/seatping_test"),
    ).toThrow(/production target/);
  });

  it("refuses a production-looking host even when the name says test", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://prod-cluster:5432/seatping_test")).toThrow(
      /production target/,
    );
  });

  it("refuses a database whose name is not marked for testing", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://localhost:5433/seatping")).toThrow(
      /must contain "test"/,
    );
  });

  it("refuses a URL with no database name", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://localhost:5433")).toThrow(
      UnsafeTestDatabaseError,
    );
  });

  it("extracts the database name and ignores query parameters", () => {
    expect(databaseNameFromUrl(SAFE)).toBe("seatping_test");
    expect(databaseNameFromUrl("postgresql://host:1/db_test")).toBe("db_test");
  });
});
