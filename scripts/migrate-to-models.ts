// scripts/migrate-to-models.ts
//
// One-off, idempotent migration of the legacy JSON-array state on Location
// (queue / admittedCustomers / removedCustomers / reservations) into the new
// QueueEntry / Reservation / SlotCounter models. Also backfills
// Location.isPublished from restaurantProfile.isPublished.
//
// Safe to run repeatedly: QueueEntry rows are upserted on `queueToken`,
// Reservation rows on `manageToken`. The legacy JSON fields are NEVER modified
// or deleted — they remain as a fallback until the migration is verified.
//
// Usage:
//   npx tsx scripts/migrate-to-models.ts            # dry run (default), prints counts
//   npx tsx scripts/migrate-to-models.ts --commit   # actually writes
//
import "dotenv/config";
import crypto from "crypto";
import { prisma } from "../server/lib/prisma.js";
import { legacyKeyOf, reservationStatusToEnum } from "../server/lib/liveData.js";
import { recountSlots } from "../server/lib/reservationCapacity.js";

const COMMIT = process.argv.includes("--commit");
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function toDate(v: any, fallback?: Date): Date | null {
  if (!v) return fallback ?? null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? (fallback ?? null) : d;
}

/** Deterministic synthetic queueToken for legacy entries that never had one. */
function syntheticToken(locationId: string, legacyKey: string, bucket: string): string {
  return (
    "mig_" +
    crypto
      .createHash("sha1")
      .update(`${locationId}|${legacyKey}|${bucket}`)
      .digest("hex")
  );
}

function queueStatusFor(bucket: "queue" | "admitted" | "removed", entry: any): {
  status: string;
  finalStatus: string | null;
} {
  if (bucket === "queue") return { status: "WAITING", finalStatus: null };
  if (bucket === "removed") {
    return { status: entry?.status === "left" ? "LEFT" : "REMOVED", finalStatus: null };
  }
  // admitted bucket: derive from finalStatus
  const fs = entry?.finalStatus;
  if (fs === "arrived") return { status: "ARRIVED", finalStatus: "arrived" };
  if (fs === "no_show") return { status: "NO_SHOW", finalStatus: "no_show" };
  return { status: "ADMITTED", finalStatus: fs || "pending" };
}

