import {
  parsePublicLanguage,
  PUBLIC_LANGUAGE_STORAGE_KEY,
  PUBLIC_LANGUAGE_COOKIE,
  PUBLIC_LANGUAGE_COOKIE_MAX_AGE,
  type PublicLanguage,
} from "@shared/publicLanguage";

export function readPublicLanguagePreference(): PublicLanguage | undefined {
  try {
    for (const cookie of document.cookie.split(";")) {
      const [name, value] = cookie.trim().split("=");
      if (name === PUBLIC_LANGUAGE_COOKIE) {
        const language = parsePublicLanguage(value);
        if (language) {
          return language;
        }
      }
    }
  } catch {}
  try {
    return parsePublicLanguage(localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function rememberPublicLanguage(language: PublicLanguage): void {
  try {
    localStorage.setItem(PUBLIC_LANGUAGE_STORAGE_KEY, language);
  } catch {}
  try {
    let cookie = `${PUBLIC_LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${PUBLIC_LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`;
    if (window.location.protocol === "https:") {
      cookie += "; Secure";
    }
    document.cookie = cookie;
  } catch {}
}
