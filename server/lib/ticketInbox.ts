import { createHash, randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import PostalMime, { type Email } from "postal-mime";
import { convert } from "html-to-text";
import { prisma } from "./prisma.js";
import { ensureTicketHistory } from "./ticketMessages.js";
import { splitEmailReply } from "../../shared/tickets.js";
import type { TicketInboxStatus } from "../../shared/tickets.js";

export function ticketInboxConfig() {
  const host = "imap.porkbun.com";
  const user = (process.env.EMAIL_USER || "").trim();
  const pass = process.env.EMAIL_PASSWORD;
  if ((process.env.EMAIL_HOST || "smtp.porkbun.com") !== "smtp.porkbun.com" || !user || !pass) {
    return null;
  }
  return {
    host,
    user,
    pass,
    port: 993,
    mailbox: "INBOX",
    id: createHash("sha256").update(`${host}:${user.toLowerCase()}:INBOX`).digest("hex"),
  };
}

export async function ticketInboxStatus(): Promise<TicketInboxStatus> {
  const config = ticketInboxConfig();
  if (!config) {
    return { configured: false, lastSyncAt: null, hasError: false };
  }
  const state = await prisma.ticketInboxSync.findUnique({ where: { id: config.id } });
  return {
    configured: true,
    lastSyncAt: state?.lastSyncAt?.toISOString() || null,
    hasError: state?.hasError || false,
  };
}

export function emailReferences(value: string | undefined): string[] {
  return [...new Set(value?.match(/<[^<>\s]{1,500}>/g) || [])].slice(-50);
}

export async function importTicketEmail(email: Email, inboxAddress: string): Promise<boolean> {
  const from = email.from?.address?.toLowerCase().trim();
  const recipients = [...(email.to || []), ...(email.cc || [])].flatMap((address) => {
    if (address.address) {
      return [address.address.toLowerCase()];
    }
    return (address.group || []).map((entry) => entry.address.toLowerCase());
  });
  if (email.deliveredTo) {
    recipients.push(email.deliveredTo.toLowerCase());
  }
  if (
    !from ||
    !recipients.includes(inboxAddress.toLowerCase()) ||
    !email.messageId ||
    !/^<[^<>\r\n\s]{1,500}>$/.test(email.messageId)
  ) {
    return false;
  }
  const automatic = email.headers.find((header) => header.key === "auto-submitted")?.value;
  if (automatic && automatic.toLowerCase() !== "no") {
    return false;
  }
  const references = emailReferences(`${email.references || ""} ${email.inReplyTo || ""}`);
  if (!references.some((id) => id.startsWith("<seatping.ticket."))) {
    return false;
  }
  const ticket = await prisma.ticket.findFirst({
    where: {
      senderEmail: { equals: from, mode: "insensitive" },
      OR: [
        { emailThreadId: { in: references } },
        { thread: { some: { emailMessageId: { in: references }, isTeamResponse: true } } },
      ],
    },
  });
  if (!ticket) {
    return false;
  }
  if (await prisma.ticketMessage.findUnique({ where: { emailMessageId: email.messageId } })) {
    return false;
  }
  let text = email.text?.trim();
  if (!text && email.html && email.html.length <= 200000) {
    text = convert(email.html, {
      wordwrap: false,
      limits: { maxDepth: 30, maxChildNodes: 10000, maxInputLength: 200000 },
      selectors: [
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "img", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
      ],
    }).trim();
  }
  if (!text || text.length > 200000) {
    return false;
  }
  const body = splitEmailReply(text);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${ticket.id} FOR UPDATE`;
    await ensureTicketHistory(tx, ticket);
    const inserted = await tx.ticketMessage.createMany({
      data: [
        {
          ticketId: ticket.id,
          sender: email.from?.name || ticket.senderName,
          senderEmail: from,
          message: body.message,
          quotedText: body.quotedText,
          isTeamResponse: false,
          status: "RECEIVED",
          emailMessageId: email.messageId,
          inReplyTo: emailReferences(email.inReplyTo)[0] || null,
          references,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "open", updatedAt: new Date() },
      });
    }
    return inserted.count > 0;
  });
  return result;
}

export async function syncTicketInbox(): Promise<{ imported: number; skipped: boolean }> {
  await prisma.ticketMessage.updateMany({
    where: { status: "SENDING", sendStartedAt: { lt: new Date(Date.now() - 120000) } },
    data: { status: "UNKNOWN" },
  });
  const { enqueueNotification } = await import("./notifications.js");
  const pending = await prisma.ticketMessage.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 60000) } },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  for (const reply of pending) {
    await enqueueNotification({ type: "ticket_reply", messageId: reply.id });
  }
  const config = ticketInboxConfig();
  if (!config) {
    return { imported: 0, skipped: true };
  }
  await prisma.ticketInboxSync.upsert({
    where: { id: config.id },
    create: { id: config.id },
    update: {},
  });
  const owner = randomUUID();
  const claim = await prisma.ticketInboxSync.updateMany({
    where: { id: config.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 55000) },
  });
  if (!claim.count) {
    return { imported: 0, skipped: true };
  }
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    maxLiteralSize: 2200000,
    maxResponseSize: 2400000,
  });
  client.on("error", () => {});
  let imported = 0;
  const timer = setTimeout(() => client.close(), 45000);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.mailbox, { readOnly: true });
    try {
      if (!client.mailbox) {
        throw new Error("Inbox unavailable");
      }
      const validity = String(client.mailbox.uidValidity);
      const state = await prisma.ticketInboxSync.findUniqueOrThrow({ where: { id: config.id } });
      let cursor = state.lastUid;
      if (state.uidValidity !== validity) {
        cursor = 0;
      }
      const found = await client.search(
        {
          uid: `${cursor + 1}:*`,
          or: [
            { header: { "In-Reply-To": "<seatping.ticket." } },
            { header: { References: "<seatping.ticket." } },
          ],
        },
        { uid: true },
      );
      const uids = (found || [])
        .filter((uid) => uid > cursor)
        .sort((a, b) => a - b)
        .slice(0, 25);
      for (const uid of uids) {
        const metadata = await client.fetchOne(String(uid), { size: true }, { uid: true });
        if (metadata && metadata.size && metadata.size <= 2000000) {
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (message && message.source) {
            const email = await PostalMime.parse(message.source, {
              maxNestingDepth: 30,
              maxHeadersSize: 100000,
              maxPartCount: 100,
              maxRfc822NestingDepth: 1,
            });
            if (await importTicketEmail(email, config.user)) {
              imported += 1;
            }
          }
        }
        cursor = uid;
        await prisma.ticketInboxSync.updateMany({
          where: { id: config.id, leaseOwner: owner },
          data: { lastUid: cursor, uidValidity: validity },
        });
      }
      await prisma.ticketInboxSync.updateMany({
        where: { id: config.id, leaseOwner: owner },
        data: { lastSyncAt: new Date(), hasError: false, uidValidity: validity, lastUid: cursor },
      });
    } finally {
      lock.release();
    }
    return { imported, skipped: false };
  } catch {
    await prisma.ticketInboxSync.updateMany({
      where: { id: config.id, leaseOwner: owner },
      data: { hasError: true },
    });
    throw new Error("Ticket email sync failed");
  } finally {
    clearTimeout(timer);
    client.close();
    await prisma.ticketInboxSync.updateMany({
      where: { id: config.id, leaseOwner: owner },
      data: { leaseOwner: null, leaseUntil: null },
    });
  }
}
