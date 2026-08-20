import { useEffect, useRef, useState } from "react";
import { CalendarDays, Contact, ListOrdered, Send, type LucideIcon } from "lucide-react";
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

export type BentoSize = "large" | "medium";

export type BentoRevealState = "hidden" | "instant" | "animate";

export interface BentoCardProps {
  index?: number;
  reveal?: BentoRevealState;
  className?: string;
}

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
          <Icon className="h-4 w-4" />
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

export function GuestCrmFeatureCard(props: BentoCardProps) {
  return (
    <BentoFeatureCard
      icon={Contact}
      title="Guest CRM"
      description="Profiles build themselves from every visit, with history, tags, and notes, so you always know your regulars."
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <GuestProfilePreview />
    </BentoFeatureCard>
  );
}

export function LiveQueueFeatureCard(props: BentoCardProps) {
  return (
    <BentoFeatureCard
      icon={ListOrdered}
      title="Live Queue"
      description="Track walk-ins in real time and notify guests automatically the moment their table is ready."
      descriptionClassName="md:min-h-[4.3rem] lg:min-h-0"
      {...props}
    >
      <QueuePreview />
    </BentoFeatureCard>
  );
}

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

const BUSINESS_BENTO_CARDS: React.ComponentType<BentoCardProps>[] = [
  ReservationFeatureCard,
  GuestCrmFeatureCard,
  LiveQueueFeatureCard,
  CampaignsFeatureCard,
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
  heading = "A Smarter Way to Manage Queues, Reservations, and Guest Flow",
  subtitle = "Give customers a smoother waiting experience while helping staff manage queues, reservations, and daily operations from one simple dashboard.",
  cards = BUSINESS_BENTO_CARDS,
  animated = true,
  className,
}: AnimatedBentoFeatureGridProps) {
  const { gridRef, reveal } = useBentoReveal(animated);
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

      <div className="container relative mx-auto max-w-6xl">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {eyebrow}
            </p>
          )}
          <h2 className={cn(eyebrow && "mt-3", SECTION_HEADING)}>{heading}</h2>
          {subtitle && <p className={cn("mt-4 max-w-2xl", SECTION_SUBTITLE)}>{subtitle}</p>}
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
