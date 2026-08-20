import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  LangContext,
  STORAGE_KEY,
  translate,
  translateStatus,
  type Lang,
  type LangContextValue,
} from "@/lib/i18n";

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "id") {
      return v;
    }
  } catch {}
  return "en";
}

function persistLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());
  const [ready, setReady] = useState(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    let cancelled = false;
    api("/auth/business/language")
      .then((d) => {
        if (cancelled) {
          return;
        }
        if (d?.language === "en" || d?.language === "id") {
          setLangState(d.language);
          persistLang(d.language);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = useCallback(async (next: Lang) => {
    const prev = langRef.current;
    if (next === prev) {
      return;
    }
    setLangState(next);
    persistLang(next);
    try {
      await api("/auth/business/language", {
        method: "PUT",
        body: JSON.stringify({ language: next }),
      });
    } catch (e) {
      setLangState(prev);
      persistLang(prev);
      throw e;
    }
  }, []);

  const value: LangContextValue = {
    lang,
    ready,
    t: (key, params) => translate(lang, key, params),
    tStatus: (status) => translateStatus(lang, status),
    setLang,
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
