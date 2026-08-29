import { describe, expect, it } from "vitest";
import { formatDeltaWithPercent } from "../../src/lib/performanceApi.js";

describe("formatDeltaWithPercent", () => {
  it("shows the share of the prior period", () => {
    expect(formatDeltaWithPercent(4, 10)).toBe("+4 (+40%)");
  });

  it("shows a fall as a negative share", () => {
    expect(formatDeltaWithPercent(-3, 10)).toBe("-3 (-30%)");
  });

  it("treats growth from an empty prior period as a full gain", () => {
    expect(formatDeltaWithPercent(7, 0)).toBe("+7 (+100%)");
  });

  it("treats a fall to nothing from an empty prior period as a full loss", () => {
    expect(formatDeltaWithPercent(-2, 0)).toBe("-2 (-100%)");
  });

  it("leaves a flat empty period without a percentage", () => {
    expect(formatDeltaWithPercent(0, 0)).toBe("0");
  });

  it("reports no change against a real prior period", () => {
    expect(formatDeltaWithPercent(0, 12)).toBe("0 (0%)");
  });
});
