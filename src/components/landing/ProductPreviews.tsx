/**
 * Static, non-interactive "preview" versions of real SeatPing business
 * surfaces, used on the marketing landing page so visitors see the actual
 * product UI (not generic mockups).
 *
 * These deliberately mirror the markup + Tailwind classes of the live
 * components — business sign-up (BusinessSignup), settings (RestaurantProfileEditor:
 * Opening Hours / Reservations), the dashboard queue + reservations
 * (BusinessDashboard, ReservationsManager) and the per-location QR — but with
 * hard-coded sample data and no handlers/API. Each preview is wrapped
 * `aria-hidden` + `pointer-events-none` since it is illustrative chrome.
 */
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  Clock,
  Calendar,
  CalendarDays,
  TrendingUp,
  LogOut,
  ListOrdered,
  ChevronDown,
  QrCode,
  Mail,
  MessageSquare,
  Phone,
  Download,
  Copy,
  MapPin,
  Pencil,
  Star,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- */
/*  Shared bits                                                      */
/* ---------------------------------------------------------------- */

/** Marks a block as decorative chrome (no focus / no pointer). */
function Preview({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none select-none", className)}>
      {children}
    </div>
  );
}

/** Button-shaped span (so previews stay non-interactive). */
function Pill({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "green" | "outline" | "danger" | "dark";
  className?: string;
}) {
  const styles: Record<string, string> = {
    default:
      "bg-primary text-primary-foreground",
    green: "bg-green-600 text-white",
    dark: "bg-slate-900 text-white",
    outline: "border border-input bg-background text-slate-700",
    danger: "border border-red-200 text-red-600 bg-white",
  };
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  arrived: "bg-blue-100 text-blue-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  arrived: "Arrived",
};

/* ---------------------------------------------------------------- */
/*  Sample data                                                      */
/* ---------------------------------------------------------------- */

const QUEUE = [
  { name: "Jessica Martinez", joined: "8 mins ago", guests: 2, method: "SMS", wait: "~10 min" },
  { name: "David Kim", joined: "5 mins ago", guests: 4, method: "WhatsApp", wait: "~18 min" },
  { name: "Rachel Thompson", joined: "Just now", guests: 1, method: "Email", wait: "~22 min" },
];

const RESERVATIONS = [
  { name: "Olivia Bennett", party: 4, time: "7:30 PM", status: "confirmed", contact: "email" },
  { name: "Liam Carter", party: 2, time: "8:00 PM", status: "pending", contact: "sms" },
  { name: "Noah Davis", party: 6, time: "8:15 PM", status: "arrived", contact: "whatsapp" },
];

const STATS = [
  { label: "Current Queue", value: "3", icon: Users, tint: "bg-indigo-100", fg: "text-indigo-600" },
  { label: "Reservations Today", value: "12", icon: Calendar, tint: "bg-blue-100", fg: "text-blue-600" },
  { label: "Avg Queue Wait", value: "5m", icon: Clock, tint: "bg-teal-100", fg: "text-teal-600" },
  { label: "Served Today", value: "28", icon: TrendingUp, tint: "bg-emerald-100", fg: "text-emerald-600" },
  { label: "Left Today", value: "4", icon: LogOut, tint: "bg-teal-100", fg: "text-teal-600" },
];

/* ---------------------------------------------------------------- */
/*  Stat cards (dashboard summary)                                   */
/* ---------------------------------------------------------------- */

export function StatCardsPreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATS.map((s) => (
          <Card key={s.label} className="bg-white rounded-xl shadow-sm border-0 p-3 md:p-4">
            <div className="flex flex-col gap-2">
              <p className="text-slate-600 text-xs md:text-sm">{s.label}</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                  {s.value}
                </p>
                <div className={cn("p-2 rounded-full", s.tint)}>
                  <s.icon className={cn("w-5 h-5 md:w-6 md:h-6", s.fg)} />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Preview>
  );
}

/* ---------------------------------------------------------------- */
/*  Queue Management card                                            */
/* ---------------------------------------------------------------- */

