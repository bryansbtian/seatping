// scripts/backfill-guests.ts
//
// One-off, idempotent backfill that builds GuestProfile rows (Guest CRM / P3A)
// from existing QueueEntry + Reservation rows. New visits maintain profiles
// automatically via the write paths; this seeds profiles for all historical
// data.
//
// Safe to run repeatedly: upsertGuestForVisit() matches an existing profile by
// normalized phone/email (scoped to business + location) and merges source row
// ids without duplicating, then recomputes stats. It NEVER deletes anything and
// never touches the source QueueEntry/Reservation rows.
//
// Usage:
//   npx tsx scripts/backfill-guests.ts            # dry run (default), prints counts
//   npx tsx scripts/backfill-guests.ts --commit   # actually writes profiles
//
import "dotenv/config";
import { prisma } from "../server/lib/prisma.js";
import {
  normalizeEmail,
  normalizePhone,
  upsertGuestForVisit,
} from "../server/lib/guests.js";

const COMMIT = process.argv.includes("--commit");

/** A grouping key for one real guest within a location, or null if untrackable. */
function groupKey(
  locationId: string,
  phone: string | null,
  countryCode: string | null,
  email: string | null,
): string | null {
  const np = normalizePhone(phone, countryCode);
  const ne = normalizeEmail(email);
  if (!np && !ne) return null;
  // Prefer phone as the key, then email — mirrors the match precedence.
  return `${locationId}|${np ? `p:${np}` : `e:${ne}`}`;
}

async function run() {
  console.log(`\n=== backfill-guests (${COMMIT ? "COMMIT" : "DRY RUN"}) ===\n`);

  const businesses = await prisma.business.findMany({
    select: { id: true, username: true },
  });

  let totalQueue = 0;
  let totalReservations = 0;
  let untrackable = 0;
  const distinctGuests = new Set<string>();

  for (const business of businesses) {
    const [queueRows, reservationRows] = await Promise.all([
      prisma.queueEntry.findMany({ where: { businessId: business.id } }),
      prisma.reservation.findMany({ where: { businessId: business.id } }),
    ]);

    if (!queueRows.length && !reservationRows.length) continue;

    for (const q of queueRows) {
      totalQueue += 1;
      const key = groupKey(q.locationId, q.phone, q.countryCode, q.email);
      if (!key) {
        untrackable += 1;
        continue;
      }
      distinctGuests.add(key);
      if (COMMIT) {
        await upsertGuestForVisit({
          businessId: q.businessId,
          businessUsername: business.username,
          locationId: q.locationId,
          firstName: q.firstName,
          lastName: q.lastName,
          phone: q.phone,
          countryCode: q.countryCode,
          email: q.email,
          queueEntryId: q.id,
        });
      }
    }

    for (const r of reservationRows) {
      totalReservations += 1;
      const key = groupKey(r.locationId, r.phone, r.countryCode, r.email);
      if (!key) {
        untrackable += 1;
        continue;
      }
      distinctGuests.add(key);
      if (COMMIT) {
        await upsertGuestForVisit({
          businessId: r.businessId,
          businessUsername: business.username,
          locationId: r.locationId,
          firstName: r.firstName,
          lastName: r.lastName,
          phone: r.phone,
          countryCode: r.countryCode,
          email: r.email,
          reservationId: r.id,
        });
      }
    }

    console.log(
      `  business ${business.username}: ${queueRows.length} queue, ${reservationRows.length} reservations`,
    );
  }

  const existingProfiles = await prisma.guestProfile.count();

  console.log("\n--- summary ---");
  console.log(`  queue entries scanned:       ${totalQueue}`);
  console.log(`  reservations scanned:        ${totalReservations}`);
  console.log(`  rows without phone/email:    ${untrackable} (skipped)`);
  console.log(`  distinct guests (estimate):  ${distinctGuests.size}`);
  console.log(`  guest_profiles now in db:    ${existingProfiles}`);
  if (!COMMIT) {
    console.log("\n  DRY RUN — nothing written. Re-run with --commit to apply.\n");
  } else {
    console.log("\n  COMMIT complete.\n");
  }
}

run()
  .catch((err) => {
    console.error("[backfill-guests] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
