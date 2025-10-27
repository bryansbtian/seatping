// server/lib/auth.ts
import jwt from "jsonwebtoken";
const COOKIE_NAME = "sp_auth";
function parseExpiresInToMs(expiresIn) {
    if (typeof expiresIn === "number") {
        // jsonwebtoken interprets numbers as seconds
        return expiresIn * 1000;
    }
    const match = /^\s*(\d+)\s*([a-zA-Z]+)\s*$/.exec(expiresIn);
    if (!match)
        return undefined;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const msPerUnit = {
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
    if (!factor)
        return undefined;
    return value * factor;
}
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET is not set");
    return secret;
}
export function signJwt(payload) {
    const secret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
    const options = { expiresIn, algorithm: "HS256" };
    return jwt.sign(payload, secret, options);
}
export function verifyJwt(token) {
    const secret = getJwtSecret();
    return jwt.verify(token, secret);
}
export function setAuthCookie(res, token) {
    const isProd = process.env.NODE_ENV === "production";
    const expiresInEnv = process.env.JWT_EXPIRES_IN ?? "7d";
    const maxAge = parseExpiresInToMs(expiresInEnv) ?? parseExpiresInToMs("7d");
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        // Persistent cookie aligned with JWT expiry
        ...(maxAge ? { maxAge } : {}),
    });
}
export function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
    });
}
export function requireAuth(req, res, next) {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (!token)
            return res.status(401).json({ error: "Unauthorized" });
        const payload = verifyJwt(token);
        req.auth = payload;
        next();
    }
    catch {
        return res.status(401).json({ error: "Unauthorized" });
    }
}
