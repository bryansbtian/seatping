import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function folder(locationId: string, kind: "banner" | "photo"): string {
  return `seatping/locations/${locationId}/${kind}`;
}

function asset(locationId: string, kind: "banner" | "photo") {
  const publicId = `${folder(locationId, kind)}/${uniqueSuffix()}`;
  return { url: `https://test.invalid/${publicId}.jpg`, publicId };
}

describe("banner media", () => {
  it("rejects an anonymous signature request", async () => {
    const { location } = await seedBusinessWithLocation();

    const res = await (await api()).post(`/api/locations/${location.id}/banner/sign`);

    expect(res.status).toBe(401);
  });

  it("refuses a signature for another business's location", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(`/api/locations/${tenantA.location.id}/banner/sign`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("commits a banner that was uploaded into the signed folder", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const banner = asset(location.id, "banner");

    const res = await (
      await api()
    )
      .post(`/api/locations/${location.id}/banner/commit`)
      .set("Cookie", businessCookie(business.id))
      .send(banner);

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.bannerImageUrl).toBe(banner.url);
    expect(stored?.bannerImagePublicId).toBe(banner.publicId);
  });

  it("rejects a commit with missing image data", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(`/api/locations/${location.id}/banner/commit`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(400);
  });

  it("rejects a commit pointing outside the location's folder", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(`/api/locations/${location.id}/banner/commit`)
      .set("Cookie", businessCookie(business.id))
      .send({
        url: "https://test.invalid/evil.jpg",
        publicId: "seatping/locations/someone-else/banner/evil",
      });

    expect(res.status).toBe(400);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.bannerImageUrl).toBeNull();
  });

  it("deletes the banner", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const banner = asset(location.id, "banner");
    const cookie = businessCookie(business.id);

    await (
      await api()
    )
      .post(`/api/locations/${location.id}/banner/commit`)
      .set("Cookie", cookie)
      .send(banner);

    const res = await (
      await api()
    )
      .delete(`/api/locations/${location.id}/banner`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.bannerImageUrl).toBeNull();
  });
});

describe("photo media", () => {
  async function commitPhoto(
    businessId: string,
    locationId: string,
  ): Promise<{ status: number; body: Record<string, never> }> {
    const photo = asset(locationId, "photo");
    const res = await (
      await api()
    )
      .post(`/api/locations/${locationId}/photos/commit`)
      .set("Cookie", businessCookie(businessId))
      .send(photo);
    return res as never;
  }

  it("commits a photo into the location gallery", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await commitPhoto(business.id, location.id);

    expect(res.status).toBe(200);
    expect(await db.photo.count({ where: { locationId: location.id } })).toBe(1);
  });

  it("rejects a photo outside the location's folder", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(`/api/locations/${location.id}/photos/commit`)
      .set("Cookie", businessCookie(business.id))
      .send({
        url: "https://test.invalid/x.jpg",
        publicId: "seatping/locations/other/photo/x",
      });

    expect(res.status).toBe(400);
    expect(await db.photo.count({ where: { locationId: location.id } })).toBe(0);
  });

  it("enforces the per-location photo maximum", async () => {
    const { business, location } = await seedBusinessWithLocation();

    for (let i = 0; i < 10; i++) {
      const res = await commitPhoto(business.id, location.id);
      expect(res.status).toBe(200);
    }

    const overflow = await commitPhoto(business.id, location.id);

    expect(overflow.status).toBe(400);
    expect(await db.photo.count({ where: { locationId: location.id } })).toBe(10);
  });

  it("updates the alt text on a photo", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    await commitPhoto(business.id, location.id);
    const photo = await db.photo.findFirst({ where: { locationId: location.id } });

    const res = await (
      await api()
    )
      .patch(`/api/locations/${location.id}/photos/${photo!.id}`)
      .set("Cookie", cookie)
      .send({ altText: "Dining room at sunset" });

    expect(res.status).toBe(200);
    const stored = await db.photo.findUnique({ where: { id: photo!.id } });
    expect(stored?.altText).toBe("Dining room at sunset");
  });

  it("deletes a photo", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    await commitPhoto(business.id, location.id);
    const photo = await db.photo.findFirst({ where: { locationId: location.id } });

    const res = await (
      await api()
    )
      .delete(`/api/locations/${location.id}/photos/${photo!.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(await db.photo.findUnique({ where: { id: photo!.id } })).toBeNull();
  });

  it("returns a client error for an unknown photo", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .delete(`/api/locations/${location.id}/photos/000000000000000000000000`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("does not let another business delete a photo", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    await commitPhoto(tenantA.business.id, tenantA.location.id);
    const photo = await db.photo.findFirst({
      where: { locationId: tenantA.location.id },
    });

    const res = await (
      await api()
    )
      .delete(`/api/locations/${tenantA.location.id}/photos/${photo!.id}`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.photo.findUnique({ where: { id: photo!.id } })).not.toBeNull();
  });
});
