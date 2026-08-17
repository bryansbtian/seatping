import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestProfile } from "@prisma/client";

const guestFindMany = vi.fn();
const guestFindRaw = vi.fn();
const savedAudienceFindUnique = vi.fn();
const templateFindFirst = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      guestProfile: { findMany: guestFindMany, findRaw: guestFindRaw },
      savedAudience: { findUnique: savedAudienceFindUnique },
      campaignTemplate: { findFirst: templateFindFirst },
    },
  };
});

const {
  advanceRecurrence,
  buildMessage,
  editableVariables,
  filterRecipients,
  formatInstantInTimezone,
  generateUniqueTemplateSlug,
  isSmsDeliverable,
  isValidMetaTemplateName,
  normalizeBodyPlaceholders,
  normalizeVariableName,
  resolveAudienceGuests,
  restaurantNameForLocation,
  slugifyTemplateName,
  wallClockToUtc,
} = await import("../../server/lib/campaigns.js");

function guest(overrides: Record<string, unknown> = {}): GuestProfile {
  return {
    id: `g-${Math.random()}`,
    email: "ada@test.invalid",
    phone: null,
    normalizedPhone: null,
    marketingOptOutAt: null,
    emailMarketingOptOutAt: null,
    whatsappMarketingOptOutAt: null,
    smsMarketingOptOutAt: null,
    emailMarketingOptIn: true,
    whatsappMarketingOptIn: true,
    smsMarketingOptIn: true,
    lastVisitAt: null,
    ...overrides,
  } as unknown as GuestProfile;
}

function audience(overrides: Record<string, unknown> = {}) {
  return {
    businessId: "0123456789abcdef01234567",
    locationId: "76543210fedcba9876543210",
    audienceType: "custom_group",
    audienceConfig: {},
    timezone: "UTC",
    ...overrides,
  } as never;
}

beforeEach(() => {
  guestFindMany.mockReset().mockResolvedValue([]);
  guestFindRaw.mockReset().mockResolvedValue([]);
  savedAudienceFindUnique.mockReset().mockResolvedValue(null);
  templateFindFirst.mockReset().mockResolvedValue(null);
});

describe("variable and slug naming", () => {
  it("converts camel case and punctuation into snake case", () => {
    expect(normalizeVariableName("firstName")).toBe("first_name");
    expect(normalizeVariableName("  Offer Details!  ")).toBe("offer_details");
    expect(normalizeVariableName("")).toBe("");
    expect(normalizeVariableName("!!!")).toBe("");
  });

  it("normalises the placeholders inside a body", () => {
    expect(normalizeBodyPlaceholders("Hi {{ firstName }} at {{business Name}}")).toBe(
      "Hi {{first_name}} at {{business_name}}",
    );
    expect(normalizeBodyPlaceholders("")).toBe("");
    expect(normalizeBodyPlaceholders("Hi {{ !!! }} there")).toBe("Hi  there");
  });

  it("slugifies a template name and falls back when nothing survives", () => {
    expect(slugifyTemplateName("We Miss You!")).toBe("we_miss_you");
    expect(slugifyTemplateName("!!!")).toBe("template");
    expect(slugifyTemplateName("")).toBe("template");
    expect(slugifyTemplateName("x".repeat(200))).toHaveLength(64);
  });

  it("accepts only Meta-safe template names", () => {
    expect(isValidMetaTemplateName("we_miss_you")).toBe(true);
    expect(isValidMetaTemplateName("We Miss You")).toBe(false);
    expect(isValidMetaTemplateName("")).toBe(false);
    expect(isValidMetaTemplateName("a".repeat(513))).toBe(false);
  });

  it("reports the variables a business may edit", () => {
    expect(editableVariables({ variables: ["first_name", "offer"] })).toEqual([
      "offer",
    ]);
    expect(editableVariables({ variables: undefined as never })).toEqual([]);
  });
});

