import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SLOT_BUTTON_BASE_CLASS, SLOT_BUTTON_COMPACT_CLASS } from "../../src/lib/slotButton.js";

const root = process.cwd();
const callSites = ["src/components/ReservationBooking.tsx", "src/pages/ManageReservation.tsx"];

function slotGridCount(file: string) {
  const source = readFileSync(path.join(root, file), "utf8");
  return (source.match(/cn\(SLOT_BUTTON_BASE_CLASS/g) ?? []).length;
}

describe("time slot buttons", () => {
  it("trims the unused leading so the digits centre on their own ink", () => {
    expect(SLOT_BUTTON_BASE_CLASS).toContain("[text-box:trim-both_cap_alphabetic]");
    expect(SLOT_BUTTON_BASE_CLASS).toContain("content-center");
  });

  it("pins the height the old padding used to produce", () => {
    expect(SLOT_BUTTON_BASE_CLASS).toContain("h-[30px]");
    expect(SLOT_BUTTON_COMPACT_CLASS).toContain("max-[320px]:h-[24px]");
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
