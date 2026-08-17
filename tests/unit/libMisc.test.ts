import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCloudinaryConfigured,
  locationFolder,
  publicIdInLocationFolder,
} from "../../server/lib/cloudinary.js";
import { logEnvStatus } from "../../server/lib/envCheck.js";
import { parsePlace } from "../../src/lib/googleMaps.js";
import {
  SEATPING_TEMPLATE_SEEDS,
  buildMessage,
  editableVariables,
  extractBodyPlaceholders,
  isValidAudienceType,
  renderString,
  slugifyTemplateName,
  smsSegments,
} from "../../server/lib/campaigns.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("cloudinary configuration guard", () => {
  it("throws when the credentials are absent", () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    expect(() => assertCloudinaryConfigured()).toThrow();
  });

  it("scopes uploads to a per-location folder", () => {
    const folder = locationFolder("biz-1", "loc-1");

    expect(folder).toContain("loc-1");
    expect(typeof folder).toBe("string");
  });

  it("recognises a public id inside a location folder", () => {
    const folder = locationFolder("biz-1", "loc-1");

    expect(publicIdInLocationFolder(`${folder}/photo123`, "biz-1", "loc-1")).toBe(
      true,
    );
    expect(publicIdInLocationFolder("someone/else/photo", "biz-1", "loc-1")).toBe(
      false,
    );
  });

  it("names the error after every missing credential", () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;

    expect(() => assertCloudinaryConfigured()).toThrow(/CLOUDINARY_CLOUD_NAME/);
  });
});

describe("environment status reporting", () => {
  it("stays silent outside production", () => {
    process.env.NODE_ENV = "test";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logEnvStatus();

    expect(error).not.toHaveBeenCalled();
  });
});

describe("google maps place parsing", () => {
  it("extracts the structured address components", () => {
    const place = {
      name: "Test Bistro",
      formatted_address: "1 Test Street, Testville, Testland",
      place_id: "place-123",
      geometry: { location: { lat: () => 1.5, lng: () => 2.5 } },
      address_components: [
        { long_name: "Testville", types: ["locality"] },
        { long_name: "Testland", types: ["country"] },
      ],
    };

    const parsed = parsePlace(place);

    expect(parsed.address).toBe("1 Test Street, Testville, Testland");
    expect(parsed.googlePlaceId).toBe("place-123");
    expect(parsed.latitude).toBe(1.5);
    expect(parsed.longitude).toBe(2.5);
    expect(parsed.city).toBe("Testville");
    expect(parsed.country).toBe("Testland");
  });

  it("tolerates a place with no geometry or components", () => {
    const parsed = parsePlace({ formatted_address: "Bare Street" });

    expect(parsed.address).toBe("Bare Street");
    expect(parsed.latitude ?? null).toBeNull();
    expect(parsed.city).toBeUndefined();
  });

  it("tolerates a null place", () => {
    expect(() => parsePlace(null)).not.toThrow();
  });
});

