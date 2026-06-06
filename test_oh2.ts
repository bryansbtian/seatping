import { getCurrentOperatingStatus } from "./server/lib/operatingHours.js";
const openingHours = {
  timezone: "Asia/Jakarta",
  monday: { enabled: true, open: "00:00", close: "00:00" },
  sunday: { enabled: true, open: "00:00", close: "00:00" },
  tuesday: { enabled: true, open: "00:00", close: "00:00" },
  wednesday: { enabled: true, open: "00:00", close: "00:00" },
  thursday: { enabled: true, open: "00:00", close: "00:00" },
  friday: { enabled: true, open: "00:00", close: "00:00" },
  saturday: { enabled: true, open: "00:00", close: "00:00" }
};
const now = new Date();
console.log(getCurrentOperatingStatus(openingHours, now));
