import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SLOT_BUTTON_BASE_CLASS,
  SLOT_BUTTON_COMPACT_CLASS,
  SLOT_BUTTON_SELECTED_CLASS,
} from "../../src/lib/slotButton.js";
import { cn } from "../../src/lib/utils.js";

const root = process.cwd();
const callSites = ["src/components/ReservationBooking.tsx", "src/pages/ManageReservation.tsx"];

function slotGridCount(file: string) {
  const source = readFileSync(path.join(root, file), "utf8");
  return (source.match(/cn\(\s*SLOT_BUTTON_BASE_CLASS/g) ?? []).length;
}

describe("time slot buttons", () => {
  it("trims the unused leading so the digits centre on their own ink", () => {
    expect(SLOT_BUTTON_BASE_CLASS).toContain("[text-box:trim-both_cap_alphabetic]");
    expect(SLOT_BUTTON_BASE_CLASS).toContain("content-center");
  });

  it("uses canonical small controls without shrinking mobile touch targets", () => {
    expect(SLOT_BUTTON_BASE_CLASS).toContain("control-sm");
    expect(SLOT_BUTTON_BASE_CLASS).toContain("rounded-control");
    expect(SLOT_BUTTON_BASE_CLASS).toContain("text-label");
    expect(SLOT_BUTTON_BASE_CLASS).toContain("focus-visible:ring-ring");
    expect(SLOT_BUTTON_BASE_CLASS).toContain("disabled:opacity-50");
    expect(SLOT_BUTTON_BASE_CLASS).not.toContain("h-[30px]");
    expect(SLOT_BUTTON_COMPACT_CLASS).not.toContain(":h-");
  });

  it("matches the time skeleton controls to the loaded slot height and radius", () => {
    const source = readFileSync(path.join(root, "src/components/TimeSlotsSkeleton.tsx"), "utf8");
    expect(source).toContain('className="control-sm rounded-control"');
  });

  it("keeps selected slots readable while hovering", () => {
    const selected = cn(SLOT_BUTTON_BASE_CLASS, SLOT_BUTTON_SELECTED_CLASS);
    expect(selected).toContain("bg-slate-900");
    expect(selected).toContain("text-white");
    expect(selected).toContain("hover:bg-slate-800");
    expect(selected).toContain("hover:text-white");
    expect(selected).not.toContain("hover:text-slate-900");
  });

  it("no longer sizes the slot from vertical padding", () => {
    expect(SLOT_BUTTON_BASE_CLASS).not.toContain("py-");
    for (const file of callSites) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toContain("py-1.5 text-xs font-medium");
      expect(source).toContain("SLOT_BUTTON_BASE_CLASS");
    }
  });

  it("keeps every slot grid on the shared class", () => {
    expect(slotGridCount(callSites[0])).toBe(2);
    expect(slotGridCount(callSites[1])).toBe(1);
  });
});
