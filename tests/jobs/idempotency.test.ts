import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { sinks } from "../setup/externalMocks.js";
import { seedBusinessWithLocation, seedReservation } from "../helpers/seed.js";
import { runReservationReminderSweep } from "../../server/lib/reservationReminders.js";
import { runDailyCreditRefillSweep } from "../../server/lib/trial.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function utcWallClockMinutesAhead(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

async function seedUtcLocation() {
  return seedBusinessWithLocation({
    restaurantProfile: {
      displayName: "Reminder Test Location",
      openingHours: { timezone: "UTC" },
    },
  });
}

describe("reservation reminder sweep", () => {
  it("sends a reminder once and does not resend on a second run", async () => {
    const { location } = await seedUtcLocation();
    const reservation = await seedReservation(location, {
      email: "reminder@test.invalid",
      status: "CONFIRMED",
      reservationDateTime: utcWallClockMinutesAhead(90),
    });

    await runReservationReminderSweep();

    const afterFirst = await db.reservation.findUnique({
      where: { id: reservation.id },
    });
    expect(afterFirst?.reminderEmailSentAt).toBeInstanceOf(Date);
    const sentAfterFirst = sinks().email.length;
    expect(sentAfterFirst).toBe(1);
    expect(sinks().email[0].to).toBe("reminder@test.invalid");

    await runReservationReminderSweep();

    expect(sinks().email.length).toBe(sentAfterFirst);
    const afterSecond = await db.reservation.findUnique({
      where: { id: reservation.id },
    });
    expect(afterSecond?.reminderEmailSentAt?.getTime()).toBe(
      afterFirst?.reminderEmailSentAt?.getTime(),
    );
  });

  it("ignores reservations outside the reminder window", async () => {
    const { location } = await seedUtcLocation();
    await seedReservation(location, {
      email: "too-far@test.invalid",
      status: "CONFIRMED",
      reservationDateTime: utcWallClockMinutesAhead(60 * 20),
    });

    await runReservationReminderSweep();

    expect(sinks().email).toHaveLength(0);
  });

  it("ignores cancelled reservations", async () => {
    const { location } = await seedUtcLocation();
    await seedReservation(location, {
      email: "cancelled@test.invalid",
      status: "CANCELLED",
      reservationDateTime: utcWallClockMinutesAhead(90),
    });

    await runReservationReminderSweep();

    expect(sinks().email).toHaveLength(0);
  });

  it("never contacts a real provider during the sweep", async () => {
    const { location } = await seedUtcLocation();
    await seedReservation(location, {
      email: "provider-check@test.invalid",
      status: "CONFIRMED",
      reservationDateTime: utcWallClockMinutesAhead(90),
    });

    await runReservationReminderSweep();

    expect(sinks().telnyx).toHaveLength(0);
    expect(sinks().whatsapp).toHaveLength(0);
  });
});

describe("monthly credit refill sweep", () => {
  it("is safe to run repeatedly on the same day", async () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const { business, location } = await seedBusinessWithLocation({ credits: 12 });

    await db.business.update({
      where: { id: business.id },
      data: {
        creditsStartedAt: startedAt,
        nextCreditRefillAt: new Date(now.getTime() - 60 * 1000),
        baseCredits: 300,
      },
    });

    await runDailyCreditRefillSweep();
    const afterFirst = await db.location.findUnique({ where: { id: location.id } });
    const businessAfterFirst = await db.business.findUnique({
      where: { id: business.id },
    });

    await runDailyCreditRefillSweep();
    const afterSecond = await db.location.findUnique({ where: { id: location.id } });
    const businessAfterSecond = await db.business.findUnique({
      where: { id: business.id },
    });

    expect(afterSecond?.credits).toBe(afterFirst?.credits);
    expect(businessAfterSecond?.nextCreditRefillAt?.getTime()).toBe(
      businessAfterFirst?.nextCreditRefillAt?.getTime(),
    );
  });

  it("does not refill a business whose next refill is still in the future", async () => {
    const now = new Date();
    const { business, location } = await seedBusinessWithLocation({ credits: 7 });
    await db.business.update({
      where: { id: business.id },
      data: {
        creditsStartedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        nextCreditRefillAt: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
      },
    });

    await runDailyCreditRefillSweep();

    const after = await db.location.findUnique({ where: { id: location.id } });
    expect(after?.credits).toBe(7);
  });
});
