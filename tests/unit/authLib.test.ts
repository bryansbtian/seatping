import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  clearAllAuthCookies,
  clearAuthCookie,
  readSession,
  requireAccountType,
  setAuthCookie,
  signJwt,
  verifyJwt,
} from "../../server/lib/auth.js";

const ORIGINAL_ENV = { ...process.env };

type CookieCall = [string, string, Record<string, unknown>];
type ClearCall = [string, Record<string, unknown>];

function fakeResponse() {
  const cookies: CookieCall[] = [];
  const cleared: ClearCall[] = [];
  const sent: Array<{ status: number; body: unknown }> = [];
  let status = 200;
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookies.push([name, value, options]);
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      cleared.push([name, options]);
    },
    status: (code: number) => {
      status = code;
      return res;
    },
    json: (body: unknown) => {
      sent.push({ status, body });
      return res;
    },
  } as unknown as Response & {
    cookie: unknown;
  };
  return { res: res as Response, cookies, cleared, sent };
}

function requestWithCookies(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  delete process.env.JWT_EXPIRES_IN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("signing and verifying tokens", () => {
  it("round-trips a payload", () => {
    const token = signJwt({ sub: "user-1", accountType: "customer" });

    const payload = verifyJwt(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.exp).toEqual(expect.any(Number));
  });

  it("refuses a token signed with a different secret", () => {
    const token = signJwt({ sub: "user-1" });
    process.env.JWT_SECRET = "a-different-secret";

    expect(() => verifyJwt(token)).toThrow();
  });

  it("refuses to sign without a secret", () => {
    delete process.env.JWT_SECRET;

    expect(() => signJwt({ sub: "user-1" })).toThrow("JWT_SECRET is not set");
  });
});

describe("auth cookie lifetimes", () => {
  it("defaults to a seven day cookie", () => {
    const { res, cookies } = fakeResponse();

    setAuthCookie(res, "token", "customer");

    expect(cookies[0][0]).toBe("sp_auth_customer");
    expect(cookies[0][2].maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    expect(cookies[0][2].httpOnly).toBe(true);
    expect(cookies[0][2].secure).toBe(false);
  });

  it("marks the cookie secure in production", () => {
    process.env.NODE_ENV = "production";
    const { res, cookies } = fakeResponse();

    setAuthCookie(res, "token", "business");

    expect(cookies[0][0]).toBe("sp_auth_business");
    expect(cookies[0][2].secure).toBe(true);
  });

  it("falls back to seven days for an expiry with no unit", () => {
    process.env.JWT_EXPIRES_IN = "3600";
    const { res, cookies } = fakeResponse();

    setAuthCookie(res, "token", "admin");

    expect(cookies[0][0]).toBe("sp_auth_admin");
    expect(cookies[0][2].maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("understands each supported duration unit", () => {
    const cases: Array<[string, number]> = [
      ["500ms", 500],
      ["30s", 30 * 1000],
      ["45 minutes", 45 * 60 * 1000],
      ["12h", 12 * 60 * 60 * 1000],
      ["3 days", 3 * 24 * 60 * 60 * 1000],
      ["2wk", 2 * 7 * 24 * 60 * 60 * 1000],
      ["1year", 365 * 24 * 60 * 60 * 1000],
    ];

    for (const [value, expected] of cases) {
      process.env.JWT_EXPIRES_IN = value;
      const { res, cookies } = fakeResponse();
      setAuthCookie(res, "token", "customer");
      expect(cookies[0][2].maxAge).toBe(expected);
    }
  });

  it("falls back to seven days for an unparseable expiry", () => {
    process.env.JWT_EXPIRES_IN = "whenever";
    const { res, cookies } = fakeResponse();

    setAuthCookie(res, "token", "customer");

    expect(cookies[0][2].maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("falls back to seven days for an unknown unit", () => {
    process.env.JWT_EXPIRES_IN = "5 fortnights";
    const { res, cookies } = fakeResponse();

    setAuthCookie(res, "token", "customer");

    expect(cookies[0][2].maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("clearing auth cookies", () => {
  it("clears one session type", () => {
    const { res, cleared } = fakeResponse();

    clearAuthCookie(res, "admin");

    expect(cleared).toHaveLength(1);
    expect(cleared[0][0]).toBe("sp_auth_admin");
  });

  it("clears every session type and the legacy cookie", () => {
    const { res, cleared } = fakeResponse();

    clearAllAuthCookies(res);

    expect(cleared.map(([name]) => name)).toEqual([
      "sp_auth_customer",
      "sp_auth_business",
      "sp_auth_admin",
      "sp_auth",
    ]);
  });
});

describe("requireAccountType", () => {
  function guard(accountType: "customer" | "business" | "admin") {
    return requireAccountType(accountType);
  }

  it("rejects a request with no cookie", () => {
    const { res, sent } = fakeResponse();
    const next = vi.fn();

    guard("business")(requestWithCookies({}), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sent[0].status).toBe(401);
  });

  it("rejects a token for the wrong session type", () => {
    const token = signJwt({ sub: "biz-1", accountType: "business" });
    const { res, sent } = fakeResponse();
    const next = vi.fn();

    guard("admin")(requestWithCookies({ sp_auth_admin: token }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sent[0].status).toBe(401);
  });

  it("rejects a malformed token", () => {
    const { res, sent } = fakeResponse();
    const next = vi.fn();

    guard("customer")(
      requestWithCookies({ sp_auth_customer: "not-a-jwt" }),
      res,
      next,
    );

    expect(sent[0].status).toBe(401);
  });

  it("attaches the payload and continues for a valid session", () => {
    const token = signJwt({ sub: "cust-1", accountType: "customer" });
    const req = requestWithCookies({ sp_auth_customer: token });
    const { res } = fakeResponse();
    const next = vi.fn();

    guard("customer")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).auth.sub).toBe("cust-1");
  });

  it("keeps the three session types separate", () => {
    const businessToken = signJwt({ sub: "biz-1", accountType: "business" });
    const { res, sent } = fakeResponse();
    const next = vi.fn();

    guard("customer")(
      requestWithCookies({ sp_auth_business: businessToken }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(sent[0].status).toBe(401);
  });
});

describe("readSession", () => {
  it("reads a customer session by default", () => {
    const token = signJwt({
      sub: "cust-1",
      accountType: "customer",
      name: "Ada",
    });

    const session = readSession(requestWithCookies({ sp_auth_customer: token }));

    expect(session).toEqual({
      accountType: "customer",
      sub: "cust-1",
      name: "Ada",
    });
  });

  it("reads another session type on request", () => {
    const token = signJwt({ sub: "biz-1", accountType: "business" });

    const session = readSession(
      requestWithCookies({ sp_auth_business: token }),
      "business",
    );

    expect(session?.sub).toBe("biz-1");
    expect(session?.name).toBeNull();
  });

  it("returns nothing without a cookie", () => {
    expect(readSession(requestWithCookies({}))).toBeNull();
  });

  it("returns nothing for a token of the wrong type", () => {
    const token = signJwt({ sub: "biz-1", accountType: "business" });

    expect(
      readSession(requestWithCookies({ sp_auth_customer: token })),
    ).toBeNull();
  });

  it("returns nothing when the token carries no subject", () => {
    const token = signJwt({ accountType: "customer" });

    expect(
      readSession(requestWithCookies({ sp_auth_customer: token })),
    ).toBeNull();
  });

  it("returns nothing for a malformed token", () => {
    expect(
      readSession(requestWithCookies({ sp_auth_customer: "not-a-jwt" })),
    ).toBeNull();
  });
});
