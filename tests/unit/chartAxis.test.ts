import { describe, expect, it } from "vitest";
import { MAX_AXIS_LABELS, axisLabelStep } from "../../src/lib/chartAxis.js";

describe("axisLabelStep", () => {
  it("labels every point while they still fit", () => {
    expect(axisLabelStep(0)).toBe(1);
    expect(axisLabelStep(1)).toBe(1);
    expect(axisLabelStep(MAX_AXIS_LABELS)).toBe(1);
  });

  it("thins the labels once there are more points than slots", () => {
    expect(axisLabelStep(MAX_AXIS_LABELS + 1)).toBe(2);
    expect(axisLabelStep(16)).toBe(2);
    expect(axisLabelStep(17)).toBe(3);
    expect(axisLabelStep(90)).toBe(12);
  });

  it("honours a caller supplied label budget", () => {
    expect(axisLabelStep(10, 10)).toBe(1);
    expect(axisLabelStep(10, 4)).toBe(3);
    expect(axisLabelStep(30, 3)).toBe(10);
  });
});
