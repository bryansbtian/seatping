import { randomUUID } from "node:crypto";
import { Prisma, type Ticket, type TicketMessage } from "@prisma/client";
import { prisma } from "./prisma.js";
import { sendEmailDetailed, renderEmail, p, calloutBox, esc } from "./email.js";
import type { TicketChatMessage } from "../../shared/tickets.js";

export function ticketEmailMessageId(): string {
  let domain = "seatping.biz";
  const address = process.env.EMAIL_USER || "";
  const candidate = address.split("@")[1];
  if (candidate && /^[a-z0-9.-]+$/i.test(candidate)) {
    domain = candidate;
  }
  return `<seatping.ticket.${randomUUID()}@${domain}>`;
}

export function serializeTicket(ticket: Ticket & { thread?: TicketMessage[] }) {
  const { thread, ...record } = ticket;
  if (thread?.length) {
    const messages: TicketChatMessage[] = thread.map((message) => {
      let timestamp = message.createdAt.toISOString();
      const legacy = message.id.match(/-legacy-(\d+)$/);
      if (legacy && Array.isArray(ticket.messages)) {
        const original = ticket.messages[Number(legacy[1]) - 1];
        if (
          original &&
          typeof original === "object" &&
          !Array.isArray(original) &&
          typeof original.timestamp === "string" &&
          !Number.isNaN(new Date(original.timestamp).getTime())
        ) {
          timestamp = original.timestamp;
        }
      }
      return {
        id: message.id,
        sender: message.sender,
        message: message.message,
        quotedText: message.quotedText,
        timestamp,
        isTeamResponse: message.isTeamResponse,
        status: message.status as TicketChatMessage["status"],
      };
    });
    return { ...record, messages };
  }
  return record;
}

export async function ensureTicketHistory(
  tx: Prisma.TransactionClient,
  ticket: Ticket,
): Promise<void> {
  if (!Array.isArray(ticket.messages)) {
    return;
  }
  const existing = await tx.ticketMessage.count({ where: { ticketId: ticket.id } });
  if (existing) {
    return;
  }
  const rows: Prisma.TicketMessageCreateManyInput[] = [];
  for (const [index, entry] of ticket.messages.entries()) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.message !== "string" ||
      typeof entry.sender !== "string"
    ) {
      continue;
    }
    let createdAt = ticket.createdAt;
    if (typeof entry.timestamp === "string") {
      const parsed = new Date(entry.timestamp);
      if (!Number.isNaN(parsed.getTime())) {
        createdAt = parsed;
      }
    }
    let status = "RECEIVED";
    if (entry.isTeamResponse === true) {
      status = "SENT";
    }
    rows.push({
      id: `${ticket.id}-legacy-${index + 1}`,
      ticketId: ticket.id,
      sender: entry.sender,
      message: entry.message,
      isTeamResponse: entry.isTeamResponse === true,
      status,
      createdAt,
    });
  }
  if (rows.length) {
    await tx.ticketMessage.createMany({ data: rows, skipDuplicates: true });
  }
}

export async function queueTicketReply(
  ticketNumber: string,
  message: string,
  sender: string,
  requestId: string,
) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { ticketNumber } });
    if (!ticket) {
      return null;
    }
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticket.id} FOR UPDATE`;
    const existing = await tx.ticketMessage.findUnique({ where: { requestId } });
    if (existing) {
      if (
        existing.ticketId !== ticket.id ||
        existing.message !== message ||
        existing.sender !== sender
      ) {
        throw new Error("Reply request conflicts with an existing message");
      }
      return existing;
    }
    await ensureTicketHistory(tx, ticket);
    const parent = await tx.ticketMessage.findFirst({
      where: {
        ticketId: ticket.id,
        emailMessageId: { not: null },
        status: { in: ["SENT", "RECEIVED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    let inReplyTo = ticket.emailThreadId;
    let references: string[] = [];
    if (inReplyTo) {
      references.push(inReplyTo);
    }
    if (parent?.emailMessageId) {
      inReplyTo = parent.emailMessageId;
      references = [...new Set([...references, ...parent.references, parent.emailMessageId])].slice(
        -30,
      );
    }
    const reply = await tx.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        sender,
        senderEmail: process.env.EMAIL_USER || null,
        message,
        isTeamResponse: true,
        status: "PENDING",
        emailMessageId: ticketEmailMessageId(),
        inReplyTo,
        references,
        requestId,
      },
    });
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "in_progress", updatedAt: new Date() },
    });
    return reply;
  });
}

export async function deliverTicketReply(id: string): Promise<void> {
  const claimed = await prisma.ticketMessage.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "SENDING", sendStartedAt: new Date() },
  });
  if (!claimed.count) {
    return;
  }
  const reply = await prisma.ticketMessage.findUnique({ where: { id }, include: { ticket: true } });
  if (!reply) {
    return;
  }
  try {
    const sent = await sendEmailDetailed(
      {
        to: reply.ticket.senderEmail,
        subject: `Re: ${reply.ticket.subject} [Ticket #${reply.ticket.ticketNumber}]`,
        replyTo: process.env.EMAIL_USER,
        messageId: reply.emailMessageId || undefined,
        inReplyTo: reply.inReplyTo || undefined,
        references: reply.references,
        html: renderEmail({
          heading: "Response To Your Feedback",
          preheader: "Your SeatPing Ticket Has A Reply",
          bodyHtml: `${p(`Hi ${esc(reply.ticket.senderName)},`)}${calloutBox(esc(reply.message).replace(/\n/g, "<br>"))}${p(`Best regards,<br>${esc(reply.sender)}<br>The SeatPing Team`)}${p("Reply directly to this email to continue the conversation.")}`,
        }),
      },
      0,
    );
    let status = "SENT";
    if (!sent.ok) {
      status = "FAILED";
      if (sent.deliveryUncertain) {
        status = "UNKNOWN";
      }
    }
    await prisma.ticketMessage.update({ where: { id }, data: { status } });
  } catch {
    await prisma.ticketMessage.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "UNKNOWN" },
    });
  }
}

export async function failTicketReply(id: string): Promise<void> {
  await prisma.ticketMessage.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "FAILED" },
  });
}
