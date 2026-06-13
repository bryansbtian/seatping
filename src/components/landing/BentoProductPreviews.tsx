/**
 * Real-product preview cards for the landing page's animated bento grid.
 *
 * Each preview is a faithful, scaled-down copy of an actual business-app
 * surface, reusing the product's own shared components and palettes so the
 * landing page shows what operators really get:
 *
 *  - {@link ReservationPreview} — ReservationsManager rows + tab pills
 *    (src/components/ReservationsManager.tsx), with real status actions.
 *  - {@link QueuePreview} — the dashboard's Queue Management rows + the
 *    "Customer admitted" toast (src/pages/BusinessDashboard.tsx).
 *  - {@link GuestProfilePreview} — the Guests page search bar + mobile guest
 *    card (src/pages/BusinessGuests.tsx).
 *  - {@link CampaignPreview} — the Campaigns list row, audience preview box,
 *    channel selector, and Message Preview (src/pages/BusinessCampaigns.tsx).
 *  - {@link MetricCardPreview} — a dashboard stat card.
 *
 * Status/tag/channel pills are the real shared components (StatusBadge,
 * GuestBadge, CampaignBadges); GuestStatusBadge's i18n hook falls back to
 * English outside the business-app provider. When editing, only show fields,
 * statuses, and actions that exist in the product.
 *
 * The previews are decorative: render them inside an aria-hidden,
 * pointer-events-none container (the bento card does this) — real Buttons are
 * kept for fidelity but get tabIndex={-1}.
 *
 * Motion: looping animations carry `.bento-loop` (disabled by
 * prefers-reduced-motion and by `[data-bento-animated="false"]`, see
 * index.css). {@link BentoTicker} and {@link CycleStack} are the shared
 * primitives.
 */
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Search,
  TrendingUp,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { GuestStatusBadge, GuestTagBadge } from "@/components/GuestBadge";
import { CampaignStatusBadge, ChannelBadge } from "@/components/CampaignBadges";

export type PreviewProps = { className?: string; animated?: boolean };

/** Sets data-bento-animated="false" so index.css can stop this subtree's loops. */
const bentoAnimatedAttr = (animated: boolean) =>
  animated ? undefined : "false";

/* ================================================================== */
/*  Motion primitives                                                 */
/* ================================================================== */

/**
 * Seamless vertical marquee: renders the rows twice and slides the track up by
 * 50% in a loop, with a soft fade mask at the top and bottom edges.
 */
