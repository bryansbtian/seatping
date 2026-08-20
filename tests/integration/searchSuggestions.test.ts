import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusiness, seedLocation, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

let ipCounter = 0;

function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

async function suggest(query: string, limit?: number) {
  let path = `/api/locations/search-suggestions?query=${encodeURIComponent(query)}`;
  if (limit !== undefined) {
    path = `${path}&limit=${limit}`;
  }
  return (await api()).get(path).set("X-Forwarded-For", freshIp());
}

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("search suggestions basics", () => {
  it("returns nothing for an empty query", async () => {
    const res = await suggest("");

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("returns nothing when no published location matches", async () => {
    const business = await seedBusiness({ name: "Nasi Padang House" });
    await seedLocation(business.id, business.username, { isPublished: true });

    const res = await suggest("zzzzzzzz");

    expect(res.body.suggestions).toEqual([]);
  });

  it("ignores unpublished locations", async () => {
    const business = await seedBusiness({ name: "Hidden Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: false,
      name: "Hidden Bistro Downtown",
    });

    const res = await suggest("hidden");

    expect(res.body.suggestions).toEqual([]);
  });

  it("ignores a location whose restaurant profile is unpublished", async () => {
    const business = await seedBusiness({ name: "Draft Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      name: "Draft Bistro Downtown",
      restaurantProfile: { isPublished: false } as never,
    });

    const res = await suggest("draft");

    expect(res.body.suggestions).toEqual([]);
  });
});

describe("search suggestion payload", () => {
  it("describes a matching restaurant with its profile fields", async () => {
    const suffix = uniqueSuffix();
    const business = await seedBusiness({
      name: `Warung ${suffix}`,
      username: `warung-${suffix}`,
    });
    const location = await seedLocation(business.id, business.username, {
      isPublished: true,
      name: "Original Name",
      displayName: "Kemang Branch",
      area: "Kemang",
      city: "Jakarta",
      bannerImageUrl: "https://test.invalid/banner.jpg",
      restaurantProfile: {
        displayName: "Warung Nusantara",
        shortAddress: "Kemang Raya 1",
        cuisineTypes: ["Indonesian", "Padang"],
        details: {},
        isPublished: true,
      } as never,
    });

    const res = await suggest("warung nusantara");

    expect(res.body.suggestions).toHaveLength(1);
    const hit = res.body.suggestions[0];
    expect(hit.locationId).toBe(location.id);
    expect(hit.businessId).toBe(business.id);
    expect(hit.businessUsername).toBe(business.username);
    expect(hit.name).toBe("Warung Nusantara");
    expect(hit.shortAddress).toBe("Kemang Raya 1");
    expect(hit.cuisine).toBe("Indonesian");
    expect(hit.area).toBe("Kemang");
    expect(hit.city).toBe("Jakarta");
    expect(hit.imageUrl).toBe("https://test.invalid/banner.jpg");
    expect(hit.url).toBe(`/restaurants/${business.username}/${location.id}`);
  });

  it("falls back to the first gallery photo when there is no banner", async () => {
    const business = await seedBusiness({ name: "Photo Bistro" });
    const location = await seedLocation(business.id, business.username, {
      isPublished: true,
      name: "Photo Bistro Downtown",
      bannerImageUrl: null,
    });
    await db.photo.create({
      data: {
        locationId: location.id,
        url: "https://test.invalid/gallery.jpg",
        publicId: `seatping/locations/${location.id}/photo/one`,
      },
    });

    const res = await suggest("photo bistro");

    expect(res.body.suggestions[0].imageUrl).toBe("https://test.invalid/gallery.jpg");
  });

  it("falls back to the location fields when there is no profile", async () => {
    const business = await seedBusiness({ name: "Plain Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      name: "Plain Bistro Kitchen",
      displayName: null,
      area: null,
      city: null,
    });

    const res = await suggest("plain bistro kitchen");

    const hit = res.body.suggestions[0];
    expect(hit.name).toBe("Plain Bistro");
    expect(hit.cuisine).toBeNull();
    expect(hit.area).toBeNull();
    expect(hit.city).toBeNull();
  });
});

describe("search suggestion matching", () => {
  it("matches on the area or city", async () => {
    const business = await seedBusiness({ name: "Area Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      area: "Senopati",
      city: "Jakarta",
    });

    const res = await suggest("senopati");

    expect(res.body.suggestions).toHaveLength(1);
  });

  it("matches on a cuisine type", async () => {
    const business = await seedBusiness({ name: "Cuisine Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      restaurantProfile: {
        cuisineTypes: ["Japanese"],
        details: {},
        isPublished: true,
      } as never,
    });

    const res = await suggest("japanese");

    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].cuisine).toBe("Japanese");
  });

  it("matches on the street address", async () => {
    const suffix = uniqueSuffix();
    const business = await seedBusiness({ name: "Address Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      address: `${suffix} Jalan Sudirman`,
    });

    const res = await suggest("sudirman");

    expect(res.body.suggestions).toHaveLength(1);
  });

  it("matches on the tagline, description or username", async () => {
    const suffix = uniqueSuffix();
    const business = await seedBusiness({
      name: "Text Bistro",
      username: `coffeehaus-${suffix}`,
    });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      restaurantProfile: {
        tagline: "Slow roasted every morning",
        description: "A neighbourhood espresso bar",
        details: {},
        isPublished: true,
      } as never,
    });

    const tagline = await suggest("roasted");
    const description = await suggest("espresso");
    const username = await suggest("coffeehaus");

    expect(tagline.body.suggestions).toHaveLength(1);
    expect(description.body.suggestions).toHaveLength(1);
    expect(username.body.suggestions).toHaveLength(1);
  });

  it("matches on the profile address details", async () => {
    const business = await seedBusiness({ name: "Detail Bistro" });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      address: "1 Somewhere",
      area: null,
      city: null,
      restaurantProfile: {
        details: { area: "Menteng", city: "Jakarta Pusat" },
        isPublished: true,
      } as never,
    });

    const res = await suggest("menteng");

    expect(res.body.suggestions).toHaveLength(1);
  });
});

