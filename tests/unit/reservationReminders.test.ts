import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reservationFindMany = vi.fn();
const reservationUpdate = vi.fn();
const reservationUpdateMany = vi.fn();
const locationFindMany = vi.fn();
const businessFindUnique = vi.fn();
const enqueueNotification = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      reservation: {
        findMany: reservationFindMany,
        update: reservationUpdate,
        updateMany: reservationUpdateMany,
      },
      location: { findMany: locationFindMany },
      business: { findUnique: businessFindUnique },
    },
  };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification };
});

const { runReservationReminderSweep } = await import("../../server/lib/reservationReminders.js");

const ORIGINAL_ENV = { ...process.env };

function inMinutes(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    locationId: "loc-1",
    manageToken: "mt-1",
    email: "guest@test.invalid",
    firstName: "Ada",
    name: "Ada Lovelace",
    guestCount: 2,
    reservationDateTime: inMinutes(60),
    ...overrides,
  };
}

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: "loc-1",
    businessId: "biz-1",
    displayName: "Downtown",
    name: "Bistro Downtown",
    address: "1 Test Street",
    restaurantProfile: { openingHours: { timezone: "UTC" } },
    ...overrides,
  };
}

function job(): Record<string, any> {
  return enqueueNotification.mock.calls[0][0];
}

