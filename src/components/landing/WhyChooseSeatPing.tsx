import { useState } from "react";
import {
  ListOrdered,
  CalendarDays,
  Zap,
  Plus,
  Minus,
  Check,
  Clock,
  BarChart3,
  Contact,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SECTION_PADDING,
  SECTION_HEADING,
  SECTION_SUBTITLE,
  CARD_TITLE,
  CARD_DESCRIPTION,
  SectionPill,
} from "@/components/landing/section";

const ACCORDION_ITEMS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ListOrdered,
    title: "Live Queue Dashboard",
    body: "See everyone waiting in real time, admit the next guest in a tap, and keep the line moving without crowding your entrance.",
  },
  {
    icon: Zap,
    title: "Smart Waitlist Automation",
    body: "SeatPing texts guests their place in line and an estimated wait, then notifies them automatically the moment their table is ready.",
  },
  {
    icon: CalendarDays,
    title: "Reservations & Booking Control",
    body: "Take bookings in advance, set capacity per hour, and confirm, seat, or cancel from one organised day view.",
  },
  {
    icon: Contact,
    title: "Guest CRM",
    body: "Guest profiles build themselves from every reservation and waitlist visit, so you can see visit history, notes, tags, and who your regulars are.",
  },
  {
    icon: Send,
    title: "Guest Campaigns",
    body: "Send SeatPing-branded SMS, WhatsApp, and Email messages to selected guests, smart audiences, or your saved groups, all from one place.",
  },
];

function FeatureAccordion() {
  const [open, setOpen] = useState(1);
  return (
    <div className="flex flex-col gap-3 lg:h-full lg:justify-between lg:gap-2">
      {ACCORDION_ITEMS.map((item, i) => {
        const active = i === open;
        let nextOpenIndex: number;
        if (active) {
          nextOpenIndex = -1;
        } else {
          nextOpenIndex = i;
        }
        let buttonStateClass: string;
        if (active) {
          buttonStateClass = "border-slate-300 bg-slate-100/80 shadow-sm";
        } else {
          buttonStateClass = "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
        }
        let iconStateClass: string;
        if (active) {
          iconStateClass = "bg-slate-900 text-white";
        } else {
          iconStateClass = "bg-slate-100 text-slate-600";
        }
        let toggleIcon: React.ReactNode;
        if (active) {
          toggleIcon = <Minus className="h-5 w-5" />;
        } else {
          toggleIcon = <Plus className="h-5 w-5" />;
        }
        let bodyStateClass: string;
        if (active) {
          bodyStateClass = "mt-3 grid-rows-[1fr] opacity-100";
        } else {
          bodyStateClass = "grid-rows-[0fr] opacity-0";
        }
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => setOpen(nextOpenIndex)}
            aria-expanded={active}
            className={cn(
              "block w-full rounded-2xl border p-4 text-left transition-all duration-300 sm:p-5",
              buttonStateClass,
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
                  iconStateClass,
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
              <span className={cn("flex-1", CARD_TITLE)}>{item.title}</span>
              <span className="shrink-0 text-slate-400">{toggleIcon}</span>
            </div>
            <div className={cn("grid transition-all duration-300 ease-out", bodyStateClass)}>
              <p className={cn("overflow-hidden pl-12", CARD_DESCRIPTION)}>{item.body}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MiniBarChart({
  data,
  color,
  max,
  yTicks,
}: {
  data: { label: string; value: number }[];
  color: string;
  max: number;
  yTicks: number[];
}) {
  const left = 24;
  const right = 256;
  const base = 96;
  const top = 8;
  const slot = (right - left) / data.length;
  const barW = Math.min(slot * 0.5, 20);
  const y = (v: number) => base - (v / max) * (base - top);
  const barPath = (cx: number, ty: number) => {
    const x = cx - barW / 2;
    const r = Math.min(4, barW / 2, base - ty);
    return `M${x},${base} L${x},${ty + r} Q${x},${ty} ${x + r},${ty} L${x + barW - r},${ty} Q${x + barW},${ty} ${x + barW},${ty + r} L${x + barW},${base} Z`;
  };
  return (
    <svg viewBox="0 0 270 116" className="mt-2 w-full" aria-hidden>
      {yTicks.map((t) => (
        <text key={t} x="18" y={y(t) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
          {t}
        </text>
      ))}
      <line x1={left} y1={base} x2={right} y2={base} stroke="#f1f5f9" strokeWidth="1" />
      {data.map((d, i) => (
        <path key={d.label} d={barPath(left + slot * i + slot / 2, y(d.value))} fill={color} />
      ))}
      {data.map((d, i) => (
        <text
          key={`label-${d.label}`}
          x={left + slot * i + slot / 2}
          y="110"
          textAnchor="middle"
          fontSize="7"
          fill="#94a3b8"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}

function ServiceSnapshot({ className }: { className?: string }) {
  const peakHours = [
    { label: "10 AM", value: 9 },
    { label: "11 AM", value: 16 },
    { label: "12 PM", value: 23 },
    { label: "1 PM", value: 18 },
    { label: "5 PM", value: 14 },
    { label: "6 PM", value: 22 },
    { label: "7 PM", value: 19 },
  ];
  const waitDistribution = [
    { label: "0-5 mins", value: 26 },
    { label: "5-10 mins", value: 44 },
    { label: "10-15 mins", value: 22 },
    { label: "15+ mins", value: 10 },
  ];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-indigo-50/70 p-5 sm:p-7",
        className,
      )}
    >
      <div className="mx-auto max-w-sm space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-700" />
            <p className="text-sm font-semibold text-slate-900">Peak Hours</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            When does your business get the most traffic?
          </p>
          <MiniBarChart data={peakHours} color="#4f46e5" max={24} yTicks={[0, 6, 12, 18, 24]} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/5">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-slate-700" />
            <p className="text-sm font-semibold text-slate-900">Wait Time Distribution</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">How efficient is your service?</p>
          <MiniBarChart
            data={waitDistribution}
            color="#64748b"
            max={48}
            yTicks={[0, 12, 24, 36, 48]}
          />
        </div>
      </div>
    </div>
  );
}

export function SeatPingFeatureGrid() {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-t border-slate-200 bg-slate-50/60",
        SECTION_PADDING,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-indigo-100/40 blur-3xl"
      />

      <div className="container relative mx-auto max-w-6xl scroll-animate">
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
          <div>
            <SectionPill icon={Check}>Why SeatPing</SectionPill>
            <h2 className={cn("mt-4", SECTION_HEADING)}>
              Power Your Front Door with Smart, Effortless Tools
            </h2>
          </div>

          <div className="lg:flex lg:items-end lg:pb-3">
            <p className={cn("max-w-md", SECTION_SUBTITLE)}>
              All the tools you need to manage queues, reservations, and guest flow, beautifully
              designed and easy to use.
            </p>
          </div>

          <div className="relative lg:pr-4">
            <div className="lg:absolute lg:inset-0 lg:overflow-y-auto lg:pr-1">
              <FeatureAccordion />
            </div>
          </div>

          <div className="flex items-center">
            <ServiceSnapshot className="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