describe("search suggestion ranking", () => {
  it("ranks an exact restaurant name above a mere address match", async () => {
    const nameMatch = await seedBusiness({ name: "Sate Khas" });
    const nameLocation = await seedLocation(nameMatch.id, nameMatch.username, {
      isPublished: true,
      address: "1 Elsewhere Road",
    });
    const addressMatch = await seedBusiness({ name: "Other Place" });
    await seedLocation(addressMatch.id, addressMatch.username, {
      isPublished: true,
      address: "12 Sate Khas Street",
    });

    const res = await suggest("sate khas");

    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.suggestions[0].locationId).toBe(nameLocation.id);
  });

  it("caps the results at three even when more match", async () => {
    for (let i = 0; i < 5; i++) {
      const business = await seedBusiness({ name: `Kopi House ${i}` });
      await seedLocation(business.id, business.username, {
        isPublished: true,
      });
    }

    const res = await suggest("kopi", 10);

    expect(res.body.suggestions).toHaveLength(3);
  });

  it("honours a smaller requested limit", async () => {
    for (let i = 0; i < 3; i++) {
      const business = await seedBusiness({ name: `Teh Botol ${i}` });
      await seedLocation(business.id, business.username, {
        isPublished: true,
      });
    }

    const res = await suggest("teh botol", 1);

    expect(res.body.suggestions).toHaveLength(1);
  });

  it("treats a non-numeric limit as the default", async () => {
    for (let i = 0; i < 5; i++) {
      const business = await seedBusiness({ name: `Bakmi Pontianak ${i}` });
      await seedLocation(business.id, business.username, {
        isPublished: true,
      });
    }

    const res = await (
      await api()
    )
      .get("/api/locations/search-suggestions?query=bakmi&limit=abc")
      .set("X-Forwarded-For", freshIp());

    expect(res.body.suggestions).toHaveLength(3);
  });

  it("breaks a score tie alphabetically", async () => {
    const later = await seedBusiness({ name: "Zeta Kitchen" });
    await seedLocation(later.id, later.username, { isPublished: true });
    const earlier = await seedBusiness({ name: "Alpha Kitchen" });
    await seedLocation(earlier.id, earlier.username, { isPublished: true });

    const res = await suggest("kitchen");

    expect(res.body.suggestions.map((s: any) => s.businessName)).toEqual([
      "Alpha Kitchen",
      "Zeta Kitchen",
    ]);
  });
});
