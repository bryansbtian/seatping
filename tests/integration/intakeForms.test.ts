import { describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { getTestPrisma } from "../helpers/db.js";
import { uniqueSuffix } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";

let ipCounter = 0;

function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function feedbackPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: `feedback-${uniqueSuffix()}@test.invalid`,
    feedbackType: "bug",
    subject: "Queue Page Stalls",
    message: "The queue position stopped refreshing after ten minutes.",
    ...overrides,
  };
}

describe("feedback intake", () => {
  it("creates a feedback ticket and emails both the team and the sender", async () => {
    const payload = feedbackPayload();

    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketNumber).toMatch(/^FEEDBACK-\d{8}-\d{4}$/);

    const ticket = await getTestPrisma().ticket.findFirst({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(ticket?.type).toBe("feedback");
    expect(ticket?.status).toBe("open");
    expect(ticket?.senderEmail).toBe(payload.email);
    expect(sinks().email.length).toBeGreaterThanOrEqual(2);
  });

  it("defaults a bug report to medium priority", async () => {
    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(feedbackPayload({ feedbackType: "bug" }));

    const ticket = await getTestPrisma().ticket.findFirst({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(ticket?.priority).toBe("medium");
  });

  it("defaults other feedback to low priority", async () => {
    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(feedbackPayload({ feedbackType: "feature" }));

    const ticket = await getTestPrisma().ticket.findFirst({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(ticket?.priority).toBe("low");
  });

  it("keeps an explicit severity as the ticket priority", async () => {
    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(feedbackPayload({ severity: "high" }));

    const ticket = await getTestPrisma().ticket.findFirst({
      where: { ticketNumber: res.body.ticketNumber },
    });
    expect(ticket?.priority).toBe("high");
  });

  it("stores the submitted message as the opening thread entry", async () => {
    const payload = feedbackPayload();

    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(payload);

    const ticket = await getTestPrisma().ticket.findFirst({
      where: { ticketNumber: res.body.ticketNumber },
    });
    const messages = ticket?.messages as unknown as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe(payload.message);
    expect(messages[0].isTeamResponse).toBe(false);
  });

  it("rejects a submission that is missing a required field", async () => {
    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(feedbackPayload({ subject: "" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required fields");
  });

  it("rejects a malformed email address", async () => {
    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .set("X-Forwarded-For", freshIp())
      .send(feedbackPayload({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid email format");
  });

  it("rate limits repeated submissions from the same sender", async () => {
    const ip = freshIp();
    const email = `repeat-${uniqueSuffix()}@test.invalid`;
    const statuses: number[] = [];

    for (let i = 0; i < 5; i++) {
      const res = await (
        await api()
      )
        .post("/api/feedback/submit")
        .set("X-Forwarded-For", ip)
        .send(feedbackPayload({ email }));
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });
});
