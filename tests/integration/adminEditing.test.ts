import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { adminCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import {
  seedBusiness,
  seedBusinessWithLocation,
  seedLocation,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function admin() {
  return adminCookie();
}

describe("credit adjustments", () => {
  it("rejects a request with no username", async () => {
    const res = await (
      await api()
    )
      .post("/admin/update-credits")
      .set("Cookie", admin())
      .send({ baseCredits: 100 });

    expect(res.status).toBe(400);
    expect(res.text).toBe("Missing required fields");
  });

  it("rejects a non-numeric credit amount", async () => {
    const business = await seedBusiness();

    const res = await (
      await api()
    )
      .post("/admin/update-credits")
      .set("Cookie", admin())
      .send({ username: business.username, baseCredits: "lots" });

    expect(res.status).toBe(400);
    expect(res.text).toBe("Credits must be a number");
  });

  it("rejects a negative credit amount", async () => {
    const business = await seedBusiness();

    const res = await (
      await api()
    )
      .post("/admin/update-credits")
      .set("Cookie", admin())
      .send({ username: business.username, baseCredits: -5 });

    expect(res.status).toBe(400);
    expect(res.text).toBe("Credits cannot be negative");
  });

  it("reports an unknown business", async () => {
    const res = await (
      await api()
    )
      .post("/admin/update-credits")
      .set("Cookie", admin())
      .send({ username: "no-such-business", baseCredits: 100 });

    expect(res.status).toBe(404);
  });

  it("stores the new base credit allowance", async () => {
    const business = await seedBusiness();

    const res = await (
      await api()
    )
      .post("/admin/update-credits")
      .set("Cookie", admin())
      .send({ username: business.username, baseCredits: 750 });

    expect(res.status).toBe(200);
    expect(res.body.user.baseCredits).toBe(750);
  });
});

describe("customer lookup", () => {
  it("rejects a blank username", async () => {
    const res = await (await api()).get("/admin/customer/%20").set("Cookie", admin());

    expect(res.status).toBe(400);
  });

  it("includes every location with its credits", async () => {
    const business = await seedBusiness();
    await seedLocation(business.id, business.username, {
      displayName: "Downtown",
      credits: 120,
    });
    await seedLocation(business.id, business.username, {
      displayName: null,
      credits: 0,
    });

    const res = await (
      await api()
    )
      .get(`/admin/customer/${business.username}`)
      .set("Cookie", admin());

    expect(res.status).toBe(200);
    expect(res.body.customer.locations).toHaveLength(2);
    expect(res.body.customer.locations[0].credits).toBe(120);
    expect(res.body.customer.locations[1].displayName).toBeNull();
  });
});

describe("customer editing validation", () => {
  async function patch(username: string, body: Record<string, unknown>) {
    return (await api()).patch(`/admin/customer/${username}`).set("Cookie", admin()).send(body);
  }

  it("rejects a blank username in the path", async () => {
    const res = await patch("%20", { name: "New" });

    expect(res.status).toBe(400);
  });

  it("reports an unknown business", async () => {
    const res = await patch("no-such-business", { name: "New" });

    expect(res.status).toBe(404);
  });

  it("rejects an empty name or phone", async () => {
    const business = await seedBusiness();

    const name = await patch(business.username, { name: "  " });
    const phone = await patch(business.username, { phone: 7 });

    expect(name.status).toBe(400);
    expect(name.body.error).toContain("name must be");
    expect(phone.status).toBe(400);
    expect(phone.body.error).toContain("phone must be");
  });

  it("rejects an empty email", async () => {
    const business = await seedBusiness();

    const res = await patch(business.username, { email: "" });

    expect(res.status).toBe(400);
  });

  it("refuses an email already used by another account", async () => {
    const business = await seedBusiness();
    const other = await seedBusiness();

    const res = await patch(business.username, { email: other.email });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already in use");
  });

  it("accepts an unchanged email", async () => {
    const business = await seedBusiness();

    const res = await patch(business.username, { email: business.email });

    expect(res.status).toBe(200);
    expect(res.body.customer.email).toBe(business.email);
  });

  it("rejects an empty username", async () => {
    const business = await seedBusiness();

    const res = await patch(business.username, { username: "   " });

    expect(res.status).toBe(400);
  });

  it("refuses a username already taken", async () => {
    const business = await seedBusiness();
    const other = await seedBusiness();

    const res = await patch(business.username, { username: other.username });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Username is already taken");
  });

  it("renames a business", async () => {
    const business = await seedBusiness();
    const nextUsername = `renamed-${uniqueSuffix()}`;

    const res = await patch(business.username, { username: nextUsername });

    expect(res.status).toBe(200);
    expect(res.body.customer.username).toBe(nextUsername);
  });

  it("rejects a negative or non-numeric allowance", async () => {
    const business = await seedBusiness();

    const negative = await patch(business.username, { maxLocations: -1 });
    const text = await patch(business.username, { baseCredits: "many" });
    const days = await patch(business.username, { trialDurationDays: Infinity });

    expect(negative.status).toBe(400);
    expect(text.status).toBe(400);
    expect(days.status).toBe(400);
  });

  it("floors a fractional allowance", async () => {
    const business = await seedBusiness();

    const res = await patch(business.username, { baseCredits: 250.9 });

    expect(res.body.customer.baseCredits).toBe(250);
  });

  it("rejects a non-boolean trial flag", async () => {
    const business = await seedBusiness();

    const res = await patch(business.username, { trial: "yes" });

    expect(res.status).toBe(400);
  });

  it("rejects a patch with nothing editable", async () => {
    const business = await seedBusiness();

    const res = await patch(business.username, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No editable fields provided");
  });
});

describe("customer trial activation", () => {
  it("starts the credit clock when a trial business is activated", async () => {
    const business = await seedBusiness({ trial: true });

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ trial: false });

    expect(res.status).toBe(200);
    expect(res.body.customer.trial).toBe(false);
    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.creditsStartedAt).toBeInstanceOf(Date);
    expect(stored?.nextCreditRefillAt).toBeInstanceOf(Date);
  });

  it("clears the credit clock when a business is put back on trial", async () => {
    const business = await seedBusiness({
      trial: false,
      creditsStartedAt: new Date(),
      lastCreditRefillAt: new Date(),
      nextCreditRefillAt: new Date(),
    });

    await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ trial: true });

    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.creditsStartedAt).toBeNull();
    expect(stored?.nextCreditRefillAt).toBeNull();
  });

  it("leaves the credit clock alone for an already activated business", async () => {
    const started = new Date("2026-01-01T00:00:00.000Z");
    const business = await seedBusiness({
      trial: false,
      creditsStartedAt: started,
    });

    await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ trial: false });

    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.creditsStartedAt?.toISOString()).toBe(started.toISOString());
  });
});

