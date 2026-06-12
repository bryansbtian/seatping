/**
 * "Why choose SeatPing" feature section, shown directly under the landing hero.
 *
 * Two stacked sections customised for SeatPing:
 *   1. {@link WhyChooseSeatPing} — pill, headline, subtitle, and a 4-up row of
 *      compact feature cards, each turning brand navy on hover.
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
  Zap,
  Plus,
  Minus,
  Check,
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

/* ================================================================== */
/*  Mini visuals — small, reusable, lightweight                       */
/* ================================================================== */

const MINI_GLASS_SURFACE =
  "relative isolate overflow-hidden border border-slate-200 bg-white shadow-sm transition-[background-color,border-color,box-shadow,backdrop-filter,transform] duration-500 ease-out before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0.22)_48%,rgba(255,255,255,0.68)_100%)] before:opacity-0 before:transition-opacity before:duration-500 before:ease-out group-hover:-translate-y-0.5 group-hover:border-white/60 group-hover:bg-white/45 group-hover:shadow-[0_14px_32px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.85)] group-hover:backdrop-blur-2xl group-hover:backdrop-saturate-150 group-hover:before:opacity-100 [&>*]:relative [&>*]:z-10";

const MINI_GLASS_INSET =
  "border border-slate-200 bg-slate-50 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-500 ease-out group-hover:border-white/50 group-hover:bg-white/35 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_8px_20px_rgba(15,23,42,0.1)] group-hover:backdrop-blur-lg group-hover:backdrop-saturate-150";

/** 1 · Queue Management card — mirrors the dashboard's Queue Management surface
 *  (title + "N customers" badge, ranked guest row, Admit / Remove). */
export function MiniQueueCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        MINI_GLASS_SURFACE,
        "flex h-full w-full flex-col rounded-xl p-3",
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
      <div
        className={cn(
          MINI_GLASS_INSET,
          "flex flex-1 flex-col justify-center rounded-lg p-2.5",
        )}
      >
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
        MINI_GLASS_SURFACE,
        "flex h-full w-full flex-col rounded-xl p-3",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-gray-800" />
        <span className="text-xs font-semibold text-gray-800">
          Reservations Management
        </span>
      </div>
      <div
        className={cn(
          MINI_GLASS_INSET,
          "flex flex-1 flex-col justify-center rounded-xl p-3",
        )}
      >
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
      tint: "bg-indigo-100",
      fg: "text-indigo-600",
    },
  ];
  return (
    <div
      className={cn("grid h-full w-full grid-cols-2 grid-rows-2 gap-2", className)}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className={cn(
            MINI_GLASS_SURFACE,
            "flex flex-col justify-center rounded-xl p-2.5",
          )}
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
          className={cn(
            MINI_GLASS_SURFACE,
            "flex flex-1 flex-col justify-center rounded-xl px-2 py-1.5",
          )}
        >
          {/* line 1: location name + credits (beside the name) + actions */}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
            <p className="min-w-0 truncate text-[11px] font-semibold text-gray-800">
              {loc.name}
            </p>
            <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[8px] font-medium leading-none text-indigo-700">
              Credits: {loc.credits}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1">
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
          {/* line 2: address */}
          <div className="mt-0.5 flex items-center gap-1.5 pl-[18px]">
            <p className="min-w-0 flex-1 truncate text-[9px] text-slate-500">
              {loc.address}
            </p>
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
      tint: "bg-slate-100 text-slate-700",
    },
    {
      icon: MessageSquare,
      label: "WhatsApp",
      text: "You're Next In Line",
      tint: "bg-indigo-50 text-indigo-600",
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

/** 6 · Guest CRM card — a guest profile auto-built from visits (name + repeat
 *  badge, tags, visit history, contact). Tag colors mirror the Guest CRM page. */
export function MiniGuestCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        MINI_GLASS_SURFACE,
        "flex h-full w-full flex-col rounded-xl p-3",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
          <Contact className="h-3.5 w-3.5" />
          Guest Profile
        </span>
        <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
          Returning
        </span>
      </div>
      <div
        className={cn(
          MINI_GLASS_INSET,
          "flex flex-1 flex-col justify-center rounded-xl p-3",
        )}
      >
        <p className="truncate text-[12px] font-semibold text-gray-800">
          Sofia Almeida
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
            VIP
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">
            Regular
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> 7 Visits
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Last: 3d Ago
          </span>
        </div>
        <span className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">sofia.almeida@example.com</span>
        </span>
      </div>
    </div>
  );
}

