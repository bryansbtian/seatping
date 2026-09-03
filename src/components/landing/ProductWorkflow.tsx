import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SECTION_PADDING,
  SECTION_HEADING,
  SECTION_SUBTITLE,
  CARD_TITLE,
  CARD_DESCRIPTION,
} from "@/components/landing/section";

const WORKFLOW_STEPS: { title: string; body: string }[] = [
  {
    title: "Guest Discovers Your Restaurant",
    body: "They find your public SeatPing page or scan your QR code at the door.",
  },
  {
    title: "They Join the Queue or Reserve",
    body: "Walk-ins join the virtual queue, while planners book a table in advance.",
  },
  {
    title: "SeatPing Matches a Table",
    body: "The party is paired with a table that fits without blocking the bookings that follow.",
  },
  {
    title: "Staff Confirm the Seating",
    body: "Your host accepts the match or overrides it, then seats the party.",
  },
  {
    title: "The Live Floor Updates",
    body: "Table statuses, waiting parties, and upcoming reservations move together.",
  },
  {
    title: "The Visit Updates Guest CRM",
    body: "Visit history, notes, and tags build themselves on the guest profile.",
  },
  {
    title: "Performance Insights Build Up",
    body: "Wait times, turn times, utilization, and covers are tracked as service happens.",
  },
  {
    title: "Campaigns Bring Guests Back",
    body: "Reach the right guests over SMS, WhatsApp, and Email from the same dashboard.",
  },
];

const STEPS_PER_STATE = 4;

const ARC_VIEWBOX_WIDTH = 300;

const ARC_VIEWBOX_HEIGHT = 520;

const ARC_CENTER_X = 60;

const ARC_CENTER_Y = 260;

const ARC_RADIUS = 226;

const ARC_INNER_RADIUS = 154;

const ARC_START_ANGLE = -88;

const ARC_END_ANGLE = 88;

const ARC_ADVANCE_ANGLE = 180;

const ARC_MARKER_ANGLES = [-72, -24, 24, 72];

const ARC_ORIGIN_X = (ARC_CENTER_X / ARC_VIEWBOX_WIDTH) * 100;

const ARC_ORIGIN_Y = (ARC_CENTER_Y / ARC_VIEWBOX_HEIGHT) * 100;

const ROW_START = ["lg:row-start-1", "lg:row-start-2", "lg:row-start-3", "lg:row-start-4"];

function stepNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function arcPoint(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  const x = ARC_CENTER_X + radius * Math.cos(radians);
  const y = ARC_CENTER_Y + radius * Math.sin(radians);
  return { x: rounded(x), y: rounded(y) };
}

