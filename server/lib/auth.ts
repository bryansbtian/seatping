// server/lib/auth.ts
import jwt, { SignOptions, JwtPayload, Secret } from "jsonwebtoken";
import type { Response, Request, NextFunction } from "express";

export type AccountType = "customer" | "business" | "admin";

// Customer, business, and admin sessions use SEPARATE cookies so they can
// coexist in the same browser. Logging in as a business must never clobber a
// logged-in customer (and vice versa) — e.g. joining a queue as a customer and
// admitting as the business from the same device both stay logged in. The admin
// cookie gates the internal /admin and /tickets consoles.
const COOKIE_NAMES: Record<AccountType, string> = {
  customer: "sp_auth_customer",
  business: "sp_auth_business",
  admin: "sp_auth_admin",
};
// Legacy single-cookie name (pre account-type separation). We never read it, but
// we clear it on logout so old sessions don't linger.
const LEGACY_COOKIE_NAME = "sp_auth";

function parseExpiresInToMs(expiresIn: string | number): number | undefined {
  if (typeof expiresIn === "number") {
    // jsonwebtoken interprets numbers as seconds
    return expiresIn * 1000;
  }
  const match = /^\s*(\d+)\s*([a-zA-Z]+)\s*$/.exec(expiresIn);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const msPerUnit: Record<string, number> = {
    ms: 1,
    s: 1000,
    sec: 1000,
    secs: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    mins: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    wk: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
    yr: 365 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000,
  };
  const factor = msPerUnit[unit];
  if (!factor) return undefined;
  return value * factor;
}

function getJwtSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signJwt(payload: string | Buffer | object) {
  const secret = getJwtSecret();
  const expiresIn: SignOptions["expiresIn"] =
    process.env.JWT_EXPIRES_IN ?? "7d";
  const options: SignOptions = { expiresIn, algorithm: "HS256" };
  return jwt.sign(payload, secret, options);
}

export function verifyJwt<T extends JwtPayload = JwtPayload>(token: string): T {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as T;
}

export function setAuthCookie(
  res: Response,
  token: string,
  accountType: AccountType,
) {
  const isProd = process.env.NODE_ENV === "production";
  const expiresInEnv = process.env.JWT_EXPIRES_IN ?? "7d";
  const maxAge = parseExpiresInToMs(expiresInEnv) ?? parseExpiresInToMs("7d");
  res.cookie(COOKIE_NAMES[accountType], token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    // Persistent cookie aligned with JWT expiry
    ...(maxAge ? { maxAge } : {}),
  });
}

export function clearAuthCookie(res: Response, accountType: AccountType) {
  res.clearCookie(COOKIE_NAMES[accountType], {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Clear every session cookie (both account types + the legacy cookie). Used by
 * the shared logout endpoint, which can't know which account type is calling.
 */
export function clearAllAuthCookies(res: Response) {
  clearAuthCookie(res, "customer");
  clearAuthCookie(res, "business");
  clearAuthCookie(res, "admin");
  res.clearCookie(LEGACY_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Build a middleware that only allows a specific account type through.
 * Customer tokens cannot pass a business gate and vice versa.
 */
export function requireAccountType(accountType: AccountType) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE_NAMES[accountType]];
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const payload = verifyJwt(token) as JwtPayload & {
        accountType?: AccountType;
      };
      if (payload.accountType !== accountType) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      (req as any).auth = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
  };
}

export const requireCustomer = requireAccountType("customer");
export const requireBusiness = requireAccountType("business");
export const requireAdmin = requireAccountType("admin");

/**
 * Read the current session without failing the request.
 * Returns the account type + display name, or null for no/legacy session.
 */
export function readSession(
  req: Request,
  accountType: AccountType = "customer",
): { accountType: AccountType; sub: string; name: string | null } | null {
  try {
    const token = req.cookies?.[COOKIE_NAMES[accountType]];
    if (!token) return null;
    const payload = verifyJwt(token) as JwtPayload & {
      accountType?: AccountType;
      name?: string;
    };
    // The token's claim must match the cookie it was read from; a token of one
    // account type stuffed into another type's cookie does not count as a session.
    if (payload.accountType !== accountType || !payload.sub) return null;
    return {
      accountType: payload.accountType,
      sub: String(payload.sub),
      name: payload.name ?? null,
    };
  } catch {
    return null;
  }
}