export function QueueCardPreview({
  className,
  rows = QUEUE,
}: {
  className?: string;
  rows?: typeof QUEUE;
}) {
  return (
    <Preview className={className}>
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardHeader className="border-b border-gray-100 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
                <ListOrdered className="w-5 h-5" />
                Queue Management
              </CardTitle>
              <CardDescription className="text-gray-600 text-sm">
                Managing queue for: Downtown
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
              {rows.length} {rows.length === 1 ? "customer" : "customers"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <div className="space-y-3 md:space-y-4">
            {rows.map((c, index) => (
              <div
                key={c.name}
                className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-start space-x-3 md:space-x-4">
                  <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs md:text-sm font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                    #{index + 1}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                      {c.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                      <span className="whitespace-nowrap">Joined: {c.joined}</span>
                      <span className="text-gray-400">•</span>
                      <span className="whitespace-nowrap">
                        {c.guests} {c.guests === 1 ? "Guest" : "Guests"}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="whitespace-nowrap">{c.method}</span>
                    </div>
                    <p className="text-xs md:text-sm font-medium text-indigo-600 mt-1">
                      Estimated wait: {c.wait}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 md:space-x-3">
                  <Pill variant="green" className="flex-1 md:flex-none">
                    Admit
                  </Pill>
                  <Pill variant="outline" className="flex-1 md:flex-none">
                    Remove
                  </Pill>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Preview>
  );
}

/* ---------------------------------------------------------------- */
/*  Awaiting arrival (amber) — Arrived / No Show                     */
/* ---------------------------------------------------------------- */

export function AwaitingArrivalPreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <Card className="bg-amber-50 border-amber-200 rounded-xl shadow-sm">
        <CardHeader className="border-b border-amber-200 p-4 md:p-5">
          <CardTitle className="text-base md:text-lg text-amber-800 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Awaiting Arrival Confirmation
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-white rounded-lg border border-amber-200">
            <div className="flex items-center space-x-3 md:space-x-4 flex-1">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-amber-600 rounded-full flex items-center justify-center">
                <span className="text-xs md:text-sm font-semibold text-white leading-none tabular-nums">
                  4:12
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                  Marcus Lee
                </h3>
                <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                  <span>Admitted: 1 min ago</span>
                  <span className="text-gray-400">•</span>
                  <span>2 Guests</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <Pill variant="green">Arrived</Pill>
              <Pill variant="danger" className="border-red-500">
                No Show
              </Pill>
            </div>
          </div>
        </CardContent>
      </Card>
    </Preview>
  );
}

/* ---------------------------------------------------------------- */
/*  Reservations Management card (tabs + rows)                       */
/* ---------------------------------------------------------------- */

export function ReservationsCardPreview({
  className,
  limit,
}: {
  className?: string;
  limit?: number;
}) {
  const rows = limit ? RESERVATIONS.slice(0, limit) : RESERVATIONS;
  const tabs = [
    { label: "Today", count: 3, active: true },
    { label: "Upcoming", count: 8, active: false },
    { label: "Past", count: 0, active: false },
  ];
  return (
    <Preview className={className}>
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardHeader className="border-b border-gray-100 p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
            <CalendarDays className="w-5 h-5" />
            Reservations Management
          </CardTitle>
          <CardDescription className="text-gray-600 text-sm mt-0.5">
            Bookings for: Downtown
          </CardDescription>
          <div className="!mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <span
                key={t.label}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  t.active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 text-[10px]",
                      t.active ? "bg-white/20 text-white" : "bg-white text-slate-500",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <div className="space-y-3">
            {rows.map((r) => {
              const ContactIcon =
                r.contact === "email"
                  ? Mail
                  : r.contact === "whatsapp"
                    ? MessageSquare
                    : Phone;
              return (
                <div key={r.name} className="rounded-xl border border-slate-200 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-sm md:text-base">
                        {r.name}
                      </p>
                      <Badge
                        className={cn(
                          "border-0 text-[10px]",
                          STATUS_STYLE[r.status],
                        )}
                      >
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {r.party}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" /> Today
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {r.time}
                      </span>
                    </div>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <ContactIcon className="h-3.5 w-3.5" />
                      <span className="capitalize">
                        {r.contact === "sms" ? "SMS" : r.contact}
                      </span>
                    </span>
                  </div>
                  {r.status === "pending" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill variant="dark">Confirm</Pill>
                      <Pill variant="danger">Cancel</Pill>
                    </div>
                  )}
                  {r.status === "confirmed" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill variant="dark">Mark Arrived</Pill>
                      <Pill variant="danger">No-Show</Pill>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Preview>
  );
}

/* ---------------------------------------------------------------- */
/*  Dashboard chrome wrapper (greeting + location select)           */
/* ---------------------------------------------------------------- */

function DashboardChrome() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-slate-800">
            Hello Cafe Milano!
          </h2>
          <p className="text-slate-600 text-sm md:text-base">
            Here is your daily statistic
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
              Credits: 285
            </span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4" />
            <span>Today</span>
          </div>
          <div className="relative">
            <span className="flex w-40 appearance-none items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-8 text-sm text-slate-700">
              Downtown
            </span>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Faithful, static reproduction of the dashboard screenshot used inside the
 * hero iPad. Wording is fixed to match the provided screenshot exactly.
 */
export function HeroDashboardScreen({ className }: { className?: string }) {
  const queue = [
    {
      pos: 1,
      name: "Olivia Reyes",
      meta: "Joined: 3m ago · 1 Guest · SMS",
      phone: "Phone: +1 (415) 555-0148" as string | null,
      email: null as string | null,
    },
    {
      pos: 2,
      name: "Marcus Bennett",
      meta: "Joined: 2m ago · 3 Guests · Email",
      phone: null as string | null,
      email: "Email: marcus.bennett@example.com",
    },
  ];
  const tabs = [
    { label: "Today", count: 0, active: false },
    { label: "Upcoming", count: 2, active: true },
    { label: "Past", count: 2, active: false },
    { label: "Cancelled", count: 0, active: false },
    { label: "No-Shows", count: 0, active: false },
  ];
  return (
    <Preview className={cn("space-y-3", className)}>
      {/* Queue Management */}
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardHeader className="border-b border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base text-gray-800">
                <ListOrdered className="w-5 h-5" />
                Queue Management
              </CardTitle>
              <CardDescription className="text-gray-600 text-sm">
                Managing queue for: Marina Bay
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Pill variant="outline">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
              </Pill>
              <Badge
                variant="secondary"
                className="bg-indigo-100 text-indigo-700 text-[10px]"
              >
                2 customers
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {queue.map((c) => (
              <div
                key={c.pos}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                    #{c.pos}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      {c.name}
                    </h3>
                    <p className="text-xs text-gray-600">{c.meta}</p>
                    {c.phone && (
                      <p className="text-xs text-gray-500 mt-1">{c.phone}</p>
                    )}
                    {c.email && (
                      <p className="text-xs text-gray-500 mt-1 break-all">
                        {c.email}
                      </p>
                    )}
                    <p className="text-xs font-medium text-indigo-600 mt-1">
                      Estimated wait: Less Than 5 Minutes
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Pill variant="green">Admit</Pill>
                  <Pill variant="outline">Remove</Pill>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reservations Management */}
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardHeader className="border-b border-gray-100 p-4">
          <CardTitle className="flex items-center gap-2 text-base text-gray-800">
            <CalendarDays className="w-5 h-5" />
            Reservations Management
          </CardTitle>
          <CardDescription className="text-gray-600 text-sm mt-0.5">
            Bookings for: Marina Bay
          </CardDescription>
          <div className="!mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <span
                key={t.label}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  t.active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 text-[10px]",
                      t.active ? "bg-white/20 text-white" : "bg-white text-slate-500",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-800 text-sm">Sofia Almeida</p>
              <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px]">
                Confirmed
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> 2
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Fri, Jun 5
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> 11:00 AM
              </span>
            </div>
            <span className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Email · sofia.almeida@example.com</span>
            </span>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill variant="dark">Mark Arrived</Pill>
              <Pill variant="danger">No-Show</Pill>
              <Pill variant="danger">Cancel</Pill>
            </div>
          </div>
        </CardContent>
      </Card>
    </Preview>
  );
}

/** Full dashboard window — the hero centerpiece. */
export function DashboardPreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-6 space-y-4 md:space-y-6">
        <DashboardChrome />
        <StatCardsPreview className="pointer-events-auto" />
        <QueueCardPreview className="pointer-events-auto" />
        <ReservationsCardPreview className="pointer-events-auto" />
      </div>
    </Preview>
  );
}

/** Compact live view for the "Step Three" onboarding card. */
export function LiveQueuePreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <div className="space-y-4">
        <QueueCardPreview rows={QUEUE.slice(0, 2)} className="pointer-events-auto" />
        <AwaitingArrivalPreview className="pointer-events-auto" />
      </div>
    </Preview>
  );
}

/* ---------------------------------------------------------------- */
/*  Business sign-up form                                            */
/* ---------------------------------------------------------------- */

function Field({
  label,
  value,
  type = "text",
}: {
  label: string;
  value: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input className="h-11" type={type} value={value} readOnly tabIndex={-1} />
    </div>
  );
}

export function SignupPreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <Card className="border-0 bg-white shadow-sm">
        <CardHeader className="space-y-1 p-5 text-center">
          <CardTitle className="text-xl text-primary">
            Create Your Business Account
          </CardTitle>
          <CardDescription className="text-sm">
            Join SeatPing and transform your business
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <Field label="Business Name" value="Cafe Milano" />
          <Field label="Business Username" value="cafemilano" />
          <Field label="Email" value="owner@cafemilano.com" type="email" />
          <div className="space-y-2">
            <Label className="text-sm">Phone Number</Label>
            <div className="flex gap-2">
              <span className="flex h-11 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm text-slate-700">
                🇺🇸 +1
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </span>
              <Input
                className="h-11 flex-1"
                value="(555) 123-4567"
                readOnly
                tabIndex={-1}
              />
            </div>
          </div>
          <Field label="Password" value="••••••••" type="password" />
          <span className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-foreground">
            Start Free Trial
          </span>
        </CardContent>
      </Card>
    </Preview>
  );
}

/* ---------------------------------------------------------------- */
/*  Settings: Opening Hours + Reservations + QR                     */
/* ---------------------------------------------------------------- */

function HoursRow({
  day,
  open,
  close,
  closed = false,
}: {
  day: string;
  open?: string;
  close?: string;
  closed?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-x-3 py-1.5">
      <span className="font-medium capitalize text-slate-800 text-sm">{day}</span>
      <div className={cn("flex items-center gap-2", closed && "opacity-50")}>
        <span className="flex-1 truncate rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
          {closed ? "Closed" : `From ${open}`}
        </span>
        <span className="flex-1 truncate rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
          {closed ? "Closed" : `To ${close}`}
        </span>
      </div>
      <Switch on={!closed} />
    </div>
  );
}

/** Static switch matching the product's look. */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
        on ? "justify-end bg-primary" : "justify-start bg-slate-200",
      )}
    >
      <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
    </span>
  );
}

