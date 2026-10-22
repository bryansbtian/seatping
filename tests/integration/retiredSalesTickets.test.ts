import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";

afterEach(clearTestDatabase);

describe("Retired Sales Ticket Migration", () => {
  it("preserves the conversation and original details while converting the ticket to support", async () => {
    const db = getTestPrisma();
    const ticket = await db.ticket.create({
      data: {
        ticketNumber: "SALES-MIGRATION-001",
        type: "sales",
        subject: "Campaign Setup Question",
        senderName: "Migration Fixture",
        senderEmail: "migration@example.test",
        data: { businessWebsite: "https://example.test", budget: "100", feedbackType: "" },
        messages: [{ message: "Please help configure campaigns." }],
        thread: {
          create: {
            sender: "Migration Fixture",
            senderEmail: "migration@example.test",
            message: "Please help configure campaigns.",
            isTeamResponse: false,
            status: "RECEIVED",
          },
        },
      },
      include: { thread: true },
    });
    const sql = readFileSync(
      "prisma/migrations/20261020185000_retire_sales_tickets/migration.sql",
      "utf8",
    );
    await db.$executeRawUnsafe(sql);
    await db.$executeRawUnsafe(sql);
    const converted = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { thread: true },
    });
    expect(converted.type).toBe("feedback");
    expect(converted.data).toEqual({
      businessWebsite: "https://example.test",
      budget: "100",
      feedbackType: "support",
    });
    expect(converted.ticketNumber).toBe(ticket.ticketNumber);
    expect(converted.createdAt).toEqual(ticket.createdAt);
    expect(converted.messages).toEqual(ticket.messages);
    expect(converted.thread).toEqual(ticket.thread);
  });
});
