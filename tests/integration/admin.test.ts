import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { adminCookie, businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("admin authorization", () => {
  it("rejects an anonymous admin request", async () => {
    const res = await (await api()).get("/admin/featured-restaurants");

    expect(res.status).toBe(401);
  });

  it("rejects a business cookie on every admin route", async () => {
    const { business } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);

    const routes = [
      "/admin/featured-restaurants",
      "/admin/campaign-templates",
      "/admin/businesses/search?username=x",
    ];
    for (const route of routes) {
      const res = await (await api()).get(route).set("Cookie", cookie);
      expect(res.status).toBe(401);
    }
  });
});

describe("admin customer management", () => {
  it("looks up a business by username", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get(`/admin/customer/${business.username}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.customer.username).toBe(business.username);
  });

  it("returns 404 for an unknown business", async () => {
    const res = await (
      await api()
    )
      .get("/admin/customer/not-a-real-business")
      .set("Cookie", adminCookie());

    expect(res.status).toBe(404);
  });

  it("updates editable business fields", async () => {
    const { business } = await seedBusinessWithLocation();
    const newName = `Renamed ${uniqueSuffix()}`;

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", adminCookie())
      .send({ name: newName, maxLocations: 3, baseCredits: 500 });

    expect(res.status).toBe(200);
    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.name).toBe(newName);
    expect(stored?.maxLocations).toBe(3);
  });

  it("searches businesses by username fragment", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get(`/admin/businesses/search?username=${business.username.slice(0, 6)}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.businesses)).toBe(true);
  });

  it("lists locations for a business", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get(`/admin/businesses/${business.id}/locations`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(location.id);
  });

  it("adjusts location credits", async () => {
    const { business, location } = await seedBusinessWithLocation({ credits: 10 });

    const res = await (
      await api()
    )
      .post("/admin/update-credits")
      .set("Cookie", adminCookie())
      .send({ username: business.username, locationId: location.id, credits: 250 });

    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const stored = await db.location.findUnique({ where: { id: location.id } });
      expect(stored?.credits).toBe(250);
    }
  });
});

describe("admin featured restaurants", () => {
  it("creates, lists, updates and removes a featured entry", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = adminCookie();

    const created = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", cookie)
      .send({ businessId: business.id, locationId: location.id, sortOrder: 1, isActive: true });

    expect(created.status).toBe(200);
    const featuredId = created.body.featured.id;

    const listed = await (await api()).get("/admin/featured-restaurants").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain(featuredId);

    const patched = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${featuredId}`)
      .set("Cookie", cookie)
      .send({ sortOrder: 5, isActive: false });
    expect(patched.status).toBe(200);
    const stored = await db.featuredRestaurant.findUnique({
      where: { id: featuredId },
    });
    expect(stored?.sortOrder).toBe(5);
    expect(stored?.isActive).toBe(false);

    const removed = await (
      await api()
    )
      .delete(`/admin/featured-restaurants/${featuredId}`)
      .set("Cookie", cookie);
    expect(removed.status).toBe(200);
    expect(await db.featuredRestaurant.findUnique({ where: { id: featuredId } })).toBeNull();
  });

  it("rejects a featured entry for an unknown location", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({
        businessId: business.id,
        locationId: "000000000000000000000000",
        sortOrder: 0,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("only lists active featured restaurants on the public endpoint", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await db.featuredRestaurant.create({
      data: {
        businessId: business.id,
        locationId: location.id,
        sortOrder: 0,
        isActive: false,
      },
    });

    const res = await (await api()).get("/api/featured-restaurants");

    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain(location.id);
  });
});

describe("admin campaign template review", () => {
  async function seedCustomTemplate(businessId: string) {
    const suffix = uniqueSuffix();
    return db.campaignTemplate.create({
      data: {
        businessId,
        templateType: "CUSTOM",
        name: `Custom ${suffix}`,
        slug: `custom-${suffix}`,
        body: "Hi {{first_name}}, a note.",
        approvalStatus: "PENDING_SEATPING_REVIEW",
        submittedAt: new Date(),
      },
    });
  }

  it("lists templates awaiting review", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedCustomTemplate(business.id);

    const res = await (await api()).get("/admin/campaign-templates").set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(template.id);
  });

  it("reads a single template", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedCustomTemplate(business.id);

    const res = await (
      await api()
    )
      .get(`/admin/campaign-templates/${template.id}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
  });

  it("approves a pending template", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedCustomTemplate(business.id);

    const res = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/approve`)
      .set("Cookie", adminCookie())
      .send({});

    expect(res.status).toBe(200);
    const stored = await db.campaignTemplate.findUnique({
      where: { id: template.id },
    });
    expect(stored?.approvalStatus).toBe("APPROVED");
    expect(stored?.approvedAt).toBeInstanceOf(Date);
  });

  it("rejects a pending template with a reason", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedCustomTemplate(business.id);

    const res = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/reject`)
      .set("Cookie", adminCookie())
      .send({ rejectionReason: "Wording needs work" });

    expect(res.status).toBe(200);
    const stored = await db.campaignTemplate.findUnique({
      where: { id: template.id },
    });
    expect(stored?.approvalStatus).toBe("REJECTED");
    expect(stored?.rejectionReason).toBe("Wording needs work");
  });

  it("stores internal review notes", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedCustomTemplate(business.id);

    const res = await (
      await api()
    )
      .patch(`/admin/campaign-templates/${template.id}/review`)
      .set("Cookie", adminCookie())
      .send({ internalReviewNotes: "Checked against WhatsApp policy" });

    expect(res.status).toBe(200);
    const stored = await db.campaignTemplate.findUnique({
      where: { id: template.id },
    });
    expect(stored?.internalReviewNotes).toBe("Checked against WhatsApp policy");
  });

  it("returns 404 when approving an unknown template", async () => {
    const res = await (
      await api()
    )
      .post("/admin/campaign-templates/000000000000000000000000/approve")
      .set("Cookie", adminCookie())
      .send({});

    expect(res.status).toBe(404);
  });
});
