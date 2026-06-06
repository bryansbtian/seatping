/**
 * Shared typography, colour, and spacing tokens for the marketing landing page.
 *
 * Every landing section imports these so headings, subtitles, pills, cards, and
 * section padding stay visually consistent. Add new landing sections using these
 * primitives rather than restyling from scratch.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Standard vertical rhythm + horizontal padding for a full-width section. */
export const SECTION_PADDING = "px-4 py-14 sm:py-16 md:py-20";

/** Standard gap between a section heading/subtitle block and its content. */
export const SECTION_CONTENT_GAP = "mt-10";

/**
 * Display heading for the hero and final CTA — the page's two largest, most
 * prominent headlines. One step larger than {@link SECTION_HEADING}, but the
 * same navy colour, weight, and tight leading so the tiers feel related.
 *
 * The `max-[360px]` step-down keeps every heading proportionally smaller on the
 * narrowest phones (where text-3xl overflows), so all headings stay consistent.
 */
export const DISPLAY_HEADING =
  "text-2xl font-semibold leading-[1.1] tracking-tight text-slate-900 min-[361px]:text-3xl sm:text-4xl md:text-5xl lg:text-6xl";

/** Main section heading (h2). Dark navy, semibold, responsive 2xl → 5xl. */
export const SECTION_HEADING =
  "text-2xl font-semibold leading-[1.12] tracking-tight text-slate-900 min-[361px]:text-3xl sm:text-4xl md:text-5xl";

/** Section subtitle / description. Muted slate, readable on every breakpoint. */
export const SECTION_SUBTITLE =
  "text-sm leading-relaxed text-slate-600 sm:text-base";

/** Card / list-item title. */
export const CARD_TITLE =
  "text-base font-semibold leading-snug text-slate-900 sm:text-lg";

/** Card / list-item body text. */
export const CARD_DESCRIPTION = "text-sm leading-relaxed text-slate-500";

/** Base card surface: rounded, hairline border, soft shadow. */
export const CARD_CONTAINER =
  "rounded-2xl border border-slate-200/80 bg-white shadow-sm";

/**
 * Small uppercase pill label with a navy accent icon, used at the top of each
 * section. Consistent border, background, shadow, and icon sizing everywhere.
 */
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
