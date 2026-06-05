/**
 * "Why choose SeatPing" feature section, shown directly under the landing hero.
 *
 * Two stacked sections customised for SeatPing:
 *   1. {@link WhyChooseSeatPing} — pill, headline, subtitle, and a 4-up row of
 *      compact feature cards, each turning brand blue on hover.
 *   2. {@link SeatPingFeatureGrid} — a two-column block with an expandable
 *      feature accordion on the left and a product "snapshot" visual on the right.
 *
 * Every mini visual is its own small component built from divs + Tailwind +
 * lucide icons (no screenshot images), so each can be resized, rearranged, or
 * simplified independently on smaller screens.
 */
import { useState } from "react";
import {
  ListOrdered,
  CalendarDays,
  Calendar,
  TrendingUp,
  MapPin,
  Users,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  Star,
  Pencil,
  QrCode,
  Bell,
  Zap,
  Activity,
  Building2,
  Plus,
  Minus,
  Check,
  BarChart3,
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
  SectionPill,
} from "@/components/landing/section";

/* ================================================================== */
/*  Mini visuals — small, reusable, lightweight                       */
/* ================================================================== */

/** 1 · Queue Management card — mirrors the dashboard's Queue Management surface
 *  (title + "N customers" badge, ranked guest row, Admit / Remove). */
export function MiniQueueCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
          <ListOrdered className="h-3.5 w-3.5" />
          Queue Management
        </span>
        <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">
          2 customers
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center rounded-lg bg-gray-50 p-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
            #1
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-gray-800">
              Marcus Bennett
            </p>
            <p className="truncate text-[9px] text-gray-600">
              Joined: 8 mins ago · 2 Guests
            </p>
            <p className="text-[9px] font-medium text-indigo-600">
              Estimated Wait: ~10 min
            </p>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="flex h-6 flex-1 items-center justify-center rounded-md bg-green-600 text-[10px] font-medium text-white">
            Admit
          </span>
          <span className="flex h-6 flex-1 items-center justify-center rounded-md border border-slate-200 bg-white text-[10px] font-medium text-slate-700">
            Remove
          </span>
        </div>
      </div>
    </div>
  );
}

/** 2 · Reservations Management card — mirrors the dashboard's reservation row
 *  (guest + status badge, party / date / time, notification contact). */
export function MiniReservationCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-gray-800" />
        <span className="text-xs font-semibold text-gray-800">
          Reservations Management
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <p className="truncate text-[12px] font-semibold text-gray-800">
            Sofia Almeida
          </p>
          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
            Confirmed
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> 2
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> Today
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> 7:30 PM
          </span>
        </div>
        <span className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Email · sofia.almeida@example.com</span>
        </span>
      </div>
    </div>
  );
}

/** 3 · Performance summary — mirrors the dashboard's daily stat cards
 *  (label + figure + tinted icon), shown as a compact 2x2. */
export function MiniPerformanceCard({ className }: { className?: string }) {
  const stats = [
    {
      label: "Served Today",
      value: "28",
      icon: TrendingUp,
      tint: "bg-emerald-100",
      fg: "text-emerald-600",
    },
    {
      label: "Avg Queue Wait",
      value: "5m",
      icon: Clock,
      tint: "bg-teal-100",
      fg: "text-teal-600",
    },
    {
      label: "Current Queue",
      value: "3",
      icon: Users,
      tint: "bg-indigo-100",
      fg: "text-indigo-600",
    },
    {
      label: "Reservations Today",
      value: "12",
      icon: Calendar,
      tint: "bg-blue-100",
      fg: "text-blue-600",
    },
  ];
  return (
    <div
      className={cn("grid h-full w-full grid-cols-2 grid-rows-2 gap-2", className)}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"
        >
          <p className="truncate text-[10px] text-slate-600">{s.label}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xl font-semibold text-slate-800">{s.value}</p>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                s.tint,
              )}
            >
              <s.icon className={cn("h-3.5 w-3.5", s.fg)} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 4 · Location card — mirrors the dashboard's Location Management card
 *  (per-location name + Credits pill, address, Edit / Reviews / QR actions),
 *  shown for two locations like a multi-location business. */
