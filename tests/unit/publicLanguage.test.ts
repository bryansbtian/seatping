import { describe, expect, it } from "vitest";
import {
  localizedPublicPath,
  unlocalizedPath,
  publicLanguageForPath,
  isLocalizedPublicPath,
  explicitPublicLanguage,
  isPublicLanguageEntryPath,
} from "../../shared/publicLanguage.js";
import { translatePublic, PUBLIC_INDONESIAN } from "../../shared/publicTranslations.js";

describe("Public Language Routing", () => {
  it.each([
    "/",
    "/search",
    "/search/sushi",
    "/help",
    "/terms",
    "/policy",
    "/profile",
    "/business",
    "/business/login",
    "/business/signup",
    "/queue/cafe/location",
    "/restaurants/cafe/location",
    "/cafe/location",
    "/reservations/manage/token",
  ])("round trips %s without losing queries or fragments", (path) => {
    const href = `${path}?date=2026-11-03&partySize=4#details`;
    const indonesian = localizedPublicPath(href, "id");
    expect(indonesian).toMatch(/^\/id(?:\/|\?|$)/);
    expect(localizedPublicPath(indonesian, "id")).toBe(indonesian);
    expect(localizedPublicPath(indonesian, "en")).toBe(href);
    expect(publicLanguageForPath(indonesian.split("?")[0])).toBe("id");
  });

  it.each([
    "/admin",
    "/admin/blog",
    "/business/overview",
    "/business/settings",
    "/api/blog",
    "/auth/login",
    "/blog",
    "/blog/story",
    "/tickets/one",
    "/id/admin",
    "/id/blog",
    "/id/business/settings",
    "/id/unknown",
    "/id/unknown/nested/path",
  ])("does not localize %s", (path) => {
    expect(isLocalizedPublicPath(path)).toBe(false);
    expect(localizedPublicPath(path, "id")).toBe(path);
    expect(publicLanguageForPath(path)).toBe("en");
  });

  it.each([
    "https://example.com/search",
    "//example.com/search",
    "mailto:help@example.com",
    "#featured",
    "?date=2026-11-03",
    "relative/path",
  ])("preserves nonabsolute site navigation %s", (href) => {
    expect(localizedPublicPath(href, "id")).toBe(href);
  });

  it("normalizes the Indonesian homepage and preserves English routes", () => {
    expect(unlocalizedPath("/id/")).toBe("/");
    expect(unlocalizedPath("/id")).toBe("/");
    expect(unlocalizedPath("/search")).toBe("/search");
    expect(publicLanguageForPath("/id/help")).toBe("id");
  });

  it("supports explicit English aliases while keeping existing English canonicals", () => {
    expect(unlocalizedPath("/en")).toBe("/");
    expect(unlocalizedPath("/en/")).toBe("/");
    expect(unlocalizedPath("/en/help")).toBe("/help");
    expect(explicitPublicLanguage("/en/help")).toBe("en");
    expect(explicitPublicLanguage("/id/help")).toBe("id");
    expect(explicitPublicLanguage("/help")).toBeUndefined();
    expect(publicLanguageForPath("/en/help")).toBe("en");
    expect(localizedPublicPath("/id/help?from=footer#faq", "en", true)).toBe(
      "/en/help?from=footer#faq",
    );
    expect(localizedPublicPath("/en?from=footer#featured", "en", true)).toBe(
      "/en?from=footer#featured",
    );
    expect(localizedPublicPath("/en/help", "en")).toBe("/help");
    expect(localizedPublicPath("/en/help", "id")).toBe("/id/help");
    expect(isLocalizedPublicPath("/en/admin")).toBe(false);
    expect(isLocalizedPublicPath("/en/blog")).toBe(false);
    expect(isLocalizedPublicPath("/en/business/settings")).toBe(false);
  });

  it("limits automatic detection to neutral entry pages", () => {
    expect(isPublicLanguageEntryPath("/")).toBe(true);
    expect(isPublicLanguageEntryPath("/business/")).toBe(true);
    for (const path of ["/en", "/id", "/search", "/admin", "/business/settings", "/blog"]) {
      expect(isPublicLanguageEntryPath(path)).toBe(false);
    }
  });
});

describe("Public Indonesian Copy", () => {
  it("uses natural Indonesian for core guest actions", () => {
    expect(translatePublic("id", "Join Queue")).toBe("Ikut Antrean");
    expect(translatePublic("id", "Book Table")).toBe("Reservasi Meja");
    expect(translatePublic("id", "Forgot Password?")).toBe("Lupa Kata Sandi?");
  });

  it("keeps English copy and business-provided content intact", () => {
    expect(translatePublic("en", "Join Queue")).toBe("Join Queue");
    expect(translatePublic("id", "Restoran Nusantara Signature Menu")).toBe(
      "Restoran Nusantara Signature Menu",
    );
    expect(translatePublic("en", "Welcome, {name}", { name: "Ayu" })).toBe("Welcome, Ayu");
    expect(translatePublic("id", "Unknown {value}")).toBe("Unknown {value}");
  });

  it("translates variable status messages and localizes clock times", () => {
    expect(translatePublic("id", "There are 3 parties ahead of you")).toBe(
      "Ada 3 rombongan di depan Anda",
    );
    expect(translatePublic("id", "Open · Closes at 7:30 PM")).toBe("Buka · Tutup Pukul 19.30");
    expect(translatePublic("id", "Closed · Opens at 9:15 AM")).toBe("Tutup · Buka Pukul 09.15");
    expect(translatePublic("id", "Closed · Opens Monday at 12:00 AM")).toBe(
      "Tutup · Buka Senin Pukul 00.00",
    );
    expect(translatePublic("id", "12:00 PM")).toBe("12.00");
    expect(translatePublic("id", "9:15 AM")).toBe("09.15");
    expect(translatePublic("en", "9:15 AM")).toBe("9:15 AM");
    expect(translatePublic("id", "Welcome, {name}", { name: "$& {other}" })).toBe(
      "Selamat datang, $& {other}",
    );
    expect(translatePublic("id", "View All (12)")).toBe("Lihat Semua (12)");
  });

  it("provides nonempty copy without prohibited punctuation or HTML entity leakage", () => {
    for (const [english, indonesian] of Object.entries(PUBLIC_INDONESIAN)) {
      expect(english.trim()).not.toBe("");
      expect(indonesian.trim()).not.toBe("");
      expect(indonesian).not.toMatch(/\u2014|&(?:amp|apos|middot);/);
      expect([...english.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()).toEqual(
        [...indonesian.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(),
      );
    }
  });
});
