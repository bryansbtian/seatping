import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const SECTION_PADDING = "px-4 py-14 sm:py-16 md:py-20";

export const SECTION_CONTENT_GAP = "mt-10";

export const DISPLAY_HEADING =
  "text-2xl font-semibold leading-[1.1] tracking-tight text-slate-900 min-[361px]:text-3xl sm:text-4xl md:text-5xl lg:text-6xl";

export const SECTION_HEADING =
  "text-2xl font-semibold leading-[1.12] tracking-tight text-slate-900 min-[361px]:text-3xl sm:text-4xl md:text-5xl";

export const SECTION_SUBTITLE =
  "text-sm leading-relaxed text-slate-600 sm:text-base";

export const CARD_TITLE =
  "text-base font-semibold leading-snug text-slate-900 sm:text-lg";

export const CARD_DESCRIPTION = "text-sm leading-relaxed text-slate-500";

export const CARD_CONTAINER =
  "rounded-2xl border border-slate-200/80 bg-white shadow-sm";

export function SectionPill({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm",
        className,
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-white">
        <Icon className="h-2.5 w-2.5" />
      </span>
      {children}
    </span>
  );
}
