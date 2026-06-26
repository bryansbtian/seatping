import { prisma } from "./prisma.js";

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