export function SettingsPreview({ className }: { className?: string }) {
  return (
    <Preview className={cn("space-y-4", className)}>
      {/* Opening Hours */}
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardHeader className="p-4 md:p-5">
          <CardTitle className="text-base md:text-lg text-gray-800">
            Opening Hours
          </CardTitle>
          <CardDescription className="text-gray-600 text-sm">
            Set the days and times your location is open.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-5 pt-0">
          <HoursRow day="monday" open="9:00 AM" close="10:00 PM" />
          <HoursRow day="friday" open="9:00 AM" close="11:30 PM" />
          <HoursRow day="sunday" closed />
        </CardContent>
      </Card>

      {/* Reservations */}
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardHeader className="p-4 md:p-5">
          <CardTitle className="text-base md:text-lg text-gray-800">
            Reservations
          </CardTitle>
          <CardDescription className="text-gray-600 text-sm">
            Allow customers to book a table in advance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-5 pt-0">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5">
            <div>
              <p className="font-medium text-gray-800 text-sm">
                Enable Reservations
              </p>
              <p className="text-xs text-muted-foreground">
                Waitlist is always on; reservations are optional.
              </p>
            </div>
            <Switch on />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Max Number of Guests</Label>
              <Input className="h-10" value="8" readOnly tabIndex={-1} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Max Reserved Guests / Hour</Label>
              <Input className="h-10" value="40" readOnly tabIndex={-1} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR code per location */}
      <Card className="bg-white rounded-xl shadow-sm border-0">
        <CardContent className="flex items-center gap-4 p-4 md:p-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <QrCode className="h-14 w-14 text-slate-900" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-800 text-sm">
              Queue QR · Downtown
            </p>
            <p className="truncate text-xs text-slate-500">
              seatping.app/queue/cafemilano/downtown
            </p>
            <div className="mt-2.5 flex gap-2">
              <Pill variant="dark">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Pill>
              <Pill variant="outline">
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
              </Pill>
            </div>
          </div>
        </CardContent>
      </Card>
    </Preview>
  );
}

