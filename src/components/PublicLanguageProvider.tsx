import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PublicLanguageContext } from "@/lib/publicLanguage";
import {
  publicLanguageForPath,
  isLocalizedPublicPath,
  isPublicLanguageEntryPath,
  localizedPublicPath,
  parsePublicLanguage,
  explicitPublicLanguage,
  type PublicLanguage,
} from "@shared/publicLanguage";
import { readPublicLanguagePreference } from "@/lib/publicLanguagePreference";
import RouteLoading from "@/components/RouteLoading";

export default function PublicLanguageProvider({ children }: { children: ReactNode }) {
  const { pathname, search, hash, key, state } = useLocation();
  const navigate = useNavigate();
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const language = publicLanguageForPath(pathname);
  const entry = isPublicLanguageEntryPath(pathname);

  useEffect(() => {
    if (!entry) {
      return;
    }
    let cancelled = false;
    let settled = false;
    const controller = new AbortController();
    const finish = (next: PublicLanguage, manual = false) => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      let selected = next;
      let explicitEnglish = manual;
      const latestPreference = readPublicLanguagePreference();
      if (latestPreference) {
        selected = latestPreference;
        explicitEnglish = true;
      }
      const current = `${pathname}${search}${hash}`;
      const destination = localizedPublicPath(current, selected, explicitEnglish);
      if (destination !== current) {
        void navigate(destination, { replace: true, state });
      } else {
        setResolvedKey(key);
      }
    };
    const preference = readPublicLanguagePreference();
    if (preference) {
      finish(preference, true);
      return;
    }
    const timeout = window.setTimeout(() => {
      finish("en");
      controller.abort();
    }, 5000);
    void (async () => {
      try {
        const response = await fetch("/api/language", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          finish("en");
          return;
        }
        const payload: unknown = await response.json();
        let detected: PublicLanguage = "en";
        if (payload && typeof payload === "object") {
          detected = parsePublicLanguage(Reflect.get(payload, "language")) ?? "en";
        }
        finish(detected);
      } catch {
        finish("en");
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [entry, pathname, search, hash, key, state, navigate]);
  useEffect(() => {
    if (pathname.startsWith("/business/") && !isLocalizedPublicPath(pathname)) {
      return;
    }
    document.documentElement.lang = language;
  }, [language, pathname]);
  let content = children;
  if (entry && resolvedKey !== key) {
    content = <RouteLoading />;
  }
  return (
    <PublicLanguageContext.Provider
      value={{ lang: language, explicitEnglish: explicitPublicLanguage(pathname) === "en" }}
    >
      {content}
    </PublicLanguageContext.Provider>
  );
}