/** 7 · Guest Campaigns card — a branded message sent to a saved audience
 *  (campaign + status, audience group, the three channels). */
export function MiniCampaignCard({ className }: { className?: string }) {
  const channels = [
    { icon: Phone, label: "SMS" },
    { icon: MessageSquare, label: "WhatsApp" },
    { icon: Mail, label: "Email" },
  ];
  return (
    <div
      className={cn(
        MINI_GLASS_SURFACE,
        "flex h-full w-full flex-col rounded-xl p-3",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
          <Send className="h-3.5 w-3.5" />
          Guest Campaigns
        </span>
        <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
          Sent
        </span>
      </div>
      <div
        className={cn(
          MINI_GLASS_INSET,
          "flex flex-1 flex-col justify-center rounded-xl p-3",
        )}
      >
        <p className="truncate text-[12px] font-semibold text-gray-800">
          We Miss You
        </p>
        <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">
          <Users className="h-3 w-3" /> Regulars · 128 Guests
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {channels.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
            >
              <c.icon className="h-3 w-3" /> {c.label}
            </span>
          ))}
        </div>
      </div>
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
      <div className="relative h-16 bg-gradient-to-r from-slate-900 to-indigo-700">
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
                ? "border-slate-300 bg-slate-100/80 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
                  active
                    ? "bg-slate-900 text-white"
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
        "relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-indigo-50/70 p-5 sm:p-7",
        className,
      )}
    >
      <div className="mx-auto max-w-sm space-y-3">
        {/* Peak Hours */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-700" />
            <p className="text-sm font-semibold text-slate-900">Peak Hours</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            When does your business get the most traffic?
          </p>
          <MiniBarChart
            data={peakHours}
            color="#4f46e5"
            max={24}
            yTicks={[0, 6, 12, 18, 24]}
          />
        </div>

        {/* Wait Time Distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/5">
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
            color="#64748b"
            max={48}
            yTicks={[0, 12, 24, 36, 48]}
          />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section #1 — Why choose SeatPing (header + 4-up feature cards)     */
/* ================================================================== */

/* ── Stacked-card scroll section ── */

/** One card in the sticky deck. Pure CSS `position: sticky`: each card pins a
 *  little lower than the previous one (top = --pin + index·--peek), so as you
 *  scroll down, each card slides up and stacks under the ones already pinned —
 *  leaving a thin deck-edge of each earlier card peeking behind the active one.
 *  The card content is vertically centered. A small responsive margin separates
 *  each card in the normal flow, while the last card stays flush with the end
 *  of the deck. */
function StackCard({
  feat,
  index,
  isLast,
}: {
  feat: {
    title: string;
    description: string;
    icon: React.ElementType;
    visual: React.ReactNode;
  };
  index: number;
  isLast: boolean;
}) {
  const Icon = feat.icon;
  return (
    <div
      className={cn("sticky w-full", !isLast && "mb-6 sm:mb-8")}
      style={{
        top: `calc(var(--pin) + ${index} * var(--peek))`,
        zIndex: index + 1,
      }}
    >
      {/* Flex (not grid) so both columns stretch to the card's full height and
          their content is genuinely centered vertically — no top-heavy gap.
          Mobile stacks the two blocks and centers them as a group. */}
      <div className="flex min-h-0 flex-col justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/[0.06] md:min-h-[16rem] md:flex-row md:justify-normal lg:min-h-[17rem]">
        {/* Left: icon + title + description, vertically centered. */}
        <div className="flex flex-col justify-center p-4 sm:p-5 md:w-1/2 md:p-6 lg:p-7">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm sm:h-10 sm:w-10">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <h3
              className={cn(
                CARD_TITLE,
                "text-lg text-slate-900 sm:text-xl lg:text-2xl",
              )}
            >
              {feat.title}
            </h3>
          </div>

          <p
            className={cn(
              CARD_DESCRIPTION,
              "mt-2.5 max-w-md text-sm leading-relaxed sm:mt-3 sm:text-base",
            )}
          >
            {feat.description}
          </p>
        </div>

        {/* Right: the existing mini UI preview, vertically centered. */}
        <div className="flex items-center justify-center border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5 md:w-1/2 md:border-l md:border-t-0 md:p-6 lg:p-7">
          <div className="w-full max-w-[15rem] sm:max-w-xs md:max-w-sm">
            {feat.visual}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhyChooseSeatPing() {
  const FEATURES = [
    {
      title: "Smart Queue Management",
      description:
        "Track every walk-in, admit guests in order, and notify them the moment a table opens up.",
      icon: ListOrdered,
      visual: <MiniQueueCard className="w-full" />,
    },
    {
      title: "Reservation Management",
      description:
        "Take bookings in advance and keep tonight's tables organised without the paper book.",
      icon: CalendarDays,
      visual: <MiniReservationCard className="w-full" />,
    },
    {
      title: "Guest CRM",
      description:
        "Guest profiles build themselves from every visit, so you can track history, tags, notes, and your repeat guests.",
      icon: Contact,
      visual: <MiniGuestCard className="w-full" />,
    },
    {
      title: "Guest Campaigns",
      description:
        "Send SeatPing-branded SMS, WhatsApp, and Email campaigns to selected guests, smart audiences, or saved groups.",
      icon: Send,
      visual: <MiniCampaignCard className="w-full" />,
    },
    {
      title: "Daily Summary",
      description:
        "See served guests, average wait, and no-shows at a glance, updated through the day.",
      icon: TrendingUp,
      visual: <MiniPerformanceCard className="w-full" />,
    },
    {
      title: "Location Management",
      description:
        "Set hours, capacity, and queue settings for each location from one place.",
      icon: MapPin,
      visual: <MiniLocationCard className="w-full" />,
    },
  ];

  return (
    <section className="relative border-t border-slate-200 bg-white">
      {/* soft brand wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 right-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-indigo-100/35 blur-3xl"
      />

      <div className="container relative mx-auto max-w-5xl px-4 pt-14 sm:pt-16 md:pt-20">
        {/* Section header — scrolls normally with the page */}
        <div className="mx-auto max-w-3xl scroll-animate text-center">
          <h2 className={SECTION_HEADING}>
            A Smarter Way to Manage Queues, Reservations, and Guest Flow
          </h2>
          <p className={cn("mx-auto mt-4 max-w-2xl", SECTION_SUBTITLE)}>
            Give customers a smoother waiting experience while helping staff
            manage queues, reservations, and daily operations from one simple
            dashboard.
          </p>
        </div>

        {/* Sticky stacked-card deck.
            --pin:  where the first card pins (clears the fixed site nav).
            --peek: how far each card pins below the previous one. Mobile keeps
                    enough room for wrapped titles on narrow phones, then
                    tightens once titles fit on one line. */}
        <div className="relative mt-10 pb-14 sm:mt-12 md:pb-20 [--peek:4.75rem] [--pin:5rem] min-[361px]:[--peek:4rem] md:[--peek:3rem] md:[--pin:6rem]">
          {FEATURES.map((feat, idx) => (
            <StackCard
              key={feat.title}
              feat={feat}
              index={idx}
              isLast={idx === FEATURES.length - 1}
            />
          ))}
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
