import { describe, expect, it } from "vitest";
import { buttonVariants } from "../../src/components/ui/buttonVariants.js";
import { PILL_BASE_CLASS, statusBadgeClass } from "../../src/lib/statusStyles.js";
import { cn } from "../../src/lib/utils.js";

describe("buttonVariants", () => {
  it("uses the control height and radius by default", () => {
    const classes = buttonVariants();

    expect(classes).toContain("control-md");
    expect(classes).toContain("rounded-control");
    expect(classes).toContain("text-label");
  });

  it("scales down for the small size and up for the large size", () => {
    expect(buttonVariants({ size: "sm" })).toContain("control-sm");
    expect(buttonVariants({ size: "lg" })).toContain("control-lg");
    expect(buttonVariants({ size: "icon" })).toContain("control-icon");
  });

  it("keeps the variant text colour when a size sets a font size", () => {
    const classes = cn(buttonVariants({ variant: "default", size: "lg" }));

    expect(classes).toContain("text-white");
    expect(classes).toContain("text-body");
  });

  it("lets a call site height override the control height", () => {
    const classes = cn(buttonVariants({ size: "lg" }), "h-12");

    expect(classes).toContain("h-12");
    expect(classes).toContain("control-lg");
  });
});

describe("status pills", () => {
  it("uses the badge geometry", () => {
    expect(PILL_BASE_CLASS).toContain("h-badge");
    expect(PILL_BASE_CLASS).toContain("rounded-badge");
    expect(PILL_BASE_CLASS).toContain("text-caption");
  });

  it("fills without a border so states read strongly", () => {
    for (const status of ["waiting", "confirmed", "cancelled", "arrived", "completed"]) {
      const classes = statusBadgeClass(status);

      expect(classes).not.toContain("border-");
      expect(classes).toMatch(/bg-\w+-100/);
    }
  });
});
