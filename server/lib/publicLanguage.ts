import type { Request } from "express";
import {
  parsePublicLanguage,
  PUBLIC_LANGUAGE_COOKIE,
  type PublicLanguage,
} from "../../shared/publicLanguage.js";

export function manualPublicLanguage(req: Request): PublicLanguage | undefined {
  const cookies: unknown = req.cookies;
  if (cookies && typeof cookies === "object" && PUBLIC_LANGUAGE_COOKIE in cookies) {
    return parsePublicLanguage(Reflect.get(cookies, PUBLIC_LANGUAGE_COOKIE));
  }
  return undefined;
}

export function requestPublicLanguage(req: Request): PublicLanguage {
  const manual = manualPublicLanguage(req);
  if (manual) {
    return manual;
  }
  if (req.get("x-vercel-ip-country")?.trim().toUpperCase() === "ID") {
    return "id";
  }
  return "en";
}
