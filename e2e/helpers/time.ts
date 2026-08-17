export const TEST_TIMEZONE = "UTC";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type OpeningHours = Record<string, unknown> & { timezone: string };

export function dateKeyInTimeZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function todayKey(timeZone: string = TEST_TIMEZONE): string {
  return dateKeyInTimeZone(new Date(), timeZone);
}

export function futureDateKey(
  daysAhead: number,
  timeZone: string = TEST_TIMEZONE,
): string {
  const at = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return dateKeyInTimeZone(at, timeZone);
}

export function openingHoursEveryDay(
  open: string,
  close: string,
  timezone: string = TEST_TIMEZONE,
): OpeningHours {
  const hours: OpeningHours = { timezone };
  for (const day of DAY_KEYS) {
    hours[day] = { enabled: true, open, close };
  }
  return hours;
}

export function openAllDayEveryDay(
  timezone: string = TEST_TIMEZONE,
): OpeningHours {
  return openingHoursEveryDay("00:00", "00:00", timezone);
}

export function closedEveryDay(
  timezone: string = TEST_TIMEZONE,
): OpeningHours {
  const hours: OpeningHours = { timezone };
  for (const day of DAY_KEYS) {
    hours[day] = { enabled: false, open: "09:00", close: "17:00" };
  }
  return hours;
}

export function publishedProfile(
  displayName: string,
  openingHours: OpeningHours,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    displayName,
    shortAddress: "Playwright District",
    tagline: "Seated without the wait",
    description: "An end to end test restaurant.",
    cuisineTypes: ["Indonesian"],
    priceRange: "$$",
    currency: "IDR",
    menu: [],
    menuUrl: "",
    details: {
      address: "1 Playwright Street, Jakarta",
      area: "Playwright District",
      city: "Jakarta",
      country: "Indonesia",
      phone: "+62 21 1234 5678",
      website: "",
      instagram: "",
      googleMapsUrl: "",
    },
    openingHours,
    isPublished: true,
    ...extra,
  };
}
