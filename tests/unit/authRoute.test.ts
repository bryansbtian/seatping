import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import bcrypt from "bcrypt";
import { signJwt } from "../../server/lib/auth.js";

const userFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const businessFindFirst = vi.fn();
const businessFindUnique = vi.fn();
const businessFindMany = vi.fn();
const businessCreate = vi.fn();
const businessUpdate = vi.fn();
const locationFindMany = vi.fn();
const locationFindFirst = vi.fn();
const locationFindUnique = vi.fn();
const locationUpdateMany = vi.fn();
const locationUpdate = vi.fn();
const locationCreate = vi.fn();
const queueEntryFindFirst = vi.fn();
const queueEntryFindUnique = vi.fn();
const queueEntryFindMany = vi.fn();
const queueEntryCreate = vi.fn();
const queueEntryCount = vi.fn();

const sendCustomerWelcomeEmail = vi.fn();
const sendPasswordResetEmail = vi.fn();
const sendPasswordChangeConfirmationEmail = vi.fn();
const sendBusinessOnboardingEmail = vi.fn();
const enqueueNotification = vi.fn();
const canNotifyRecipient = vi.fn();
const assembleBusinessMe = vi.fn();
const syncCustomerQueue = vi.fn();
const syncGuestFromQueueEntry = vi.fn();
const enforceTrialExpiration = vi.fn();
const checkAndRefillMonthlyCredits = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      user: {
        findFirst: userFindFirst,
        findUnique: userFindUnique,
        create: userCreate,
        update: userUpdate,
      },
      business: {
        findFirst: businessFindFirst,
        findUnique: businessFindUnique,
        findMany: businessFindMany,
        create: businessCreate,
        update: businessUpdate,
      },
      location: {
        findMany: locationFindMany,
        findFirst: locationFindFirst,
        findUnique: locationFindUnique,
        updateMany: locationUpdateMany,
        update: locationUpdate,
        create: locationCreate,
      },
      queueEntry: {
        findFirst: queueEntryFindFirst,
        findUnique: queueEntryFindUnique,
        findMany: queueEntryFindMany,
        create: queueEntryCreate,
        count: queueEntryCount,
      },
    },
  };
});

vi.mock("../../server/lib/email.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/email.js");
  return {
    ...actual,
    sendCustomerWelcomeEmail,
    sendPasswordResetEmail,
    sendPasswordChangeConfirmationEmail,
    sendBusinessOnboardingEmail,
  };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification, canNotifyRecipient };
});

vi.mock("../../server/lib/business.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/business.js");
  return { ...actual, assembleBusinessMe };
});

vi.mock("../../server/lib/queueSync.js", () => {
  return { syncCustomerQueue };
});

vi.mock("../../server/lib/guests.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/guests.js");
  return { ...actual, syncGuestFromQueueEntry };
});

vi.mock("../../server/lib/trial.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/trial.js");
  return { ...actual, enforceTrialExpiration, checkAndRefillMonthlyCredits };
});

const authRouter = (await import("../../server/routes/auth.js")).default;

const ORIGINAL_ENV = { ...process.env };
const LOC = "0123456789abcdef01234567";
const ADMIN_PASSWORD = "AdminPassw0rd!";

let ipCounter = 0;
let recoveryCounter = 0;

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/auth", authRouter);
  return supertest(server);
}

function freshEmail(): string {
  recoveryCounter += 1;
  return `recover-${recoveryCounter}@test.invalid`;
}

