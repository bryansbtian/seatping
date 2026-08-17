import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Business, Location } from "@prisma/client";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import {
  futureReservationDateTime,
  seedBusinessWithLocation,
  seedQueueEntry,
  seedReservation,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

let business: Business;
let location: Location;
let cookie: string;

async function seedGuest(overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  return db.guestProfile.create({
    data: {
      businessId: business.id,
      businessUsername: business.username,
      locationId: location.id,
      firstName: "Guest",
      lastName: suffix,
      fullName: `Guest ${suffix}`,
      email: `g-${suffix}@test.invalid`,
      normalizedEmail: `g-${suffix}@test.invalid`,
      phone: "5551234567",
      normalizedPhone: `1555123${suffix.slice(0, 4)}`,
      totalVisits: 1,
      ...overrides,
    },
  });
}

function pastReservationDateTime(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T18:00`;
}

beforeAll(async () => {
  const seeded = await seedBusinessWithLocation();
  business = seeded.business;
  location = seeded.location;
  cookie = businessCookie(business.id);
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("guest detail timeline", () => {
  it("builds a timeline from the linked waitlist entries", async () => {
    const entries = await Promise.all([
      seedQueueEntry(location, {
        status: "WAITING",
        joinedAt: new Date("2026-01-01T10:00:00.000Z"),
      }),
      seedQueueEntry(location, {
        status: "ADMITTED",
        joinedAt: new Date("2026-01-02T10:00:00.000Z"),
      }),
      seedQueueEntry(location, {
        status: "ARRIVED",
        joinedAt: new Date("2026-01-03T10:00:00.000Z"),
      }),
      seedQueueEntry(location, {
        status: "NO_SHOW",
        joinedAt: new Date("2026-01-04T10:00:00.000Z"),
      }),
      seedQueueEntry(location, {
        status: "REMOVED",
        joinedAt: new Date("2026-01-05T10:00:00.000Z"),
      }),
      seedQueueEntry(location, {
        status: "LEFT",
        joinedAt: new Date("2026-01-06T10:00:00.000Z"),
      }),
    ]);
    const guest = await seedGuest({
      sourceQueueEntryIds: entries.map((e) => {
        return e.id;
      }),
    });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.waitlistHistory).toHaveLength(6);
    expect(res.body.waitlistHistory.map((w: any) => w.status)).toEqual([
      "left",
      "removed",
      "no_show",
      "arrived",
      "admitted",
      "waiting",
    ]);
    for (const row of res.body.waitlistHistory) {
      expect(row.source).toBe("waitlist");
      expect(row.atLabel).toEqual(expect.any(String));
      expect(row.location).toEqual(expect.any(String));
    }
  });

  it("splits reservations into upcoming and past", async () => {
    const upcoming = await seedReservation(location, {
      status: "CONFIRMED",
      reservationDateTime: futureReservationDateTime(19, 5),
      notes: "Window table please",
    });
    const completed = await seedReservation(location, {
      status: "COMPLETED",
      reservationDateTime: pastReservationDateTime(),
    });
    const cancelledButFuture = await seedReservation(location, {
      status: "CANCELLED",
      reservationDateTime: futureReservationDateTime(20, 6),
    });
    const guest = await seedGuest({
      sourceReservationIds: [upcoming.id, completed.id, cancelledButFuture.id],
    });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.body.upcomingReservations.map((r: any) => r.id)).toEqual([
      upcoming.id,
    ]);
    expect(res.body.upcomingReservations[0].notes).toBe("Window table please");
    expect(res.body.pastReservations.map((r: any) => r.id).sort()).toEqual(
      [completed.id, cancelledButFuture.id].sort(),
    );
  });

  it("merges waitlist and reservation events into one timeline", async () => {
    const entry = await seedQueueEntry(location, {
      status: "ARRIVED",
      joinedAt: new Date("2026-02-01T10:00:00.000Z"),
    });
    const reservation = await seedReservation(location, {
      status: "COMPLETED",
      reservationDateTime: pastReservationDateTime(),
    });
    const guest = await seedGuest({
      sourceQueueEntryIds: [entry.id],
      sourceReservationIds: [reservation.id],
    });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.body.timeline).toHaveLength(2);
    const sources = res.body.timeline.map((t: any) => {
      return t.source;
    });
    expect(sources).toContain("waitlist");
    expect(sources).toContain("reservation");
    for (const event of res.body.timeline) {
      expect(event.upcoming).toBeUndefined();
    }
  });

  it("returns an empty history for a guest with no linked visits", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.body.timeline).toEqual([]);
    expect(res.body.waitlistHistory).toEqual([]);
    expect(res.body.upcomingReservations).toEqual([]);
    expect(res.body.pastReservations).toEqual([]);
  });

  it("tolerates a reservation with no date at all", async () => {
    const reservation = await seedReservation(location, {
      status: "CONFIRMED",
      reservationDateTime: "",
    });
    const guest = await seedGuest({ sourceReservationIds: [reservation.id] });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.pastReservations).toHaveLength(1);
    expect(res.body.pastReservations[0].at).toBeNull();
    expect(res.body.pastReservations[0].atLabel).toBeNull();
  });

  it("tolerates a reservation whose date cannot be parsed", async () => {
    const reservation = await seedReservation(location, {
      status: "CONFIRMED",
      reservationDateTime: "sometime next week",
    });
    const guest = await seedGuest({ sourceReservationIds: [reservation.id] });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.pastReservations[0].at).toBeNull();
    expect(res.body.pastReservations[0].atLabel).toBeNull();
  });

  it("exposes the guest profile alongside its location label and timezone", async () => {
    const guest = await seedGuest({
      notes: "Allergic to peanuts",
      summary: "Regular Friday guest",
    });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.body.guest.notes).toBe("Allergic to peanuts");
    expect(res.body.guest.summary).toBe("Regular Friday guest");
    expect(res.body.guest.hasNotes).toBe(true);
    expect(res.body.guest.location.id).toBe(location.id);
    expect(res.body.guest.location.label).toEqual(expect.any(String));
    expect(res.body.guest.location.timezone).toEqual(expect.any(String));
  });

  it("falls back to a generic label when the location is gone", async () => {
    const orphanLocation = await db.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        name: "Temporary",
        address: "9 Test Street",
      },
    });
    const guest = await db.guestProfile.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        locationId: orphanLocation.id,
        firstName: "Orphan",
        totalVisits: 1,
      },
    });
    await db.location.delete({ where: { id: orphanLocation.id } });

    const res = await (await api())
      .get(`/api/guests/${guest.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.guest.location.label).toBe("Location");
  });
});

