/**
 * Animated bento feature grid for the business landing page.
 *
 * A reusable, responsive "bento" section: large cards span 4 of 6 columns on
 * desktop and medium cards span 2, tablet collapses to 2 columns, and mobile
 * stacks the same cards in one column. Cards fade and slide in on scroll.
 *
 * Each of the four cards is its own self-contained, exported component that
 * bundles the card header (icon + title + description) with its real-product
 * preview:
 *   - {@link ReservationFeatureCard}
 *   - {@link GuestCrmFeatureCard}
 *   - {@link LiveQueueFeatureCard}
 *   - {@link CampaignsFeatureCard}
 *
 * They all build on the shared {@link BentoFeatureCard} shell and resize
 * responsively on their own (mobile stacks, tablet 2-col, desktop bento). To
 * resize or restyle a single card, pass it a `className`; the inner previews
 * (BentoProductPreviews.tsx) carry their own responsive sizing. Render the
 * cards through this section, or drop any one of them anywhere on its own.
 *
 * Motion rules:
 *  - Every looping preview animation carries `.bento-loop`; index.css disables
 *    them all under `prefers-reduced-motion` and when `animated={false}` sets
 *    `data-bento-animated="false"` on the section.
 *  - The scroll entrance uses one IntersectionObserver on the grid and is
 *    skipped entirely (content shown immediately) for reduced-motion users or
 *    when no observer is available.
 */
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Contact,
  ListOrdered,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SECTION_PADDING,
  SECTION_CONTENT_GAP,
  SECTION_HEADING,
  SECTION_SUBTITLE,
  CARD_TITLE,
  CARD_DESCRIPTION,
} from "@/components/landing/section";
import {
  ReservationPreview,
  QueuePreview,
  GuestProfilePreview,
  CampaignPreview,
} from "@/components/landing/BentoProductPreviews";

/* ================================================================== */
/*  Types                                                             */
/* ================================================================== */

/** `large` spans 4/6 desktop columns, `medium` spans 2/6. */
export type BentoSize = "large" | "medium";

/** Drives the per-card scroll entrance. `instant` shows with no animation. */
export type BentoRevealState = "hidden" | "instant" | "animate";

/** Props every bento feature card accepts. The grid injects `index` (for the
 *  stagger) and `reveal`; `className` lets a caller resize/restyle one card. */
export interface BentoCardProps {
  index?: number;
  reveal?: BentoRevealState;
  className?: string;
}

/* ================================================================== */
/*  Shared card shell                                                 */
/* ================================================================== */

/**
 * Generic bento card surface: brand border + soft shadow, an icon/title/
 * description header, then a decorative preview area. `size` sets the desktop
 * column span; `previewClassName` tweaks the preview area; `className` resizes
 * or restyles the whole card.
 */
export function BentoFeatureCard({
  icon: Icon,
  title,
  description,
  size = "medium",
  index = 0,
  reveal = "instant",
  className,
  descriptionClassName,
  previewClassName,
  children,
}: BentoCardProps & {
  icon: LucideIcon;
  title: string;
  description: string;
  size?: BentoSize;
  /** Extra classes for the description, e.g. a min-height so paired cards'
   *  headers match and their previews start at the same vertical position. */
  descriptionClassName?: string;
  previewClassName?: string;
  children: React.ReactNode;
}) {
  const large = size === "large";
  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6",
        "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_-28px_rgba(15,23,42,0.22)]",
        "transition-[box-shadow,border-color] duration-300 hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_48px_-24px_rgba(15,23,42,0.28)]",
        large ? "md:col-span-2 lg:col-span-4" : "lg:col-span-2",
        reveal === "hidden" && "opacity-0",
        reveal === "animate" && "animate-bento-reveal opacity-0",
        className,
      )}
      style={
        // Snappier stagger: ~70ms per card so the four cards finish quickly.
        reveal === "animate" ? { animationDelay: `${index * 0.07}s` } : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className={CARD_TITLE}>{title}</h3>
      </div>
      <p className={cn("mt-2.5 max-w-xl", CARD_DESCRIPTION, descriptionClassName)}>
        {description}
      </p>
      {/* The previews mirror the live product but are decorative here; hide
          them from assistive tech and keep them non-interactive. On very narrow
          phones (<=375px) zoom the preview down a touch so its (mostly fixed-px)
          content fits the mini card without crowding. */}
      <div
        aria-hidden
        className={cn(
          "mt-5 flex min-h-0 flex-1 flex-col justify-center sm:mt-6",
          "max-[375px]:[zoom:0.85]",
          previewClassName,
        )}
      >
        {children}
      </div>
    </article>
  );
}

/* ================================================================== */
/*  The four SeatPing business feature cards                          */
/* ================================================================== */

