import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { measureDatabase } from "./performanceTiming.js";

export function withBusinessCreditLock<T>(
  businessId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await measureDatabase(
      "credit.lock",
      () => tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`,
    );
    return work(tx);
  });
}
