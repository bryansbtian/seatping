import { describe, expect, it } from "vitest";
import { normalizePhone } from "../../server/lib/guests.js";

const INDONESIAN_CANONICAL = "6281234567890";

describe("Indonesian phone normalization", () => {
  const representations: Array<[string, string | null]> = [
    ["081234567890", "+62"],
    ["81234567890", "+62"],
    ["6281234567890", "+62"],
    ["+6281234567890", "+62"],
    ["6281234567890", null],
    ["+6281234567890", null],
    ["+62 812-3456-7890", null],
    ["0812 3456 7890", "+62"],
    ["(0812) 3456-7890", "+62"],
    ["0812-3456-7890", "62"],
  ];

  for (const [phone, countryCode] of representations) {
    it(`normalizes ${phone} with country code ${countryCode} to the canonical number`, () => {
      expect(normalizePhone(phone, countryCode)).toBe(INDONESIAN_CANONICAL);
    });
  }

  it("resolves every representation to a single value", () => {
    const results = new Set(
      representations.map(([phone, countryCode]) => {
        return normalizePhone(phone, countryCode);
      }),
    );

    expect(results.size).toBe(1);
  });
});

describe("other countries keep working", () => {
  it("normalizes a United States number", () => {
    expect(normalizePhone("(555) 123-4567", "+1")).toBe("15551234567");
    expect(normalizePhone("+1 555 123 4567", "")).toBe("15551234567");
    expect(normalizePhone("5551234567", "+1")).toBe("15551234567");
  });

  it("normalizes a United Kingdom number with a trunk prefix", () => {
    expect(normalizePhone("07911123456", "+44")).toBe("447911123456");
    expect(normalizePhone("7911123456", "+44")).toBe("447911123456");
    expect(normalizePhone("+447911123456", "+44")).toBe("447911123456");
  });

  it("normalizes a Singapore number that has no trunk prefix", () => {
    expect(normalizePhone("81234567", "+65")).toBe("6581234567");
    expect(normalizePhone("+65 8123 4567", "")).toBe("6581234567");
  });

  it("keeps a bare national number when no country code is given", () => {
    expect(normalizePhone("81234567890")).toBe("81234567890");
    expect(normalizePhone("0812345678", "")).toBe("812345678");
  });
});

describe("normalizePhone rejections", () => {
  it("rejects input with no digits", () => {
    expect(normalizePhone("no digits")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(7, 7)).toBeNull();
  });

  it("rejects a number that is only trunk zeroes", () => {
    expect(normalizePhone("000000")).toBeNull();
    expect(normalizePhone("0", "+62")).toBeNull();
  });

  it("rejects a number that is too short to dial", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("123", "")).toBeNull();
  });

  it("keeps a short national number that a country code makes dialable", () => {
    expect(normalizePhone("12345", "+62")).toBe("6212345");
  });
});