describe("generateUniqueTemplateSlug", () => {
  it("returns the base slug when nothing collides", async () => {
    await expect(generateUniqueTemplateSlug("We Miss You")).resolves.toBe(
      "we_miss_you",
    );
    expect(templateFindFirst.mock.calls[0][0].where.templateType).toBe(
      "SEATPING",
    );
  });

  it("scopes the collision check to a business when one is given", async () => {
    await generateUniqueTemplateSlug("We Miss You", { businessId: "biz-1" });

    expect(templateFindFirst.mock.calls[0][0].where.businessId).toBe("biz-1");
  });

  it("excludes the template being renamed", async () => {
    await generateUniqueTemplateSlug("We Miss You", { ignoreId: "tmpl-1" });

    expect(templateFindFirst.mock.calls[0][0].where.NOT).toEqual({
      id: "tmpl-1",
    });
  });

  it("suffixes the slug until it is free", async () => {
    templateFindFirst
      .mockResolvedValueOnce({ id: "a" })
      .mockResolvedValueOnce({ id: "b" })
      .mockResolvedValue(null);

    const slug = await generateUniqueTemplateSlug("We Miss You");

    expect(slug).toMatch(/^we_miss_you_\d+$/);
  });
});

describe("restaurantNameForLocation", () => {
  it("prefers the profile display name then its name", () => {
    expect(
      restaurantNameForLocation({ restaurantProfile: { displayName: " Warung " } }, "F"),
    ).toBe("Warung");
    expect(
      restaurantNameForLocation({ restaurantProfile: { name: " Kopi " } }, "F"),
    ).toBe("Kopi");
  });

  it("falls back through the location fields to the given fallback", () => {
    expect(restaurantNameForLocation({ displayName: "Downtown" }, "F")).toBe(
      "Downtown",
    );
    expect(restaurantNameForLocation({ name: "Bistro" }, "F")).toBe("Bistro");
    expect(restaurantNameForLocation({}, "Fallback")).toBe("Fallback");
    expect(restaurantNameForLocation(null, "Fallback")).toBe("Fallback");
  });

  it("ignores a profile that is not an object or has blank names", () => {
    expect(restaurantNameForLocation({ restaurantProfile: "x" }, "F")).toBe("F");
    expect(
      restaurantNameForLocation({ restaurantProfile: { displayName: "   " } }, "F"),
    ).toBe("F");
    expect(
      restaurantNameForLocation({ restaurantProfile: { displayName: 7 } }, "F"),
    ).toBe("F");
  });
});

describe("wall clock conversions", () => {
  it("reads a local wall clock in the given timezone", () => {
    expect(wallClockToUtc("2026-08-12T19:00", "UTC")?.toISOString()).toBe(
      "2026-08-12T19:00:00.000Z",
    );
    expect(wallClockToUtc("2026-08-12T19:00", "Asia/Jakarta")?.toISOString()).toBe(
      "2026-08-12T12:00:00.000Z",
    );
  });

  it("reports nothing for a value it cannot read", () => {
    expect(wallClockToUtc(null, "UTC")).toBeNull();
    expect(wallClockToUtc("", "UTC")).toBeNull();
    expect(wallClockToUtc("12/08/2026 19:00", "UTC")).toBeNull();
  });

  it("formats an instant in a timezone", () => {
    expect(
      formatInstantInTimezone(new Date("2026-08-12T19:00:00.000Z"), "UTC"),
    ).toEqual(expect.any(String));
    expect(
      formatInstantInTimezone("2026-08-12T19:00:00.000Z", "UTC"),
    ).toEqual(expect.any(String));
  });

  it("reports nothing for an instant it cannot read", () => {
    expect(formatInstantInTimezone(null, "UTC")).toBeNull();
    expect(formatInstantInTimezone("not a date", "UTC")).toBeNull();
  });

  it("falls back for an unusable timezone", () => {
    expect(
      formatInstantInTimezone(new Date("2026-08-12T19:00:00.000Z"), "Not/AZone"),
    ).toEqual(expect.any(String));
  });
});

