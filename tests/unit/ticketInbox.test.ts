import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailReferences,
  importTicketEmail,
  syncTicketInbox,
  ticketInboxConfig,
  ticketInboxStatus,
} from "../../server/lib/ticketInbox.js";
import { splitEmailReply } from "../../shared/tickets.js";
import type { Email } from "postal-mime";

const mocks = vi.hoisted(() => ({
  state: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  message: { updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), createMany: vi.fn() },
  ticket: { findFirst: vi.fn(), update: vi.fn() },
  query: vi.fn(),
  mailbox: { current: { uidValidity: 1n } as { uidValidity: bigint } | false },
  connect: vi.fn(),
  lock: vi.fn(),
  release: vi.fn(),
  search: vi.fn(),
  fetch: vi.fn(),
  close: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("../../server/lib/prisma.js", () => ({
  prisma: {
    ticketInboxSync: mocks.state,
    ticketMessage: mocks.message,
    ticket: mocks.ticket,
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({ ticketMessage: mocks.message, ticket: mocks.ticket, $queryRaw: mocks.query }),
  },
}));
vi.mock("../../server/lib/ticketMessages.js", () => ({ ensureTicketHistory: vi.fn() }));
vi.mock("../../server/lib/notifications.js", () => ({ enqueueNotification: mocks.enqueue }));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    get mailbox() {
      return mocks.mailbox.current;
    }
    on = vi.fn();
    connect = mocks.connect;
    getMailboxLock = mocks.lock;
    search = mocks.search;
    fetchOne = mocks.fetch;
    close = mocks.close;
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EMAIL_HOST", "smtp.porkbun.com");
  vi.stubEnv("EMAIL_USER", "sender@test.invalid");
  vi.stubEnv("EMAIL_PASSWORD", "test-password");
  mocks.message.findMany.mockResolvedValue([]);
  mocks.state.updateMany.mockResolvedValue({ count: 1 });
  mocks.state.findUniqueOrThrow.mockResolvedValue({ lastUid: 4, uidValidity: "1" });
  mocks.lock.mockResolvedValue({ release: mocks.release });
  mocks.search.mockResolvedValue([]);
  mocks.mailbox.current = { uidValidity: 1n };
  mocks.ticket.findFirst.mockResolvedValue({ id: "ticket-1", senderName: "Guest" });
  mocks.message.createMany.mockResolvedValue({ count: 1 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Ticket Inbox Sync", () => {
  it("reports saved sync errors and the timestamp without exposing provider details", async () => {
    const lastSyncAt = new Date("2026-10-01T12:00:00Z");
    mocks.state.findUnique.mockResolvedValue({ lastSyncAt, hasError: true });
    expect(await ticketInboxStatus()).toEqual({
      configured: true,
      lastSyncAt: lastSyncAt.toISOString(),
      hasError: true,
    });
    mocks.state.findUnique.mockResolvedValue(null);
    expect(await ticketInboxStatus()).toEqual({
      configured: true,
      lastSyncAt: null,
      hasError: false,
    });
  });

  it("imports valid replies in UID order and ignores already processed messages", async () => {
    mocks.search.mockResolvedValue([7, 3, 5]);
    const source = Buffer.from(
      [
        "From: Guest <guest@test.invalid>",
        "To: sender@test.invalid",
        "Message-ID: <reply@test.invalid>",
        "In-Reply-To: <seatping.ticket.original@test.invalid>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Thank you!",
      ].join("\r\n"),
    );
    mocks.fetch.mockImplementation(async (_uid: string, query: { size?: boolean }) => {
      if (query.size) {
        return { size: source.length };
      }
      return { source };
    });
    expect(await syncTicketInbox()).toEqual({ imported: 2, skipped: false });
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual(["5", "5", "7", "7"]);
    expect(mocks.message.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ message: "Thank you!", status: "RECEIVED" })],
        skipDuplicates: true,
      }),
    );
    expect(mocks.state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastUid: 7, uidValidity: "1" } }),
    );
  });

  it.each([false, { size: 0 }, { size: 10 }])(
    "advances past missing metadata or message source: %j",
    async (metadata) => {
      mocks.search.mockResolvedValue([5]);
      mocks.fetch.mockResolvedValueOnce(metadata).mockResolvedValueOnce(false);
      expect(await syncTicketInbox()).toEqual({ imported: 0, skipped: false });
      expect(mocks.message.createMany).not.toHaveBeenCalled();
      expect(mocks.state.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastUid: 5, uidValidity: "1" } }),
      );
    },
  );

  it("releases the mailbox lock when the server has no selected mailbox", async () => {
    mocks.mailbox.current = false;
    await expect(syncTicketInbox()).rejects.toThrow("Ticket email sync failed");
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("handles a search with no returned UID list", async () => {
    mocks.search.mockResolvedValue(false);
    expect(await syncTicketInbox()).toEqual({ imported: 0, skipped: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("uses the existing email credentials for the Porkbun inbox", () => {
    expect(ticketInboxConfig()).toMatchObject({
      host: "imap.porkbun.com",
      port: 993,
      user: "sender@test.invalid",
      pass: "test-password",
      mailbox: "INBOX",
    });
    vi.stubEnv("EMAIL_HOST", "smtp.other.test");
    expect(ticketInboxConfig()).toBeNull();
    vi.stubEnv("EMAIL_HOST", "smtp.porkbun.com");
    vi.stubEnv("EMAIL_USER", "");
    expect(ticketInboxConfig()).toBeNull();
  });
  it("reports missing configuration and retries pending outbound jobs without opening an inbox", async () => {
    vi.stubEnv("EMAIL_PASSWORD", "");
    mocks.message.findMany.mockResolvedValue([{ id: "pending" }]);
    expect(await ticketInboxStatus()).toEqual({
      configured: false,
      lastSyncAt: null,
      hasError: false,
    });
    expect(await syncTicketInbox()).toEqual({ imported: 0, skipped: true });
    expect(mocks.enqueue).toHaveBeenCalledWith({ type: "ticket_reply", messageId: "pending" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("respects the shared database lease", async () => {
    mocks.state.updateMany.mockResolvedValue({ count: 0 });
    expect(await syncTicketInbox()).toEqual({ imported: 0, skipped: true });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("opens the inbox read-only and resumes after the stored UID", async () => {
    expect(await syncTicketInbox()).toEqual({ imported: 0, skipped: false });
    expect(mocks.lock).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ uid: "5:*" }), {
      uid: true,
    });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.state.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { leaseOwner: null, leaseUntil: null } }),
    );
  });
  it("resets UID position when the mailbox validity changes and bounds large messages", async () => {
    mocks.state.findUniqueOrThrow.mockResolvedValue({ lastUid: 99, uidValidity: "old" });
    mocks.search.mockResolvedValue([1, 2]);
    mocks.fetch.mockResolvedValue({ size: 3000000 });
    await syncTicketInbox();
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ uid: "1:*" }), {
      uid: true,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastUid: 2, uidValidity: "1" } }),
    );
  });
  it("releases the lease and reports a safe error when the mailbox fails", async () => {
    mocks.connect.mockRejectedValue(new Error("private provider failure"));
    await expect(syncTicketInbox()).rejects.toThrow("Ticket email sync failed");
    expect(mocks.state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hasError: true } }),
    );
    expect(mocks.state.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { leaseOwner: null, leaseUntil: null } }),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("persists a reset cursor even when a replaced mailbox is empty", async () => {
    mocks.state.findUniqueOrThrow.mockResolvedValue({ lastUid: 99, uidValidity: "old" });
    await syncTicketInbox();
    expect(mocks.state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastUid: 0, uidValidity: "1" }) }),
    );
  });
  it("limits reference extraction and preserves unquoted replies", () => {
    expect(emailReferences("junk <a@b> <a@b> <c@d>\r\n")).toEqual(["<a@b>", "<c@d>"]);
    expect(splitEmailReply("Hello\r\n\r\n> Previous reply")).toEqual({
      message: "Hello",
      quotedText: "> Previous reply",
    });
    expect(splitEmailReply("A complete reply")).toEqual({
      message: "A complete reply",
      quotedText: null,
    });
    expect(splitEmailReply("> Only quoted content")).toEqual({
      message: "> Only quoted content",
      quotedText: null,
    });
  });
});

