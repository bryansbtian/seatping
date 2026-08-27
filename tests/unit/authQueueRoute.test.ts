import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { signJwt } from "../../server/lib/auth.js";

const businessFindFirst = vi.fn();
const businessFindUnique = vi.fn();
const locationFindUnique = vi.fn();
const locationFindFirst = vi.fn();
const locationFindMany = vi.fn();
const queueEntryFindFirst = vi.fn();
const queueEntryFindUnique = vi.fn();
const queueEntryFindMany = vi.fn();
const queueEntryUpdateMany = vi.fn();
const queueEntryCount = vi.fn();
const reservationFindMany = vi.fn();

const enqueueNotification = vi.fn();
const syncCustomerQueue = vi.fn();
const touchGuestByQueueEntryId = vi.fn();

const tableAssignmentUpdateMany = vi.fn(async () => ({ count: 0 }));

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      business: { findFirst: businessFindFirst, findUnique: businessFindUnique },
      location: {
        findUnique: locationFindUnique,
        findFirst: locationFindFirst,
        findMany: locationFindMany,
      },
      queueEntry: {
        findFirst: queueEntryFindFirst,
        findUnique: queueEntryFindUnique,
        findMany: queueEntryFindMany,
        updateMany: queueEntryUpdateMany,
        count: queueEntryCount,
      },
      reservation: { findMany: reservationFindMany },
      tableAssignment: { updateMany: tableAssignmentUpdateMany },
    },
  };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification, canNotifyRecipient: vi.fn() };
});

vi.mock("../../server/lib/queueSync.js", () => {
  return { syncCustomerQueue };
});

vi.mock("../../server/lib/guests.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/guests.js");
  return { ...actual, touchGuestByQueueEntryId };
});

const authRouter = (await import("../../server/routes/auth.js")).default;

const ORIGINAL_ENV = { ...process.env };
const LOC = "0123456789abcdef01234567";
const KEY = "AdaLovelace2026-08-12";

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/auth", authRouter);
  return supertest(server);
}

function businessCookie(id = "biz-1"): string {
  return `sp_auth_business=${signJwt({ sub: id, accountType: "business", name: "Bistro" })}`;
}

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qe-1",
    queueToken: "qt-1",
    legacyKey: KEY,
    locationId: LOC,
    businessId: "biz-1",
    customerId: null,
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
    notificationMethod: "email",
    email: "ada@test.invalid",
    phone: null,
    countryCode: null,
    smsConsent: false,
    smsMarketingConsent: false,
    status: "WAITING",
    joinedAt: new Date("2026-08-12T18:00:00.000Z"),
    admittedAt: null,
    arrivedAt: null,
    noShowAt: null,
    removedAt: null,
    leftAt: null,
    finalStatus: null,
    ...overrides,
  };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOC,
    businessId: "biz-1",
    address: "1 Test Street",
    displayName: "Downtown",
    name: "Bistro Downtown",
    restaurantProfile: {},
    queueEnabled: true,
    ...overrides,
  };
}

function queuePath(key: string, action?: string): string {
  let path = `/auth/business/bistro/queue/${key}`;
  if (action) {
    path = `${path}/${action}`;
  }
  return path;
}

