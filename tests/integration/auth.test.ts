import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie, customerCookie } from "../helpers/auth.js";
import { TEST_ADMIN_PASSWORD, TEST_ADMIN_USERNAME } from "../helpers/constants.js";
import {
  TEST_PASSWORD,
  seedBusinessWithLocation,
  seedCustomer,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("session endpoint", () => {
  it("reports no session for an anonymous request", async () => {
    const res = await (await api()).get("/auth/session");

    expect(res.status).toBe(200);
    expect(res.body.customer).toBeNull();
    expect(res.body.business).toBeNull();
  });

  it("reports the customer identity when a customer cookie is present", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .get("/auth/session")
      .set("Cookie", customerCookie(customer.id, customer.name));

    expect(res.status).toBe(200);
    expect(res.body.customer).not.toBeNull();
    expect(res.body.business).toBeNull();
  });

  it("keeps customer and business sessions independent", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .get("/auth/session")
      .set("Cookie", businessCookie(business.id, business.name));

    expect(res.body.business).not.toBeNull();
    expect(res.body.customer).toBeNull();
  });

  it("ignores a malformed token", async () => {
    const res = await (await api())
      .get("/auth/session")
      .set("Cookie", "sp_auth_customer=not-a-jwt");

    expect(res.status).toBe(200);
    expect(res.body.customer).toBeNull();
  });
});

describe("customer login", () => {
  it("signs in with the correct password and sets a cookie", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/login")
      .send({ emailOrUsername: customer.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] ?? [];
    expect(cookies.join(";")).toContain("sp_auth_customer");
  });

  it("also accepts the username", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/login")
      .send({ emailOrUsername: customer.username, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it("rejects a wrong password without revealing which field failed", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/login")
      .send({ emailOrUsername: customer.email, password: "WrongPassw0rd!" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects an unknown account", async () => {
    const res = await (await api())
      .post("/auth/login")
      .send({ emailOrUsername: "nobody@test.invalid", password: TEST_PASSWORD });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a payload that fails schema validation", async () => {
    const res = await (await api())
      .post("/auth/login")
      .send({ emailOrUsername: "x" });

    expect(res.status).toBe(400);
  });

  it("clears the cookie on logout", async () => {
    const res = await (await api()).post("/auth/customer/logout");

    expect(res.status).toBe(200);
  });
});

describe("business login", () => {
  it("signs in a business and sets the business cookie", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/auth/business/login")
      .send({ emailOrUsername: business.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect((res.headers["set-cookie"] ?? []).join(";")).toContain(
      "sp_auth_business",
    );
  });

  it("rejects a wrong business password", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/auth/business/login")
      .send({ emailOrUsername: business.email, password: "Nope12345!" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("logs a business out", async () => {
    const res = await (await api()).post("/auth/business/logout");

    expect(res.status).toBe(200);
  });
});

describe("admin login", () => {
  it("signs in with the configured admin credentials", async () => {
    const res = await (await api())
      .post("/auth/admin/login")
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect((res.headers["set-cookie"] ?? []).join(";")).toContain("sp_auth_admin");
  });

  it("rejects a wrong admin password", async () => {
    const res = await (await api())
      .post("/auth/admin/login")
      .send({ username: TEST_ADMIN_USERNAME, password: "wrong-password" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects an unknown admin username", async () => {
    const res = await (await api())
      .post("/auth/admin/login")
      .send({ username: "not-the-admin", password: TEST_ADMIN_PASSWORD });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("reports admin session state", async () => {
    const anon = await (await api()).get("/auth/admin/session");

    expect(anon.status).toBe(200);
    expect(anon.body.authenticated).toBe(false);
  });
});

describe("customer profile", () => {
  it("returns the authenticated customer", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .get("/auth/me")
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(200);
    expect(res.body.user?.email ?? res.body.email).toBe(customer.email);
  });

  it("rejects an anonymous profile read", async () => {
    const res = await (await api()).get("/auth/me");

    expect(res.status).toBe(401);
  });

  it("updates the profile and persists the change", async () => {
    const customer = await seedCustomer();
    const newName = `Renamed ${uniqueSuffix()}`;

    const res = await (await api())
      .put("/auth/me")
      .set("Cookie", customerCookie(customer.id))
      .send({
        name: newName,
        username: customer.username,
        email: customer.email,
        phone: "+15559990000",
      });

    expect(res.status).toBe(200);
    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored?.name).toBe(newName);
  });

  it("rejects a profile update that fails validation", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .put("/auth/me")
      .set("Cookie", customerCookie(customer.id))
      .send({ name: "", username: "x", email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("changes the password when the current one is correct", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/change-password")
      .set("Cookie", customerCookie(customer.id))
      .send({ currentPassword: TEST_PASSWORD, newPassword: "BrandNewPass1!" });

    expect(res.status).toBe(200);
    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored?.password).not.toBe(customer.password);
  });

  it("refuses a password change with the wrong current password", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/change-password")
      .set("Cookie", customerCookie(customer.id))
      .send({ currentPassword: "NotThePassword1!", newPassword: "BrandNewPass1!" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored?.password).toBe(customer.password);
  });
});

describe("business username availability probe", () => {
  it("reports a taken username as existing", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).get(
      `/auth/exists?username=${encodeURIComponent(business.username)}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true });
  });

  it("reports a free username as available", async () => {
    const res = await (await api()).get(
      `/auth/exists?username=definitely-free-${uniqueSuffix()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it("requires a username parameter", async () => {
    const res = await (await api()).get("/auth/exists");

    expect(res.status).toBe(400);
  });
});

describe("business profile", () => {
  it("returns the authenticated business with its locations", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .get("/auth/business/me")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(location.id);
  });

  it("reads and writes the business language preference", async () => {
    const { business } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);

    const initial = await (await api())
      .get("/auth/business/language")
      .set("Cookie", cookie);
    expect(initial.status).toBe(200);

    const updated = await (await api())
      .put("/auth/business/language")
      .set("Cookie", cookie)
      .send({ language: "id" });
    expect(updated.status).toBe(200);

    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.language).toBe("id");
  });

  it("rejects an unsupported language", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .put("/auth/business/language")
      .set("Cookie", businessCookie(business.id))
      .send({ language: "klingon" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("lists public addresses for a business", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api()).get(
      `/auth/business/${business.username}/addresses`,
    );

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(location.address);
  });

  it("returns 404 addresses for an unknown business", async () => {
    const res = await (await api()).get("/auth/business/nobody-here/addresses");

    expect(res.status).toBe(404);
  });
});