/* ================================================================ */
/*  Compact MINI cards — used in the hero collage only.             */
/*  (Width-agnostic: w-full; the collage wrapper fixes their size.) */
/* ================================================================ */

const miniCard =
  "w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/30";

/** 1 · Queue Management (single waiting guest + Admit / Notify). */
export function QueueMiniCard({ className }: { className?: string }) {
  return (
    <div className={cn(miniCard, className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <ListOrdered className="h-4 w-4 text-slate-500" />
          Queue
        </span>
        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 text-[10px]">
          1 waiting
        </Badge>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
        <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
          #1
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">
            Marcus Bennett
          </p>
          <p className="truncate text-xs text-gray-600">Just now · 1 Guest</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          Waiting
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <Pill variant="green" className="flex-1">
          Admit
        </Pill>
        <Pill variant="outline" className="flex-1">
          Notify
        </Pill>
      </div>
    </div>
  );
}

/** 2 · Reservations Management (party of 2, date/time, status badge). */
export function ReservationMiniCard({ className }: { className?: string }) {
  return (
    <div className={cn(miniCard, className)}>
      <div className="mb-3 flex items-center gap-1.5">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-semibold text-gray-800">Reservations</span>
        <span className="ml-auto text-xs text-slate-400">Marina Bay</span>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-800 text-sm">Sofia Almeida</p>
          <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px]">
            Confirmed
          </Badge>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> 2
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> Wed, Jun 10
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> 7:30 PM
          </span>
        </div>
        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Email · sofia.almeida@example.com</span>
        </span>
      </div>
    </div>
  );
}

/** 3 · Performance Summary (tiny sparkline + 3 stats). */
export function PerformanceMiniCard({ className }: { className?: string }) {
  return (
    <div className={cn(miniCard, className)}>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <TrendingUp className="h-4 w-4 text-slate-500" />
          Performance
        </span>
        <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
          Daily
        </span>
      </div>
      <p className="text-xs text-slate-500">Served, wait time &amp; no-shows</p>

      <svg viewBox="0 0 240 68" className="mt-2 h-16 w-full" aria-hidden>
        {/* baseline */}
        <line x1="0" y1="64" x2="240" y2="64" stroke="#f1f5f9" strokeWidth="1" />
        {/* customers served (indigo) */}
        <polyline
          points="0,52 40,48 80,50 120,42 160,36 200,26 240,12"
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* no-shows (amber) */}
        <polyline
          points="0,60 40,60 80,58 120,60 160,55 200,57 240,54"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
        {[
          { v: "28", l: "Served", c: "text-indigo-600" },
          { v: "5m", l: "Avg wait", c: "text-emerald-600" },
          { v: "3", l: "No-shows", c: "text-amber-600" },
        ].map((s) => (
          <div key={s.l}>
            <p className={cn("text-base font-semibold", s.c)}>{s.v}</p>
            <p className="text-[10px] text-slate-500">{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 4 · Location Management (name, credits, address, Edit / Reviews / QR). */
export function LocationMiniCard({ className }: { className?: string }) {
  return (
    <div className={cn(miniCard, className)}>
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-800 text-sm">Marina Bay</p>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              Credits: 992
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            12 Harbourfront Walk, Marina Bay
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Pill variant="outline" className="flex-1">
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Pill>
        <Pill variant="outline" className="flex-1">
          <Star className="mr-1 h-3.5 w-3.5" /> Reviews
        </Pill>
        <Pill variant="outline" className="flex-1">
          <QrCode className="mr-1 h-3.5 w-3.5" /> QR
        </Pill>
      </div>
    </div>
  );
}

/** Small notification toast (SMS / WhatsApp sent). */
export function NotifyToastMiniCard({
  className,
  label = "SMS sent",
  text = "“Your table is ready 🎉”",
  tint = "bg-emerald-50 text-emerald-600",
}: {
  className?: string;
  label?: string;
  text?: string;
  tint?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xl shadow-slate-300/30",
        className,
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tint)}>
        <MessageSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-800">{text}</p>
      </div>
    </div>
  );
}

/** Tiny single-stat chip. */
export function StatChipMiniCard({
  label,
  value,
  icon: Icon,
  tint,
  fg,
  className,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  fg: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl shadow-slate-300/30",
        className,
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-2xl font-semibold text-slate-800">{value}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", tint)}>
          <Icon className={cn("h-4 w-4", fg)} />
        </span>
      </div>
    </div>
  );
}

/** Compact QR "scan to join" card. */
export function QrMiniCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/30",
        className,
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
        <QrCode className="h-8 w-8 text-slate-900" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">Scan to join</p>
        <p className="truncate text-xs text-slate-500">Queue · Marina Bay</p>
      </div>
    </div>
  );
}