describe("guest tag editing", () => {
  it("accepts a clean tag list and drops blanks and duplicates", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ tags: ["VIP", "  ", "vip", " Regular "] });

    expect(res.status).toBe(200);
    expect(res.body.guest.tags).toEqual(["VIP", "Regular"]);
  });

  it("truncates a very long tag", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ tags: ["t".repeat(60)] });

    expect(res.body.guest.tags[0]).toHaveLength(40);
  });

  it("keeps at most thirty tags", async () => {
    const guest = await seedGuest();
    const tags = Array.from({ length: 40 }, (_, i) => {
      return `tag-${i}`;
    });

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ tags });

    expect(res.body.guest.tags).toHaveLength(30);
  });

  it("rejects a tag list that is not an array", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ tags: "vip" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("tags must be an array of strings");
  });

  it("rejects a tag list containing a non-string", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ tags: ["vip", 7] });

    expect(res.status).toBe(400);
  });

  it("rejects notes that are not a string", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ notes: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("notes must be a string");
  });

  it("truncates very long notes", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({ notes: "n".repeat(6000) });

    expect(res.status).toBe(200);
    const stored = await db.guestProfile.findUnique({ where: { id: guest.id } });
    expect(stored?.notes).toHaveLength(5000);
  });

  it("rejects a patch with nothing to change", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .patch(`/api/guests/${guest.id}`)
      .set("Cookie", cookie)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nothing to update");
  });

  it("does not add a tag that is already present under another casing", async () => {
    const guest = await seedGuest({ tags: ["VIP"] });

    const res = await (await api())
      .post(`/api/guests/${guest.id}/tags`)
      .set("Cookie", cookie)
      .send({ tag: "vip" });

    expect(res.body.guest.tags).toEqual(["VIP"]);
  });

  it("refuses to push a guest past the tag ceiling", async () => {
    const guest = await seedGuest({
      tags: Array.from({ length: 30 }, (_, i) => {
        return `tag-${i}`;
      }),
    });

    const res = await (await api())
      .post(`/api/guests/${guest.id}/tags`)
      .set("Cookie", cookie)
      .send({ tag: "one-too-many" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Too many tags");
  });

  it("rejects an empty tag", async () => {
    const guest = await seedGuest();

    const res = await (await api())
      .post(`/api/guests/${guest.id}/tags`)
      .set("Cookie", cookie)
      .send({ tag: "   " });

    expect(res.status).toBe(400);
  });

  it("removes a tag regardless of casing", async () => {
    const guest = await seedGuest({ tags: ["VIP", "Regular"] });

    const res = await (await api())
      .delete(`/api/guests/${guest.id}/tags/${encodeURIComponent("vip")}`)
      .set("Cookie", cookie);

    expect(res.body.guest.tags).toEqual(["Regular"]);
  });

  it("rejects removing a blank tag", async () => {
    const guest = await seedGuest({ tags: ["VIP"] });

    const res = await (await api())
      .delete(`/api/guests/${guest.id}/tags/${encodeURIComponent("  ")}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(400);
  });

  it("reports an unknown guest on every tag route", async () => {
    const missing = "000000000000000000000000";

    const add = await (await api())
      .post(`/api/guests/${missing}/tags`)
      .set("Cookie", cookie)
      .send({ tag: "vip" });
    const remove = await (await api())
      .delete(`/api/guests/${missing}/tags/vip`)
      .set("Cookie", cookie);
    const patch = await (await api())
      .patch(`/api/guests/${missing}`)
      .set("Cookie", cookie)
      .send({ notes: "x" });
    const recompute = await (await api())
      .post(`/api/guests/${missing}/recompute`)
      .set("Cookie", cookie);

    expect(add.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(patch.status).toBe(404);
    expect(recompute.status).toBe(404);
  });
});

describe("guest list metadata", () => {
  it("lists every location of the business with a label", async () => {
    const res = await (await api())
      .get("/api/guests/meta")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.locations.length).toBeGreaterThan(0);
    for (const entry of res.body.locations) {
      expect(entry.id).toEqual(expect.any(String));
      expect(entry.label).toEqual(expect.any(String));
    }
    expect(res.body.suggestedTags.length).toBeGreaterThan(0);
  });

  it("reports the location timezone alongside the guest list", async () => {
    const res = await (await api())
      .get(`/api/guests?locationId=${location.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.location.id).toBe(location.id);
    expect(res.body.location.timezone).toEqual(expect.any(String));
  });

  it("refuses a list request with no location", async () => {
    const res = await (await api()).get("/api/guests").set("Cookie", cookie);

    expect(res.status).toBe(404);
  });
});