export function MiniLocationCard({ className }: { className?: string }) {
  const locations = [
    {
      name: "Marina Bay",
      credits: 992,
      address: "12 Harbourfront Walk, Marina Bay",
    },
    {
      name: "Downtown",
      credits: 540,
      address: "8 Orchard Road, Downtown",
    },
    {
      name: "Riverside",
      credits: 318,
      address: "5 Riverside Quay, Riverside",
    },
  ];
  return (
    <div className={cn("flex h-full w-full flex-col gap-1", className)}>
      {locations.map((loc) => (
        <div
          key={loc.name}
          className="flex flex-1 flex-col justify-center rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm"
        >
          {/* line 1: location name (full width) + actions */}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
            <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-800">
              {loc.name}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {[Pencil, Star, QrCode].map((Icon, i) => (
                <span
                  key={i}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600"
                >
                  <Icon className="h-2.5 w-2.5" />
                </span>
              ))}
            </div>
          </div>
          {/* line 2: address + credits */}
          <div className="mt-0.5 flex items-center gap-1.5 pl-[18px]">
            <p className="min-w-0 flex-1 truncate text-[9px] text-slate-500">
              {loc.address}
            </p>
            <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[8px] font-medium leading-none text-indigo-700">
              Credits: {loc.credits}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 5 · Customer notification bubbles (SMS / WhatsApp / Email). */
export function MiniNotificationCard({ className }: { className?: string }) {
  const rows = [
    {
      icon: Phone,
      label: "SMS",
      text: "Your Table Is Ready 🎉",
      tint: "bg-blue-50 text-blue-600",
    },
    {
      icon: MessageSquare,
      label: "WhatsApp",
      text: "You're Next In Line",
      tint: "bg-teal-50 text-teal-600",
    },
    {
      icon: Mail,
      label: "Email",
      text: "Booking Confirmed For 7:30 PM",
      tint: "bg-indigo-50 text-indigo-600",
    },
  ];
  return (
    <div className={cn("w-full space-y-2", className)}>
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              r.tint,
            )}
          >
            <r.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-slate-400">{r.label}</p>
            <p className="truncate text-xs font-medium text-slate-800">
              {r.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Public restaurant profile preview (photo, menu, reviews, CTAs). */
export function MiniRestaurantProfileCard({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      {/* banner */}
      <div className="relative h-16 bg-gradient-to-r from-blue-500 to-indigo-500">
        <div className="absolute -bottom-4 left-3 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white bg-slate-900 text-sm font-semibold text-white">
          CM
        </div>
      </div>
      <div className="px-3 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              Cafe Milano
            </p>
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <MapPin className="h-2.5 w-2.5" /> Marina Bay
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> 4.8
          </span>
        </div>
        {/* menu chips */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {["Brunch", "Coffee", "Pasta", "Vegan"].map((m) => (
            <span
              key={m}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-medium text-slate-600"
            >
              {m}
            </span>
          ))}
        </div>
        {/* CTAs */}
        <div className="mt-3 flex gap-1.5">
          <span className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-900 text-[10px] font-medium text-white">
            <ListOrdered className="h-3 w-3" /> Join Queue
          </span>
          <span className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[10px] font-medium text-slate-700">
            <CalendarDays className="h-3 w-3" /> Reserve
          </span>
        </div>
      </div>
    </div>
  );
}

/* ----- Section #2: feature accordion + product visual -------------- */

/** Expandable feature list shown on the left of section #2. Each row mirrors a
 *  real SeatPing capability; one stays open to reveal its description. */
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
    icon: Activity,
    title: "Real-Time Performance Insights",
    body: "Track served guests, average wait, and no-shows as the day unfolds, so you can staff up before it gets busy.",
  },
  {
    icon: Building2,
    title: "Multi-Location Operations",
    body: "Run every branch from one account, each with its own queue, opening hours, and settings.",
  },
];

function FeatureAccordion() {
  const [open, setOpen] = useState(1);
  return (
    // Mobile: natural stack. Desktop: fill the column height and spread rows so
    // the list's top/bottom align with the graph card; gaps compress (and the
    // area scrolls) if an expanded row needs more room than the fixed height.
    <div className="flex flex-col gap-3 lg:h-full lg:justify-between lg:gap-2">
      {ACCORDION_ITEMS.map((item, i) => {
        const active = i === open;
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => setOpen(active ? -1 : i)}
            aria-expanded={active}
            className={cn(
              "block w-full rounded-2xl border p-4 text-left transition-all duration-300 sm:p-5",
              active
                ? "border-blue-200 bg-blue-50/70 shadow-sm"
                : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30",
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
              <span className={cn("flex-1", CARD_TITLE)}>{item.title}</span>
              <span className="shrink-0 text-slate-400">
                {active ? (
                  <Minus className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </span>
            </div>
            {/* grid-rows trick animates the height open/closed smoothly */}
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                active
                  ? "mt-3 grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <p className={cn("overflow-hidden pl-12", CARD_DESCRIPTION)}>
                {item.body}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Lightweight static bar chart (rounded tops) mirroring the dashboard's
 *  Peak Hours / Wait Time Distribution bars. */
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
  // bar path with rounded TOP corners only (flat against the baseline).
  const barPath = (cx: number, ty: number) => {
    const x = cx - barW / 2;
    const r = Math.min(4, barW / 2, base - ty);
    return `M${x},${base} L${x},${ty + r} Q${x},${ty} ${x + r},${ty} L${x + barW - r},${ty} Q${x + barW},${ty} ${x + barW},${ty + r} L${x + barW},${base} Z`;
  };
  return (
    <svg viewBox="0 0 270 116" className="mt-2 w-full" aria-hidden>
      {yTicks.map((t) => (
        <text
          key={t}
          x="18"
          y={y(t) + 3}
          textAnchor="end"
          fontSize="8"
          fill="#94a3b8"
        >
          {t}
        </text>
      ))}
      <line
        x1={left}
        y1={base}
        x2={right}
        y2={base}
        stroke="#f1f5f9"
        strokeWidth="1"
      />
      {data.map((d, i) => (
        <path
          key={d.label}
          d={barPath(left + slot * i + slot / 2, y(d.value))}
          fill={color}
        />
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

/** Product visual for section #2: a soft brand panel showing the dashboard's
 *  Peak Hours and Wait Time Distribution bar charts. Faithful to the real
 *  charts' titles + colours. */
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
        "relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-100 via-blue-50 to-indigo-50 p-5 sm:p-7",
        className,
      )}
    >
      <div className="mx-auto max-w-sm space-y-3">
        {/* Peak Hours */}
        <div className="rounded-2xl bg-white p-4 shadow-lg shadow-blue-900/5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-700" />
            <p className="text-sm font-semibold text-slate-900">Peak Hours</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            When does your business get the most traffic?
          </p>
          <MiniBarChart
            data={peakHours}
            color="#3b82f6"
            max={24}
            yTicks={[0, 6, 12, 18, 24]}
          />
        </div>

        {/* Wait Time Distribution */}
        <div className="rounded-2xl bg-white p-4 shadow-lg shadow-blue-900/5">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-slate-700" />
            <p className="text-sm font-semibold text-slate-900">
              Wait Time Distribution
            </p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            How efficient is your service?
          </p>
          <MiniBarChart
            data={waitDistribution}
            color="#10b981"
            max={48}
            yTicks={[0, 12, 24, 36, 48]}
          />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Card shells                                                       */
/* ================================================================== */

/** Compact feature card for the top 4-up row. Light by default, turning brand
 *  blue on hover (gradient, white text, brand-blue icon). */
function SmallFeatureCard({
  icon: Icon,
  title,
  description,
  visual,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  visual: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-blue-50/40 p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-500 ease-out hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 sm:p-5">
      {/* Blue gradient that fades in on hover. Gradients (background-image) can't
          be transitioned, so we cross-fade this overlay with opacity instead,
          which animates smoothly. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-600 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
      />
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition-colors duration-500 ease-out group-hover:text-blue-600">
            <Icon className="h-5 w-5" />
          </span>
          <h3
            className={cn(
              CARD_TITLE,
              "transition-colors duration-500 ease-out group-hover:text-white",
            )}
          >
            {title}
          </h3>
        </div>
        <p
          className={cn(
            "mt-3 transition-colors duration-500 ease-out group-hover:text-blue-50/90",
            CARD_DESCRIPTION,
          )}
        >
          {description}
        </p>
        <div className="mt-auto pt-4">
          <div className="h-44">{visual}</div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section #1 — Why choose SeatPing (header + 4-up feature cards)     */
/* ================================================================== */

export default function WhyChooseSeatPing() {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-t border-slate-200 bg-white",
        SECTION_PADDING,
      )}
    >
      {/* soft brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 right-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-blue-100/40 blur-3xl"
      />

      <div className="container relative mx-auto max-w-6xl scroll-animate">
        {/* header */}
        <div className="max-w-3xl">
          <SectionPill icon={Bell}>Designed for Guest Flow</SectionPill>
          <h2 className={cn("mt-4", SECTION_HEADING)}>
            A Smarter Way to Manage Queues, Reservations, and Guest Flow
          </h2>
          <p className={cn("mt-4 max-w-2xl", SECTION_SUBTITLE)}>
            Give customers a smoother waiting experience while helping staff
            manage queues, reservations, and daily operations from one simple
            dashboard.
          </p>
        </div>

        {/* top 4-up feature cards */}
        <div
          className={cn(
            SECTION_CONTENT_GAP,
            "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4",
          )}
        >
          <SmallFeatureCard
            icon={ListOrdered}
            title="Smart Queue Management"
            description="Track every walk-in, admit guests in order, and notify them the moment a table opens up."
            visual={<MiniQueueCard />}
          />
          <SmallFeatureCard
            icon={CalendarDays}
            title="Reservation Management"
            description="Take bookings in advance and keep tonight's tables organised without the paper book."
            visual={<MiniReservationCard />}
          />
          <SmallFeatureCard
            icon={TrendingUp}
            title="Daily Summary"
            description="See served guests, average wait, and no-shows at a glance, updated through the day."
            visual={<MiniPerformanceCard />}
          />
          <SmallFeatureCard
            icon={MapPin}
            title="Location Management"
            description="Set hours, capacity, and queue settings for each location from one place."
            visual={<MiniLocationCard />}
          />
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  Section #2 — Why SeatPing (heading + accordion + product visual)  */
/* ================================================================== */

export function SeatPingFeatureGrid() {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-t border-slate-200 bg-slate-50/60",
        SECTION_PADDING,
      )}
    >
      {/* soft brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-indigo-100/40 blur-3xl"
      />

      <div className="container relative mx-auto max-w-6xl scroll-animate">
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
          {/* top-left: pill + heading */}
          <div>
            <SectionPill icon={Check}>Why SeatPing</SectionPill>
            <h2 className={cn("mt-4", SECTION_HEADING)}>
              Power Your Front Door with Smart, Effortless Tools
            </h2>
          </div>

          {/* top-right: subtitle */}
          <div className="lg:flex lg:items-end lg:pb-3">
            <p className={cn("max-w-md", SECTION_SUBTITLE)}>
              All the tools you need to manage queues, reservations, and guest
              flow, beautifully designed and easy to use.
            </p>
          </div>

          {/* bottom-left: accordion. On lg it's absolutely filled so its height
              is driven by the graph card (expanding a row can't grow the row or
              move the graph); overflow-y-auto contains any overflow. */}
          <div className="relative lg:pr-4">
            <div className="lg:absolute lg:inset-0 lg:overflow-y-auto lg:pr-1">
              <FeatureAccordion />
            </div>
          </div>

          {/* bottom-right: product visual (defines the row height on lg) */}
          <div className="flex items-center">
            <ServiceSnapshot className="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
