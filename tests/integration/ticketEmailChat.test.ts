import { describe, expect, it } from "vitest";
import PostalMime from "postal-mime";
import { randomUUID } from "node:crypto";
import { api } from "../helpers/app.js";
import { adminCookie } from "../helpers/auth.js";
import { getTestPrisma } from "../helpers/db.js";
import { behavior, sinks } from "../setup/externalMocks.js";
import { importTicketEmail } from "../../server/lib/ticketInbox.js";
import {
  deliverTicketReply,
  queueTicketReply,
  ticketEmailMessageId,
} from "../../server/lib/ticketMessages.js";

async function ticket() {
  return getTestPrisma().ticket.create({
    data: {
      ticketNumber: `CHAT-${randomUUID()}`,
      type: "feedback",
      subject: "Help With Booking",
      senderName: "Guest",
      senderEmail: `guest-${randomUUID()}@test.invalid`,
      emailThreadId: ticketEmailMessageId(),
      messages: [
        {
          sender: "Guest",
          message: "Please help.",
          timestamp: "2026-10-01T12:00:00.000Z",
          isTeamResponse: false,
        },
      ],
      data: {},
    },
  });
}

async function incoming(
  from: string,
  reference: string,
  text = "Thanks, it works!",
  id = `<${randomUUID()}@test.invalid>`,
) {
  return PostalMime.parse(
    [
      `From: Guest <${from}>`,
      "To: sender@test.invalid",
      `Message-ID: ${id}`,
      `In-Reply-To: ${reference}`,
      `References: ${reference}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      text,
    ].join("\r\n"),
  );
}

describe("Ticket Email Chat", () => {
  it("requires admin access for conversations, sync, and retries", async () => {
    const client = await api();
    for (const path of ["/tickets/email/status", "/tickets/CHAT-example"]) {
      expect((await client.get(path)).status).toBe(401);
    }
    for (const path of [
      "/tickets/email/sync",
      "/tickets/CHAT-example/respond",
      "/tickets/CHAT-example/messages/unknown/retry",
    ]) {
      expect((await client.post(path).send({})).status).toBe(401);
    }
    expect(
      (await client.get("/tickets/email/status").set("Cookie", adminCookie())).body.configured,
    ).toBe(false);
    expect((await client.post("/tickets/email/sync").set("Cookie", adminCookie())).status).toBe(
      503,
    );
  });

  it("serializes duplicate requests and sends a threaded email only once", async () => {
    const seeded = await ticket();
    const requestId = randomUUID();
    const replies = await Promise.all(
      [0, 1].map(() =>
        queueTicketReply(seeded.ticketNumber, "A fix is ready.", "Support", requestId),
      ),
    );
    expect(replies[0]?.id).toBe(replies[1]?.id);
    const reply = replies[0]!;
    await Promise.all([deliverTicketReply(reply.id), deliverTicketReply(reply.id)]);
    expect(sinks().email.filter((email) => email.to === seeded.senderEmail)).toHaveLength(1);
    expect(sinks().email.at(-1)).toMatchObject({
      messageId: reply.emailMessageId,
      inReplyTo: seeded.emailThreadId,
      references: [seeded.emailThreadId],
      replyTo: "sender@test.invalid",
    });
    const stored = await getTestPrisma().ticketMessage.findUniqueOrThrow({
      where: { id: reply.id },
    });
    expect(stored.status).toBe("SENT");
    await expect(
      queueTicketReply(seeded.ticketNumber, "Different content", "Support", requestId),
    ).rejects.toThrow("conflicts");
  });

  it("imports a customer email once, reopens the ticket, and replies to that email", async () => {
    const seeded = await ticket();
    await getTestPrisma().ticket.update({ where: { id: seeded.id }, data: { status: "closed" } });
    const email = await incoming(
      seeded.senderEmail.toUpperCase(),
      seeded.emailThreadId!,
      "It still fails.\n\nOn Monday, Support wrote:\n> Try again.",
    );
    const imported = await Promise.all([
      importTicketEmail(email, "sender@test.invalid"),
      importTicketEmail(email, "sender@test.invalid"),
    ]);
    expect(imported.filter(Boolean)).toHaveLength(1);
    const stored = await getTestPrisma().ticket.findUniqueOrThrow({
      where: { id: seeded.id },
      include: { thread: true },
    });
    expect(stored.status).toBe("open");
    expect(stored.thread).toHaveLength(2);
    expect(stored.thread.find((entry) => entry.emailMessageId === email.messageId)).toMatchObject({
      message: "It still fails.",
      quotedText: "On Monday, Support wrote:\n> Try again.",
      status: "RECEIVED",
    });
    const reply = await queueTicketReply(
      seeded.ticketNumber,
      "We are investigating.",
      "Support",
      randomUUID(),
    );
    expect(reply?.inReplyTo).toBe(email.messageId);
    expect(reply?.references).toContain(seeded.emailThreadId);
    const response = await (
      await api()
    )
      .get(`/tickets/${seeded.ticketNumber}`)
      .set("Cookie", adminCookie());
    expect(response.body.ticket.messages).toHaveLength(3);
    expect(response.body.ticket.messages[0].timestamp).toBe("2026-10-01T12:00:00.000Z");
  });

  it("rejects unrelated senders, forged subjects, wrong recipients and automatic responses", async () => {
    const seeded = await ticket();
    const wrongSender = await incoming("attacker@test.invalid", seeded.emailThreadId!);
    expect(await importTicketEmail(wrongSender, "sender@test.invalid")).toBe(false);
    const unrelated = await incoming(seeded.senderEmail, "<unknown@test.invalid>");
    expect(await importTicketEmail(unrelated, "sender@test.invalid")).toBe(false);
    const wrongRecipient = await incoming(seeded.senderEmail, seeded.emailThreadId!);
    wrongRecipient.to = [{ name: "Other", address: "other@test.invalid" }];
    expect(await importTicketEmail(wrongRecipient, "sender@test.invalid")).toBe(false);
    const automatic = await incoming(seeded.senderEmail, seeded.emailThreadId!);
    automatic.headers.push({ key: "auto-submitted", value: "auto-replied" });
    expect(await importTicketEmail(automatic, "sender@test.invalid")).toBe(false);
    const empty = await incoming(seeded.senderEmail, seeded.emailThreadId!, "");
    expect(await importTicketEmail(empty, "sender@test.invalid")).toBe(false);
    expect(await getTestPrisma().ticketMessage.count({ where: { ticketId: seeded.id } })).toBe(0);
  });

  it("converts HTML-only emails into safe readable text", async () => {
    const seeded = await ticket();
    const email = await incoming(seeded.senderEmail, seeded.emailThreadId!);
    delete email.text;
    email.html =
      '<p>Thanks &amp; see you soon.</p><script>alert(1)</script><img src="https://tracker.test/open">';
    expect(await importTicketEmail(email, "sender@test.invalid")).toBe(true);
    const message = await getTestPrisma().ticketMessage.findUniqueOrThrow({
      where: { emailMessageId: email.messageId },
    });
    expect(message.message).toBe("Thanks & see you soon.");
  });

  it("preserves failed messages and retries through the authenticated endpoint", async () => {
    const seeded = await ticket();
    const reply = (await queueTicketReply(
      seeded.ticketNumber,
      "<script>unsafe</script>",
      "Support",
      randomUUID(),
    ))!;
    behavior().emailAccepted = [];
    behavior().emailRejected = [seeded.senderEmail];
    await deliverTicketReply(reply.id);
    expect(
      (await getTestPrisma().ticketMessage.findUniqueOrThrow({ where: { id: reply.id } })).status,
    ).toBe("FAILED");
    expect(sinks().email.at(-1)?.html).not.toContain("<script>unsafe</script>");
    behavior().emailAccepted = null;
    behavior().emailRejected = null;
    const response = await (
      await api()
    )
      .post(`/tickets/${seeded.ticketNumber}/messages/${reply.id}/retry`)
      .set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    await expect
      .poll(
        async () =>
          (await getTestPrisma().ticketMessage.findUniqueOrThrow({ where: { id: reply.id } }))
            .status,
      )
      .toBe("SENT");
    expect(
      (
        await (
          await api()
        )
          .post(`/tickets/${seeded.ticketNumber}/messages/${reply.id}/retry`)
          .set("Cookie", adminCookie())
      ).status,
    ).toBe(409);
    expect(
      (
        await (
          await api()
        )
          .post(`/tickets/another/messages/${reply.id}/retry`)
          .set("Cookie", adminCookie())
      ).status,
    ).toBe(404);
    await (await api()).delete(`/tickets/${seeded.ticketNumber}`).set("Cookie", adminCookie());
    expect(await getTestPrisma().ticketMessage.count({ where: { ticketId: seeded.id } })).toBe(0);
  });

  it("leaves uncertain SMTP outcomes for manual review instead of sending again", async () => {
    const seeded = await ticket();
    const reply = (await queueTicketReply(
      seeded.ticketNumber,
      "Please try again.",
      "Support",
      randomUUID(),
    ))!;
    behavior().emailSendError = "SMTP connection closed before acknowledgement";
    await deliverTicketReply(reply.id);
    expect(
      (await getTestPrisma().ticketMessage.findUniqueOrThrow({ where: { id: reply.id } })).status,
    ).toBe("UNKNOWN");
    await deliverTicketReply(reply.id);
    expect(sinks().email.filter((email) => email.to === seeded.senderEmail)).toHaveLength(1);
  });

  it("rejects invalid reply data without persisting a message", async () => {
    const seeded = await ticket();
    for (const body of [
      { message: " ", responderName: "Support" },
      { message: "x".repeat(20001), responderName: "Support" },
      { message: "Hello", responderName: "Support", requestId: "invalid" },
    ]) {
      expect(
        (
          await (
            await api()
          )
            .post(`/tickets/${seeded.ticketNumber}/respond`)
            .set("Cookie", adminCookie())
            .send(body)
        ).status,
      ).toBe(400);
    }
    expect(await getTestPrisma().ticketMessage.count({ where: { ticketId: seeded.id } })).toBe(0);
  });
});
