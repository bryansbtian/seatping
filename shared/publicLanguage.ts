export type PublicLanguage = "en" | "id";

export const PUBLIC_LANGUAGE_STORAGE_KEY = "seatping.consumer.lang";
export const PUBLIC_LANGUAGE_COOKIE = "seatping.consumer.lang";
export const PUBLIC_LANGUAGE_COOKIE_MAX_AGE = 31_536_000;

export function parsePublicLanguage(value: unknown): PublicLanguage | undefined {
  if (value === "en" || value === "id") {
    return value;
  }
  return undefined;
}

export function explicitPublicLanguage(pathname: string): PublicLanguage | undefined {
  return parsePublicLanguage(pathname.split("/")[1]);
}

export function isPublicLanguageEntryPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return clean === "/" || clean === "/business";
}

const publicPages = new Set([
  "/",
  "/login",
  "/signup",
  "/profile",
  "/forgot",
  "/reset",
  "/search",
  "/policy",
  "/terms",
  "/help",
  "/feedback",
  "/business",
  "/business/login",
  "/business/signup",
]);

const reservedPrefixes = new Set([
  "id",
  "en",
  "admin",
  "api",
  "auth",
  "business",
  "blog",
  "tickets",
  "queue",
  "restaurants",
  "reservations",
  ...[...publicPages].map((path) => path.split("/")[1]).filter(Boolean),
]);

export function unlocalizedPath(pathname: string): string {
  if (/^\/(id|en)\/?$/.test(pathname)) {
    return "/";
  }
  if (/^\/(id|en)\//.test(pathname)) {
    return pathname.slice(3);
  }
  return pathname;
}

export function isLocalizedPublicPath(pathname: string): boolean {
  const path = unlocalizedPath(pathname).replace(/\/+$/, "") || "/";
  if (publicPages.has(path)) {
    return true;
  }
  if (/^\/search\/[^/]+$/.test(path)) {
    return true;
  }
  if (/^\/(queue|restaurants)\/[^/]+\/[^/]+$/.test(path)) {
    return true;
  }
  if (/^\/reservations\/manage\/[^/]+$/.test(path)) {
    return true;
  }
  const segments = path.split("/").filter(Boolean);
  return segments.length === 2 && !reservedPrefixes.has(segments[0]);
}

export function publicLanguageForPath(pathname: string): PublicLanguage {
  if ((pathname === "/id" || pathname.startsWith("/id/")) && isLocalizedPublicPath(pathname)) {
    return "id";
  }
  return "en";
}

export function localizedPublicPath(
  href: string,
  language: PublicLanguage,
  explicitEnglish = false,
): string {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return href;
  }
  const end = href.search(/[?#]/);
  let pathname = href;
  let suffix = "";
  if (end >= 0) {
    pathname = href.slice(0, end);
    suffix = href.slice(end);
  }
  if (!isLocalizedPublicPath(pathname)) {
    return href;
  }
  const base = unlocalizedPath(pathname);
  if (language === "en") {
    if (explicitEnglish) {
      if (base === "/") {
        return `/en${suffix}`;
      }
      return `/en${base}${suffix}`;
    }
    return `${base}${suffix}`;
  }
  if (base === "/") {
    return `/id${suffix}`;
  }
  return `/id${base}${suffix}`;
}
