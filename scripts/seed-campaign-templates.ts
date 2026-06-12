// scripts/seed-campaign-templates.ts
//
// Idempotently insert the curated SeatPing campaign templates. Safe to run
// repeatedly — existing templates are matched by (templateType=SEATPING, name)
// and refreshed rather than duplicated.
//
// Run: npx tsx scripts/seed-campaign-templates.ts
import { prisma } from "../server/lib/prisma.js";
import { seedSeatPingTemplates } from "../server/lib/campaigns.js";

async function run() {
  await seedSeatPingTemplates();
  const count = await prisma.campaignTemplate.count({
    where: { templateType: "SEATPING" },
  });
  console.log(`[seed-campaign-templates] SeatPing templates present: ${count}`);
}

run()
  .catch((err) => {
    console.error("[seed-campaign-templates] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