describe("customer location editing", () => {
  it("rejects a locations payload that is not an array", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ locations: { credits: 10 } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("locations must be an array");
  });

  it("rejects a locations payload of the wrong length", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ locations: [{}, {}] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not match");
  });

  it("rejects negative location credits", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ locations: [{ credits: -1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("locations[0].credits must be a non-negative number");
  });

  it("rejects an empty location address", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ locations: [{ address: "   " }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("locations[0].address must be a non-empty string");
  });

  it("updates the address and credits of each location", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ locations: [{ address: "  9 New Street  ", credits: 42.7 }] });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.address).toBe("9 New Street");
    expect(stored?.credits).toBe(42);
  });

  it("accepts a locations-only patch with no other fields", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/admin/customer/${business.username}`)
      .set("Cookie", admin())
      .send({ locations: [{}] });

    expect(res.status).toBe(200);
  });
});

describe("business lookup helpers", () => {
  it("requires a username query", async () => {
    const res = await (await api()).get("/admin/businesses/search").set("Cookie", admin());

    expect(res.status).toBe(400);
  });

  it("rejects a malformed business id when listing locations", async () => {
    const res = await (
      await api()
    )
      .get("/admin/businesses/not-an-id/locations")
      .set("Cookie", admin());

    expect(res.status).toBe(404);
  });

  it("reports an unknown business when listing locations", async () => {
    const res = await (
      await api()
    )
      .get("/admin/businesses/000000000000000000000000/locations")
      .set("Cookie", admin());

    expect(res.status).toBe(404);
  });
});

describe("featured restaurant validation", () => {
  it("rejects a malformed business or location id", async () => {
    const badBusiness = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({ businessId: "nope", locationId: "000000000000000000000000" });
    const badLocation = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({ businessId: "000000000000000000000000", locationId: "nope" });

    expect(badBusiness.status).toBe(400);
    expect(badBusiness.body.error).toContain("businessId");
    expect(badLocation.status).toBe(400);
    expect(badLocation.body.error).toContain("locationId");
  });

  it("reports an unknown business", async () => {
    const { location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({
        businessId: "000000000000000000000000",
        locationId: location.id,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Business not found");
  });

  it("refuses a location that belongs to another business", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({
        businessId: tenantA.business.id,
        locationId: tenantB.location.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not belong");
  });

  it("refuses to feature the same location twice", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const payload = { businessId: business.id, locationId: location.id };
    await (await api()).post("/admin/featured-restaurants").set("Cookie", admin()).send(payload);

    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send(payload);

    expect(res.status).toBe(409);
  });

  it("rejects a non-numeric sort order or non-boolean active flag", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const order = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({
        businessId: business.id,
        locationId: location.id,
        sortOrder: "first",
      });
    const active = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({
        businessId: business.id,
        locationId: location.id,
        isActive: "yes",
      });

    expect(order.status).toBe(400);
    expect(active.status).toBe(400);
  });

  it("stores the supplied sort order and active flag", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({
        businessId: business.id,
        locationId: location.id,
        sortOrder: 3.9,
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.featured.sortOrder).toBe(3);
    expect(res.body.featured.isActive).toBe(false);
    expect(res.body.featured.business.username).toBe(business.username);
    expect(res.body.featured.location.id).toBe(location.id);
  });

  it("rejects a malformed id on update and delete", async () => {
    const update = await (
      await api()
    )
      .patch("/admin/featured-restaurants/not-an-id")
      .set("Cookie", admin())
      .send({ isActive: false });
    const remove = await (
      await api()
    )
      .delete("/admin/featured-restaurants/not-an-id")
      .set("Cookie", admin());

    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);
  });

  it("rejects an update with invalid or missing fields", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const created = await (
      await api()
    )
      .post("/admin/featured-restaurants")
      .set("Cookie", admin())
      .send({ businessId: business.id, locationId: location.id });
    const id = created.body.featured.id;

    const order = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${id}`)
      .set("Cookie", admin())
      .send({ sortOrder: "first" });
    const active = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${id}`)
      .set("Cookie", admin())
      .send({ isActive: "yes" });
    const empty = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${id}`)
      .set("Cookie", admin())
      .send({});

    expect(order.status).toBe(400);
    expect(active.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe("No editable fields provided");
  });

  it("reports an unknown featured entry on update and delete", async () => {
    const missing = "000000000000000000000000";

    const update = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${missing}`)
      .set("Cookie", admin())
      .send({ isActive: false });
    const remove = await (
      await api()
    )
      .delete(`/admin/featured-restaurants/${missing}`)
      .set("Cookie", admin());

    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);
  });
});

describe("admin campaign template review", () => {
  async function seedTemplate(overrides: Record<string, unknown> = {}) {
    const suffix = uniqueSuffix();
    return db.campaignTemplate.create({
      data: {
        templateType: "CUSTOM",
        name: `Custom ${suffix}`,
        slug: `custom-${suffix}`,
        body: "Hi {{first_name}}, a note.",
        approvalStatus: "PENDING_SEATPING_REVIEW",
        submittedAt: new Date(),
        ...overrides,
      },
    });
  }

  it("filters the list by approval status", async () => {
    const { business } = await seedBusinessWithLocation();
    await seedTemplate({ businessId: business.id, approvalStatus: "APPROVED" });
    await seedTemplate({ businessId: business.id, approvalStatus: "REJECTED" });

    const res = await (
      await api()
    )
      .get("/admin/campaign-templates?status=approved")
      .set("Cookie", admin());

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
    expect(res.body.templates[0].approvalStatus).toBe("APPROVED");
    expect(res.body.counts.APPROVED).toBe(1);
    expect(res.body.counts.REJECTED).toBe(1);
  });

  it("ignores an unrecognised status filter", async () => {
    const { business } = await seedBusinessWithLocation();
    await seedTemplate({ businessId: business.id });

    const res = await (
      await api()
    )
      .get("/admin/campaign-templates?status=nonsense")
      .set("Cookie", admin());

    expect(res.body.templates).toHaveLength(1);
  });

  it("searches templates by name", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedTemplate({
      businessId: business.id,
      name: "Ramadan Special Offer",
    });
    await seedTemplate({ businessId: business.id, name: "Unrelated" });

    const res = await (
      await api()
    )
      .get("/admin/campaign-templates?search=ramadan")
      .set("Cookie", admin());

    expect(res.body.templates).toHaveLength(1);
    expect(res.body.templates[0].id).toBe(template.id);
  });

  it("attaches the owning business to each row", async () => {
    const { business } = await seedBusinessWithLocation();
    await seedTemplate({ businessId: business.id });

    const res = await (await api()).get("/admin/campaign-templates").set("Cookie", admin());

    expect(res.body.templates[0].business.username).toBe(business.username);
  });

  it("tolerates a template with no owning business", async () => {
    await seedTemplate();

    const res = await (await api()).get("/admin/campaign-templates").set("Cookie", admin());

    expect(res.status).toBe(200);
    expect(res.body.templates[0].business).toBeNull();
  });

  it("returns the linked location with a single template", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seedTemplate({
      businessId: business.id,
      locationId: location.id,
    });

    const res = await (
      await api()
    )
      .get(`/admin/campaign-templates/${template.id}`)
      .set("Cookie", admin());

    expect(res.status).toBe(200);
    expect(res.body.location.id).toBe(location.id);
    expect(res.body.template.business.username).toBe(business.username);
  });

  it("rejects a malformed template id on every review route", async () => {
    const get = await (
      await api()
    )
      .get("/admin/campaign-templates/not-an-id")
      .set("Cookie", admin());
    const review = await (
      await api()
    )
      .patch("/admin/campaign-templates/not-an-id/review")
      .set("Cookie", admin())
      .send({ internalReviewNotes: "x" });
    const approve = await (
      await api()
    )
      .post("/admin/campaign-templates/not-an-id/approve")
      .set("Cookie", admin());
    const reject = await (
      await api()
    )
      .post("/admin/campaign-templates/not-an-id/reject")
      .set("Cookie", admin())
      .send({ rejectionReason: "no" });

    expect(get.status).toBe(404);
    expect(review.status).toBe(404);
    expect(approve.status).toBe(404);
    expect(reject.status).toBe(404);
  });

  it("clears a review field when it is set to null", async () => {
    const template = await seedTemplate({ internalReviewNotes: "earlier note" });

    const res = await (
      await api()
    )
      .patch(`/admin/campaign-templates/${template.id}/review`)
      .set("Cookie", admin())
      .send({ internalReviewNotes: null });

    expect(res.status).toBe(200);
    expect(res.body.template.internalReviewNotes).toBeNull();
  });

  it("stores and clears the Meta review timestamps", async () => {
    const template = await seedTemplate();

    const set = await (
      await api()
    )
      .patch(`/admin/campaign-templates/${template.id}/review`)
      .set("Cookie", admin())
      .send({ whatsappSubmittedAt: "2026-08-01T00:00:00.000Z" });
    const cleared = await (
      await api()
    )
      .patch(`/admin/campaign-templates/${template.id}/review`)
      .set("Cookie", admin())
      .send({ whatsappSubmittedAt: null });

    expect(set.body.template.whatsappSubmittedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(cleared.body.template.whatsappSubmittedAt).toBeNull();
  });

  it("rejects a review with no reviewable fields", async () => {
    const template = await seedTemplate();

    const res = await (
      await api()
    )
      .patch(`/admin/campaign-templates/${template.id}/review`)
      .set("Cookie", admin())
      .send({ name: "Renamed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No reviewable fields provided");
  });

  it("refuses to approve or reject a SeatPing template", async () => {
    const template = await seedTemplate({
      templateType: "SEATPING",
      approvalStatus: "APPROVED",
    });

    const approve = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/approve`)
      .set("Cookie", admin());
    const reject = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/reject`)
      .set("Cookie", admin())
      .send({ rejectionReason: "not needed" });

    expect(approve.status).toBe(400);
    expect(approve.body.error).toContain("Only custom templates");
    expect(reject.status).toBe(400);
  });

  it("records the Meta template name supplied at approval", async () => {
    const template = await seedTemplate();

    const res = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/approve`)
      .set("Cookie", admin())
      .send({
        whatsappProviderTemplateName: "custom_promo",
        whatsappMetaStatus: "APPROVED",
      });

    expect(res.status).toBe(200);
    expect(res.body.template.whatsappProviderTemplateName).toBe("custom_promo");
    expect(res.body.template.whatsappMetaStatus).toBe("APPROVED");
    expect(res.body.template.approvedBy).toEqual(expect.any(String));
  });

  it("keeps an existing Meta approval timestamp", async () => {
    const approvedAt = new Date("2026-01-01T00:00:00.000Z");
    const template = await seedTemplate({ whatsappApprovedAt: approvedAt });

    const res = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/approve`)
      .set("Cookie", admin());

    expect(res.body.template.whatsappApprovedAt).toBe(approvedAt.toISOString());
  });

  it("requires a reason to reject", async () => {
    const template = await seedTemplate();

    const res = await (
      await api()
    )
      .post(`/admin/campaign-templates/${template.id}/reject`)
      .set("Cookie", admin())
      .send({ rejectionReason: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A rejection reason is required");
  });

  it("reports an unknown template on review and reject", async () => {
    const missing = "000000000000000000000000";

    const review = await (
      await api()
    )
      .patch(`/admin/campaign-templates/${missing}/review`)
      .set("Cookie", admin())
      .send({ internalReviewNotes: "x" });
    const reject = await (
      await api()
    )
      .post(`/admin/campaign-templates/${missing}/reject`)
      .set("Cookie", admin())
      .send({ rejectionReason: "no" });
    const get = await (
      await api()
    )
      .get(`/admin/campaign-templates/${missing}`)
      .set("Cookie", admin());

    expect(review.status).toBe(404);
    expect(reject.status).toBe(404);
    expect(get.status).toBe(404);
  });
});