/** Reservation Management card — wide, with the ReservationsManager preview. */
export function ReservationFeatureCard(props: BentoCardProps) {
  return (
    <BentoFeatureCard
      icon={CalendarDays}
      title="Reservation Management"
      description="Take bookings in advance, set capacity per hour, and keep tonight's tables organised without the paper book."
      size="large"
      {...props}
    >
      <ReservationPreview />
    </BentoFeatureCard>
  );
}

/** Guest CRM card — medium, with the Guests page preview. */
export function GuestCrmFeatureCard(props: BentoCardProps) {
  return (
    <BentoFeatureCard
      icon={Contact}
      title="Guest CRM"
      description="Profiles build themselves from every visit, with history, tags, and notes, so you always know your regulars."
      // On tablet this pairs with Live Queue; reserve a 3-line description height
      // so both headers match and the previews start at the same height.
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <GuestProfilePreview />
    </BentoFeatureCard>
  );
}

/** Live Queue card — medium, with the dashboard Queue Management preview. */
export function LiveQueueFeatureCard(props: BentoCardProps) {
  return (
    <BentoFeatureCard
      icon={ListOrdered}
      title="Live Queue"
      description="Track walk-ins in real time and notify guests automatically the moment their table is ready."
      // Match GuestCrmFeatureCard's reserved description height so the two
      // tablet-paired headers line up.
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <QueuePreview />
    </BentoFeatureCard>
  );
}

/** Guest Campaigns card — wide, with the Campaigns preview. */
export function CampaignsFeatureCard(props: BentoCardProps) {
  return (
    <BentoFeatureCard
      icon={Send}
      title="Guest Campaigns"
      description="Send SeatPing-branded SMS, WhatsApp, and Email campaigns to smart audiences or your saved guest groups."
      size="large"
      {...props}
    >
      <CampaignPreview />
    </BentoFeatureCard>
  );
}

/** Default ordered cards for the business landing page. */
export const BUSINESS_BENTO_CARDS: React.ComponentType<BentoCardProps>[] = [
  ReservationFeatureCard,
  GuestCrmFeatureCard,
  LiveQueueFeatureCard,
  CampaignsFeatureCard,
];

/* ================================================================== */
/*  Section + grid                                                    */
/* ================================================================== */

interface AnimatedBentoFeatureGridProps {
  /** Small uppercase label above the heading. Pass null to hide. */
  eyebrow?: React.ReactNode;
  heading?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Cards to render. Each receives `index` + `reveal`. Defaults to the four
   *  SeatPing business cards. */
  cards?: React.ComponentType<BentoCardProps>[];
  /** Master switch for the scroll entrance + looping preview animations. */
  animated?: boolean;
  className?: string;
}

/**
 * Reveals the grid once it scrolls into view. Falls back to showing content
 * immediately (no entrance animation) when animations are off, the user
 * prefers reduced motion, or IntersectionObserver is unavailable.
 */
function useBentoReveal(animated: boolean) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<BentoRevealState>(
    animated ? "hidden" : "instant",
  );

  useEffect(() => {
    if (!animated) {
      setReveal("instant");
      return;
    }
    const el = gridRef.current;
    if (
      !el ||
      typeof IntersectionObserver === "undefined" ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      setReveal("instant");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReveal("animate");
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animated]);

  return { gridRef, reveal };
}

/**
 * The bento section. Render bare for the SeatPing business defaults, or pass
 * your own `cards` / copy / `animated` to reuse it elsewhere.
 */
export default function AnimatedBentoFeatureGrid({
  eyebrow = "Features",
  heading = "A Smarter Way to Manage Queues, Reservations, and Guest Flow",
  subtitle = "Give customers a smoother waiting experience while helping staff manage queues, reservations, and daily operations from one simple dashboard.",
  cards = BUSINESS_BENTO_CARDS,
  animated = true,
  className,
}: AnimatedBentoFeatureGridProps) {
  const { gridRef, reveal } = useBentoReveal(animated);
  return (
    <section
      data-bento-animated={animated ? undefined : "false"}
      className={cn(
        "relative overflow-hidden border-t border-slate-200 bg-slate-50/60",
        SECTION_PADDING,
        className,
      )}
    >
      {/* soft brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-indigo-100/40 blur-3xl"
      />

      <div className="container relative mx-auto max-w-6xl">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {eyebrow}
            </p>
          )}
          <h2 className={cn(eyebrow && "mt-3", SECTION_HEADING)}>{heading}</h2>
          {subtitle && (
            <p className={cn("mt-4 max-w-2xl", SECTION_SUBTITLE)}>{subtitle}</p>
          )}
        </div>

        <div
          ref={gridRef}
          className={cn(
            SECTION_CONTENT_GAP,
            "grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-6",
          )}
        >
          {cards.map((Card, index) => (
            <Card key={index} index={index} reveal={reveal} />
          ))}
        </div>
      </div>
    </section>
  );
}
