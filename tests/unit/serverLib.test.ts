import { describe, expect, it } from "vitest";
import type { QueueEntry, Reservation } from "@prisma/client";
import {
  legacyKeyOf,
  queueEntryToLegacy,
  reconstructQueueArrays,
  reservationRowToLegacy,
  reservationStatusToEnum,
  reservationStatusToLegacy,
} from "../../server/lib/liveData.js";
import {
  SITE_URL,
  injectSeo,
  isBusinessPath,
  metaForPath,
  renderSeoTags,
} from "../../server/lib/pageMeta.js";
import { formatWhatsAppNumber } from "../../server/lib/whatsapp.js";
import {
  computeStats,
  buildSummary,
  isReturning,
  normalizeEmail,
  normalizePhone,
  badgeForContact,
  turnMinutes,
} from "../../server/lib/guests.js";
import {
  DEFAULT_BASE_CREDITS,
  computeNextRefillDate,
  getBaseCreditsForUser,
  getCreditsForLocation,
  isTrialExpired,
  nextMonthlyAnchorAfter,
  shouldRefillMonthlyCredits,
} from "../../server/lib/trial.js";
import {
  BusinessSignUpSchema,
  ChangePasswordSchema,
  CustomerSignUpSchema,
  LoginSchema,
} from "../../server/lib/validation.js";
import { withWriteRetry } from "../../server/lib/dbRetry.js";

function queueRow(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: "q1",
    queueToken: "token-1",
    legacyKey: "key-1",
    locationId: "loc-1",
    businessId: "biz-1",
    customerId: null,
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
    notificationMethod: "email",
    phone: null,
    countryCode: null,
    email: "ada@test.invalid",
    smsConsent: false,
    smsMarketingConsent: false,
    status: "WAITING",
    finalStatus: null,
    joinedAt: new Date("2026-06-08T10:00:00.000Z"),
    admittedAt: null,
    arrivedAt: null,
    noShowAt: null,
    removedAt: null,
    leftAt: null,
    createdAt: new Date("2026-06-08T10:00:00.000Z"),
    updatedAt: new Date("2026-06-08T10:00:00.000Z"),
    ...overrides,
  } as QueueEntry;
}

function reservationRow(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    manageToken: "mt-1",
    locationId: "loc-1",
    businessId: "biz-1",
    businessUsername: "biz",
    customerId: null,
    firstName: "Grace",
    lastName: "Hopper",
    name: null,
    guestCount: 4,
    email: "grace@test.invalid",
    phone: null,
    countryCode: null,
    contactMethod: null,
    reservationDateTime: "2026-06-10T19:00",
    status: "CONFIRMED",
    notes: null,
    source: null,
    reminderEmailSentAt: null,
    cancelledAt: null,
    arrivedAt: null,
    completedAt: null,
    noShowAt: null,
    createdAt: new Date("2026-06-08T10:00:00.000Z"),
    updatedAt: new Date("2026-06-08T10:00:00.000Z"),
    ...overrides,
  } as Reservation;
}

describe("legacy queue serialization", () => {
  it("builds a stable legacy key from the identity fields", () => {
    expect(legacyKeyOf("Ada", "Lovelace", "2026-06-08")).toBe("AdaLovelace2026-06-08");
  });

  it("tolerates missing parts when building the key", () => {
    expect(legacyKeyOf(null, undefined, null)).toBe("");
  });

  it("exposes the fields the frontend expects", () => {
    const legacy = queueEntryToLegacy(queueRow(), { position: 3 });

    expect(legacy.name).toBe("Ada Lovelace");
    expect(legacy.partySize).toBe(2);
    expect(legacy.numGuests).toBe(2);
    expect(legacy.status).toBeUndefined();
    expect(legacy.position).toBe(3);
    expect(legacy.joinedAt).toBe("2026-06-08T10:00:00.000Z");
  });

  it("defaults an absent country code", () => {
    expect(queueEntryToLegacy(queueRow()).countryCode).toBe("+1");
  });

  it("maps admitted entries with their final status", () => {
    const legacy = queueEntryToLegacy(
      queueRow({
        status: "ADMITTED",
        admittedAt: new Date("2026-06-08T11:00:00.000Z"),
        finalStatus: null,
      }),
    );

    expect(legacy.status).toBe("admitted");
    expect(legacy.finalStatus).toBe("pending");
  });

  it("distinguishes left from removed entries", () => {
    expect(queueEntryToLegacy(queueRow({ status: "LEFT" })).status).toBe("left");
    expect(queueEntryToLegacy(queueRow({ status: "REMOVED" })).status).toBe("removed");
  });

  it("splits rows into queue, admitted and removed buckets", () => {
    const arrays = reconstructQueueArrays([
      queueRow({ id: "a", status: "WAITING" }),
      queueRow({ id: "b", status: "ADMITTED", admittedAt: new Date() }),
      queueRow({ id: "c", status: "REMOVED", removedAt: new Date() }),
    ]);

    expect(arrays.queue).toHaveLength(1);
    expect(arrays.admittedCustomers).toHaveLength(1);
    expect(arrays.removedCustomers).toHaveLength(1);
  });

  it("numbers waiting positions from one", () => {
    const arrays = reconstructQueueArrays([
      queueRow({ id: "a", status: "WAITING" }),
      queueRow({ id: "b", status: "WAITING" }),
    ]);

    expect(arrays.queue[0].position).toBe(1);
    expect(arrays.queue[1].position).toBe(2);
  });
});