beforeEach(() => {
  process.env.FRONTEND_URL = "https://app.test.invalid";
  reservationFindMany.mockReset().mockResolvedValue([]);
  reservationUpdate.mockReset().mockResolvedValue({});
  reservationUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  locationFindMany.mockReset().mockResolvedValue([location()]);
  businessFindUnique.mockReset().mockResolvedValue({ name: "Bistro" });
  enqueueNotification.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("reminder sweep shortcuts", () => {
  it("stops early when nothing is due", async () => {
    await runReservationReminderSweep();

    expect(locationFindMany).not.toHaveBeenCalled();
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("skips a reservation whose location is gone", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    locationFindMany.mockResolvedValue([]);

    await runReservationReminderSweep();

    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("skips a reservation with no email address", async () => {
    reservationFindMany.mockResolvedValue([reservation({ email: null })]);

    await runReservationReminderSweep();

    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("skips a reservation that is already in the past", async () => {
    reservationFindMany.mockResolvedValue([reservation({ reservationDateTime: inMinutes(-30) })]);

    await runReservationReminderSweep();

    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("skips a reservation beyond the reminder window", async () => {
    reservationFindMany.mockResolvedValue([reservation({ reservationDateTime: inMinutes(300) })]);

    await runReservationReminderSweep();

    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("skips a reservation whose date cannot be read", async () => {
    reservationFindMany.mockResolvedValue([reservation({ reservationDateTime: "not a date" })]);

    await runReservationReminderSweep();

    expect(enqueueNotification).not.toHaveBeenCalled();
  });
});

describe("reminder sweep delivery", () => {
  it("enqueues a reminder and stamps the reservation", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);

    await runReservationReminderSweep();

    expect(job().type).toBe("reservation_reminder");
    expect(job().email).toBe("guest@test.invalid");
    expect(job().firstName).toBe("Ada");
    expect(job().businessName).toBe("Bistro");
    expect(job().address).toBe("1 Test Street");
    expect(job().partySize).toBe(2);
    expect(job().manageUrl).toBe("https://app.test.invalid/reservations/manage/mt-1");
    const claim = reservationUpdateMany.mock.calls[0][0];
    expect(claim.where.id).toBe("res-1");
    expect(claim.data.reminderEmailSentAt).toBeInstanceOf(Date);
    expect(reservationUpdate).not.toHaveBeenCalled();
  });

  it("omits the manage link when there is no token", async () => {
    reservationFindMany.mockResolvedValue([reservation({ manageToken: null })]);

    await runReservationReminderSweep();

    expect(job().manageUrl).toBeUndefined();
  });

  it("falls back to the full name then a greeting", async () => {
    reservationFindMany.mockResolvedValue([reservation({ firstName: null })]);
    await runReservationReminderSweep();
    expect(job().firstName).toBe("Ada Lovelace");

    enqueueNotification.mockClear();
    reservationFindMany.mockResolvedValue([reservation({ firstName: null, name: null })]);
    await runReservationReminderSweep();
    expect(job().firstName).toBe("there");
  });

  it("treats a missing party size as one guest", async () => {
    reservationFindMany.mockResolvedValue([reservation({ guestCount: "many" })]);

    await runReservationReminderSweep();

    expect(job().partySize).toBe(1);
  });

  it("falls back to the location name for the address", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    locationFindMany.mockResolvedValue([location({ address: null })]);

    await runReservationReminderSweep();

    expect(job().address).toBe("Downtown");
  });

  it("falls back through the location and business names", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    locationFindMany.mockResolvedValue([location({ address: null, displayName: null })]);
    await runReservationReminderSweep();
    expect(job().address).toBe("Bistro Downtown");

    enqueueNotification.mockClear();
    locationFindMany.mockResolvedValue([
      location({ address: null, displayName: null, name: null }),
    ]);
    await runReservationReminderSweep();
    expect(job().address).toBe("Bistro");
  });

  it("falls back to a generic business name", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    businessFindUnique.mockResolvedValue(null);

    await runReservationReminderSweep();

    expect(job().businessName).toBe("the restaurant");
  });

  it("looks a business name up once for several reservations", async () => {
    reservationFindMany.mockResolvedValue([
      reservation({ id: "res-1" }),
      reservation({ id: "res-2" }),
    ]);

    await runReservationReminderSweep();

    expect(businessFindUnique).toHaveBeenCalledTimes(1);
    expect(enqueueNotification).toHaveBeenCalledTimes(2);
  });

  it("defaults the manage link host when none is configured", async () => {
    delete process.env.FRONTEND_URL;
    reservationFindMany.mockResolvedValue([reservation()]);

    await runReservationReminderSweep();

    expect(job().manageUrl).toBe("https://www.seatping.biz/reservations/manage/mt-1");
  });
});

describe("reminder sweep timezones", () => {
  it("falls back to the SeatPing timezone when the location has none", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    locationFindMany.mockResolvedValue([
      location({ restaurantProfile: {} }),
      location({ id: "loc-2", restaurantProfile: null }),
    ]);

    await runReservationReminderSweep();

    expect(enqueueNotification.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("ignores an opening-hours block with a non-string timezone", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    locationFindMany.mockResolvedValue([
      location({ restaurantProfile: { openingHours: { timezone: 7 } } }),
    ]);

    await expect(runReservationReminderSweep()).resolves.toBeUndefined();
  });

  it("ignores opening hours that are not an object", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    locationFindMany.mockResolvedValue([
      location({ restaurantProfile: { openingHours: "nine to five" } }),
    ]);

    await expect(runReservationReminderSweep()).resolves.toBeUndefined();
  });
});

describe("reminder sweep claims", () => {
  it("claims a reservation before handing it to the notifier", async () => {
    const order: string[] = [];
    reservationFindMany.mockResolvedValue([reservation()]);
    reservationUpdateMany.mockImplementation(async () => {
      order.push("claim");
      return { count: 1 };
    });
    enqueueNotification.mockImplementation(async () => {
      order.push("enqueue");
    });

    await runReservationReminderSweep();

    expect(order).toEqual(["claim", "enqueue"]);
  });

  it("only claims reservations that are still unstamped", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);

    await runReservationReminderSweep();

    const where = reservationUpdateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { reminderEmailSentAt: null },
      { reminderEmailSentAt: { isSet: false } },
    ]);
  });

  it("sends nothing when another sweep already claimed the reservation", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    reservationUpdateMany.mockResolvedValue({ count: 0 });

    await runReservationReminderSweep();

    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("keeps sweeping when one reservation is claimed by someone else", async () => {
    reservationFindMany.mockResolvedValue([
      reservation({ id: "res-1" }),
      reservation({ id: "res-2" }),
    ]);
    reservationUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });

    await runReservationReminderSweep();

    expect(enqueueNotification).toHaveBeenCalledTimes(1);
  });

  it("sends one reminder when two sweeps overlap on the same reservation", async () => {
    const claimed = new Set<string>();
    reservationFindMany.mockResolvedValue([reservation()]);
    reservationUpdateMany.mockImplementation(async (args: any) => {
      await Promise.resolve();
      if (claimed.has(args.where.id)) {
        return { count: 0 };
      }
      claimed.add(args.where.id);
      return { count: 1 };
    });

    await Promise.all([runReservationReminderSweep(), runReservationReminderSweep()]);

    expect(reservationUpdateMany).toHaveBeenCalledTimes(2);
    expect(enqueueNotification).toHaveBeenCalledTimes(1);
  });
});

describe("reminder sweep failures", () => {
  it("keeps sweeping when one reminder cannot be enqueued", async () => {
    reservationFindMany.mockResolvedValue([
      reservation({ id: "res-1" }),
      reservation({ id: "res-2" }),
    ]);
    enqueueNotification.mockRejectedValueOnce(new Error("queue down")).mockResolvedValue(undefined);

    await runReservationReminderSweep();

    expect(console.error).toHaveBeenCalled();
    expect(enqueueNotification).toHaveBeenCalledTimes(2);
  });

  it("releases the claim when the enqueue fails", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    enqueueNotification.mockRejectedValue(new Error("queue down"));

    await runReservationReminderSweep();

    expect(reservationUpdate).toHaveBeenCalledWith({
      where: { id: "res-1" },
      data: { reminderEmailSentAt: null },
    });
  });

  it("survives a release that itself fails", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    enqueueNotification.mockRejectedValue(new Error("queue down"));
    reservationUpdate.mockRejectedValue(new Error("db down"));

    await expect(runReservationReminderSweep()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("survives a rejection that carries no message", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    enqueueNotification.mockRejectedValue("queue exploded");

    await runReservationReminderSweep();

    expect((console.error as any).mock.calls[0][1]).toBe("queue exploded");
  });

  it("keeps sweeping when the claim write fails", async () => {
    reservationFindMany.mockResolvedValue([reservation()]);
    reservationUpdateMany.mockRejectedValue(new Error("db down"));

    await expect(runReservationReminderSweep()).resolves.toBeUndefined();
    expect(enqueueNotification).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
