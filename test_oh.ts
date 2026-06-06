import { getDateOperatingStatus, getCurrentOperatingStatus, isMinuteWithinOperatingHours } from "./server/lib/operatingHours.js";
import { computeAvailability, normalizeSettings } from "./server/lib/reservations.js";

const openingHours = {
  timezone: "Asia/Jakarta",
  monday: { enabled: true, open: "00:00", close: "00:00" }
};

const dateStr = "2026-06-08"; // Monday
const status = getDateOperatingStatus(openingHours, dateStr);
console.log("getDateOperatingStatus:", JSON.stringify(status, null, 2));

console.log("isMinuteWithinOperatingHours (12:30):", isMinuteWithinOperatingHours(status, 12 * 60 + 30));

const settings = normalizeSettings({
  reservationStartTime: "00:00",
  reservationEndTime: "23:59",
});

const availability = computeAvailability({
  settings,
  reservations: [],
  date: dateStr,
  partySize: 2,
  timeZone: "Asia/Jakarta",
  openingHours,
});

console.log("computeAvailability slots length:", availability.slots.length);
console.log("outsideWindow:", availability.outsideWindow);
