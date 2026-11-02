import { afterEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import {
  CampaignChannel,
  CampaignStatus,
  CampaignRecipientStatus,
  CampaignRunStatus,
  CampaignTemplateApprovalStatus,
  QueueStatus,
  ReservationStatus,
  TableAssignmentStatus,
  TableShape,
} from "@prisma/client";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { seedDevelopmentData } from "../../server/lib/developmentSeed.js";
import { blogFieldsSchema } from "../../shared/blog.js";
import { computeStats } from "../../server/lib/guests.js";
import { TEST_ADMIN_PASSWORD } from "../helpers/constants.js";
import { apiFromIp } from "../helpers/app.js";
import { businessCookie, customerCookie } from "../helpers/auth.js";
import { LIVE_STATUSES } from "../../server/lib/floorLive.js";

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await clearTestDatabase();
});

describe("Local Development Demo Data", () => {
  it("seeds real relational data repeatedly without overwriting local edits", async () => {
    await clearTestDatabase();
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const db = getTestPrisma();
    expect(await db.business.count()).toBe(32);
    expect(await db.location.count()).toBe(63);
    expect(await db.featuredRestaurant.count()).toBe(12);
    expect(await db.featuredRestaurant.count({ where: { isActive: false } })).toBe(2);
    expect(await db.business.count({ where: { trial: true } })).toBe(10);
    expect(await db.ticket.count()).toBe(51);
    expect(await db.ticket.count({ where: { type: "feedback" } })).toBe(51);
    for (const status of ["open", "in_progress", "closed"]) {
      expect(await db.ticket.count({ where: { status } })).toBe(17);
    }
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: "dev-demo-ticket-2" } })).data,
    ).toEqual({ feedbackType: "support", severity: "medium" });
    expect(await db.ticketMessage.count()).toBe(83);
    expect(await db.ticketMessage.count({ where: { status: "PENDING" } })).toBe(0);
    expect(await db.campaignTemplate.count()).toBe(37);
    expect(await db.campaignTemplate.count({ where: { approvalStatus: "REJECTED" } })).toBe(8);
    expect(await db.blogPost.count()).toBe(19);
    expect(await db.blogPost.count({ where: { status: "PUBLISHED" } })).toBe(9);
    for (const post of await db.blogPost.findMany()) {
      expect(
        blogFieldsSchema.safeParse({
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          coverUrl: post.coverUrl,
          coverAlt: post.coverAlt,
          author: post.author,
          category: post.category,
          tags: post.tags,
        }).success,
      ).toBe(true);
    }
    await db.blogPost.update({ where: { id: "dev-demo-blog" }, data: { title: "My Local Edit" } });
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    expect(await db.business.count()).toBe(32);
    expect(await db.ticket.count()).toBe(51);
    expect(await db.location.count()).toBe(63);
    expect(await db.ticketMessage.count()).toBe(83);
    expect(await db.featuredRestaurant.count()).toBe(12);
    expect(await db.campaignTemplate.count()).toBe(37);
    expect(await db.blogPost.count()).toBe(19);
    expect((await db.blogPost.findUniqueOrThrow({ where: { id: "dev-demo-blog" } })).title).toBe(
      "My Local Edit",
    );
  });
  it("preserves existing local accounts and login hashes", async () => {
    await clearTestDatabase();
    const db = getTestPrisma();
    const account = await db.business.create({
      data: {
        name: "Existing Local Restaurant",
        username: "existing-local-account",
        email: "existing@example.test",
        phone: "+12025550199",
        password: "existing-local-test-password-hash",
        trial: false,
        baseCredits: 725,
      },
    });
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    expect(await db.business.findUnique({ where: { id: account.id } })).toEqual(account);
    expect(await db.business.count()).toBe(33);
  });
  it("refuses to seed a hosted database even from an explicitly invoked setup", async () => {
    await expect(
      seedDevelopmentData("postgresql://u:p@hosted.example.test/seatping_dev"),
    ).rejects.toThrow("Development cannot connect");
  });
  it("covers every operational status, campaign channel, and floor shape with linked data", async () => {
    await clearTestDatabase();
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const db = getTestPrisma();
    for (const locationId of ["dev-demo-location-0", "dev-demo-location-1"]) {
      const queues = await db.queueEntry.findMany({ where: { locationId } });
      const reservations = await db.reservation.findMany({ where: { locationId } });
      const campaigns = await db.campaign.findMany({ where: { locationId } });
      expect(new Set(queues.map((row) => row.status))).toEqual(new Set(Object.values(QueueStatus)));
      expect(new Set(reservations.map((row) => row.status))).toEqual(
        new Set(Object.values(ReservationStatus)),
      );
      for (const channel of Object.values(CampaignChannel)) {
        expect(
          new Set(campaigns.filter((row) => row.channel === channel).map((row) => row.status)),
        ).toEqual(new Set(Object.values(CampaignStatus)));
      }
      expect(
        new Set(
          (await db.campaignTemplate.findMany({ where: { locationId } })).map(
            (row) => row.approvalStatus,
          ),
        ),
      ).toEqual(new Set(Object.values(CampaignTemplateApprovalStatus)));
    }
    expect(new Set((await db.campaignRun.findMany()).map((row) => row.status))).toEqual(
      new Set(Object.values(CampaignRunStatus)),
    );
    expect(new Set((await db.campaignRecipient.findMany()).map((row) => row.status))).toEqual(
      new Set(Object.values(CampaignRecipientStatus)),
    );
    expect(new Set((await db.tableAssignment.findMany()).map((row) => row.status))).toEqual(
      new Set(Object.values(TableAssignmentStatus)),
    );
    const tables = await db.diningTable.findMany();
    expect(new Set(tables.map((row) => row.shape))).toEqual(new Set(Object.values(TableShape)));
    expect(tables.some((row) => row.isBlocked)).toBe(true);
    expect(tables.some((row) => row.cleaningSince !== null)).toBe(true);
    for (const assignment of await db.tableAssignment.findMany()) {
      const capacity = tables
        .filter((row) => assignment.tableIds.includes(row.id))
        .reduce((sum, row) => sum + row.capacity, 0);
      expect(assignment.partySize).toBeLessThanOrEqual(capacity);
      expect(assignment.tableIds).toContain(assignment.tableId);
      if (assignment.reservationId) {
        const reservation = await db.reservation.findUniqueOrThrow({
          where: { id: assignment.reservationId },
        });
        expect(assignment.locationId).toBe(reservation.locationId);
        if (reservation.status === "CONFIRMED") {
          expect(assignment.source).toBe("SMART");
          expect(assignment.status).toBe("RESERVED");
        }
      }
    }
    expect(await db.diningTable.count({ where: { locationId: "dev-demo-location-1" } })).toBe(0);
    expect(await db.guestProfile.count({ where: { locationId: "dev-demo-empty-location" } })).toBe(
      0,
    );
    expect(await db.queueEntry.count({ where: { locationId: "dev-demo-empty-location" } })).toBe(0);
    expect(await db.review.count({ where: { businessReply: null } })).toBeGreaterThan(0);
    expect(await db.review.count({ where: { businessReply: { not: null } } })).toBeGreaterThan(0);
  });
  it("keeps guest summaries, table windows, delivery totals, and reservation capacity consistent", async () => {
    await clearTestDatabase();
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const db = getTestPrisma();
    for (const guest of await db.guestProfile.findMany()) {
      const queues = await db.queueEntry.findMany({
        where: { id: { in: guest.sourceQueueEntryIds } },
      });
      const reservations = await db.reservation.findMany({
        where: { id: { in: guest.sourceReservationIds } },
      });
      const stats = computeStats(queues, reservations, "Asia/Jakarta");
      expect(guest.totalVisits).toBe(stats.totalVisits);
      expect(guest.upcomingReservationCount).toBe(stats.upcomingReservationCount);
      expect(guest.noShowCount).toBe(stats.noShowCount);
      expect(guest.cancelledCount).toBe(stats.cancelledCount);
      expect(queues.every((row) => row.locationId === guest.locationId)).toBe(true);
      expect(reservations.every((row) => row.locationId === guest.locationId)).toBe(true);
    }
    for (const counter of await db.slotCounter.findMany()) {
      const rows = await db.reservation.findMany({
        where: {
          locationId: counter.locationId,
          status: { in: ["CONFIRMED", "ARRIVED"] },
          reservationDateTime: {
            startsWith: `${counter.dateKey}T${String(counter.hour).padStart(2, "0")}:`,
          },
        },
      });
      expect(counter.reservedGuests).toBe(rows.reduce((sum, row) => sum + row.guestCount, 0));
    }
    for (const run of await db.campaignRun.findMany()) {
      const recipients = await db.campaignRecipient.findMany({ where: { runId: run.id } });
      expect(run.recipientCount).toBe(recipients.length);
      expect(run.sentCount).toBe(
        recipients.filter((row) => ["SENT", "DELIVERED"].includes(row.status)).length,
      );
      expect(run.failedCount).toBe(recipients.filter((row) => row.status === "FAILED").length);
      expect(run.skippedCount).toBe(recipients.filter((row) => row.status === "SKIPPED").length);
    }
    expect(await db.guestProfile.count({ where: { totalVisits: 0 } })).toBeGreaterThan(0);
    expect(await db.guestProfile.count({ where: { totalVisits: { gte: 2 } } })).toBeGreaterThan(0);
    expect(
      await db.guestProfile.count({
        where: { lastVisitAt: { lt: new Date(Date.now() - 60 * 86400000) } },
      }),
    ).toBeGreaterThan(0);
  });
  it("provides usable demo logins without publishing a default password or enabling deliveries", async () => {
    await clearTestDatabase();
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const db = getTestPrisma();
    for (const business of await db.business.findMany()) {
      expect(await bcrypt.compare(TEST_ADMIN_PASSWORD, business.password)).toBe(true);
    }
    const user = await db.user.findUniqueOrThrow({ where: { username: "demo-diner" } });
    expect(await bcrypt.compare(TEST_ADMIN_PASSWORD, user.password)).toBe(true);
    expect(user.upcomingReservations).not.toEqual([]);
    expect(user.pastReservations).not.toEqual([]);
    expect(user.queueingActivity).not.toEqual([]);
    expect(user.savedRestaurants).not.toEqual([]);
    expect(await db.campaign.count({ where: { nextRunAt: { not: null } } })).toBe(0);
    expect(await db.reservation.count({ where: { reminderEmailSentAt: null } })).toBe(0);
    expect(
      await db.ticketMessage.count({ where: { status: { in: ["PENDING", "SENDING"] } } }),
    ).toBe(0);
    expect(
      (await db.guestProfile.findMany()).every(
        (row) => !row.email || row.email.endsWith("@example.test"),
      ),
    ).toBe(true);
  });
  it("refreshes demo dates without duplicating rows or touching personal records", async () => {
    await clearTestDatabase();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const db = getTestPrisma();
    const counts = [
      await db.guestProfile.count(),
      await db.queueEntry.count(),
      await db.reservation.count(),
      await db.campaign.count(),
      await db.tableAssignment.count(),
      await db.slotCounter.count(),
    ];
    const original = await db.reservation.findUniqueOrThrow({
      where: { id: "dev-demo-reservation-0-0" },
    });
    const personalGuest = await db.guestProfile.create({
      data: {
        businessId: "dev-demo-business-0",
        locationId: "dev-demo-location-0",
        fullName: "My Local Guest",
        notes: "Keep my local work",
      },
    });
    vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    expect([
      (await db.guestProfile.count()) - 1,
      await db.queueEntry.count(),
      await db.reservation.count(),
      await db.campaign.count(),
      await db.tableAssignment.count(),
      await db.slotCounter.count(),
    ]).toEqual(counts);
    expect(
      (await db.reservation.findUniqueOrThrow({ where: { id: original.id } })).reservationDateTime,
    ).not.toBe(original.reservationDateTime);
    expect(await db.guestProfile.findUniqueOrThrow({ where: { id: personalGuest.id } })).toEqual(
      personalGuest,
    );
  });
  it("fails before writing data when the local demo login hash is missing", async () => {
    await clearTestDatabase();
    vi.stubEnv("ADMIN_PASSWORD_HASH", "");
    await expect(seedDevelopmentData(process.env.TEST_DATABASE_URL!)).rejects.toThrow(
      "Set ADMIN_PASSWORD_HASH",
    );
    expect(await getTestPrisma().business.count()).toBe(0);
  });
  it("makes the demo accessible through real login, dashboard, and public APIs", async () => {
    await clearTestDatabase();
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const client = await apiFromIp();
    const businessLogin = await client
      .post("/auth/business/login")
      .send({ emailOrUsername: "demo-restaurant-1", password: TEST_ADMIN_PASSWORD });
    expect(businessLogin.status).toBe(200);
    const customerLogin = await client
      .post("/auth/login")
      .send({ emailOrUsername: "demo-diner", password: TEST_ADMIN_PASSWORD });
    expect(customerLogin.status).toBe(200);
    const cookie = businessCookie("dev-demo-business-0");
    const guests = await client
      .get("/api/guests?locationId=dev-demo-location-0")
      .set("Cookie", cookie);
    expect(guests.status).toBe(200);
    expect(guests.body.guests.length).toBeGreaterThan(20);
    const campaigns = await client
      .get("/api/campaigns?locationId=dev-demo-location-0")
      .set("Cookie", cookie);
    expect(campaigns.status).toBe(200);
    expect(campaigns.body.campaigns).toHaveLength(
      Object.values(CampaignStatus).length * Object.values(CampaignChannel).length,
    );
    const live = await client.get("/api/floor/dev-demo-location-0/live").set("Cookie", cookie);
    expect(live.status).toBe(200);
    const rooms = live.body.rooms as Array<{ tables: Array<{ status: string }> }>;
    expect(new Set(rooms.flatMap((room) => room.tables.map((table) => table.status)))).toEqual(
      new Set(LIVE_STATUSES),
    );
    const performance = await client
      .get("/api/performance/dev-demo-location-0?preset=30d")
      .set("Cookie", cookie);
    expect(performance.status).toBe(200);
    expect(performance.body.metrics.hasActivity).toBe(true);
    const profile = await client
      .get("/auth/me")
      .set("Cookie", customerCookie("dev-demo-customer-0"));
    expect(profile.status).toBe(200);
    expect(profile.body.user.upcomingReservations.length).toBeGreaterThan(0);
    expect(profile.body.user.pastReservations.length).toBeGreaterThan(0);
    const restaurant = await client.get("/api/restaurants/demo-restaurant-1/dev-demo-location-0");
    expect(restaurant.status).toBe(200);
    expect(restaurant.body.restaurant.reviewCount).toBe(12);
    expect(restaurant.body.restaurant.menu).toHaveLength(3);
    expect(restaurant.body.restaurant.photos).toHaveLength(3);
  });
});