/** Awaiting-arrival mini (timer + Arrived / No Show). */
export function AwaitingMiniCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-amber-200 bg-amber-50 p-3.5 shadow-xl shadow-amber-200/30",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold tabular-nums text-white">
          4:12
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">
            Daniel Cho
          </p>
          <p className="truncate text-xs text-gray-600">Admitted · 2 Guests</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Pill variant="green" className="flex-1">
          Arrived
        </Pill>
        <Pill variant="danger" className="flex-1 border-red-500">
          No Show
        </Pill>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Hero collage — layered on desktop, tidy grid on tablet/mobile   */
/* ---------------------------------------------------------------- */

export function HeroCollage() {
  return (
    <Preview>
      {/* Desktop: packed, heavily-overlapping composition of mini previews */}
      <div className="relative mx-auto hidden h-[520px] max-w-5xl lg:block">
        {/* --- top band --- */}
        <div className="absolute left-0 top-0 z-50 w-44">
          <StatChipMiniCard
            label="In queue"
            value="4"
            icon={Users}
            tint="bg-indigo-100"
            fg="text-indigo-600"
          />
        </div>
        <div className="absolute left-[27%] top-0 z-50 w-64">
          <NotifyToastMiniCard />
        </div>
        <div className="absolute left-[54%] top-1 z-40 w-44">
          <StatChipMiniCard
            label="Reservations"
            value="12"
            icon={Calendar}
            tint="bg-blue-100"
            fg="text-blue-600"
          />
        </div>
        <div className="absolute right-0 top-2 z-20 w-[20rem]">
          <PerformanceMiniCard />
        </div>

        {/* --- middle (anchors, front) --- */}
        <div className="absolute left-1 top-24 z-20 w-72">
          <QueueMiniCard />
        </div>
        <div className="absolute left-[22%] top-32 z-40 w-[21rem]">
          <ReservationMiniCard />
        </div>
        <div className="absolute left-[50%] top-40 z-30 w-60">
          <NotifyToastMiniCard
            label="WhatsApp sent"
            text="“You’re next in line”"
            tint="bg-teal-50 text-teal-600"
          />
        </div>
        <div className="absolute right-1 top-[38%] z-30 w-44">
          <StatChipMiniCard
            label="Served today"
            value="28"
            icon={TrendingUp}
            tint="bg-emerald-100"
            fg="text-emerald-600"
          />
        </div>
        <div className="absolute left-[6%] top-[52%] z-30 w-40">
          <StatChipMiniCard
            label="Avg wait"
            value="5m"
            icon={Clock}
            tint="bg-teal-100"
            fg="text-teal-600"
          />
        </div>

        {/* --- bottom band --- */}
        <div className="absolute bottom-2 left-0 z-30 w-60">
          <QrMiniCard />
        </div>
        <div className="absolute bottom-0 left-[26%] z-40 w-72">
          <AwaitingMiniCard />
        </div>
        <div className="absolute bottom-1 right-2 z-20 w-[20rem]">
          <LocationMiniCard />
        </div>
      </div>

      {/* Tablet / mobile: stacked grid; lighter elements hidden on phones */}
      <div className="mx-auto grid max-w-md grid-cols-1 gap-4 sm:max-w-2xl sm:grid-cols-2 lg:hidden">
        <NotifyToastMiniCard className="sm:col-span-2" />
        <ReservationMiniCard />
        <QueueMiniCard />
        <LocationMiniCard />
        <PerformanceMiniCard className="max-sm:hidden" />
        <QrMiniCard className="max-sm:hidden" />
        <AwaitingMiniCard className="max-sm:hidden" />
        <NotifyToastMiniCard
          className="max-sm:hidden"
          label="WhatsApp sent"
          text="“You’re next in line”"
          tint="bg-teal-50 text-teal-600"
        />
      </div>
    </Preview>
  );
}
