
import { prisma } from "./prisma.js";

export type CustomerQueueStatus =
  | "waiting"
  | "admitted"
  | "arrived"
  | "no_show"
  | "removed"
  | "left";

const ACTIVE_QUEUE_STATUSES: CustomerQueueStatus[] = ["waiting"];

export async function syncCustomerQueue(
  entry: any,
  opts: {
    status: CustomerQueueStatus;
    businessUsername?: string | null;
    businessName?: string | null;
    locationName?: string | null;
    locationId?: string | null;
  },
): Promise<void> {
  if (!entry?.customerId) return;

  const user = await prisma.user.findUnique({
    where: { id: entry.customerId },
    select: { queueingActivity: true },
  });
  if (!user) return;

  const key =
    entry.queueToken ||
    `${entry.firstName ?? ""}${entry.lastName ?? ""}${entry.joinedAt ?? ""}`;

  const item = {
    id: key,
    queueToken: entry.queueToken ?? null,
    entryKey: `${entry.firstName ?? ""}${entry.lastName ?? ""}${entry.joinedAt ?? ""}`,
    businessUsername: opts.businessUsername ?? entry.businessUsername ?? null,
    businessName: opts.businessName ?? null,
    locationName: opts.locationName ?? null,
    locationId: opts.locationId ?? entry.locationId ?? null,
    joinedAt: entry.joinedAt ?? null,
    partySize: Number(entry.partySize ?? entry.numGuests) || 0,
    notificationMethod: entry.notificationMethod ?? null,
    status: opts.status,
    active: ACTIVE_QUEUE_STATUSES.includes(opts.status),
    admittedAt: entry.admittedAt ?? null,
    confirmedAt: entry.confirmedAt ?? null,
    noShowMarkedAt: entry.noShowMarkedAt ?? null,
    removedAt: entry.removedAt ?? null,
    leftAt: entry.leftAt ?? null,
  };

  const list = (
    Array.isArray(user.queueingActivity) ? (user.queueingActivity as any[]) : []
  ).filter((q) => (q?.id ?? null) !== key);
  list.unshift(item);

  await prisma.user.update({
    where: { id: entry.customerId },
    data: { queueingActivity: list as any },
  });
}