describe("advanceRecurrence", () => {
  const from = new Date("2026-08-12T19:00:00.000Z");

  it("advances by a day, a week and a month", () => {
    const daily = advanceRecurrence(from, "DAILY", "UTC");
    const weekly = advanceRecurrence(from, "WEEKLY", "UTC");
    const monthly = advanceRecurrence(from, "MONTHLY", "UTC");

    expect(daily.toISOString().slice(0, 10)).toBe("2026-08-13");
    expect(weekly.toISOString().slice(0, 10)).toBe("2026-08-19");
    expect(monthly.toISOString().slice(0, 10)).toBe("2026-09-12");
  });

  it("rolls a December monthly run into the next year", () => {
    const next = advanceRecurrence(
      new Date("2026-12-12T19:00:00.000Z"),
      "MONTHLY",
      "UTC",
    );

    expect(next.toISOString().slice(0, 7)).toBe("2027-01");
  });

  it("clamps to the last day of a month that is too short", () => {
    expect(
      advanceRecurrence(new Date("2026-01-31T19:00:00.000Z"), "MONTHLY", "UTC")
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-02-28");
    expect(
      advanceRecurrence(new Date("2026-03-31T19:00:00.000Z"), "MONTHLY", "UTC")
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-04-30");
  });

  it("keeps a day that exists in the next month", () => {
    expect(
      advanceRecurrence(new Date("2026-04-30T19:00:00.000Z"), "MONTHLY", "UTC")
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-05-30");
  });

  it("raises for a timezone the runtime rejects", () => {
    expect(() => advanceRecurrence(from, "DAILY", "Not/AZone")).toThrow(
      RangeError,
    );
  });
});

describe("filterRecipients", () => {
  it("excludes a guest who opted out of all marketing", () => {
    const result = filterRecipients(
      [guest({ marketingOptOutAt: new Date() })],
      "EMAIL",
    );

    expect(result.exclusions.optedOut).toBe(1);
    expect(result.eligible).toHaveLength(0);
    expect(result.excludedCount).toBe(1);
  });

  it("excludes a guest who opted out of the specific channel", () => {
    expect(
      filterRecipients([guest({ emailMarketingOptIn: false })], "EMAIL")
        .exclusions.optedOut,
    ).toBe(1);
    expect(
      filterRecipients(
        [guest({ whatsappMarketingOptOutAt: new Date(), normalizedPhone: "6281234567890" })],
        "WHATSAPP",
      ).exclusions.optedOut,
    ).toBe(1);
    expect(
      filterRecipients(
        [guest({ smsMarketingOptIn: false, normalizedPhone: "12125551234" })],
        "SMS",
      ).exclusions.optedOut,
    ).toBe(1);
  });

  it("separates a missing address from an unusable one", () => {
    const result = filterRecipients(
      [guest({ email: null }), guest({ email: "not-an-email" })],
      "EMAIL",
    );

    expect(result.exclusions.noEmail).toBe(1);
    expect(result.exclusions.invalid).toBe(1);
  });

  it("separates a missing phone from an unusable one", () => {
    const result = filterRecipients(
      [guest({ phone: null }), guest({ phone: "123" })],
      "WHATSAPP",
    );

    expect(result.exclusions.noPhone).toBe(1);
    expect(result.exclusions.invalid).toBe(1);
  });

  it("falls back to deriving the phone when none is stored", () => {
    const result = filterRecipients(
      [guest({ phone: "6281234567890", normalizedPhone: null })],
      "WHATSAPP",
    );

    expect(result.eligible[0].phone).toBe("6281234567890");
  });

  it("only allows deliverable numbers on sms", () => {
    expect(isSmsDeliverable("12125551234")).toBe(true);
    expect(isSmsDeliverable("6281234567890")).toBe(false);

    const result = filterRecipients(
      [
        guest({ normalizedPhone: "12125551234" }),
        guest({ normalizedPhone: "6281234567890" }),
      ],
      "SMS",
    );

    expect(result.eligible).toHaveLength(1);
    expect(result.exclusions.invalid).toBe(1);
  });
});

describe("buildMessage variants", () => {
  function template(overrides: Record<string, unknown> = {}) {
    return {
      name: "Promo",
      body: "Hi {{first_name}}, visit {{business_name}} soon.",
      offerDetails: null,
      ctaText: null,
      ctaUrl: null,
      whatsappProviderTemplateName: null,
      whatsappLanguage: null,
      variables: [],
      ...overrides,
    } as never;
  }

  const ctx = {
    businessName: "Bistro",
    locationName: "Downtown",
    firstName: null,
    guestName: null,
  } as never;

  it("falls back to a friendly greeting when there is no name", () => {
    const msg = buildMessage(template(), {}, ctx, "EMAIL" as never);

    expect(msg.text).toContain("there");
  });

  it("falls back to a generic template name", () => {
    const msg = buildMessage(
      template({ name: "" }),
      {},
      ctx,
      "EMAIL" as never,
    );

    expect(msg.subject).toContain("A message");
  });

  it("defaults the WhatsApp language", () => {
    const msg = buildMessage(
      template({ whatsappProviderTemplateName: "promo" }),
      {},
      ctx,
      "WHATSAPP" as never,
    );

    expect(msg.whatsappLanguage).toBe("en");
    expect(msg.whatsappTemplateName).toBe("promo");
  });

  it("reports no template name when the template has none", () => {
    const msg = buildMessage(template(), {}, ctx, "WHATSAPP" as never);

    expect(msg.whatsappTemplateName).toBeNull();
  });

  it("fills a positional template up to its highest index", () => {
    const msg = buildMessage(
      template({ body: "Hi {{1}}, see {{3}} soon." }),
      { "1": "Ada" },
      ctx,
      "WHATSAPP" as never,
    );

    expect(msg.whatsappParams).toEqual([
      { text: "Ada" },
      { text: "" },
      { text: "" },
    ]);
  });

  it("carries the offer into the WhatsApp values", () => {
    const msg = buildMessage(
      template({
        body: "Hi {{first_name}}, enjoy {{offer}} today.",
        offerDetails: "20% off",
      }),
      {},
      ctx,
      "WHATSAPP" as never,
    );

    expect(msg.whatsappValues?.offer).toBe("20% off");
  });

  it("includes the call to action in the plain text only when complete", () => {
    const complete = buildMessage(
      template({ ctaText: "Book now", ctaUrl: "https://test.invalid/book" }),
      {},
      ctx,
      "SMS" as never,
    );
    const partial = buildMessage(
      template({ ctaText: "Book now" }),
      {},
      ctx,
      "SMS" as never,
    );

    expect(complete.text).toContain("Book now: https://test.invalid/book");
    expect(partial.text).not.toContain("Book now:");
  });
});

describe("resolveAudienceGuests", () => {
  it("returns nothing for an unknown audience type", async () => {
    await expect(
      resolveAudienceGuests(audience({ audienceType: "nonsense" })),
    ).resolves.toEqual([]);
    expect(guestFindMany).not.toHaveBeenCalled();
  });

  it("maps each simple audience onto its filter", async () => {
    const cases: Array<[string, string]> = [
      ["all_guests", ""],
      ["returning", "totalVisits"],
      ["new", "totalVisits"],
      ["visited_yesterday", "lastVisitAt"],
      ["not_returned_15d", "lastVisitAt"],
      ["not_returned_30d", "lastVisitAt"],
      ["not_returned_60d", "lastVisitAt"],
      ["upcoming_reservations", "upcomingReservationCount"],
      ["no_show_history", "noShowCount"],
    ];

    for (const [audienceType, key] of cases) {
      guestFindMany.mockClear();
      await resolveAudienceGuests(audience({ audienceType }));
      const where = guestFindMany.mock.calls[0][0].where;
      if (key) {
        expect(where[key]).toBeDefined();
      }
    }
  });

  it("returns nothing for a tag audience with no tag", async () => {
    await expect(
      resolveAudienceGuests(
        audience({ audienceType: "with_tag", audienceConfig: { tag: "  " } }),
      ),
    ).resolves.toEqual([]);
  });

  it("returns nothing when no guest carries the tag", async () => {
    await expect(
      resolveAudienceGuests(
        audience({ audienceType: "with_tag", audienceConfig: { tag: "VIP" } }),
      ),
    ).resolves.toEqual([]);
  });

  it("scopes a tag audience to the matching ids", async () => {
    guestFindRaw.mockResolvedValue([{ _id: { $oid: "guest-9" } }]);

    await resolveAudienceGuests(
      audience({ audienceType: "with_tag", audienceConfig: { tag: "V.I.P" } }),
    );

    expect(guestFindMany.mock.calls[0][0].where.id).toEqual({
      in: ["guest-9"],
    });
  });

  it("returns nothing for a manual audience with no ids", async () => {
    await expect(
      resolveAudienceGuests(
        audience({ audienceType: "manual", audienceConfig: { guestIds: [] } }),
      ),
    ).resolves.toEqual([]);
    await expect(
      resolveAudienceGuests(audience({ audienceType: "manual" })),
    ).resolves.toEqual([]);
  });

  it("looks a manual audience up by id", async () => {
    await resolveAudienceGuests(
      audience({
        audienceType: "manual",
        audienceConfig: { guestIds: ["g1", "g2"] },
      }),
    );

    expect(guestFindMany.mock.calls[0][0].where.id).toEqual({
      in: ["g1", "g2"],
    });
  });

  it("reads the filters from a saved audience", async () => {
    savedAudienceFindUnique.mockResolvedValue({
      filters: { totalVisitsMin: 3 },
    });

    await resolveAudienceGuests(
      audience({ audienceConfig: { savedAudienceId: "aud-1" } }),
    );

    expect(guestFindMany.mock.calls[0][0].where.totalVisits.gte).toBe(3);
  });

  it("falls back to the inline filters when the saved audience is gone", async () => {
    await resolveAudienceGuests(
      audience({
        audienceConfig: {
          savedAudienceId: "aud-missing",
          filters: { totalVisitsMax: 5 },
        },
      }),
    );

    expect(guestFindMany.mock.calls[0][0].where.totalVisits.lte).toBe(5);
  });

  it("applies every custom filter it understands", async () => {
    await resolveAudienceGuests(
      audience({
        audienceConfig: {
          filters: {
            lastVisitMinDaysAgo: 10,
            lastVisitMaxDaysAgo: 60,
            hasUpcomingReservation: true,
            hasNoShowHistory: true,
            hasNotes: true,
          },
        },
      }),
    );

    const where = guestFindMany.mock.calls[0][0].where;
    expect(where.lastVisitAt.lte).toBeInstanceOf(Date);
    expect(where.lastVisitAt.gte).toBeInstanceOf(Date);
    expect(where.upcomingReservationCount).toEqual({ gt: 0 });
    expect(where.noShowCount).toEqual({ gt: 0 });
    expect(where.notes).toBeDefined();
  });

  it("returns nothing when a tag filter matches no one", async () => {
    await expect(
      resolveAudienceGuests(
        audience({ audienceConfig: { filters: { tags: ["VIP"] } } }),
      ),
    ).resolves.toEqual([]);
    expect(guestFindMany).not.toHaveBeenCalled();
  });

  it("merges the tag matches with the manually chosen guests", async () => {
    guestFindRaw.mockResolvedValue([{ _id: { $oid: "g-tagged" } }]);
    const tagged = guest({ id: "g-tagged", lastVisitAt: new Date("2026-08-01") });
    const manual = guest({ id: "g-manual", lastVisitAt: new Date("2026-08-10") });
    guestFindMany
      .mockResolvedValueOnce([tagged])
      .mockResolvedValueOnce([manual]);

    const out = await resolveAudienceGuests(
      audience({
        audienceConfig: { filters: { tags: ["VIP"], guestIds: ["g-manual"] } },
      }),
    );

    expect(out.map((g) => g.id)).toEqual(["g-manual", "g-tagged"]);
  });

  it("deduplicates a guest that both queries return", async () => {
    const shared = guest({ id: "g-1" });
    guestFindMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared]);

    const out = await resolveAudienceGuests(
      audience({ audienceConfig: { filters: { guestIds: ["g-1"] } } }),
    );

    expect(out).toHaveLength(1);
  });
});