function admittedPath(key: string, action: string): string {
  return `/auth/business/bistro/admitted/${key}/${action}`;
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  businessFindFirst
    .mockReset()
    .mockResolvedValue({ id: "biz-1", name: "Bistro", username: "bistro" });
  businessFindUnique.mockReset().mockResolvedValue({ id: "biz-1", name: "Bistro" });
  locationFindUnique.mockReset().mockResolvedValue(locationRow());
  locationFindFirst.mockReset().mockResolvedValue(locationRow());
  locationFindMany.mockReset().mockResolvedValue([]);
  queueEntryFindFirst.mockReset().mockResolvedValue(entryRow());
  queueEntryFindUnique.mockReset().mockResolvedValue(entryRow());
  queueEntryFindMany.mockReset().mockResolvedValue([]);
  queueEntryUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  queueEntryCount.mockReset().mockResolvedValue(1);
  reservationFindMany.mockReset().mockResolvedValue([]);
  enqueueNotification.mockReset().mockResolvedValue(undefined);
  syncCustomerQueue.mockReset().mockResolvedValue(undefined);
  touchGuestByQueueEntryId.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("admitting a guest", () => {
  it("notifies the guest on their chosen channel", async () => {
    for (const method of ["sms", "whatsapp", "email"]) {
      enqueueNotification.mockClear();
      queueEntryFindFirst.mockResolvedValue(
        entryRow({ notificationMethod: method, phone: "81234567890" }),
      );

      const res = await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

      expect(res.status).toBe(200);
      expect(enqueueNotification.mock.calls[0][0].channel).toBe(method);
    }
  });

  it("sends nothing for a guest with no notification channel", async () => {
    queueEntryFindFirst.mockResolvedValue(entryRow({ notificationMethod: "none" }));

    const res = await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

    expect(res.status).toBe(200);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("defaults the contact details in the notification", async () => {
    queueEntryFindFirst.mockResolvedValue(
      entryRow({ notificationMethod: "sms", phone: null, countryCode: null }),
    );

    await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

    const job = enqueueNotification.mock.calls[0][0];
    expect(job.countryCode).toBe("+1");
    expect(job.phoneNumber).toBe("");
  });

  it("falls back through the restaurant name", async () => {
    locationFindUnique.mockResolvedValue(null);
    businessFindFirst.mockResolvedValue({
      id: "biz-1",
      name: null,
      username: "bistro",
    });

    await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

    expect(enqueueNotification.mock.calls[0][0].restaurantName).toBe("The business");
  });

  it("prefers the profile display name for the restaurant", async () => {
    locationFindUnique.mockResolvedValue(
      locationRow({ restaurantProfile: { displayName: "Warung Nusantara" } }),
    );

    await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

    expect(enqueueNotification.mock.calls[0][0].restaurantName).toBe("Warung Nusantara");
  });

  it("reports a race where the guest stopped waiting", async () => {
    queueEntryUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

    expect(res.status).toBe(409);
  });

  it("reports a server error", async () => {
    businessFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app().post(queuePath(KEY, "admit")).set("Cookie", businessCookie());

    expect(res.status).toBe(500);
  });
});

describe("confirming arrival", () => {
  it("falls back through the location label", async () => {
    locationFindUnique.mockResolvedValue(null);

    const res = await app()
      .post(admittedPath(KEY, "confirm-arrival"))
      .set("Cookie", businessCookie());

    expect(res.status).toBe(200);
    expect(syncCustomerQueue.mock.calls[0][1].locationName).toBe("Bistro");
  });

  it("uses the location display name when there is one", async () => {
    const res = await app()
      .post(admittedPath(KEY, "confirm-arrival"))
      .set("Cookie", businessCookie());

    expect(res.status).toBe(200);
    expect(syncCustomerQueue.mock.calls[0][1].locationName).toBe("Downtown");
  });

  it("reports a race where the guest is no longer admitted", async () => {
    queueEntryUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app()
      .post(admittedPath(KEY, "confirm-arrival"))
      .set("Cookie", businessCookie());

    expect(res.status).toBe(409);
  });

  it("refuses another business's guest", async () => {
    businessFindFirst.mockResolvedValue(null);

    const res = await app()
      .post(admittedPath(KEY, "confirm-arrival"))
      .set("Cookie", businessCookie());

    expect(res.status).toBe(404);
  });

  it("reports a server error", async () => {
    businessFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post(admittedPath(KEY, "confirm-arrival"))
      .set("Cookie", businessCookie());

    expect(res.status).toBe(500);
  });
});

describe("marking a no-show", () => {
  it("falls back through the location label", async () => {
    locationFindUnique.mockResolvedValue(locationRow({ displayName: null, name: null }));

    const res = await app().post(admittedPath(KEY, "mark-no-show")).set("Cookie", businessCookie());

    expect(res.status).toBe(200);
    expect(syncCustomerQueue.mock.calls[0][1].locationName).toBe("Bistro");
    expect(touchGuestByQueueEntryId).toHaveBeenCalledWith("qe-1");
  });

  it("reports a race where the guest is no longer admitted", async () => {
    queueEntryUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app().post(admittedPath(KEY, "mark-no-show")).set("Cookie", businessCookie());

    expect(res.status).toBe(409);
  });

  it("refuses another business's guest", async () => {
    businessFindFirst.mockResolvedValue(null);

    const res = await app().post(admittedPath(KEY, "mark-no-show")).set("Cookie", businessCookie());

    expect(res.status).toBe(404);
  });

  it("reports a server error", async () => {
    businessFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app().post(admittedPath(KEY, "mark-no-show")).set("Cookie", businessCookie());

    expect(res.status).toBe(500);
  });
});

describe("removing a guest", () => {
  it("falls back through the location label", async () => {
    locationFindUnique.mockResolvedValue(null);

    const res = await app().delete(queuePath(KEY)).set("Cookie", businessCookie());

    expect(res.status).toBe(200);
    expect(syncCustomerQueue.mock.calls[0][1].locationName).toBe("Bistro");
  });

  it("reports a race where the guest already left", async () => {
    queueEntryUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app().delete(queuePath(KEY)).set("Cookie", businessCookie());

    expect(res.status).toBe(409);
  });

  it("refuses another business's guest", async () => {
    businessFindFirst.mockResolvedValue(null);

    const res = await app().delete(queuePath(KEY)).set("Cookie", businessCookie());

    expect(res.status).toBe(404);
  });

  it("reports a server error", async () => {
    businessFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app().delete(queuePath(KEY)).set("Cookie", businessCookie());

    expect(res.status).toBe(500);
  });
});

describe("a guest leaving", () => {
  it("falls back through the location label", async () => {
    locationFindUnique.mockResolvedValue(null);

    const res = await app().post(queuePath(KEY, "leave"));

    expect(res.status).toBe(200);
    expect(syncCustomerQueue.mock.calls[0][1].locationName).toBe("Bistro");
  });

  it("reports a race where the guest stopped waiting", async () => {
    queueEntryUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app().post(queuePath(KEY, "leave"));

    expect(res.status).toBe(409);
  });

  it("reports a server error", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().post(queuePath(KEY, "leave"));

    expect(res.status).toBe(500);
  });
});

describe("queue status by token", () => {
  it("hides an entry that belongs to another business", async () => {
    queueEntryFindUnique.mockResolvedValue(entryRow({ businessId: "biz-other" }));

    const res = await app().get(queuePath("token/qt-1", "status"));

    expect(res.body.message).toBe("Queue session not found or expired");
  });

  it("reports the position of a waiting guest", async () => {
    queueEntryCount.mockResolvedValue(3);

    const res = await app().get(queuePath("token/qt-1", "status"));

    expect(res.body.position).toBe(3);
    expect(res.body.address).toBe("1 Test Street");
  });

  it("falls back to a blank address when the location is gone", async () => {
    locationFindUnique.mockResolvedValue(null);

    const res = await app().get(queuePath("token/qt-1", "status"));

    expect(res.body.address).toBe("");
  });

  it("reports each terminal status", async () => {
    const cases: Array<[string, string]> = [
      ["ARRIVED", "arrived"],
      ["NO_SHOW", "no_show"],
      ["REMOVED", "removed"],
      ["LEFT", "left"],
    ];

    for (const [status, expected] of cases) {
      queueEntryFindUnique.mockResolvedValue(entryRow({ status }));
      const res = await app().get(queuePath("token/qt-1", "status"));
      expect(res.body.status).toBe(expected);
    }
  });

  it("reports an admitted guest and whether the hold expired", async () => {
    queueEntryFindUnique.mockResolvedValue(
      entryRow({ status: "ADMITTED", admittedAt: new Date() }),
    );
    const fresh = await app().get(queuePath("token/qt-1", "status"));

    queueEntryFindUnique.mockResolvedValue(
      entryRow({
        status: "ADMITTED",
        admittedAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    );
    const stale = await app().get(queuePath("token/qt-1", "status"));

    expect(fresh.body.admitted).toBe(true);
    expect(fresh.body.expired).toBe(false);
    expect(stale.body.expired).toBe(true);
    expect(stale.body.message).toBe("Hold window has expired");
  });

  it("reports no hold window when there is no admit time", async () => {
    queueEntryFindUnique.mockResolvedValue(entryRow({ status: "ADMITTED", admittedAt: null }));

    const res = await app().get(queuePath("token/qt-1", "status"));

    expect(res.body.turnExpiresAt).toBeNull();
    expect(res.body.expired).toBe(false);
  });

  it("rejects a blank username or token", async () => {
    const noUser = await app().get("/auth/business/%20/queue/token/qt-1/status");
    const noToken = await app().get("/auth/business/bistro/queue/token/%20/status");

    expect(noUser.status).toBe(400);
    expect(noToken.status).toBe(400);
  });

  it("reports an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app().get(queuePath("token/qt-1", "status"));

    expect(res.status).toBe(404);
  });
});

describe("queue status by customer key", () => {
  it("reports the most active entry when several share a key", async () => {
    queueEntryFindMany.mockResolvedValue([
      entryRow({ id: "a", status: "LEFT" }),
      entryRow({ id: "b", status: "WAITING" }),
    ]);
    queueEntryCount.mockResolvedValue(2);

    const res = await app().get(queuePath(KEY, "status"));

    expect(res.body.position).toBe(2);
  });

  it("reports each terminal status", async () => {
    const cases: Array<[string, string]> = [
      ["ARRIVED", "arrived"],
      ["NO_SHOW", "no_show"],
      ["REMOVED", "removed"],
      ["LEFT", "left"],
    ];

    for (const [status, expected] of cases) {
      queueEntryFindMany.mockResolvedValue([entryRow({ status })]);
      const res = await app().get(queuePath(KEY, "status"));
      expect(res.body.status).toBe(expected);
    }
  });

  it("reports an admitted guest and an expired hold", async () => {
    queueEntryFindMany.mockResolvedValue([
      entryRow({
        status: "ADMITTED",
        admittedAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    ]);

    const res = await app().get(queuePath(KEY, "status"));

    expect(res.body.admitted).toBe(true);
    expect(res.body.expired).toBe(true);
  });

  it("reports an admitted guest with no recorded admit time", async () => {
    queueEntryFindMany.mockResolvedValue([entryRow({ status: "ADMITTED", admittedAt: null })]);

    const res = await app().get(queuePath(KEY, "status"));

    expect(res.body.turnExpiresAt).toBeNull();
  });

  it("reports a guest it has never seen", async () => {
    const res = await app().get(queuePath("never-queued", "status"));

    expect(res.body.message).toBe("Customer not found");
  });
});

describe("wait estimates", () => {
  it("reports nothing when the ticket belongs to another business", async () => {
    queueEntryFindUnique.mockResolvedValue({
      locationId: LOC,
      businessId: "biz-other",
      status: "WAITING",
    });

    const res = await app().get(queuePath("token/qt-1", "eta"));

    expect(res.status).toBe(404);
  });

  it("reports nothing when the location is gone", async () => {
    queueEntryFindUnique.mockResolvedValue({
      locationId: LOC,
      businessId: "biz-1",
      status: "WAITING",
    });
    locationFindUnique.mockResolvedValue(null);

    const res = await app().get(queuePath("token/qt-1", "eta"));

    expect(res.status).toBe(404);
  });

  it("estimates the wait for a queued ticket", async () => {
    queueEntryFindUnique.mockResolvedValue({
      locationId: LOC,
      businessId: "biz-1",
      status: "WAITING",
    });
    queueEntryFindMany.mockResolvedValue([entryRow({ queueToken: "qt-1" })]);

    const res = await app().get(queuePath("token/qt-1", "eta"));

    expect(res.status).toBe(200);
    expect(res.body.eta.position).toBe(1);
  });

  it("refuses estimates for another business's location", async () => {
    locationFindFirst.mockResolvedValue(null);

    const res = await app()
      .get(`/auth/business/bistro/locations/${LOC}/queue-etas`)
      .set("Cookie", businessCookie());

    expect(res.status).toBe(404);
  });

  it("lists estimates for a location the business owns", async () => {
    queueEntryFindMany.mockResolvedValue([entryRow()]);

    const res = await app()
      .get(`/auth/business/bistro/locations/${LOC}/queue-etas`)
      .set("Cookie", businessCookie());

    expect(res.status).toBe(200);
    expect(res.body.etas).toHaveLength(1);
  });

  it("reports a server error on the estimates list", async () => {
    locationFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app()
      .get(`/auth/business/bistro/locations/${LOC}/queue-etas`)
      .set("Cookie", businessCookie());

    expect(res.status).toBe(500);
  });
});