describe("campaign message rendering", () => {
  it("substitutes known variables", () => {
    expect(
      renderString("Hi {{first_name}} from {{business_name}}", {
        first_name: "Ada",
        business_name: "Bistro",
      }),
    ).toBe("Hi Ada from Bistro");
  });

  it("replaces an unknown variable with an empty string", () => {
    expect(renderString("Hi {{missing}}!", {})).toBe("Hi !");
  });

  it("returns an empty string for an empty template", () => {
    expect(renderString("", { a: "b" })).toBe("");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderString("Hi {{  first_name  }}", { first_name: "Ada" })).toBe(
      "Hi Ada",
    );
  });

  it("extracts placeholders from a body", () => {
    const found = extractBodyPlaceholders("Hi {{first_name}}, from {{business_name}}");

    expect(found).toContain("first_name");
    expect(found).toContain("business_name");
  });

  it("returns no placeholders for plain text", () => {
    expect(extractBodyPlaceholders("No variables here")).toEqual([]);
  });

  it("slugifies a template name", () => {
    expect(slugifyTemplateName("We Miss You!")).toBe("we_miss_you");
    expect(slugifyTemplateName("  Spaced   Out  ")).toBe("spaced_out");
  });

  it("treats the built-in audience keys as valid", () => {
    expect(isValidAudienceType("all_guests")).toBe(true);
    expect(isValidAudienceType("with_tag")).toBe(true);
    expect(isValidAudienceType("manual")).toBe(true);
    expect(isValidAudienceType("custom_group")).toBe(true);
    expect(isValidAudienceType("not_a_real_audience")).toBe(false);
  });

  it("ships well formed template seeds", () => {
    expect(SEATPING_TEMPLATE_SEEDS.length).toBeGreaterThan(0);
    for (const seed of SEATPING_TEMPLATE_SEEDS) {
      expect(seed.name).toEqual(expect.any(String));
      expect(seed.body).toEqual(expect.any(String));
      expect(seed.variables.length).toBeGreaterThan(0);
      expect(slugifyTemplateName(seed.name)).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("reports only the variables a business may edit", () => {
    const template = {
      body: "Hi {{first_name}}, here is {{offer}} from {{business_name}}",
      variables: ["first_name", "offer", "business_name"],
    };

    const editable = editableVariables(template as never);

    expect(editable).toContain("offer");
    expect(editable).not.toContain("first_name");
    expect(editable).not.toContain("business_name");
  });
});

describe("sms segmentation", () => {
  it("counts a short GSM-7 message as one segment", () => {
    const seg = smsSegments("Hello there");

    expect(seg.segments).toBe(1);
    expect(seg.encoding).toBe("GSM-7");
    expect(seg.characters).toBe("Hello there".length);
  });

  it("switches to UCS-2 when the text needs it", () => {
    const seg = smsSegments("Hello 😀");

    expect(seg.encoding).toBe("UCS-2");
    expect(seg.segments).toBeGreaterThanOrEqual(1);
  });

  it("splits a long GSM-7 message into multiple segments", () => {
    const seg = smsSegments("a".repeat(200));

    expect(seg.segments).toBeGreaterThan(1);
    expect(seg.characters).toBe(200);
  });

  it("counts extended GSM characters as two", () => {
    const plain = smsSegments("a");
    const extended = smsSegments("€");

    expect(extended.characters).toBeGreaterThan(plain.characters);
  });

  it("always reports at least one segment", () => {
    expect(smsSegments("").segments).toBeGreaterThanOrEqual(1);
  });
});

describe("buildMessage", () => {
  const ctx = {
    businessName: "Test Bistro",
    locationName: "Downtown",
    firstName: "Ada",
    guestName: "Ada Lovelace",
  };

  function template(overrides: Record<string, unknown> = {}) {
    return {
      name: "Promo",
      body: "Hi {{first_name}}, visit {{business_name}}.",
      offerDetails: null,
      ctaText: null,
      ctaUrl: null,
      whatsappProviderTemplateName: null,
      whatsappLanguage: "en",
      ...overrides,
    };
  }

  it("builds an email with a subject and html body", () => {
    const msg = buildMessage(template() as never, {}, ctx as never, "EMAIL" as never);

    expect(msg.subject).toEqual(expect.any(String));
    expect(msg.html).toContain("Ada");
    expect(msg.text).toContain("Ada");
  });

  it("builds an SMS with plain text only", () => {
    const msg = buildMessage(template() as never, {}, ctx as never, "SMS" as never);

    expect(msg.text).toContain("Ada");
    expect(msg.html).toBeUndefined();
  });

  it("includes the offer and call to action when present", () => {
    const msg = buildMessage(
      template({
        offerDetails: "20% off",
        ctaText: "Book now",
        ctaUrl: "https://test.invalid/book",
      }) as never,
      {},
      ctx as never,
      "EMAIL" as never,
    );

    expect(msg.text).toContain("20% off");
    expect(msg.text).toContain("https://test.invalid/book");
  });

  it("omits the call to action when the url is missing", () => {
    const msg = buildMessage(
      template({ ctaText: "Book now", ctaUrl: null }) as never,
      {},
      ctx as never,
      "EMAIL" as never,
    );

    expect(msg.text).not.toContain("Book now:");
  });
});
