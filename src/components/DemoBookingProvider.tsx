import { useRef, useState, type ReactNode } from "react";
import { DemoBookingContext } from "@/lib/demoBooking";
import type { Lang } from "@/lib/i18n";
import DemoBookingModal from "@/components/DemoBookingModal";

export default function DemoBookingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <DemoBookingContext.Provider
      value={(language, element) => {
        trigger.current = element ?? (document.activeElement as HTMLElement);
        setLang(language);
        setOpen(true);
      }}
    >
      {children}
      <DemoBookingModal open={open} onOpenChange={setOpen} lang={lang} returnFocus={trigger} />
    </DemoBookingContext.Provider>
  );
}