function freshIp(): string {
  ipCounter += 1;
  return `10.30.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function customerCookie(id = "cust-1"): string {
  return `sp_auth_customer=${signJwt({ sub: id, accountType: "customer", name: "Ada" })}`;
}

function businessCookie(id = "biz-1"): string {
  return `sp_auth_business=${signJwt({ sub: id, accountType: "business", name: "Bistro" })}`;
}

function customerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cust-1",
    name: "Ada Lovelace",
    email: "ada@test.invalid",
    username: "ada",
    phone: "+15550000000",
    upcomingReservations: [],
    pastReservations: [],
    queueingActivity: [],
    savedRestaurants: [],
    createdAt: new Date(),
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
    area: "Kemang",
    city: "Jakarta",
    country: "Indonesia",
    latitude: null,
    longitude: null,
    googleMapsUrl: null,
    queueEnabled: true,
    credits: 100,
    restaurantProfile: {},
    photos: [],
    ...overrides,
  };
}

function joinPayload(overrides: Record<string, unknown> = {}) {
  return {
    locationId: LOC,
    firstName: "Ada",
    lastName: "Lovelace",
    numGuests: 2,
    notificationMethod: "email",
    email: `join-${Math.random()}@test.invalid`,
    ...overrides,
  };
}

beforeEach(async () => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  process.env.ADMIN_USERNAME = "test-admin";
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(ADMIN_PASSWORD, 4);
  delete process.env.FRONTEND_URL;
  delete process.env.APP_ORIGIN;
  delete process.env.CLIENT_ORIGIN;

  userFindFirst.mockReset().mockResolvedValue(null);
  userFindUnique.mockReset().mockResolvedValue(customerRow());
  userCreate.mockReset().mockResolvedValue(customerRow());
  userUpdate.mockReset().mockResolvedValue(customerRow());
  businessFindFirst.mockReset().mockResolvedValue(null);
  businessFindUnique
    .mockReset()
    .mockResolvedValue({ id: "biz-1", name: "Bistro", email: "owner@test.invalid" });
  businessFindMany.mockReset().mockResolvedValue([]);
  businessCreate.mockReset().mockResolvedValue({
    id: "biz-1",
    name: "Bistro",
    username: "bistro",
    email: "owner@test.invalid",
  });
  businessUpdate.mockReset().mockResolvedValue({});
  locationFindMany.mockReset().mockResolvedValue([]);
  locationFindFirst.mockReset().mockResolvedValue(locationRow());
  locationFindUnique.mockReset().mockResolvedValue(locationRow());
  locationUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  locationUpdate.mockReset().mockResolvedValue({});
  locationCreate.mockReset().mockResolvedValue(locationRow());
  queueEntryFindFirst.mockReset().mockResolvedValue(null);
  queueEntryFindUnique.mockReset().mockResolvedValue(null);
  queueEntryFindMany.mockReset().mockResolvedValue([]);
  queueEntryCreate.mockReset().mockImplementation(async ({ data }) => {
    return { id: "qe-1", ...data };
  });
  queueEntryCount.mockReset().mockResolvedValue(1);

  sendCustomerWelcomeEmail.mockReset().mockResolvedValue(true);
  sendPasswordResetEmail.mockReset().mockResolvedValue(true);
  sendPasswordChangeConfirmationEmail.mockReset().mockResolvedValue(true);
  sendBusinessOnboardingEmail.mockReset().mockResolvedValue(true);
  enqueueNotification.mockReset().mockResolvedValue(undefined);
  canNotifyRecipient.mockReset().mockResolvedValue(true);
  assembleBusinessMe.mockReset().mockResolvedValue({ id: "biz-1" });
  syncCustomerQueue.mockReset().mockResolvedValue(undefined);
  syncGuestFromQueueEntry.mockReset().mockResolvedValue(undefined);
  enforceTrialExpiration.mockReset().mockResolvedValue(undefined);
  checkAndRefillMonthlyCredits.mockReset().mockResolvedValue(undefined);

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("session probe", () => {
  it("reports nobody when there is no cookie", async () => {
    const res = await app().get("/auth/session");

    expect(res.body).toEqual({ customer: null, business: null });
  });

  it("reports both session types when both cookies are present", async () => {
    const res = await app()
      .get("/auth/session")
      .set("Cookie", [customerCookie(), businessCookie()]);

    expect(res.body.customer).toEqual({ name: "Ada" });
    expect(res.body.business).toEqual({ name: "Bistro" });
  });

  it("reports the admin session separately", async () => {
    const anon = await app().get("/auth/admin/session");
    const signedIn = await app()
      .get("/auth/admin/session")
      .set("Cookie", `sp_auth_admin=${signJwt({ sub: "admin", accountType: "admin" })}`);

    expect(anon.body.authenticated).toBe(false);
    expect(signedIn.body.authenticated).toBe(true);
  });
});

describe("customer signup and login", () => {
  const signup = {
    name: "Ada Lovelace",
    username: "ada",
    email: "ada@test.invalid",
    phone: "+15550000000",
    password: "TestPassw0rd!",
  };

  it("refuses an email or username already in use", async () => {
    userFindFirst.mockResolvedValue({ id: "cust-existing" });

    const res = await app().post("/auth/signup").set("X-Forwarded-For", freshIp()).send(signup);

    expect(res.status).toBe(409);
  });

  it("keeps the signup when the welcome email fails", async () => {
    sendCustomerWelcomeEmail.mockRejectedValue(new Error("smtp down"));

    const res = await app().post("/auth/signup").set("X-Forwarded-For", freshIp()).send(signup);

    expect(res.status).toBe(201);
  });

  it("reports a server error on signup", async () => {
    userCreate.mockRejectedValue(new Error("db down"));

    const res = await app().post("/auth/signup").set("X-Forwarded-For", freshIp()).send(signup);

    expect(res.status).toBe(500);
  });

  it("refuses an unknown account and a wrong password alike", async () => {
    const unknown = await app()
      .post("/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ emailOrUsername: "ada@test.invalid", password: "TestPassw0rd!" });

    userFindFirst.mockResolvedValue({
      id: "cust-1",
      name: "Ada",
      password: await bcrypt.hash("TheRealPassword1!", 4),
    });
    const wrong = await app()
      .post("/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ emailOrUsername: "ada@test.invalid", password: "TestPassw0rd!" });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it("reports a server error on login", async () => {
    userFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ emailOrUsername: "ada@test.invalid", password: "TestPassw0rd!" });

    expect(res.status).toBe(500);
  });

  it("clears the cookie on logout", async () => {
    const customer = await app().post("/auth/customer/logout");
    const business = await app().post("/auth/business/logout");
    const admin = await app().post("/auth/admin/logout");

    expect(customer.body).toEqual({ ok: true });
    expect(business.body).toEqual({ ok: true });
    expect(admin.body).toEqual({ ok: true });
  });
});

describe("activity enrichment", () => {
  it("leaves a profile with no activity untouched", async () => {
    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    expect(res.body.user.upcomingReservations).toEqual([]);
    expect(locationFindMany).not.toHaveBeenCalled();
  });

  it("attaches the restaurant image and name by location", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({
        upcomingReservations: [{ id: "r1", locationId: LOC }],
      }),
    );
    locationFindMany.mockResolvedValue([
      locationRow({
        bannerImageUrl: "https://test.invalid/banner.jpg",
        restaurantProfile: { displayName: "Warung Nusantara" },
      }),
    ]);
    businessFindMany.mockResolvedValue([{ id: "biz-1", name: "Bistro" }]);

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    const entry = res.body.user.upcomingReservations[0];
    expect(entry.imageUrl).toBe("https://test.invalid/banner.jpg");
    expect(entry.restaurantName).toBe("Warung Nusantara");
  });

  it("falls back to the gallery photo and the business name", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({ pastReservations: [{ id: "r1", locationId: LOC }] }),
    );
    locationFindMany.mockResolvedValue([
      locationRow({
        bannerImageUrl: null,
        photos: [{ url: "https://test.invalid/gallery.jpg" }],
      }),
    ]);
    businessFindMany.mockResolvedValue([{ id: "biz-1", name: "Bistro" }]);

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    const entry = res.body.user.pastReservations[0];
    expect(entry.imageUrl).toBe("https://test.invalid/gallery.jpg");
    expect(entry.restaurantName).toBe("Bistro");
  });

  it("falls back through the location names", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({ queueingActivity: [{ id: "q1", locationId: LOC }] }),
    );
    locationFindMany.mockResolvedValue([locationRow({ bannerImageUrl: null, photos: [] })]);
    businessFindMany.mockResolvedValue([]);

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    expect(res.body.user.queueingActivity[0].restaurantName).toBe("Downtown");
    expect(res.body.user.queueingActivity[0].imageUrl).toBeNull();
  });

  it("resolves an entry that only carries a business username", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({
        queueingActivity: [{ id: "q1", businessUsername: "bistro" }],
      }),
    );
    businessFindMany.mockResolvedValue([{ id: "biz-1", username: "bistro", name: "Bistro" }]);
    locationFindMany.mockResolvedValue([
      locationRow({ bannerImageUrl: "https://test.invalid/b.jpg" }),
      locationRow({ id: "loc-2", bannerImageUrl: "https://test.invalid/second.jpg" }),
    ]);

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    const entry = res.body.user.queueingActivity[0];
    expect(entry.imageUrl).toBe("https://test.invalid/b.jpg");
    expect(entry.restaurantName).toBe("Bistro");
  });

  it("tolerates a business username with no locations", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({
        queueingActivity: [{ id: "q1", businessUsername: "bistro" }],
      }),
    );
    businessFindMany.mockResolvedValue([{ id: "biz-1", username: "bistro", name: "Bistro" }]);
    locationFindMany.mockResolvedValue([]);

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    expect(res.body.user.queueingActivity[0].imageUrl).toBeNull();
    expect(res.body.user.queueingActivity[0].restaurantName).toBe("Bistro");
  });

  it("keeps an image the entry already carries", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({
        upcomingReservations: [
          {
            id: "r1",
            locationId: LOC,
            imageUrl: "https://test.invalid/stored.jpg",
            businessName: "Stored Name",
          },
        ],
      }),
    );
    locationFindMany.mockResolvedValue([]);

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    const entry = res.body.user.upcomingReservations[0];
    expect(entry.imageUrl).toBe("https://test.invalid/stored.jpg");
    expect(entry.restaurantName).toBe("Stored Name");
  });

  it("tolerates activity lists of the wrong shape", async () => {
    userFindUnique.mockResolvedValue(
      customerRow({
        upcomingReservations: "not a list",
        pastReservations: null,
        queueingActivity: [{ id: "q1" }],
      }),
    );

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    expect(res.status).toBe(200);
    expect(res.body.user.queueingActivity[0].restaurantName).toBeNull();
  });

  it("reports a server error while loading the profile", async () => {
    userFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/me").set("Cookie", customerCookie());

    expect(res.status).toBe(500);
  });
});

describe("password recovery", () => {
  it("requires an email address", async () => {
    const res = await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .send({});

    expect(res.status).toBe(400);
  });

  it("answers the same way for an address it does not know", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .send({ email: freshEmail() });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stamps a reset token on a business account", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      email: "owner@test.invalid",
    });

    const res = await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .send({ email: freshEmail(), type: "business" });

    expect(res.status).toBe(200);
    expect(businessUpdate).toHaveBeenCalled();
    expect(sendPasswordResetEmail.mock.calls[0][2]).toBe("business");
  });

  it("stamps a reset token on a customer account", async () => {
    userFindUnique.mockResolvedValue({
      id: "cust-1",
      email: "ada@test.invalid",
    });

    await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .send({ email: freshEmail() });

    expect(userUpdate).toHaveBeenCalled();
    expect(sendPasswordResetEmail.mock.calls[0][2]).toBe("customer");
  });

  it("only trusts an origin on the allow list", async () => {
    process.env.FRONTEND_URL = "https://app.test.invalid";
    userFindUnique.mockResolvedValue({ id: "cust-1", email: "ada@test.invalid" });

    await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .set("Origin", "https://app.test.invalid")
      .send({ email: freshEmail() });
    expect(sendPasswordResetEmail.mock.calls[0][3]).toBe("https://app.test.invalid");

    sendPasswordResetEmail.mockClear();
    await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .set("Origin", "https://evil.test.invalid")
      .send({ email: freshEmail() });
    expect(sendPasswordResetEmail.mock.calls[0][3]).toBeUndefined();
  });

  it("reports a failed reset email", async () => {
    userFindUnique.mockResolvedValue({ id: "cust-1", email: "ada@test.invalid" });
    sendPasswordResetEmail.mockResolvedValue(false);

    const res = await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .send({ email: freshEmail() });

    expect(res.status).toBe(500);
  });

  it("reports a server error while starting a reset", async () => {
    userFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/auth/forgot-password")
      .set("X-Forwarded-For", freshIp())
      .send({ email: freshEmail() });

    expect(res.status).toBe(500);
  });
});

describe("completing a password reset", () => {
  it("requires a token and a long enough password", async () => {
    const missing = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({});
    const short = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({ token: "tok", newPassword: "short" });

    expect(missing.status).toBe(400);
    expect(short.status).toBe(400);
    expect(short.body.error).toContain("at least 8");
  });

  it("resets a business password", async () => {
    businessFindFirst.mockResolvedValue({
      id: "biz-1",
      email: "owner@test.invalid",
      name: "Bistro",
    });

    const res = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({ token: "tok", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(200);
    expect(businessUpdate.mock.calls[0][0].data.resetToken).toBeNull();
  });

  it("resets a customer password", async () => {
    userFindFirst.mockResolvedValue({
      id: "cust-1",
      email: "ada@test.invalid",
      name: "Ada",
    });

    const res = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({ token: "tok", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(200);
    expect(userUpdate.mock.calls[0][0].data.resetTokenExpiry).toBeNull();
  });

  it("keeps the reset when the confirmation email fails", async () => {
    userFindFirst.mockResolvedValue({
      id: "cust-1",
      email: "ada@test.invalid",
      name: "Ada",
    });
    sendPasswordChangeConfirmationEmail.mockRejectedValue(new Error("smtp"));

    const res = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({ token: "tok", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(200);
  });

  it("rejects a token it cannot match", async () => {
    const res = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({ token: "tok", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid or expired");
  });

  it("reports a server error while resetting", async () => {
    businessFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/auth/reset-password")
      .set("X-Forwarded-For", freshIp())
      .send({ token: "tok", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(500);
  });
});

describe("username availability", () => {
  it("requires a username", async () => {
    const res = await app().get("/auth/exists").set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(400);
  });

  it("reports whether a business username is taken", async () => {
    const taken = await app().get("/auth/exists?username=bistro").set("X-Forwarded-For", freshIp());
    businessFindUnique.mockResolvedValue(null);
    const free = await app().get("/auth/exists?username=free").set("X-Forwarded-For", freshIp());

    expect(taken.body.exists).toBe(true);
    expect(free.body.exists).toBe(false);
  });

  it("reports a server error", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/exists?username=bistro").set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(500);
  });
});

describe("business signup and login", () => {
  const signup = {
    name: "Bistro",
    username: "bistro",
    email: "owner@test.invalid",
    phone: "+15550000000",
    password: "TestPassw0rd!",
  };

  it("refuses an email or username already in use", async () => {
    businessFindFirst.mockResolvedValue({ id: "biz-existing" });

    const res = await app()
      .post("/auth/business/signup")
      .set("X-Forwarded-For", freshIp())
      .send(signup);

    expect(res.status).toBe(409);
  });

  it("keeps the signup when the onboarding email fails", async () => {
    sendBusinessOnboardingEmail.mockRejectedValue(new Error("smtp down"));

    const res = await app()
      .post("/auth/business/signup")
      .set("X-Forwarded-For", freshIp())
      .send(signup);

    expect(res.status).toBe(201);
  });

  it("reports a server error on business signup", async () => {
    businessCreate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/auth/business/signup")
      .set("X-Forwarded-For", freshIp())
      .send(signup);

    expect(res.status).toBe(500);
  });

  it("refuses an unknown account and a wrong password alike", async () => {
    const unknown = await app()
      .post("/auth/business/login")
      .set("X-Forwarded-For", freshIp())
      .send({ emailOrUsername: "owner@test.invalid", password: "TestPassw0rd!" });

    businessFindFirst.mockResolvedValue({
      id: "biz-1",
      name: "Bistro",
      password: await bcrypt.hash("TheRealPassword1!", 4),
    });
    const wrong = await app()
      .post("/auth/business/login")
      .set("X-Forwarded-For", freshIp())
      .send({ emailOrUsername: "owner@test.invalid", password: "TestPassw0rd!" });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it("reports a server error on business login", async () => {
    businessFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/auth/business/login")
      .set("X-Forwarded-For", freshIp())
      .send({ emailOrUsername: "owner@test.invalid", password: "TestPassw0rd!" });

    expect(res.status).toBe(500);
  });

  it("reports a missing business profile", async () => {
    assembleBusinessMe.mockResolvedValue(null);

    const res = await app().get("/auth/business/me").set("Cookie", businessCookie());

    expect(res.status).toBe(404);
  });

  it("reports a server error on the business profile", async () => {
    enforceTrialExpiration.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/business/me").set("Cookie", businessCookie());

    expect(res.status).toBe(500);
  });
});

describe("admin login", () => {
  it("fails closed when the admin env vars are missing", async () => {
    delete process.env.ADMIN_USERNAME;

    const res = await app()
      .post("/auth/admin/login")
      .set("X-Forwarded-For", freshIp())
      .send({ username: "test-admin", password: ADMIN_PASSWORD });

    expect(res.status).toBe(401);
  });

  it("fails closed when the password hash is missing", async () => {
    delete process.env.ADMIN_PASSWORD_HASH;

    const res = await app()
      .post("/auth/admin/login")
      .set("X-Forwarded-For", freshIp())
      .send({ username: "test-admin", password: ADMIN_PASSWORD });

    expect(res.status).toBe(401);
  });

  it("refuses a wrong username or password with the same message", async () => {
    const wrongUser = await app()
      .post("/auth/admin/login")
      .set("X-Forwarded-For", freshIp())
      .send({ username: "someone-else", password: ADMIN_PASSWORD });
    const wrongPass = await app()
      .post("/auth/admin/login")
      .set("X-Forwarded-For", freshIp())
      .send({ username: "test-admin", password: "nope" });

    expect(wrongUser.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    expect(wrongUser.body.error).toBe(wrongPass.body.error);
  });

  it("signs a valid admin in", async () => {
    const res = await app()
      .post("/auth/admin/login")
      .set("X-Forwarded-For", freshIp())
      .send({ username: "test-admin", password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"].join()).toContain("sp_auth_admin");
  });

  it("answers a malformed hash with the generic refusal", async () => {
    process.env.ADMIN_PASSWORD_HASH = "not-a-bcrypt-hash";

    const res = await app()
      .post("/auth/admin/login")
      .set("X-Forwarded-For", freshIp())
      .send({ username: "test-admin", password: ADMIN_PASSWORD });

    expect(res.status).toBe(401);
  });
});

describe("business address directory", () => {
  it("requires a username", async () => {
    const res = await app().get("/auth/business/%20/addresses");

    expect(res.status).toBe(400);
  });

  it("falls back through the location and profile names", async () => {
    locationFindMany.mockResolvedValue([
      locationRow({ restaurantProfile: { displayName: "Warung" } }),
      locationRow({ id: "l2", displayName: null }),
      locationRow({ id: "l3", displayName: null, name: null }),
      locationRow({ id: "l4", queueEnabled: null }),
    ]);

    const res = await app().get("/auth/business/bistro/addresses");

    expect(res.body.addresses[0].restaurantName).toBe("Warung");
    expect(res.body.addresses[1].restaurantName).toBe("Bistro Downtown");
    expect(res.body.addresses[2].restaurantName).toBeNull();
    expect(res.body.addresses[3].queueEnabled).toBe(true);
  });

  it("reports a server error", async () => {
    locationFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/business/bistro/addresses");

    expect(res.status).toBe(500);
  });
});

describe("joining a queue", () => {
  it("requires the core fields and a location", async () => {
    const missing = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send({ firstName: "Ada" });
    const noLocation = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload({ locationId: undefined, address: undefined }));

    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("All fields are required");
    expect(noLocation.status).toBe(400);
    expect(noLocation.body.error).toBe("A location is required");
  });

  it("requires a blank username to be rejected", async () => {
    const res = await app()
      .post("/auth/business/%20/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(400);
  });

  it("rejects an unknown notification method", async () => {
    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload({ notificationMethod: "pigeon" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid notification method");
  });

  it("requires a phone number for whatsapp", async () => {
    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(
        joinPayload({
          notificationMethod: "whatsapp",
          email: undefined,
          phoneNumber: undefined,
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Phone number is required");
  });

  it("accepts a whatsapp join without an sms consent flag", async () => {
    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(
        joinPayload({
          notificationMethod: "whatsapp",
          email: undefined,
          phoneNumber: "81234567890",
        }),
      );

    expect(res.status).toBe(200);
  });

  it("resolves the location by address when no id is given", async () => {
    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload({ locationId: undefined, address: "1 Test Street" }));

    expect(res.status).toBe(200);
    expect(locationFindFirst.mock.calls[0][0].where.address).toBe("1 Test Street");
  });

  it("reports an unknown business and an unknown location", async () => {
    businessFindUnique.mockResolvedValue(null);
    const noBusiness = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    businessFindUnique.mockResolvedValue({ id: "biz-1", name: "Bistro" });
    locationFindFirst.mockResolvedValue(null);
    const noLocation = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(noBusiness.status).toBe(404);
    expect(noLocation.status).toBe(404);
  });

  it("refuses a location with queueing switched off", async () => {
    locationFindFirst.mockResolvedValue(locationRow({ queueEnabled: false }));

    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not available at this location");
  });

  it("refuses a join outside the operating hours", async () => {
    const closed = {
      timezone: "UTC",
      monday: { enabled: false },
      tuesday: { enabled: false },
      wednesday: { enabled: false },
      thursday: { enabled: false },
      friday: { enabled: false },
      saturday: { enabled: false },
      sunday: { enabled: false },
    };
    locationFindFirst.mockResolvedValue(
      locationRow({ restaurantProfile: { openingHours: closed } }),
    );

    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("currently closed");
    expect(res.body.operatingStatus.isOpen).toBe(false);
  });

  it("refuses a contact already waiting", async () => {
    queueEntryFindFirst.mockResolvedValue({ id: "qe-existing" });

    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(409);
    expect(res.body.alreadyInQueue).toBe(true);
  });

  it("refuses a contact that hit the daily notification cap", async () => {
    canNotifyRecipient.mockResolvedValue(false);

    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(429);
  });

  it("refuses a join when the location has no credits", async () => {
    locationUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("no credits remaining");
  });

  it("gives the credit back when the write fails", async () => {
    queueEntryCreate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(res.status).toBe(500);
    expect(locationUpdate).toHaveBeenCalledWith({
      where: { id: LOC },
      data: { credits: { increment: 1 } },
    });
  });

  it("links the entry to a signed-in customer", async () => {
    const res = await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .set("Cookie", customerCookie())
      .send(joinPayload());

    expect(res.status).toBe(200);
    expect(queueEntryCreate.mock.calls[0][0].data.customerId).toBe("cust-1");
  });

  it("defaults the country code and optional fields", async () => {
    await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    const data = queueEntryCreate.mock.calls[0][0].data;
    expect(data.countryCode).toBe("+1");
    expect(data.phone).toBeNull();
    expect(data.smsConsent).toBe(false);
    expect(data.smsMarketingConsent).toBe(false);
  });

  it("falls back through the restaurant name for the notification", async () => {
    locationFindFirst.mockResolvedValue(locationRow({ displayName: null, name: null }));
    businessFindUnique.mockResolvedValue({ id: "biz-1", name: null });

    await app()
      .post("/auth/business/bistro/queue")
      .set("X-Forwarded-For", freshIp())
      .send(joinPayload());

    expect(enqueueNotification.mock.calls[0][0].restaurantName).toBe("the business");
  });
});

describe("queue hold window", () => {
  it("does not reveal whether an unknown token ever existed", async () => {
    const res = await app().get("/auth/business/bistro/queue/token/qt-1/status");

    expect(res.status).toBeLessThan(500);
    expect(JSON.stringify(res.body)).not.toContain("qt-1");
  });

  it("reports a server error on the token status route", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/business/bistro/queue/token/qt-1/status");

    expect(res.status).toBe(500);
  });

  it("reports a server error on the customer status route", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/business/bistro/queue/key-1/status");

    expect(res.status).toBe(500);
  });

  it("reports a server error on the eta route", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/business/bistro/queue/token/qt-1/eta");

    expect(res.status).toBe(500);
  });
});