describe("Ticket Reply Validation", () => {
  const reply = (fields: Partial<Email> = {}): Email => ({
    headers: [],
    attachments: [],
    from: { name: "Guest", address: "guest@test.invalid" },
    to: [{ name: "Support", address: "sender@test.invalid" }],
    messageId: "<reply@test.invalid>",
    inReplyTo: "<seatping.ticket.original@test.invalid>",
    text: "Thanks for your help.",
    ...fields,
  });

  it.each([
    { from: undefined },
    { to: undefined },
    { messageId: undefined },
    { messageId: "malformed" },
    { headers: [{ key: "auto-submitted", value: "auto-replied" }] },
    { inReplyTo: "<unrelated@test.invalid>" },
  ])(
    "rejects unauthenticated or automated email without looking up tickets: %j",
    async (fields) => {
      expect(await importTicketEmail(reply(fields), "sender@test.invalid")).toBe(false);
      expect(mocks.ticket.findFirst).not.toHaveBeenCalled();
      expect(mocks.message.createMany).not.toHaveBeenCalled();
    },
  );

  it("accepts group recipients, cc, and delivered-to addresses", async () => {
    for (const fields of [
      { to: [{ name: "Support Group", group: [{ name: "", address: "sender@test.invalid" }] }] },
      { to: undefined, cc: [{ name: "", address: "sender@test.invalid" }] },
      { to: undefined, deliveredTo: "SENDER@test.invalid" },
    ]) {
      expect(await importTicketEmail(reply(fields), "sender@test.invalid")).toBe(true);
    }
    expect(mocks.ticket.update).toHaveBeenCalledTimes(3);
  });

  it("ignores unknown threads and duplicate email message IDs", async () => {
    mocks.ticket.findFirst.mockResolvedValueOnce(null);
    expect(await importTicketEmail(reply(), "sender@test.invalid")).toBe(false);
    mocks.message.findUnique.mockResolvedValueOnce({ id: "existing" });
    expect(await importTicketEmail(reply(), "sender@test.invalid")).toBe(false);
    expect(mocks.message.createMany).not.toHaveBeenCalled();
  });

  it.each([
    { text: "" },
    { text: "x".repeat(200001) },
    { text: undefined, html: "x".repeat(200001) },
  ])("rejects empty and oversized message bodies", async (fields) => {
    expect(await importTicketEmail(reply(fields), "sender@test.invalid")).toBe(false);
    expect(mocks.message.createMany).not.toHaveBeenCalled();
  });

  it("converts HTML safely, preserves quoted content, and falls back to the ticket sender", async () => {
    expect(
      await importTicketEmail(
        reply({
          from: { name: "", address: "GUEST@test.invalid" },
          headers: [{ key: "auto-submitted", value: "no" }],
          text: undefined,
          html: "<p>Hello</p><script>secret()</script><p>&gt; Earlier reply</p>",
        }),
        "sender@test.invalid",
      ),
    ).toBe(true);
    expect(mocks.message.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            sender: "Guest",
            senderEmail: "guest@test.invalid",
            message: "Hello",
            quotedText: "> Earlier reply",
          }),
        ],
      }),
    );
  });

  it("does not reopen a ticket when another worker already inserted the reply", async () => {
    mocks.message.createMany.mockResolvedValue({ count: 0 });
    expect(await importTicketEmail(reply(), "sender@test.invalid")).toBe(false);
    expect(mocks.ticket.update).not.toHaveBeenCalled();
  });
});
