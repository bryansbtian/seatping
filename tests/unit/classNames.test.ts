import { describe, expect, it } from "vitest";
import { cn } from "../../src/lib/utils.js";

describe("cn", () => {
  it("keeps a custom font size beside a text colour", () => {
    expect(cn("text-micro font-medium", "text-amber-800")).toContain("text-micro");
    expect(cn("text-caption", "text-slate-500")).toContain("text-caption");
  });

  it("still lets a later font size win over an earlier one", () => {
    const merged = cn("text-micro", "text-caption");

    expect(merged).toContain("text-caption");
    expect(merged).not.toContain("text-micro");
  });

  it("still lets a later colour win over an earlier one", () => {
    const merged = cn("text-slate-500", "text-amber-800");

    expect(merged).toContain("text-amber-800");
    expect(merged).not.toContain("text-slate-500");
  });

  it("merges a custom font size against a built-in one", () => {
    const merged = cn("text-sm", "text-micro");

    expect(merged).toContain("text-micro");
    expect(merged).not.toContain("text-sm");
  });
});
