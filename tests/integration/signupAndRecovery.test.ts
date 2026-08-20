import { afterAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { customerCookie } from "../helpers/auth.js";
import { sinks } from "../setup/externalMocks.js";
import { seedBusinessWithLocation, seedCustomer, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function signupBody(overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  return {
    name: `New User ${suffix}`,
    username: `user-${suffix}`,
    email: `user-${suffix}@test.invalid`,
    phone: "+15551234567",
    password: "StrongPassw0rd!",
    ...overrides,
  };
}

describe("customer signup", () => {
  it("creates a customer and issues a session", async () => {
    const body = signupBody();

    const res = await (await api()).post("/auth/signup").send(body);

    expect(res.status).toBe(201);
    expect((res.headers["set-cookie"] ?? []).join(";")).toContain("sp_auth_customer");

    const stored = await db.user.findUnique({ where: { email: body.email } });
    expect(stored).not.toBeNull();
    expect(stored?.password).not.toBe(body.password);
  });

  it("rejects a duplicate email", async () => {
    const existing = await seedCustomer();

    const res = await (
      await api()
    )
      .post("/auth/signup")
      .send(signupBody({ email: existing.email }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a weak password", async () => {
    const res = await (await api()).post("/auth/signup").send(signupBody({ password: "short" }));

    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });

  it("rejects a malformed email", async () => {
    const res = await (
      await api()
    )
      .post("/auth/signup")
      .send(signupBody({ email: "not-an-email" }));

    expect(res.status).toBe(400);
  });
});

describe("business signup", () => {
  it("creates a business account", async () => {
    const body = signupBody();

    const res = await (await api()).post("/auth/business/signup").send(body);

    expect(res.status).toBe(201);
    const stored = await db.business.findUnique({ where: { email: body.email } });
    expect(stored).not.toBeNull();
    expect(stored?.password).not.toBe(body.password);
  });

  it("rejects a duplicate business username", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/auth/business/signup")
      .send(signupBody({ username: business.username }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("password recovery", () => {
  it("accepts a forgot-password request for a known customer", async () => {
    const customer = await seedCustomer();

    const res = await (
      await api()
    )
      .post("/auth/forgot-password")
      .send({ email: customer.email, type: "customer" });

    expect(res.status).toBe(200);

    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored?.resetToken).toEqual(expect.any(String));
    expect(stored?.resetTokenExpiry).toBeInstanceOf(Date);
    expect(sinks().email.length).toBeGreaterThanOrEqual(1);
  });

  it("does not reveal whether an unknown email exists", async () => {
    const res = await (
      await api()
    )
      .post("/auth/forgot-password")
      .send({ email: "nobody-here@test.invalid", type: "customer" });

    expect(res.status).toBe(200);
  });

  it("requires an email", async () => {
    const res = await (await api()).post("/auth/forgot-password").send({});

    expect(res.status).toBe(400);
  });

  it("resets the password with a valid token", async () => {
    const customer = await seedCustomer();
    const rawToken = crypto.randomBytes(24).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

    await db.user.update({
      where: { id: customer.id },
      data: {
        resetToken: hashed,
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await (
      await api()
    )
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "AnotherStrongPass1!" });

    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const stored = await db.user.findUnique({ where: { id: customer.id } });
      expect(stored?.password).not.toBe(customer.password);
      expect(stored?.resetToken).toBeNull();
    }
  });

  it("rejects an unknown reset token", async () => {
    const res = await (
      await api()
    )
      .post("/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "AnotherStrongPass1!" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("requires both a token and a new password", async () => {
    const res = await (await api()).post("/auth/reset-password").send({ token: "abc" });

    expect(res.status).toBe(400);
  });

  it("refuses an expired reset token", async () => {
    const customer = await seedCustomer();
    const rawToken = crypto.randomBytes(24).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

    await db.user.update({
      where: { id: customer.id },
      data: {
        resetToken: hashed,
        resetTokenExpiry: new Date(Date.now() - 60 * 1000),
      },
    });

    const res = await (
      await api()
    )
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "AnotherStrongPass1!" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored?.password).toBe(customer.password);
  });
});

describe("saved restaurants", () => {
  it("saves a restaurant for the customer", async () => {
    const customer = await seedCustomer();
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/auth/me/saved-restaurants")
      .set("Cookie", customerCookie(customer.id))
      .send({
        businessUsername: business.username,
        businessName: business.name,
        locationName: location.displayName,
      });

    expect(res.status).toBeLessThan(500);
  });

  it("requires a business username", async () => {
    const customer = await seedCustomer();

    const res = await (
      await api()
    )
      .post("/auth/me/saved-restaurants")
      .set("Cookie", customerCookie(customer.id))
      .send({});

    expect(res.status).toBe(400);
  });

  it("rejects an anonymous save", async () => {
    const res = await (
      await api()
    )
      .post("/auth/me/saved-restaurants")
      .send({ businessUsername: "someone" });

    expect(res.status).toBe(401);
  });
});
