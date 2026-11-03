import { usePublicLanguage } from "@/lib/publicLanguage";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CalendarDaysIcon,
  ChartAnalysisIcon,
  ContactIcon,
  LayoutGridIcon,
  LeftToRightListNumberIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
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
import {
  FloorBentoPreview,
  PerformanceBentoPreview,
} from "@/components/landing/FloorProductPreviews";

export type BentoSize = "large" | "medium";

export type BentoRevealState = "hidden" | "instant" | "animate";

export interface BentoCardProps {
  index?: number;
  reveal?: BentoRevealState;
  className?: string;
}

export function BentoFeatureCard({
  icon,
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
  icon: IconSvgElement;
  title: string;
  description: string;
  size?: BentoSize;
  descriptionClassName?: string;
  previewClassName?: string;
  children: React.ReactNode;
}) {
  const large = size === "large";
  let spanClass: string;
  if (large) {
    spanClass = "md:col-span-2 lg:col-span-4";
  } else {
    spanClass = "lg:col-span-2";
  }
  let revealStyle: React.CSSProperties | undefined;
  if (reveal === "animate") {
    revealStyle = { animationDelay: `${index * 0.07}s` };
  } else {
    revealStyle = undefined;
  }
  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6",
        "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_-28px_rgba(15,23,42,0.22)]",
        "transition-[box-shadow,border-color] duration-300 hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_48px_-24px_rgba(15,23,42,0.28)]",
        spanClass,
        reveal === "hidden" && "opacity-0",
        reveal === "animate" && "animate-bento-reveal opacity-0",
        className,
      )}
      style={revealStyle}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <HugeiconsIcon icon={icon} className="h-4 w-4" />
        </span>
        <h3 className={CARD_TITLE}>{title}</h3>
      </div>
      <p className={cn("mt-2.5 max-w-xl", CARD_DESCRIPTION, descriptionClassName)}>{description}</p>
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

export function ReservationFeatureCard(props: BentoCardProps) {
  const { t: tp } = usePublicLanguage();

  return (
    <BentoFeatureCard
      icon={CalendarDaysIcon}
      title={tp("Reservation Management")}
      className="md:max-lg:row-start-4"
      description={tp(
        "Take bookings in advance, set capacity per hour, and let Smart Table Assignment pair each booking with a table that fits before guests arrive.",
      )}
      size="large"
      {...props}
    >
      <ReservationPreview />
    </BentoFeatureCard>
  );
}

export function GuestCrmFeatureCard(props: BentoCardProps) {
  const { t: tp } = usePublicLanguage();

  return (
    <BentoFeatureCard
      icon={ContactIcon}
      title={tp("Guest CRM")}
      className="md:max-lg:col-start-2 md:max-lg:row-start-2 md:max-lg:self-start"
      description={tp(
        "Profiles build themselves from every visit, with history, tags, and notes, so you always know your regulars.",
      )}
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <GuestProfilePreview />
    </BentoFeatureCard>
  );
}

export function LiveQueueFeatureCard(props: BentoCardProps) {
  const { t: tp } = usePublicLanguage();

  return (
    <BentoFeatureCard
      icon={LeftToRightListNumberIcon}
      title={tp("Live Queue")}
      className="md:max-lg:col-start-1 md:max-lg:row-start-2 md:max-lg:row-span-2 md:max-lg:self-start"
      description={tp(
        "Track walk-ins in real time, see the recommended table for each waiting party, and notify guests the moment their table is ready.",
      )}
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <QueuePreview />
    </BentoFeatureCard>
  );
}

export function CampaignsFeatureCard(props: BentoCardProps) {
  const { t: tp } = usePublicLanguage();

  return (
    <BentoFeatureCard
      icon={SentIcon}
      title={tp("Guest Campaigns")}
      className="md:max-lg:row-start-5"
      description={tp(
        "Send SeatPing-branded SMS, WhatsApp, and Email campaigns to smart audiences or your saved guest groups.",
      )}
      size="large"
      {...props}
    >
      <CampaignPreview />
    </BentoFeatureCard>
  );
}

export function FloorManagementFeatureCard(props: BentoCardProps) {
  const { t: tp } = usePublicLanguage();

  return (
    <BentoFeatureCard
      icon={LayoutGridIcon}
      title={tp("Floor Management")}
      className="md:max-lg:row-start-1"
      description={tp(
        "Run your dining room from a live floor plan, with table statuses, queue-to-table matching, and staff overrides in one view.",
      )}
      size="large"
      {...props}
    >
      <FloorBentoPreview />
    </BentoFeatureCard>
  );
}

export function PerformanceFeatureCard(props: BentoCardProps) {
  const { t: tp } = usePublicLanguage();

  return (
    <BentoFeatureCard
      icon={ChartAnalysisIcon}
      title={tp("Performance")}
      className="md:max-lg:col-start-2 md:max-lg:row-start-3"
      description={tp(
        "See wait times, table turn times, utilization, covers, and no-shows for every location.",
      )}
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <PerformanceBentoPreview />
    </BentoFeatureCard>
  );
}

const BUSINESS_BENTO_CARDS: React.ComponentType<BentoCardProps>[] = [
  FloorManagementFeatureCard,
  LiveQueueFeatureCard,
  GuestCrmFeatureCard,
  ReservationFeatureCard,
  CampaignsFeatureCard,
  PerformanceFeatureCard,
];

interface AnimatedBentoFeatureGridProps {
  eyebrow?: React.ReactNode;
  heading?: React.ReactNode;
  subtitle?: React.ReactNode;
  cards?: React.ComponentType<BentoCardProps>[];
  animated?: boolean;
  className?: string;
}

function useBentoReveal(animated: boolean) {
  const gridRef = useRef<HTMLDivElement>(null);
  let initialReveal: BentoRevealState;
  if (animated) {
    initialReveal = "hidden";
  } else {
    initialReveal = "instant";
  }
  const [reveal, setReveal] = useState<BentoRevealState>(initialReveal);

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

export default function AnimatedBentoFeatureGrid({
  eyebrow = "Features",
  heading = "A Smarter Way to Run Your Floor, Queue, and Reservations",
  subtitle = "Give guests a smoother waiting experience while your team manages the dining room, the queue, reservations, and daily operations from one simple dashboard.",
  cards = BUSINESS_BENTO_CARDS,
  animated = true,
  className,
}: AnimatedBentoFeatureGridProps) {
  const { t: tp } = usePublicLanguage();

  const { gridRef, reveal } = useBentoReveal(animated);
  let localizedEyebrow = eyebrow;
  let localizedHeading = heading;
  let localizedSubtitle = subtitle;
  if (typeof eyebrow === "string") {
    localizedEyebrow = tp(eyebrow);
  }
  if (typeof heading === "string") {
    localizedHeading = tp(heading);
  }
  if (typeof subtitle === "string") {
    localizedSubtitle = tp(subtitle);
  }
  let bentoAnimatedAttr: string | undefined;
  if (animated) {
    bentoAnimatedAttr = undefined;
  } else {
    bentoAnimatedAttr = "false";
  }
  return (
    <section
      data-bento-animated={bentoAnimatedAttr}
      className={cn(
        "relative overflow-hidden border-t border-slate-200 bg-slate-50/60",
        SECTION_PADDING,
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-indigo-100/40 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-7xl px-8 lg:px-4">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {localizedEyebrow}
            </p>
          )}
          <h2 className={cn(eyebrow && "mt-3", SECTION_HEADING)}>{localizedHeading}</h2>
          {subtitle && (
            <p className={cn("mt-4 max-w-2xl", SECTION_SUBTITLE)}>{localizedSubtitle}</p>
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