function arcPath(radius: number): string {
  const start = arcPoint(ARC_START_ANGLE, radius);
  const end = arcPoint(ARC_END_ANGLE, radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

function arcAngle(index: number): number {
  const slot = index % STEPS_PER_STATE;
  let angle = ARC_MARKER_ANGLES[slot];
  if (index >= STEPS_PER_STATE) {
    angle += ARC_ADVANCE_ANGLE;
  }
  return angle;
}

function arcPosition(index: number): { left: string; top: string } {
  const point = arcPoint(arcAngle(index), ARC_RADIUS);
  const left = (point.x / ARC_VIEWBOX_WIDTH) * 100;
  const top = (point.y / ARC_VIEWBOX_HEIGHT) * 100;
  return { left: `${rounded(left)}%`, top: `${rounded(top)}%` };
}

function useSecondState(sentinelRef: React.RefObject<HTMLElement>): boolean {
  const [secondState, setSecondState] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setSecondState(entries[entries.length - 1].isIntersecting);
      },
      { rootMargin: "0px 0px -95% 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef]);

  return secondState;
}

function WorkflowStep({ index, active }: { index: number; active: boolean }) {
  const step = WORKFLOW_STEPS[index];
  const slot = index % STEPS_PER_STATE;

  let stateClass = "lg:pointer-events-none lg:opacity-0 motion-safe:lg:translate-y-4";
  if (active) {
    stateClass = "lg:pointer-events-auto lg:opacity-100 motion-safe:lg:translate-y-0";
  } else if (index < STEPS_PER_STATE) {
    stateClass = "lg:pointer-events-none lg:opacity-0 motion-safe:lg:-translate-y-4";
  }

  return (
    <li
      data-step={stepNumber(index)}
      data-active={String(active)}
      className={cn(
        "flex items-start gap-4 sm:gap-5",
        "lg:col-start-1 lg:items-center lg:gap-0",
        "transition-[opacity,transform] duration-500 ease-out",
        "motion-reduce:transition-none",
        ROW_START[slot],
        stateClass,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold tabular-nums text-slate-900 shadow-sm sm:h-12 sm:w-12 lg:sr-only">
        {stepNumber(index)}
      </span>
      <div className="min-w-0 flex-1 pt-1.5 lg:pt-0">
        <h3 className={CARD_TITLE}>{step.title}</h3>
        <p className={cn("mt-1.5 max-w-sm", CARD_DESCRIPTION)}>{step.body}</p>
      </div>
    </li>
  );
}

function ArcMarker({
  index,
  active,
  rotation,
}: {
  index: number;
  active: boolean;
  rotation: number;
}) {
  const position = arcPosition(index);

  let markerClass = "border-slate-200 bg-white text-slate-400 opacity-0";
  if (active) {
    markerClass =
      "border-indigo-200 bg-white text-slate-900 opacity-100 shadow-sm ring-4 ring-indigo-50";
  }

  return (
    <span
      data-orbit-step={stepNumber(index)}
      data-active={String(active)}
      style={{ left: position.left, top: position.top }}
      className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
    >
      <span
        style={{ transform: `rotate(${-rotation}deg)` }}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
          "transition-[opacity,background-color,color,border-color,transform] duration-700 ease-out",
          "motion-reduce:transition-none",
          markerClass,
        )}
      >
        {stepNumber(index)}
      </span>
    </span>
  );
}

function WorkflowArc({ secondState }: { secondState: boolean }) {
  let rotation = 0;
  let dashOffset = 0.11;
  if (secondState) {
    rotation = ARC_ADVANCE_ANGLE;
    dashOffset = -0.11;
  }

  return (
    <div
      aria-hidden="true"
      data-testid="workflow-orbit"
      data-rotation={rotation}
      data-arc-layout="half"
      className="relative mx-auto hidden aspect-[300/520] w-[14rem] overflow-hidden lg:block xl:w-[18rem]"
    >
      <svg
        aria-hidden="true"
        data-testid="workflow-curve"
        viewBox={`0 0 ${ARC_VIEWBOX_WIDTH} ${ARC_VIEWBOX_HEIGHT}`}
        className="absolute inset-0 h-full w-full"
      >
        <path
          d={arcPath(ARC_RADIUS)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-slate-200"
        />
        <path
          d={arcPath(ARC_RADIUS)}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.78 1"
          strokeDashoffset={dashOffset}
          className="text-indigo-500 transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
        <path
          d={arcPath(ARC_INNER_RADIUS)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 8"
          className="text-slate-200"
        />
      </svg>

      <div
        data-testid="workflow-orbit-markers"
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${ARC_ORIGIN_X}% ${ARC_ORIGIN_Y}%`,
        }}
        className="absolute inset-0 transition-transform duration-[900ms] ease-in-out motion-reduce:transition-none"
      >
        {WORKFLOW_STEPS.map((step, index) => {
          const inFirstState = index < STEPS_PER_STATE;
          let active = inFirstState;
          if (secondState) {
            active = !inFirstState;
          }
          return <ArcMarker key={step.title} index={index} active={active} rotation={rotation} />;
        })}
      </div>
    </div>
  );
}

export function ProductWorkflowSection() {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const secondState = useSecondState(sentinelRef);

  return (
    <section className={cn("relative border-t border-slate-200 bg-white", SECTION_PADDING)}>
      <div className="relative lg:h-[calc(100vh+32rem)]">
        <span
          ref={sentinelRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 block lg:top-[calc(112px+5vh)]"
        />

        <div className="lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:min-h-[40rem] lg:items-center">
          <div className="mx-auto w-full max-w-7xl px-8 lg:px-4">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_14rem_minmax(17rem,1fr)] lg:items-center lg:gap-6 xl:grid-cols-[minmax(26rem,1.2fr)_18rem_minmax(20rem,1fr)] xl:gap-8">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  How It Works
                </p>
                <h2 className={cn("mt-3", SECTION_HEADING)}>
                  From the Front Door to the Right Table, and Back Again
                </h2>
                <p className={cn("mt-4 max-w-2xl", SECTION_SUBTITLE)}>
                  One connected workflow runs the whole visit, so nothing gets rekeyed between the
                  queue, the floor, and your guest records.
                </p>
              </div>

              <WorkflowArc secondState={secondState} />

              <div className="relative">
                <span
                  aria-hidden="true"
                  className="absolute bottom-8 left-[22px] top-8 w-px bg-slate-200 sm:left-6 lg:hidden"
                />
                <ol className="relative flex flex-col gap-8 sm:gap-10 lg:grid lg:h-[26rem] lg:grid-rows-4 lg:gap-0 xl:h-[28rem]">
                  {WORKFLOW_STEPS.map((step, index) => {
                    const inFirstState = index < STEPS_PER_STATE;
                    let active = inFirstState;
                    if (secondState) {
                      active = !inFirstState;
                    }
                    return <WorkflowStep key={step.title} index={index} active={active} />;
                  })}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
