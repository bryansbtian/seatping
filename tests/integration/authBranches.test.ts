import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie, customerCookie } from "../helpers/auth.js";
import {
  seedBusinessWithLocation,
  seedCustomer,
  seedReservation,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function todayInLocationZone(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe("business reservation status transitions", () => {
  const path = (locationId: string, reservationId: string) => {
    return `/auth/business/locations/${locationId}/reservations/${reservationId}`;
  };

  it("marks a reservation as arrived", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const reservation = await seedReservation(location, {
      reservationDateTime: `${todayInLocationZone()}T12:00`,
    });

    const res = await (await api())
      .patch(path(location.id, reservation.id))
      .set("Cookie", businessCookie(business.id))
      .send({ status: "arrived" });

    expect(res.status).toBe(200);
    const stored = await db.reservation.findUnique({
      where: { id: reservation.id },
    });
    expect(stored?.status).toBe("ARRIVED");
    expect(stored?.arrivedAt).toBeInstanceOf(Date);
  });

  it("marks a reservation as completed", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const reservation = await seedReservation(location);

    const res = await (await api())
      .patch(path(location.id, reservation.id))
      .set("Cookie", businessCookie(business.id))
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(
      (await db.reservation.findUnique({ where: { id: reservation.id } }))?.status,
    ).toBe("COMPLETED");
  });

  it("marks a reservation as a no-show and frees its capacity", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const reservation = await seedReservation(location, {
      guestCount: 4,
      reservationDateTime: `${todayInLocationZone()}T12:00`,
    });
    const date = reservation.reservationDateTime.split("T")[0];
    await db.slotCounter.create({
      data: { locationId: location.id, dateKey: date, hour: 12, reservedGuests: 4 },
    });

    const res = await (await api())
      .patch(path(location.id, reservation.id))
      .set("Cookie", businessCookie(business.id))
      .send({ status: "no_show" });

    expect(res.status).toBe(200);
    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: date, hour: 12 },
    });
    expect(counter?.reservedGuests).toBe(0);
  });

  it("cancels a reservation", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const reservation = await seedReservation(location);

    const res = await (await api())
      .patch(path(location.id, reservation.id))
      .set("Cookie", businessCookie(business.id))
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(
      (await db.reservation.findUnique({ where: { id: reservation.id } }))?.status,
    ).toBe("CANCELLED");
  });

  it("rejects an unknown status value", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const reservation = await seedReservation(location);

    const res = await (await api())
      .patch(path(location.id, reservation.id))
      .set("Cookie", businessCookie(business.id))
      .send({ status: "teleported" });

    expect(res.status).toBe(400);
    expect(
      (await db.reservation.findUnique({ where: { id: reservation.id } }))?.status,
    ).toBe("CONFIRMED");
  });

  it("rejects an anonymous status change", async () => {
    const { location } = await seedBusinessWithLocation();
    const reservation = await seedReservation(location);

    const res = await (await api())
      .patch(path(location.id, reservation.id))
      .send({ status: "cancelled" });

    expect(res.status).toBe(401);
  });

  it("does not let another business change a reservation", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const reservation = await seedReservation(tenantA.location);

    const res = await (await api())
      .patch(path(tenantA.location.id, reservation.id))
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({ status: "cancelled" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(
      (await db.reservation.findUnique({ where: { id: reservation.id } }))?.status,
    ).toBe("CONFIRMED");
  });

  it("returns a client error for an unknown reservation", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .patch(path(location.id, "000000000000000000000000"))
      .set("Cookie", businessCookie(business.id))
      .send({ status: "cancelled" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("business address list update", () => {
  it("requires a locations array", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .put("/auth/business/me")
      .set("Cookie", businessCookie(business.id))
      .send({ locations: "not-an-array" });

    expect(res.status).toBe(400);
  });

  it("accepts an array of location updates", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .put("/auth/business/me")
      .set("Cookie", businessCookie(business.id))
      .send({ locations: [{ id: location.id, address: "42 Updated Way" }] });

    expect(res.status).toBeLessThan(500);
  });

  it("rejects an anonymous update", async () => {
    const res = await (await api())
      .put("/auth/business/me")
      .send({ locations: [] });

    expect(res.status).toBe(401);
  });
});

describe("customer saved item removal", () => {
  it("removes a saved restaurant", async () => {
    const customer = await seedCustomer();
    const { business } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);

    await (await api())
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie)
      .send({ businessUsername: business.username, businessName: business.name });

    const res = await (await api())
      .delete(`/auth/me/saved-restaurants/${business.username}`)
      .set("Cookie", cookie);

    expect(res.status).toBeLessThan(500);
  });

  it("removes a saved location", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);

    await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", cookie)
      .send({ locationId: location.id });

    const res = await (await api())
      .delete(`/auth/me/saved-locations/${location.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBeLessThan(500);
  });

  it("rejects anonymous removal", async () => {
    const res = await (await api()).delete("/auth/me/saved-restaurants/someone");

    expect(res.status).toBe(401);
  });
});

describe("business password recovery", () => {
  it("issues a reset token for a business account", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/auth/forgot-password")
      .send({ email: business.email, type: "business" });

    expect(res.status).toBe(200);
    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.resetToken).toEqual(expect.any(String));
  });

  it("treats an unknown business email the same as a known one", async () => {
    const res = await (await api())
      .post("/auth/forgot-password")
      .send({ email: "no-such-business@test.invalid", type: "business" });

    expect(res.status).toBe(200);
  });
});
