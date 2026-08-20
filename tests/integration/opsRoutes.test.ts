import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { adminCookie, businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedCustomer, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("location reviews", () => {
  async function seedReview(locationId: string, customerId: string) {
    return db.review.create({
      data: {
        locationId,
        customerId,
        customerName: "Reviewer",
        rating: 4,
        description: `Review ${uniqueSuffix()}`,
      },
    });
  }

  it("lists reviews for a location the business owns", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    const review = await seedReview(location.id, customer.id);

    const res = await (
      await api()
    )
      .get(`/api/locations/${location.id}/reviews`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(review.id);
  });

  it("refuses review access for another business", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    await seedReview(tenantA.location.id, customer.id);

    const res = await (
      await api()
    )
      .get(`/api/locations/${tenantA.location.id}/reviews`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects an anonymous review listing", async () => {
    const { location } = await seedBusinessWithLocation();

    const res = await (await api()).get(`/api/locations/${location.id}/reviews`);

    expect(res.status).toBe(401);
  });

  it("adds and removes a business reply on a review", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    const review = await seedReview(location.id, customer.id);
    const cookie = businessCookie(business.id);

    const replied = await (
      await api()
    )
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", cookie)
      .send({ reply: "Thank you for visiting." });

    expect(replied.status).toBe(200);
    let stored = await db.review.findUnique({ where: { id: review.id } });
    expect(stored?.businessReply).toBe("Thank you for visiting.");
    expect(stored?.businessReplyCreatedAt).toBeInstanceOf(Date);

    const removed = await (
      await api()
    )
      .delete(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", cookie);

    expect(removed.status).toBe(200);
    stored = await db.review.findUnique({ where: { id: review.id } });
    expect(stored?.businessReply).toBeNull();
  });

  it("rejects an empty reply", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    const review = await seedReview(location.id, customer.id);

    const res = await (
      await api()
    )
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", businessCookie(business.id))
      .send({ reply: "   " });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns a client error replying to an unknown review", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .patch(`/api/locations/${location.id}/reviews/000000000000000000000000/reply`)
      .set("Cookie", businessCookie(business.id))
      .send({ reply: "Hello" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("support tickets", () => {
  async function seedTicket(overrides: Record<string, unknown> = {}) {
    const suffix = uniqueSuffix();
    return db.ticket.create({
      data: {
        ticketNumber: `T-${suffix}`,
        type: "feedback",
        status: "open",
        subject: `Subject ${suffix}`,
        senderName: "Ada",
        senderEmail: `ticket-${suffix}@test.invalid`,
        data: {},
        messages: [],
        ...overrides,
      },
    });
  }

  it("rejects ticket access without an admin session", async () => {
    const res = await (await api()).get("/tickets");

    expect(res.status).toBe(401);
  });

  it("lists tickets for an admin", async () => {
    const ticket = await seedTicket();

    const res = await (await api()).get("/tickets").set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(ticket.ticketNumber);
  });

  it("reports ticket statistics", async () => {
    await seedTicket({ status: "open" });
    await seedTicket({ status: "closed" });

    const res = await (await api()).get("/tickets/stats").set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveProperty("total");
    expect(res.body.stats.total).toBeGreaterThanOrEqual(2);
  });

  it("reads a single ticket by number", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .get(`/tickets/${ticket.ticketNumber}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown ticket", async () => {
    const res = await (await api()).get("/tickets/T-does-not-exist").set("Cookie", adminCookie());

    expect(res.status).toBe(404);
  });

  it("updates ticket status, assignment and priority", async () => {
    const ticket = await seedTicket();
    const cookie = adminCookie();

    const status = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/status`)
      .set("Cookie", cookie)
      .send({ status: "in_progress" });
    expect(status.status).toBe(200);

    const assigned = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/assign`)
      .set("Cookie", cookie)
      .send({ assignedTo: "support-agent" });
    expect(assigned.status).toBe(200);

    const priority = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/priority`)
      .set("Cookie", cookie)
      .send({ priority: "high" });
    expect(priority.status).toBe(200);

    const stored = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored?.status).toBe("in_progress");
    expect(stored?.assignedTo).toBe("support-agent");
    expect(stored?.priority).toBe("high");
  });

  it("appends a team response to a ticket", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .post(`/tickets/${ticket.ticketNumber}/respond`)
      .set("Cookie", adminCookie())
      .send({ message: "We are looking into it.", responderName: "Support" });

    expect(res.status).toBeLessThan(500);
  });
});

describe("cron endpoints", () => {
  it("refuses an unauthenticated reminder sweep", async () => {
    const res = await (await api()).post("/api/cron/reservation-reminders");

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("runs the reminder sweep with the cron secret", async () => {
    const res = await (
      await api()
    )
      .post("/api/cron/reservation-reminders")
      .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);

    expect(res.status).toBe(200);
  });

  it("runs the credit refill sweep with the cron secret", async () => {
    const res = await (
      await api()
    )
      .post("/api/cron/credit-refill")
      .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);

    expect(res.status).toBe(200);
  });

  it("runs the campaign sweep with the cron secret", async () => {
    const res = await (
      await api()
    )
      .post("/api/cron/campaigns")
      .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);

    expect(res.status).toBe(200);
  });

  it("refuses a wrong cron secret", async () => {
    const res = await (
      await api()
    )
      .post("/api/cron/credit-refill")
      .set("Authorization", "Bearer definitely-wrong");

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("qstash job worker", () => {
  it("rejects a job with no valid signature", async () => {
    const res = await (
      await api()
    )
      .post("/api/jobs/notification")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "queue_join" }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
