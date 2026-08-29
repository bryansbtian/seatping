import { describe, expect, it } from "vitest";
import { compactNumber } from "../../src/lib/formatNumber.js";

describe("compactNumber", () => {
  it("leaves small numbers alone", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(7)).toBe("7");
    expect(compactNumber(999)).toBe("999");
  });

  it("shortens thousands", () => {
    expect(compactNumber(1200)).toBe("1.2k");
    expect(compactNumber(4500)).toBe("4.5k");
  });

  it("drops a trailing zero decimal", () => {
    expect(compactNumber(1000)).toBe("1k");
    expect(compactNumber(2000)).toBe("2k");
  });

  it("shortens millions", () => {
    expect(compactNumber(1_500_000)).toBe("1.5m");
  });

  it("shortens billions", () => {
    expect(compactNumber(2_400_000_000)).toBe("2.4b");
  });

  it("keeps the sign on negatives", () => {
    expect(compactNumber(-1200)).toBe("-1.2k");
  });
});
