import { prisma } from "./prisma.js";

/**
 * Build a human-readable ticket number like SALES-20260611-0007.
 *
 * The sequence is derived from a count of today's tickets, so two concurrent
 * submissions can race to the same number; ticketNumber is @unique, so the
 * loser's create fails rather than producing a duplicate. Acceptable at the
 * current inquiry volume.
 */
export async function generateTicketNumber(
  type: "SALES" | "FEEDBACK",
): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");

  const startOfDay = new Date(date.setHours(0, 0, 0, 0));
  const endOfDay = new Date(date.setHours(23, 59, 59, 999));

  const count = await prisma.ticket.count({
    where: {
      type: type.toLowerCase(),
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
  });

  return `${type}-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}
