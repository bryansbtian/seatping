import { describe, expect, it } from "vitest";
import { formatBlogDate } from "../../shared/blogDate.js";

describe("Blog Dates", () => {
  it.each([
    ["2026-11-11T20:30:00-05:00", "Nov 12, 2026"],
    ["2026-11-12T07:30:00+08:00", "Nov 11, 2026"],
    ["2027-01-01T00:00:00.000Z", "Jan 1, 2027"],
    ["2026-12-31T23:59:59.999Z", "Dec 31, 2026"],
  ])("formats %s as the UTC calendar date", (value, expected) => {
    expect(formatBlogDate(value)).toBe(expected);
  });

  it("keeps the article date on the same UTC day as the card", () => {
    const value = "2026-11-11T20:30:00-05:00";
    expect(formatBlogDate(value)).toBe("Nov 12, 2026");
    expect(formatBlogDate(value, "long")).toBe("November 12, 2026");
  });
});
