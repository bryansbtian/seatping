// scripts/migrate-pending-reservations.ts
//
// One-off, idempotent migration that converts any legacy reservations with
// status "PENDING" to "CONFIRMED". The deprecated pending (manual-approval)
// reservation flow has been removed from the product and the value was dropped
// from the ReservationStatus enum, so this must run BEFORE deploying the schema
// change — otherwise the Prisma client would fail to deserialize old PENDING
// rows.
//
// Uses raw MongoDB commands (not the typed Prisma API) so it keeps working even
// after "PENDING" is gone from the generated enum type.
//
// Safe to run repeatedly: once every PENDING row is CONFIRMED the update simply
// matches nothing. It never deletes anything.
//
// Usage:
//   npx tsx scripts/migrate-pending-reservations.ts            # dry run, prints counts
//   npx tsx scripts/migrate-pending-reservations.ts --commit   # actually converts
//
import "dotenv/config";
import { prisma } from "../server/lib/prisma.js";

const COMMIT = process.argv.includes("--commit");
const COLLECTION = "reservations";

async function countPending(): Promise<number> {
  const res = (await prisma.$runCommandRaw({
    count: COLLECTION,
    query: { status: "PENDING" },
  })) as { n?: number };
  return Number(res?.n ?? 0);
}

async function main() {
  const before = await countPending();
  console.log(`[migrate-pending] reservations with status=PENDING: ${before}`);

  if (before === 0) {
    console.log("[migrate-pending] nothing to migrate. Done.");
    return;
  }

  if (!COMMIT) {
    console.log(
      "[migrate-pending] DRY RUN — re-run with --commit to convert these to CONFIRMED.",
    );
    return;
  }

  const result = (await prisma.$runCommandRaw({
    update: COLLECTION,
    updates: [
      {
        q: { status: "PENDING" },
        u: { $set: { status: "CONFIRMED" } },
        multi: true,
      },
    ],
  })) as { nModified?: number; n?: number };

  const after = await countPending();
  console.log(
    `[migrate-pending] converted ${result?.nModified ?? result?.n ?? "?"} row(s) to CONFIRMED. Remaining PENDING: ${after}`,
  );
}

main()
  .catch((err) => {
    console.error("[migrate-pending] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
