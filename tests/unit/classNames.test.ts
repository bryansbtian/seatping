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

  it("keeps the design system type scale beside a text colour", () => {
    expect(cn("text-label", "text-white")).toContain("text-label");
    expect(cn("text-body", "text-white")).toContain("text-white");
    expect(cn("text-title font-medium", "text-slate-800")).toContain("text-title");
  });

  it("lets a call site font size win over a design system one", () => {
    const merged = cn("text-label", "text-base");

    expect(merged).toContain("text-base");
    expect(merged).not.toContain("text-label");
  });

  it("lets a call site radius win over the control radius", () => {
    const merged = cn("rounded-control", "rounded-xl");

    expect(merged).toContain("rounded-xl");
    expect(merged).not.toContain("rounded-control");
  });

  it("lets a call site height win over a row height", () => {
    const merged = cn("h-row", "h-12");

    expect(merged).toContain("h-12");
    expect(merged).not.toContain("h-row");
  });

  it("keeps switch track and thumb sizing apart from other sizes", () => {
    expect(cn("h-switch-h w-switch-w", "shrink-0")).toContain("h-switch-h");
    expect(cn("min-h-row", "min-h-row-lg")).toBe("min-h-row-lg");
  });
});
