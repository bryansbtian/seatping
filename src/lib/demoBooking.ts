import { createContext, useContext } from "react";
import { useLang, type Lang } from "@/lib/i18n";
import { usePublicLanguage } from "@/lib/publicLanguage";

export const DemoBookingContext = createContext<(lang: Lang, trigger?: HTMLElement) => void>(
  () => {},
);

export function useDemoBooking() {
  const open = useContext(DemoBookingContext);
  const { lang } = useLang();
  const { lang: publicLang } = usePublicLanguage();
  let language = lang;
  if (publicLang === "id") {
    language = publicLang;
  }
  return (event?: { currentTarget: HTMLElement }) => open(language, event?.currentTarget);
}
