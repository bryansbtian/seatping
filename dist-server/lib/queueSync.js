// Keeps a logged-in customer's denormalized `queueingActivity` profile list in
// sync with their queue entries. Mirrors the pattern of `syncCustomerReservation`
// in reservations.ts. No-op for guest joins (no `customerId` on the entry).
//
// The source of truth for a *live* waiting ticket is still the Location.queue
// JSON (position + ETA are computed there). We deliberately do NOT denormalize
// position/ETA here — those change as the queue moves. Instead the profile card
// links to the live status page for active tickets, and renders stored history
// for terminal ones.
import { prisma } from "./prisma.js";
// Only "waiting" is live; everything else is terminal history.
const ACTIVE_QUEUE_STATUSES = ["waiting"];
/**
 * Upsert one queue entry into the customer's `queueingActivity` list. Keyed by
 * the entry's `queueToken` so repeated lifecycle events (waiting -> admitted ->
 * arrived, etc.) update the same card instead of duplicating it.
 */
export async function syncCustomerQueue(entry, opts) {
    if (!entry?.customerId)
        return;
    const user = await prisma.user.findUnique({
        where: { id: entry.customerId },
        select: { queueingActivity: true },
    });
    if (!user)
        return;
    const key = entry.queueToken ||
        `${entry.firstName ?? ""}${entry.lastName ?? ""}${entry.joinedAt ?? ""}`;
    const item = {
        id: key,
        queueToken: entry.queueToken ?? null,
        // Composite key the live status route accepts as its `:customerId` param.
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
    const list = (Array.isArray(user.queueingActivity) ? user.queueingActivity : []).filter((q) => (q?.id ?? null) !== key);
    list.unshift(item);
    await prisma.user.update({
        where: { id: entry.customerId },
        data: { queueingActivity: list },
    });
}