describe("reservation status mapping", () => {
  it("maps enum values to legacy values", () => {
    expect(reservationStatusToLegacy("CONFIRMED")).toBe("confirmed");
    expect(reservationStatusToLegacy("NO_SHOW")).toBe("no_show");
  });

  it("falls back to confirmed for an unknown enum value", () => {
    expect(reservationStatusToLegacy("SOMETHING_ELSE")).toBe("confirmed");
  });

  it("maps legacy values back to enum values regardless of casing", () => {
    expect(reservationStatusToEnum("cancelled")).toBe("CANCELLED");
    expect(reservationStatusToEnum("ARRIVED")).toBe("ARRIVED");
  });

  it("falls back to CONFIRMED for unknown or empty legacy values", () => {
    expect(reservationStatusToEnum("")).toBe("CONFIRMED");
    expect(reservationStatusToEnum("nonsense")).toBe("CONFIRMED");
  });

  it("serializes a reservation row and hides the manage token by default", () => {
    const legacy = reservationRowToLegacy(reservationRow());

    expect(legacy.partySize).toBe(4);
    expect(legacy.status).toBe("confirmed");
    expect(legacy.name).toBe("Grace Hopper");
    expect(legacy.manageToken).toBeUndefined();
  });

  it("includes the manage token when explicitly requested", () => {
    const legacy = reservationRowToLegacy(reservationRow(), {
      includeToken: true,
    });

    expect(legacy.manageToken).toBe("mt-1");
  });
});

describe("page metadata", () => {
  it("recognises business paths", () => {
    expect(isBusinessPath("/business")).toBe(true);
    expect(isBusinessPath("/business/dashboard")).toBe(true);
    expect(isBusinessPath("/businesses")).toBe(false);
    expect(isBusinessPath("/")).toBe(false);
  });

  it("selects different metadata for business and customer paths", () => {
    const business = metaForPath("/business/dashboard");
    const customer = metaForPath("/");

    expect(business.title).not.toBe(customer.title);
    expect(business.url.startsWith(SITE_URL)).toBe(true);
  });

  it("strips query strings and trailing slashes from the canonical url", () => {
    expect(metaForPath("/help?a=1").url).toBe(`${SITE_URL}/help`);
    expect(metaForPath("/help/").url).toBe(`${SITE_URL}/help`);
    expect(metaForPath("/").url).toBe(`${SITE_URL}/`);
  });

  it("renders escaped meta tags", () => {
    const tags = renderSeoTags(metaForPath("/"));

    expect(tags).toContain("<title>");
    expect(tags).toContain("og:title");
  });

  it("injects tags between the SEO markers", () => {
    const template = "<head>\n<!-- SEO:START -->old<!-- SEO:END -->\n</head>";
    const out = injectSeo(template, "/");

    expect(out).not.toContain("old");
    expect(out).toContain("og:title");
  });

  it("leaves a template without markers unchanged", () => {
    const template = "<head></head>";

    expect(injectSeo(template, "/")).toBe(template);
  });
});

describe("whatsapp number formatting", () => {
  it("concatenates the digits of the country code and number", () => {
    expect(formatWhatsAppNumber("+62", "812-3456-7890")).toBe("6281234567890");
  });

  it("tolerates empty parts", () => {
    expect(formatWhatsAppNumber("", "")).toBe("");
    expect(formatWhatsAppNumber("+1", "")).toBe("1");
  });
});

