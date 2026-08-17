import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getCurrentOperatingStatus,
  getDateOperatingStatus,
  isMinuteWithinOperatingHours,
} from "../../server/lib/operatingHours.js";

const hours = {
  timezone: "Asia/Jakarta",
  monday: { enabled: true, open: "10:00", close: "21:00" },
  tuesday: { enabled: true, open: "18:00", close: "02:00" },
  wednesday: { enabled: false, open: "10:00", close: "21:00" },
  thursday: { enabled: true, open: "10:00", close: "21:00" },
  friday: { enabled: true, open: "10:00", close: "21:00" },
  saturday: { enabled: true, open: "10:00", close: "21:00" },
  sunday: { enabled: false, open: "10:00", close: "21:00" },
};

test("marks an explicitly disabled date as closed", () => {
  const status = getDateOperatingStatus(hours, "2026-06-07");
  assert.equal(status.dayName, "Sunday");
  assert.equal(status.configured, true);
  assert.equal(status.isClosed, true);
  assert.equal(status.hoursLabel, "Closed");
});

test("uses the location timezone for current open status", () => {
  const status = getCurrentOperatingStatus(
    hours,
    new Date("2026-06-08T05:00:00.000Z"),
  );
  assert.equal(status.date, "2026-06-08");
  assert.equal(status.localMinute, 12 * 60);
  assert.equal(status.isOpen, true);
});

test("carries an overnight shift into the following date", () => {
  const wednesday = getDateOperatingStatus(hours, "2026-06-10");
  assert.equal(wednesday.isClosed, false);
  assert.equal(isMinuteWithinOperatingHours(wednesday, 60), true);
  assert.equal(isMinuteWithinOperatingHours(wednesday, 3 * 60), false);

  const duringSpill = getCurrentOperatingStatus(
    hours,
    new Date("2026-06-09T18:00:00.000Z"),
  );
  assert.equal(duringSpill.date, "2026-06-10");
  assert.equal(duringSpill.localMinute, 60);
  assert.equal(duringSpill.isOpen, true);
});

test("allows legacy locations whose hours are not configured", () => {
  const status = getCurrentOperatingStatus(undefined);
  assert.equal(status.configured, false);
  assert.equal(status.isOpen, null);
});
