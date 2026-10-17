import { createContext, useContext } from "react";
import { useLang, type Lang } from "@/lib/i18n";

export const DemoBookingContext = createContext<(lang: Lang, trigger?: HTMLElement) => void>(
  () => {},
);

export function useDemoBooking() {
  const open = useContext(DemoBookingContext);
  const { lang } = useLang();
  return (event?: { currentTarget: HTMLElement }) => open(lang, event?.currentTarget);
}
