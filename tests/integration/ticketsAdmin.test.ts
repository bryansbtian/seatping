import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { adminCookie } from "../helpers/auth.js";
import { getTestPrisma } from "../helpers/db.js";
import { uniqueSuffix } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";

async function seedTicket(overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  return getTestPrisma().ticket.create({
    data: {
      ticketNumber: `FEEDBACK-TEST-${suffix}`,
      type: "feedback",
      status: "open",
      priority: "low",
      subject: "Queue Page Stalls",
      senderName: "Ada Lovelace",
      senderEmail: `ticket-${suffix}@test.invalid`,
      data: {},
      messages: [
        {
          sender: "Ada Lovelace",
          message: "The queue position stopped refreshing.",
          timestamp: new Date().toISOString(),
          isTeamResponse: false,
        },
      ],
      ...overrides,
    },
  });
}

beforeAll(async () => {
  await seedTicket({ type: "sales", status: "closed", priority: "high" });
  await seedTicket({ status: "in_progress", priority: "medium" });
});

describe("ticket access control", () => {
  it("refuses an anonymous listing", async () => {
    const res = await (await api()).get("/tickets");

    expect(res.status).toBe(401);
  });

  it("refuses an anonymous status change", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/status`)
      .send({ status: "closed" });

    expect(res.status).toBe(401);
  });
});

describe("listing tickets", () => {
  it("returns tickets newest first", async () => {
    const res = await (await api()).get("/tickets").set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.tickets.length).toBeGreaterThan(0);
  });

  it("filters by status, type and priority", async () => {
    const res = await (
      await api()
    )
      .get("/tickets?status=closed&type=sales&priority=high")
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    for (const ticket of res.body.tickets) {
      expect(ticket.status).toBe("closed");
      expect(ticket.type).toBe("sales");
      expect(ticket.priority).toBe("high");
    }
  });

  it("honours the requested limit", async () => {
    const res = await (await api()).get("/tickets?limit=1").set("Cookie", adminCookie());

    expect(res.body.tickets).toHaveLength(1);
  });

  it("reports counts by status and type", async () => {
    const res = await (await api()).get("/tickets/stats").set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBeGreaterThan(0);
    expect(res.body.stats.open).toEqual(expect.any(Number));
    expect(res.body.stats.inProgress).toEqual(expect.any(Number));
    expect(res.body.stats.closed).toEqual(expect.any(Number));
    expect(res.body.stats.sales).toEqual(expect.any(Number));
    expect(res.body.stats.feedback).toEqual(expect.any(Number));
  });
});

describe("reading one ticket", () => {
  it("returns the ticket by its number", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .get(`/tickets/${ticket.ticketNumber}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    expect(res.body.ticket.ticketNumber).toBe(ticket.ticketNumber);
  });

  it("reports an unknown ticket number", async () => {
    const res = await (await api()).get("/tickets/FEEDBACK-NOPE-0001").set("Cookie", adminCookie());

    expect(res.status).toBe(404);
  });
});

describe("updating a ticket", () => {
  it("changes the status", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe("in_progress");
  });

  it("rejects an unknown status", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "archived" });

    expect(res.status).toBe(400);
  });

  it("reports an unknown ticket on a status change", async () => {
    const res = await (
      await api()
    )
      .patch("/tickets/FEEDBACK-NOPE-0001/status")
      .set("Cookie", adminCookie())
      .send({ status: "closed" });

    expect(res.status).toBe(404);
  });

  it("assigns an owner", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/assign`)
      .set("Cookie", adminCookie())
      .send({ assignedTo: "support-lead" });

    expect(res.status).toBe(200);
    expect(res.body.ticket.assignedTo).toBe("support-lead");
  });

  it("rejects an empty assignee", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/assign`)
      .set("Cookie", adminCookie())
      .send({ assignedTo: "" });

    expect(res.status).toBe(400);
  });

  it("reports an unknown ticket on an assignment", async () => {
    const res = await (
      await api()
    )
      .patch("/tickets/FEEDBACK-NOPE-0001/assign")
      .set("Cookie", adminCookie())
      .send({ assignedTo: "support-lead" });

    expect(res.status).toBe(404);
  });

  it("changes the priority", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/priority`)
      .set("Cookie", adminCookie())
      .send({ priority: "high" });

    expect(res.status).toBe(200);
    expect(res.body.ticket.priority).toBe("high");
  });

  it("rejects an unknown priority", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .patch(`/tickets/${ticket.ticketNumber}/priority`)
      .set("Cookie", adminCookie())
      .send({ priority: "urgent" });

    expect(res.status).toBe(400);
  });

  it("reports an unknown ticket on a priority change", async () => {
    const res = await (
      await api()
    )
      .patch("/tickets/FEEDBACK-NOPE-0001/priority")
      .set("Cookie", adminCookie())
      .send({ priority: "high" });

    expect(res.status).toBe(404);
  });
});

describe("responding to a ticket", () => {
  it("emails the sender and appends the reply to the thread", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .post(`/tickets/${ticket.ticketNumber}/respond`)
      .set("Cookie", adminCookie())
      .send({ message: "We have shipped a fix.", responderName: "Bryan" });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe("in_progress");
    const messages = res.body.ticket.messages as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(2);
    expect(messages[1].isTeamResponse).toBe(true);
    expect(messages[1].message).toBe("We have shipped a fix.");
    expect(sinks().email.at(-1)?.to).toBe(ticket.senderEmail);
    expect(sinks().email.at(-1)?.subject).toContain(ticket.ticketNumber);
  });

  it("titles the reply after a sales inquiry", async () => {
    const ticket = await seedTicket({ type: "sales" });

    await (
      await api()
    )
      .post(`/tickets/${ticket.ticketNumber}/respond`)
      .set("Cookie", adminCookie())
      .send({ message: "Happy to set up a demo.", responderName: "Bryan" });

    expect(sinks().email.at(-1)?.html).toContain("Sales Inquiry");
  });

  it("rejects a reply with no message", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .post(`/tickets/${ticket.ticketNumber}/respond`)
      .set("Cookie", adminCookie())
      .send({ responderName: "Bryan" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("message field is required");
  });

  it("rejects a reply with no responder name", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .post(`/tickets/${ticket.ticketNumber}/respond`)
      .set("Cookie", adminCookie())
      .send({ message: "We have shipped a fix." });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("responderName field is required");
  });

  it("reports an unknown ticket", async () => {
    const res = await (
      await api()
    )
      .post("/tickets/FEEDBACK-NOPE-0001/respond")
      .set("Cookie", adminCookie())
      .send({ message: "Hello", responderName: "Bryan" });

    expect(res.status).toBe(404);
  });
});

describe("deleting a ticket", () => {
  it("removes the ticket", async () => {
    const ticket = await seedTicket();

    const res = await (
      await api()
    )
      .delete(`/tickets/${ticket.ticketNumber}`)
      .set("Cookie", adminCookie());

    expect(res.status).toBe(200);
    const stored = await getTestPrisma().ticket.findUnique({
      where: { ticketNumber: ticket.ticketNumber },
    });
    expect(stored).toBeNull();
  });

  it("reports an unknown ticket", async () => {
    const res = await (
      await api()
    )
      .delete("/tickets/FEEDBACK-NOPE-0001")
      .set("Cookie", adminCookie());

    expect(res.status).toBe(404);
  });
});