export function BentoTicker({
  items,
  duration = 18,
  className,
}: {
  items: React.ReactNode[];
  duration?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]",
        className,
      )}
    >
      <div
        className="bento-loop animate-bento-ticker [will-change:transform]"
        style={{ animationDuration: `${duration}s` }}
      >
        {[0, 1].map((copy) => (
          <div key={copy}>
            {items.map((item, i) => (
              <div key={i} className="pb-2">
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Crossfading layer stack: each layer is visible for `duration / n` seconds,
 * cycling forever. Layer 0 stays in normal flow (it defines the height) while
 * the rest are absolutely stacked on top. With animations disabled, layer 0
 * is shown statically.
 */
export function CycleStack({
  layers,
  duration = 9,
  offset = 0,
  className,
}: {
  layers: React.ReactNode[];
  duration?: number;
  /** Shifts the whole cycle (seconds); useful to desync sibling stacks. */
  offset?: number;
  className?: string;
}) {
  const step = duration / layers.length;
  return (
    <div className={cn("relative", className)}>
      {layers.map((layer, i) => (
        <div
          key={i}
          className={cn(
            "bento-loop animate-bento-cycle",
            i === 0
              ? "relative h-full opacity-100"
              : "absolute inset-0 opacity-0",
          )}
          style={{
            animationDuration: `${duration}s`,
            animationDelay: `${offset + i * step}s`,
          }}
        >
          {layer}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  MetricCardPreview — dashboard stat card                           */
/* ================================================================== */

/** A dashboard "Today" stat card (label, figure, tinted round icon). */
export function MetricCardPreview({
  label,
  value,
  icon: Icon,
  tint,
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Tint pair from the dashboard, e.g. "bg-blue-100 text-blue-600". */
  tint: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-[10px] text-slate-600">{label}</p>
        <div className="flex items-center justify-between">
          <p className="text-xl font-semibold leading-none text-slate-800">
            {value}
          </p>
          <div
            className={cn("grid h-7 w-7 place-items-center rounded-full", tint)}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ReservationPreview — ReservationsManager rows + tabs              */
/* ================================================================== */

const RESERVATION_ROWS: {
  name: string;
  status: "confirmed" | "pending" | "arrived";
  returning?: boolean;
  party: number;
  date: string;
  time: string;
  contactIcon: LucideIcon;
  contactLabel: string;
  contactValue: string;
  actions: { label: string; variant: "default" | "destructiveOutline" }[];
}[] = [
  {
    name: "Sofia Almeida",
    status: "confirmed",
    returning: true,
    party: 2,
    date: "Fri, Jun 12",
    time: "7:30 PM",
    contactIcon: Mail,
    contactLabel: "Email",
    contactValue: "sofia.almeida@example.com",
    actions: [
      { label: "Mark Arrived", variant: "default" },
      { label: "No-Show", variant: "destructiveOutline" },
    ],
  },
  {
    name: "Marcus Bennett",
    status: "confirmed",
    party: 4,
    date: "Fri, Jun 12",
    time: "7:45 PM",
    contactIcon: Phone,
    contactLabel: "SMS",
    contactValue: "+1 (415) 555-0114",
    actions: [
      { label: "Mark Arrived", variant: "default" },
      { label: "Cancel", variant: "destructiveOutline" },
    ],
  },
  {
    name: "Aisha Rahman",
    status: "arrived",
    party: 3,
    date: "Fri, Jun 12",
    time: "8:00 PM",
    contactIcon: Phone,
    contactLabel: "SMS",
    contactValue: "+1 (628) 555-0192",
    actions: [
      { label: "Mark Completed", variant: "default" },
      { label: "No-Show", variant: "destructiveOutline" },
    ],
  },
  {
    name: "Daniel Lee",
    status: "confirmed",
    party: 2,
    date: "Fri, Jun 12",
    time: "8:15 PM",
    contactIcon: Mail,
    contactLabel: "Email",
    contactValue: "daniel.lee@example.com",
    actions: [
      { label: "Mark Arrived", variant: "default" },
      { label: "No-Show", variant: "destructiveOutline" },
    ],
  },
];

/** One ReservationsManager row, scaled down (same structure + pills). */
function ReservationPreviewRow({
  row,
}: {
  row: (typeof RESERVATION_ROWS)[number];
}) {
  const ContactIcon = row.contactIcon;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold text-gray-800">{row.name}</p>
        <StatusBadge status={row.status} />
        {row.returning && <GuestStatusBadge returning />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" /> {row.party}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> {row.date}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {row.time}
        </span>
      </div>
      <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-[10px] text-slate-500">
        <ContactIcon className="h-3 w-3 shrink-0" />
        <span>{row.contactLabel}</span>
        <span className="text-slate-400">·</span>
        <span className="truncate">{row.contactValue}</span>
      </span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {row.actions.map((a) => (
          <Button
            key={a.label}
            size="sm"
            variant={a.variant}
            tabIndex={-1}
            className="h-6 px-2.5 text-[10px]"
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The reservations panel: real tab pills + a ticker of booking rows, flanked
 *  by two dashboard stat cards on desktop. */
export function ReservationPreview({
  className,
  animated = true,
}: PreviewProps) {
  // Full tab set from ReservationsManager (Today / Upcoming / Past /
  // Cancelled / No-Shows); counts only render when > 0, like the real header.
  const tabs = [
    { label: "Today", count: 4, active: true },
    { label: "Upcoming", count: 2, active: false },
    { label: "Past", count: 0, active: false },
    { label: "Cancelled", count: 0, active: false },
    { label: "No-Shows", count: 0, active: false },
  ];
  return (
    <div
      data-bento-animated={bentoAnimatedAttr(animated)}
      className={cn("flex h-full w-full flex-col justify-center", className)}
    >
      {/* Booking list and the stat column are siblings in a flex row so the
          stat column spans the same vertical extent as the booking list:
          "Reservations Today" lines up with the top and "Left Today" with the
          bottom of the list, with even spacing between the three. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-8">
        {/* Booking list (tabs + ticker) */}
        <div className="mx-auto flex w-full max-w-sm flex-col md:mx-0 md:max-w-none md:flex-1">
          {/* Tab pills, exactly like the ReservationsManager header */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {tabs.map((t) => (
              <span
                key={t.label}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium",
                  t.active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 text-[9px]",
                      t.active
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-500",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </span>
            ))}
          </div>
          <BentoTicker
            className="h-48 sm:h-52"
            duration={20}
            items={RESERVATION_ROWS.map((row) => (
              <ReservationPreviewRow key={row.name} row={row} />
            ))}
          />
        </div>

        {/* Real dashboard stat cards: a right column spread evenly across the
            booking list's height (md+ only). */}
        <div className="hidden w-36 shrink-0 flex-col justify-between md:flex">
          <div className="rotate-2">
            <MetricCardPreview
              label="Reservations Today"
              value="12"
              icon={Calendar}
              tint="bg-blue-100 text-blue-600"
              className="shadow-md"
            />
          </div>
          <div className="-rotate-2">
            <MetricCardPreview
              label="Served Today"
              value="28"
              icon={TrendingUp}
              tint="bg-emerald-100 text-emerald-600"
              className="shadow-md"
            />
          </div>
          <div className="rotate-2">
            <MetricCardPreview
              label="Left Today"
              value="3"
              icon={LogOut}
              tint="bg-teal-100 text-teal-600"
              className="shadow-md"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  QueuePreview — dashboard Queue Management rows + admit toast      */
/* ================================================================== */

const QUEUE_ROWS = [
  {
    pos: "#1",
    name: "Marcus Bennett",
    returning: true,
    joined: "Joined: 8 mins ago",
    guests: "2 Guests",
    eta: "Estimated Wait: ~5 min",
  },
  {
    pos: "#2",
    name: "Aisha Rahman",
    returning: false,
    joined: "Joined: 2 mins ago",
    guests: "4 Guests",
    eta: "Estimated Wait: ~12 min",
  },
];

/** The dashboard's queue card content: gray rows with position chips,
 *  Admit / Remove actions, and the real "Customer admitted" toast. */
export function QueuePreview({ className, animated = true }: PreviewProps) {
  return (
    <div
      data-bento-animated={bentoAnimatedAttr(animated)}
      className={cn(
        // Mirror GuestProfilePreview so the two cards align on tablet: top-align
        // at md (header lines up with the Guest CRM search; toast fills to the
        // bottom), re-center as a block at lg (pairs with the tall Campaigns).
        "flex h-full w-full flex-col justify-center md:justify-start lg:justify-center",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span className="truncate text-[10px] text-gray-600">
          Managing queue for: Marina Bay
        </span>
        <Badge
          variant="secondary"
          className="shrink-0 bg-indigo-100 px-2 py-0.5 text-[9px] text-indigo-700 hover:bg-indigo-100"
        >
          2 customers
        </Badge>
      </div>
      <div className="flex flex-col gap-2 md:flex-1 md:justify-between lg:flex-none">
        {QUEUE_ROWS.map((row) => (
          <div key={row.pos} className="rounded-lg bg-gray-50 p-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[10px] font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                {row.pos}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                  <span className="min-w-0 truncate">{row.name}</span>
                  {row.returning && (
                    // Keep the badge on the name's line; shrink it on mobile so
                    // it fits beside the name, restore full size from sm up.
                    <GuestStatusBadge
                      returning
                      className="shrink-0 px-1.5 text-[9px] sm:px-2.5 sm:text-[10px]"
                    />
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-gray-600">
                  <span>{row.joined}</span>
                  <span className="text-gray-400">•</span>
                  <span>{row.guests}</span>
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-indigo-600">
                  {row.eta}
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <Button
                size="sm"
                variant="success"
                tabIndex={-1}
                className="h-6 flex-1 text-[10px]"
              >
                Admit
              </Button>
              <Button
                size="sm"
                variant="destructiveOutline"
                tabIndex={-1}
                className="h-6 flex-1 text-[10px]"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}

        {/* The dashboard toast that pops after admitting a guest. */}
        <div className="bento-loop animate-bento-toast rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg">
          <p className="text-[11px] font-semibold text-slate-900">
            Customer Admitted
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Marcus has been admitted and will proceed to their turn.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  GuestProfilePreview — Guests page search + guest cards            */
/* ================================================================== */

const GUEST_PROFILES: {
  name: string;
  initials: string;
  returning: boolean;
  phone: string;
  email: string;
  visits: number;
  last: string;
  upcoming?: string;
  tags: string[];
}[] = [
  {
    name: "Sofia Almeida",
    initials: "SA",
    returning: true,
    phone: "+1 (415) 555-0114",
    email: "sofia.almeida@example.com",
    visits: 12,
    last: "Jun 9",
    upcoming: "1 Upcoming",
    tags: ["VIP", "Regular"],
  },
  {
    name: "Marcus Bennett",
    initials: "MB",
    returning: false,
    phone: "+1 (628) 555-0192",
    email: "marcus.bennett@example.com",
    visits: 1,
    last: "Jun 12",
    tags: ["Birthday"],
  },
  {
    name: "Priya Nair",
    initials: "PN",
    returning: true,
    phone: "+1 (206) 555-0167",
    email: "priya.nair@example.com",
    visits: 6,
    last: "May 28",
    tags: ["Regular", "High Spender"],
  },
];

/** One Guests-page guest card (the page's mobile layout, scaled down). */
function GuestProfilePanel({
  profile,
}: {
  profile: (typeof GUEST_PROFILES)[number];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700">
          {profile.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-slate-800">
              {profile.name}
            </span>
            <GuestStatusBadge returning={profile.returning} />
          </div>
          <div className="mt-0.5 space-y-0.5 text-[10px] text-slate-500">
            <div className="truncate tabular-nums">{profile.phone}</div>
            <div className="truncate">{profile.email}</div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-600">
            <span>
              <strong className="font-semibold text-slate-800">
                {profile.visits}
              </strong>{" "}
              {profile.visits === 1 ? "Visit" : "Visits"}
            </span>
            <span>Last: {profile.last}</span>
            {profile.upcoming && (
              <span className="text-blue-700">{profile.upcoming}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {profile.tags.map((tag) => (
              <GuestTagBadge key={tag} tag={tag} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Guests page: real search field + a short guest list. Showing a couple
 *  of guests (like the real list) fills the card so it sits level with the
 *  Live Queue card beside it on tablet/desktop. */
export function GuestProfilePreview({
  className,
  animated = true,
}: PreviewProps) {
  return (
    <div
      data-bento-animated={bentoAnimatedAttr(animated)}
      className={cn(
        // Tablet (md): top-align so the search lines up with the Live Queue
        // header and the cards fill down to the card's bottom. Desktop (lg):
        // re-center as a block since this card pairs with the tall Reservation.
        "flex h-full w-full flex-col justify-center md:justify-start lg:justify-center",
        className,
      )}
    >
      <div className="mb-2 flex h-7 w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[10px] text-slate-400">
        <Search className="h-3 w-3" /> Search Guests
      </div>
      <div className="flex flex-col gap-2 md:flex-1 md:justify-between lg:flex-none">
        {GUEST_PROFILES.slice(0, 2).map((profile) => (
          <GuestProfilePanel key={profile.name} profile={profile} />
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  CampaignPreview — Campaigns list, audience box, channel selector, */
/*  and the synced Message Preview                                    */
/* ================================================================== */

const CAMPAIGN_CYCLE_SECONDS = 9;

const CHANNELS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "SMS", label: "SMS", icon: Phone },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { key: "EMAIL", label: "Email", icon: Mail },
];

/** Channel selector button (campaign drawer) whose active state cycles. */
function CyclingChannelButton({
  channel,
  index,
  duration,
}: {
  channel: (typeof CHANNELS)[number];
  index: number;
  duration: number;
}) {
  const Icon = channel.icon;
  return (
    <span className="relative flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-[10px] font-medium text-slate-600">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{channel.label}</span>
      <span
        className={cn(
          "bento-loop animate-bento-cycle absolute -inset-px flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-indigo-300 bg-indigo-100 text-indigo-700",
          index === 0 ? "opacity-100" : "opacity-0",
        )}
        style={{
          animationDuration: `${duration}s`,
          animationDelay: `${(index * duration) / CHANNELS.length}s`,
        }}
      >
        <Icon className="h-3 w-3 shrink-0" /> {channel.label}
      </span>
    </span>
  );
}

/** The campaign drawer's Message Preview block for one channel. */
function MessagePreviewPanel({
  channel,
  subject,
}: {
  channel: (typeof CHANNELS)[number];
  subject?: string;
}) {
  const Icon = channel.icon;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      {subject && (
        <div className="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-[10px]">
          <span className="text-slate-500">Subject:</span>{" "}
          <span className="font-medium text-slate-800">{subject}</span>
        </div>
      )}
      {/* Body matches buildMessage(): the rendered text, then the signature
          line naming the business + "via SeatPing" that every SMS/WhatsApp/
          Email carries. */}
      <div className="flex-1 space-y-2 p-3 text-[11px] leading-relaxed text-slate-700">
        <p>
          Hi Sofia, it&apos;s been a while! Show this message for 10% off your
          next visit.
        </p>
        <p className="text-slate-500">- Cafe Milano (via SeatPing)</p>
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] text-slate-500">
        <Icon className="h-3 w-3 shrink-0" /> SeatPing on behalf of your
        restaurant
      </div>
    </div>
  );
}

/** Campaigns: a real list row + audience preview + channel selector on the
 *  left, with the Message Preview swapping in sync on the right. */
export function CampaignPreview({ className, animated = true }: PreviewProps) {
  return (
    <div
      data-bento-animated={bentoAnimatedAttr(animated)}
      className={cn(
        "mx-auto grid h-full w-full max-w-xl items-stretch gap-3 sm:grid-cols-2 sm:gap-4",
        className,
      )}
    >
      {/* Composer column: campaign row, audience preview, channel selector.
          justify-between spreads the panels to fill the full grid-cell height
          so this column matches the Message Preview's height on the right. */}
      <div className="flex h-full flex-col justify-between gap-2">
        {/* Campaigns list — a scheduled campaign and a sent one (History row). */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-slate-800">
              Weekend Brunch Reminder
            </span>
            <CampaignStatusBadge status="SCHEDULED" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ChannelBadge channel="EMAIL" />
            <span className="text-[10px] text-slate-500">2 Recipients</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            · Scheduled · Jun 14, 2026, 2:00 AM
          </p>
        </div>

        {/* Sent campaign, mirroring the Campaigns History row (delivery stats). */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-medium text-slate-800">
              June Win-Back
            </span>
            <ChannelBadge channel="SMS" />
            <CampaignStatusBadge status="SENT" />
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Lunch Comeback Offer · Sent on Jun 11, 2026
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> 189 Sent
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" /> 0 Failed
            </span>
            <span className="text-slate-500">0 Skipped</span>
          </div>
        </div>

        {/* Audience preview box (campaign drawer) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-slate-700">
              Returning Guests
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-indigo-700">
              128 Recipients
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">
            134 Matched · 6 Excluded
          </p>
        </div>

        {/* Channel selector (campaign drawer), active state cycling */}
        <div className="flex gap-1.5">
          {CHANNELS.map((channel, i) => (
            <CyclingChannelButton
              key={channel.key}
              channel={channel}
              index={i}
              duration={CAMPAIGN_CYCLE_SECONDS}
            />
          ))}
        </div>
      </div>

      {/* Message Preview, synced with the cycling channel selector. */}
      <CycleStack
        className="h-full min-h-[8.5rem]"
        duration={CAMPAIGN_CYCLE_SECONDS}
        layers={[
          <MessagePreviewPanel key="sms" channel={CHANNELS[0]} />,
          <MessagePreviewPanel key="whatsapp" channel={CHANNELS[1]} />,
          <MessagePreviewPanel
            key="email"
            channel={CHANNELS[2]}
            subject="Cafe Milano: June Win-Back"
          />,
        ]}
      />
    </div>
  );
}