describe("guest normalization and dedup keys", () => {
  it("lowercases and trims an email", () => {
    expect(normalizeEmail("  Ada@Test.INVALID ")).toBe("ada@test.invalid");
  });

  it("rejects values that are not usable emails", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("reduces a phone number to comparable digits", () => {
    expect(normalizePhone("812-3456-7890", "+62")).toBe("6281234567890");
  });

  it("treats differently punctuated numbers as the same guest", () => {
    expect(normalizePhone("(555) 123-4567", "+1")).toBe(normalizePhone("+1 555 123 4567", ""));
  });

  it("strips leading zeros so a local format matches the international one", () => {
    expect(normalizePhone("0812345678", "")).toBe("812345678");
  });

  it("rejects a number that is too short to identify a guest", () => {
    expect(normalizePhone("123", "")).toBeNull();
    expect(normalizePhone("", "")).toBeNull();
    expect(normalizePhone(null, null)).toBeNull();
  });

  it("classifies returning guests by visit count", () => {
    expect(isReturning(1)).toBe(false);
    expect(isReturning(2)).toBe(true);
    expect(isReturning(9)).toBe(true);
  });

  it("summarises a guest's history", () => {
    const stats = computeStats(
      [queueRow({ status: "ARRIVED" })],
      [reservationRow({ status: "COMPLETED" })],
      "UTC",
    );

    expect(stats.totalVisits).toBeGreaterThanOrEqual(1);
    const summary = buildSummary(stats, "UTC");
    expect(summary).toEqual(expect.any(String));
    expect(summary.length).toBeGreaterThan(0);
  });

  it("counts no-shows separately from visits", () => {
    const stats = computeStats([queueRow({ status: "NO_SHOW" })], [], "UTC");

    expect(stats.noShowCount).toBe(1);
  });

  it("counts cancelled reservations separately", () => {
    const stats = computeStats([], [reservationRow({ status: "CANCELLED" })], "UTC");

    expect(stats.cancelledCount).toBe(1);
  });

  it("matches a badge by normalized email or phone", () => {
    const map = new Map([
      ["e:ada@test.invalid", { totalVisits: 4, returning: true }],
      ["p:6281234567890", { totalVisits: 9, returning: true }],
    ]);

    const badge = badgeForContact(map, { email: "ADA@test.invalid" });
    expect(badge?.totalVisits).toBe(4);

    expect(badgeForContact(map, { phone: "812-3456-7890", countryCode: "+62" })?.totalVisits).toBe(
      9,
    );
    expect(badgeForContact(map, { email: "nobody@test.invalid" })).toBeNull();
  });
});

describe("trial and credit accounting", () => {
  it("treats a business inside its trial window as active", () => {
    const business = {
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      trialDurationDays: 7,
    };

    expect(isTrialExpired(business)).toBe(false);
  });

  it("treats a business past its trial window as expired", () => {
    const business = {
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      trialDurationDays: 7,
    };

    expect(isTrialExpired(business)).toBe(true);
  });

  it("defaults the trial length when it is not a number", () => {
    const business = {
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      trialDurationDays: "nonsense",
    };

    expect(isTrialExpired(business)).toBe(false);
  });

  it("uses the configured base credits when present", () => {
    expect(getBaseCreditsForUser({ baseCredits: 42 })).toBe(42);
  });

  it("falls back to the default base credits", () => {
    expect(getBaseCreditsForUser({})).toBe(DEFAULT_BASE_CREDITS);
    expect(getBaseCreditsForUser(null)).toBe(DEFAULT_BASE_CREDITS);
  });

  it("gives an expired trial business no credits", () => {
    const expired = {
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      trialDurationDays: 7,
      trial: true,
      baseCredits: 300,
    };

    expect(getCreditsForLocation(expired)).toBe(0);
  });

  it("advances the monthly anchor past the current date", () => {
    const anchor = new Date("2026-01-15T00:00:00.000Z");
    const next = nextMonthlyAnchorAfter(anchor, new Date("2026-03-20T00:00:00.000Z"));

    expect(next.getTime()).toBeGreaterThan(new Date("2026-03-20T00:00:00.000Z").getTime());
  });

  it("computes a refill date after the start date", () => {
    const started = new Date("2026-01-15T00:00:00.000Z");
    const next = computeNextRefillDate(started, new Date("2026-02-01T00:00:00.000Z"));

    expect(next.getTime()).toBeGreaterThan(started.getTime());
  });

  it("only refills once the next refill date has passed", () => {
    expect(
      shouldRefillMonthlyCredits({
        trial: false,
        creditsStartedAt: new Date("2026-01-01"),
        nextCreditRefillAt: new Date(Date.now() - 1000),
      }),
    ).toBe(true);

    expect(
      shouldRefillMonthlyCredits({
        trial: false,
        creditsStartedAt: new Date("2026-01-01"),
        nextCreditRefillAt: new Date(Date.now() + 86400000),
      }),
    ).toBe(false);
  });

  it("does not refill a business that never started credits", () => {
    expect(shouldRefillMonthlyCredits({ trial: false })).toBe(false);
  });

  it("never refills a business still on trial", () => {
    expect(
      shouldRefillMonthlyCredits({
        trial: true,
        creditsStartedAt: new Date("2026-01-01"),
        nextCreditRefillAt: new Date(Date.now() - 1000),
      }),
    ).toBe(false);
  });
});

describe("request validation schemas", () => {
  it("accepts a valid business signup", () => {
    const parsed = BusinessSignUpSchema.safeParse({
      name: "Test Bistro",
      username: "test-bistro",
      email: "owner@test.invalid",
      phone: "+15551234567",
      password: "Passw0rd!",
      address: "1 Test Street",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed signup email", () => {
    const parsed = BusinessSignUpSchema.safeParse({
      name: "Test Bistro",
      username: "test-bistro",
      email: "not-an-email",
      phone: "+15551234567",
      password: "Passw0rd!",
      address: "1 Test Street",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a short password", () => {
    const parsed = CustomerSignUpSchema.safeParse({
      name: "Ada",
      username: "ada",
      email: "ada@test.invalid",
      phone: "+15551234567",
      password: "x",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires both fields on login", () => {
    expect(LoginSchema.safeParse({ emailOrUsername: "a@test.invalid" }).success).toBe(false);
    expect(
      LoginSchema.safeParse({
        emailOrUsername: "a@test.invalid",
        password: "Passw0rd!",
      }).success,
    ).toBe(true);
  });

  it("requires a new password when changing it", () => {
    expect(ChangePasswordSchema.safeParse({ currentPassword: "Passw0rd!" }).success).toBe(false);
  });
});

describe("write retry helper", () => {
  it("returns the value when the operation succeeds first time", async () => {
    const result = await withWriteRetry(async () => {
      return "ok";
    });

    expect(result).toBe("ok");
  });

  it("retries a P2034 write conflict and then succeeds", async () => {
    let attempts = 0;
    const result = await withWriteRetry(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("write conflict"), { code: "P2034" });
      }
      return "recovered";
    });

    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("rethrows a non-retryable error immediately", async () => {
    let attempts = 0;
    await expect(
      withWriteRetry(async () => {
        attempts += 1;
        throw new Error("permanent failure");
      }),
    ).rejects.toThrow(/permanent failure/);

    expect(attempts).toBe(1);
  });

  it("gives up after exhausting the retry budget", async () => {
    let attempts = 0;
    await expect(
      withWriteRetry(async () => {
        attempts += 1;
        throw Object.assign(new Error("always conflicts"), { code: "P2034" });
      }, 3),
    ).rejects.toThrow(/always conflicts/);

    expect(attempts).toBe(3);
  });
});

describe("turnMinutes", () => {
  const seated = new Date("2026-08-27T18:00:00.000Z");

  it("measures the time a party held the table", () => {
    expect(turnMinutes(seated, new Date("2026-08-27T19:12:00.000Z"))).toBe(72);
  });

  it("rounds to the nearest minute", () => {
    expect(turnMinutes(seated, new Date("2026-08-27T18:30:40.000Z"))).toBe(31);
  });

  it("returns zero for a visit closed immediately", () => {
    expect(turnMinutes(seated, seated)).toBe(0);
  });

  it("has nothing to report before the party is seated", () => {
    expect(turnMinutes(null, new Date())).toBeNull();
  });

  it("has nothing to report while the party is still at the table", () => {
    expect(turnMinutes(seated, null)).toBeNull();
  });

  it("refuses a completion that lands before seating", () => {
    expect(turnMinutes(seated, new Date("2026-08-27T17:00:00.000Z"))).toBeNull();
  });

  it("refuses an unreadable timestamp", () => {
    expect(turnMinutes(seated, new Date("nonsense"))).toBeNull();
  });
});
