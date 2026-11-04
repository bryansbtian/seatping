import { describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { getTestPrisma } from "../helpers/db.js";
import { uniqueSuffix } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";
import { queueTicketReply, deliverTicketReply } from "../../server/lib/ticketMessages.js";

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
  it.each(["en", "id"])(
    "preserves the %s sender preference for confirmations and threaded replies",
    async (language) => {
      const payload = feedbackPayload();
      const response = await (
        await api()
      )
        .post("/api/feedback/submit")
        .set("X-Forwarded-For", freshIp())
        .set("x-seatping-language", language)
        .send(payload);
      expect(response.status).toBe(200);
      const ticket = await getTestPrisma().ticket.findUniqueOrThrow({
        where: { ticketNumber: response.body.ticketNumber },
      });
      expect(ticket.data).toMatchObject({ language });
      const confirmation = sinks().email.find((email) => email.to === payload.email);
      expect(confirmation?.html).toContain(`<html lang="${language}">`);
      const reply = await queueTicketReply(
        ticket.ticketNumber,
        "Original English reply.\n<Keep this>",
        "Support Agent",
        `reply-${uniqueSuffix()}`,
      );
      if (!reply) {
        throw new Error("Support reply was not queued");
      }
      await deliverTicketReply(reply.id);
      const sent = sinks().email.at(-1);
      expect(sent).toMatchObject({
        to: payload.email,
        inReplyTo: ticket.emailThreadId,
        references: [ticket.emailThreadId],
        messageId: reply.emailMessageId,
        replyTo: "sender@test.invalid",
      });
      expect(sent?.html).toContain(`<html lang="${language}">`);
      expect(sent?.html).toContain("Original English reply.<br>&lt;Keep this&gt;");
      let heading = "Response To Your Feedback";
      let subject = `Re: ${payload.subject} [Ticket #${ticket.ticketNumber}]`;
      let closing = "The SeatPing Team";
      if (language === "id") {
        heading = "Tanggapan atas Masukan Anda";
        subject = `Re: ${payload.subject} [Tiket #${ticket.ticketNumber}]`;
        closing = "Tim SeatPing";
        expect(confirmation?.subject).toBe(`Masukan Diterima: ${ticket.ticketNumber}`);
        expect(sent?.html).toContain("Balas langsung email ini untuk melanjutkan percakapan.");
      }
      expect(sent?.subject).toBe(subject);
      expect(sent?.html).toContain(heading);
      expect(sent?.html).toContain(closing);
    },
  );

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
