import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { adminCookie } from "../helpers/auth.js";
import { seedBusiness, seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

const MALFORMED_ID = "nope";
const MISSING_ID = "0123456789abcdef01234567";

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("admin customer editing guards", () => {
  it("refuses an email that already belongs to another business", async () => {
    const { business } = await seedBusinessWithLocation();
    const other = await seedBusiness();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", adminCookie())
      .send({ email: other.email });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email is already in use by another account");
  });

  it("skips the duplicate check when the username patch matches the current username", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", adminCookie())
      .send({ username: business.username, name: "Renamed Business" });

    expect(res.status).toBe(200);
    expect(res.body.customer.username).toBe(business.username);
    expect(res.body.customer.name).toBe("Renamed Business");
  });

  it("leaves a location untouched when its patch entry is null", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", adminCookie())
      .send({ locations: [null] });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.address).toBe(location.address);
    expect(stored?.credits).toBe(location.credits);
  });

  it("rejects a request that carries no body at all", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No editable fields provided");
  });
});

describe("admin featured restaurant guards", () => {
  it("returns not found for a malformed business id when listing locations", async () => {
    const res = await (
      await api()
    )
      .get(`/admin/businesses/${MALFORMED_ID}/locations`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Business not found");
  });

  it("requires a valid businessId when the create body is missing entirely", async () => {
    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A valid businessId is required");
  });

  it("requires a valid locationId alongside the business", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId: business.id, locationId: MALFORMED_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A valid locationId is required");
  });

  it("returns not found when patching a malformed featured id", async () => {
    const res = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${MALFORMED_ID}`)
      .set("Cookie", adminCookie())
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Featured restaurant not found");
  });

  it("rejects a patch that carries no editable fields", async () => {
    const res = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${MISSING_ID}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No editable fields provided");
  });

  it("returns not found when deleting a malformed featured id", async () => {
    const res = await (
      await api()
    )
      .delete(`/admin/featured-restaurants/${MALFORMED_ID}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Featured restaurant not found");
  });

  it("serializes a featured location that has no display name or name", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await db.location.update({
      where: { id: location.id },
      data: { displayName: null, name: null },
    });
    await db.featuredRestaurant.create({
      data: { businessId: business.id, locationId: location.id },
    });

    const res = await (await api()).get("/admin/featured-restaurants").set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.featured).toHaveLength(1);
    expect(res.body.featured[0].location.displayName).toBeNull();
    expect(res.body.featured[0].location.name).toBeNull();
  });
});

describe("admin campaign template guards", () => {
  async function seedManagedTemplate() {
    const suffix = uniqueSuffix();
    return db.campaignTemplate.create({
      data: {
        templateType: "SEATPING",
        name: `Managed ${suffix}`,
        slug: `managed-${suffix}`,
        body: "Hi {{first_name}}, a note.",
        approvalStatus: "APPROVED",
      },
    });
  }

  it("returns not found for a malformed template id on every review action", async () => {
    const request = await api();
    const cookie = adminCookie();

    const responses = [
      await request.get(`/admin/campaign-templates/${MALFORMED_ID}`).set("Cookie", cookie),
      await request
        .patch(`/admin/campaign-templates/${MALFORMED_ID}/review`)
        .set("Cookie", cookie)
        .send({ internalReviewNotes: "looks fine" }),
      await request
        .post(`/admin/campaign-templates/${MALFORMED_ID}/approve`)
        .set("Cookie", cookie)
        .send({}),
      await request
        .post(`/admin/campaign-templates/${MALFORMED_ID}/reject`)
        .set("Cookie", cookie)
        .send({ rejectionReason: "not suitable" }),
    ];

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Template not found");
    }
  });

  it("requires a rejection reason before looking the template up", async () => {
    const res = await (
      await api()
    )
      .post(`/admin/campaign-templates/${MISSING_ID}/reject`)
      .set("Cookie", adminCookie())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A rejection reason is required");
  });

  it("reads a managed template that has no owning business", async () => {
    const template = await seedManagedTemplate();

    const res = await (
      await api()
    )
      .get(`/admin/campaign-templates/${template.id}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.template.businessId).toBeNull();
    expect(res.body.location).toBeNull();
  });
});