async function run() {
  console.log(`\n=== migrate-to-models (${COMMIT ? "COMMIT" : "DRY RUN"}) ===\n`);

  const locations = await prisma.location.findMany();
  console.log(`Locations: ${locations.length}\n`);

  const counts = {
    queueEntries: 0,
    reservations: 0,
    isPublishedBackfilled: 0,
    locationsWithReservations: 0,
    skippedNoJoinedAt: 0,
  };

  for (const loc of locations) {
    const businessId = loc.businessId;

    // ---- Queue entries (queue + admitted + removed) --------------------
    const buckets: Array<["queue" | "admitted" | "removed", any[]]> = [
      ["queue", Array.isArray(loc.queue) ? (loc.queue as any[]) : []],
      [
        "admitted",
        Array.isArray(loc.admittedCustomers) ? (loc.admittedCustomers as any[]) : [],
      ],
      [
        "removed",
        Array.isArray(loc.removedCustomers) ? (loc.removedCustomers as any[]) : [],
      ],
    ];

    for (const [bucket, list] of buckets) {
      for (const entry of list) {
        if (!entry || typeof entry !== "object") continue;
        const joinedAt = toDate(entry.joinedAt, toDate(loc.createdAt) || new Date());
        if (!joinedAt) {
          counts.skippedNoJoinedAt++;
          continue;
        }
        const legacyKey = legacyKeyOf(entry.firstName, entry.lastName, entry.joinedAt);
        const queueToken: string =
          (typeof entry.queueToken === "string" && entry.queueToken) ||
          syntheticToken(loc.id, legacyKey, bucket);
        const { status, finalStatus } = queueStatusFor(bucket, entry);

        counts.queueEntries++;
        if (!COMMIT) continue;

        const data = {
          legacyKey,
          locationId: loc.id,
          businessId,
          customerId:
            typeof entry.customerId === "string" && OBJECT_ID_RE.test(entry.customerId)
              ? entry.customerId
              : null,
          firstName: String(entry.firstName ?? ""),
          lastName: String(entry.lastName ?? ""),
          guestCount: Number(entry.partySize ?? entry.numGuests) || 0,
          notificationMethod: String(entry.notificationMethod ?? ""),
          phone: entry.phoneNumber ? String(entry.phoneNumber) : null,
          countryCode: entry.countryCode ? String(entry.countryCode) : null,
          email: entry.email ? String(entry.email) : null,
          smsConsent: Boolean(entry.smsConsent),
          smsMarketingConsent: Boolean(entry.smsMarketingConsent),
          status: status as any,
          finalStatus,
          joinedAt,
          admittedAt: toDate(entry.admittedAt),
          arrivedAt: toDate(entry.confirmedAt),
          noShowAt: toDate(entry.noShowMarkedAt),
          removedAt: toDate(entry.removedAt),
          leftAt: toDate(entry.leftAt),
        };

        await prisma.queueEntry.upsert({
          where: { queueToken },
          create: { queueToken, ...data },
          update: data, // re-run keeps rows aligned with the source JSON
        });
      }
    }

    // ---- Reservations --------------------------------------------------
    const reservations = Array.isArray(loc.reservations)
      ? (loc.reservations as any[])
      : [];
    if (reservations.length) counts.locationsWithReservations++;

    for (const r of reservations) {
      if (!r || typeof r !== "object") continue;
      const manageToken: string =
        (typeof r.manageToken === "string" && r.manageToken) ||
        crypto.randomBytes(24).toString("hex");

      counts.reservations++;
      if (!COMMIT) continue;

      const idValid = typeof r.id === "string" && OBJECT_ID_RE.test(r.id);
      const data = {
        locationId: loc.id,
        businessId,
        businessUsername: r.businessUsername ?? loc.businessUsername ?? null,
        customerId:
          typeof r.customerId === "string" && OBJECT_ID_RE.test(r.customerId)
            ? r.customerId
            : null,
        firstName: String(r.firstName ?? ""),
        lastName: String(r.lastName ?? ""),
        name: r.name ?? null,
        guestCount: Number(r.partySize) || 0,
        email: String(r.email ?? ""),
        phone: r.phone ? String(r.phone) : null,
        countryCode: r.countryCode ? String(r.countryCode) : null,
        contactMethod: r.contactMethod ?? "email",
        reservationDateTime: String(r.reservationDateTime ?? ""),
        status: reservationStatusToEnum(r.status) as any,
        notes: r.notes ? String(r.notes) : null,
        source: r.source ?? "seatping_public",
        reminderEmailSentAt: toDate(r.reminderEmailSentAt),
        cancelledAt: toDate(r.cancelledAt),
        arrivedAt: toDate(r.arrivedAt),
        completedAt: toDate(r.completedAt),
        noShowAt: toDate(r.noShowAt),
      };

      await prisma.reservation.upsert({
        where: { manageToken },
        // Preserve the legacy id as the Mongo _id when it's a valid ObjectId
        // (it always is — randomBytes(12).toString("hex")), so customer-profile
        // dedup and dashboard PATCH-by-id keep working.
        create: { manageToken, ...(idValid ? { id: r.id } : {}), ...data },
        update: data,
      });
    }

    // ---- isPublished backfill -----------------------------------------
    const rp = (loc.restaurantProfile || {}) as any;
    const shouldPublish = rp?.isPublished === true;
    if (shouldPublish && loc.isPublished !== true) {
      counts.isPublishedBackfilled++;
      if (COMMIT) {
        await prisma.location.update({
          where: { id: loc.id },
          data: { isPublished: true },
        });
      }
    }
  }

  // ---- Seed SlotCounters from the now-migrated reservations -------------
  if (COMMIT) {
    const locsWithRes = locations.filter(
      (l) => Array.isArray(l.reservations) && (l.reservations as any[]).length,
    );
    for (const l of locsWithRes) {
      await recountSlots(l.id);
    }
    console.log(`Seeded SlotCounters for ${locsWithRes.length} location(s).`);
  }

  console.log("\n--- Summary ---");
  console.table(counts);
  console.log(
    COMMIT
      ? "\nCOMMIT complete. Legacy JSON fields left intact as fallback.\n"
      : "\nDRY RUN only — nothing written. Re-run with --commit to apply.\n",
  );
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Migration failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
