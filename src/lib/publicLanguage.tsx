import { createContext, useCallback, useContext } from "react";
import { localizedPublicPath, type PublicLanguage } from "@shared/publicLanguage";
import type { To } from "react-router-dom";
import { translatePublic } from "@shared/publicTranslations";
import { enUS, id } from "date-fns/locale";

export const PublicLanguageContext = createContext<{
  lang: PublicLanguage;
  explicitEnglish: boolean;
}>({ lang: "en", explicitEnglish: false });

export function localizeTo(to: To, language: PublicLanguage, explicitEnglish = false): To {
  if (typeof to === "string") {
    return localizedPublicPath(to, language, explicitEnglish);
  }
  if (to.pathname) {
    return { ...to, pathname: localizedPublicPath(to.pathname, language, explicitEnglish) };
  }
  return to;
}

export function usePublicLanguage() {
  const { lang, explicitEnglish } = useContext(PublicLanguageContext);
  let locale = "en-US";
  let dateLocale = enUS;
  let shortDateFormat = "MMM d";
  let longDateFormat = "MMM d, yyyy";
  if (lang === "id") {
    locale = "id-ID";
    dateLocale = id;
    shortDateFormat = "d MMM";
    longDateFormat = "d MMM yyyy";
  }
  const t = useCallback(
    (text: string, params?: Record<string, string | number>) => translatePublic(lang, text, params),
    [lang],
  );
  return {
    lang,
    explicitEnglish,
    locale,
    dateLocale,
    shortDateFormat,
    longDateFormat,
    t,
  };
}
