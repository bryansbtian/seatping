import { describe, expect, it } from "vitest";
import { maskEmail, maskEmailList, maskPhone } from "../../server/lib/redact.js";

describe("maskEmail", () => {
  it("keeps only the first character and the domain", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });

  it("trims and handles subdomains", () => {
    expect(maskEmail("  Someone@mail.corp.example.com  ")).toBe("S***@mail.corp.example.com");
  });

  it("never leaks the local part", () => {
    const masked = maskEmail("verysecretaddress@example.com");
    expect(masked).not.toContain("verysecretaddress");
    expect(masked).toBe("v***@example.com");
  });

  it("redacts values that are not addresses", () => {
    expect(maskEmail("not-an-email")).toBe("[redacted]");
    expect(maskEmail("@example.com")).toBe("[redacted]");
    expect(maskEmail("trailing@")).toBe("[redacted]");
  });

  it("reports missing values without throwing", () => {
    expect(maskEmail(null)).toBe("[none]");
    expect(maskEmail(undefined)).toBe("[none]");
    expect(maskEmail("   ")).toBe("[none]");
  });
});

describe("maskEmailList", () => {
  it("masks every address", () => {
    expect(maskEmailList(["one@a.com", "two@b.com"])).toBe("o***@a.com, t***@b.com");
  });

  it("returns an empty string for an empty list", () => {
    expect(maskEmailList([])).toBe("");
  });
});

describe("maskPhone", () => {
  it("keeps the last four digits and the plus prefix", () => {
    expect(maskPhone("+6281234567890")).toBe("+*********7890");
    expect(maskPhone("6281234567890")).toBe("*********7890");
  });

  it("ignores separators when counting digits", () => {
    expect(maskPhone("+1 (555) 123-4567")).toBe("+*******4567");
  });

  it("never leaks the leading digits", () => {
    expect(maskPhone("+628123456789")).not.toContain("8123");
  });

  it("redacts values too short to mask", () => {
    expect(maskPhone("12")).toBe("[redacted]");
    expect(maskPhone("abc")).toBe("[redacted]");
  });

  it("reports missing values without throwing", () => {
    expect(maskPhone(null)).toBe("[none]");
    expect(maskPhone(undefined)).toBe("[none]");
    expect(maskPhone("  ")).toBe("[none]");
  });
});
