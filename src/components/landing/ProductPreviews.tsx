import { useLayoutEffect, useRef, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
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
  ChevronLeft,
  ChevronRight,
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
  Wifi,
  Signal,
  BatteryFull,
  Lock,
  Plus,
  Share,
} from "lucide-react";
import { cn } from "@/lib/utils";


function Preview({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none select-none", className)}
    >
      {children}
    </div>
  );
}

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
    default: "bg-primary text-primary-foreground",
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


const QUEUE = [
  {
    name: "Jessica Martinez",
    joined: "8 mins ago",
    guests: 2,
    method: "SMS",
    wait: "~10 min",
  },
  {
    name: "David Kim",
    joined: "5 mins ago",
    guests: 4,
    method: "WhatsApp",
    wait: "~18 min",
  },
  {
    name: "Rachel Thompson",
    joined: "Just now",
    guests: 1,
    method: "Email",
    wait: "~22 min",
  },
];

const RESERVATIONS = [
  {
    name: "Olivia Bennett",
    party: 4,
    time: "7:30 PM",
    status: "confirmed",
    contact: "email",
  },
  {
    name: "Liam Carter",
    party: 2,
    time: "8:00 PM",
    status: "confirmed",
    contact: "sms",
  },
  {
    name: "Noah Davis",
    party: 6,
    time: "8:15 PM",
    status: "arrived",
    contact: "whatsapp",
  },
];

const STATS = [
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
  {
    label: "Avg Queue Wait",
    value: "5m",
    icon: Clock,
    tint: "bg-teal-100",
    fg: "text-teal-600",
  },
  {
    label: "Served Today",
    value: "28",
    icon: TrendingUp,
    tint: "bg-emerald-100",
    fg: "text-emerald-600",
  },
  {
    label: "Left Today",
    value: "4",
    icon: LogOut,
    tint: "bg-teal-100",
    fg: "text-teal-600",
  },
];


export function StatCardsPreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATS.map((s) => (
          <Card
            key={s.label}
            className="bg-white rounded-xl shadow-sm border-0 p-3 md:p-4"
          >
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
          {}
          <div className="md:hidden">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
                <ListOrdered className="w-5 h-5" />
                Queue Management
              </CardTitle>
              <Badge
                variant="secondary"
                className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-1 whitespace-nowrap max-[374px]:hidden"
              >
                {rows.length} {rows.length === 1 ? "customer" : "customers"}
              </Badge>
            </div>
            <CardDescription className="text-gray-600 text-sm mb-3 mt-0.5">
              Managing queue for: Downtown
            </CardDescription>
            <span className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-background text-sm font-medium text-slate-700">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </span>
          </div>

          {}
          <div className="hidden md:flex md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
                <ListOrdered className="w-5 h-5" />
                Queue Management
              </CardTitle>
              <CardDescription className="text-gray-600 text-sm">
                Managing queue for: Downtown
              </CardDescription>
            </div>
            <div className="flex items-center space-x-3">
              <span className="flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-slate-700">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </span>
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                {rows.length} {rows.length === 1 ? "customer" : "customers"}
              </Badge>
            </div>
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
                      <span className="whitespace-nowrap">
                        Joined: {c.joined}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="whitespace-nowrap">
                        {c.guests} {c.guests === 1 ? "Guest" : "Guests"}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="whitespace-nowrap">{c.method}</span>
                    </div>
                    <p className="text-xs md:text-sm font-medium text-indigo-600 mt-1">
                      Estimated Wait: {c.wait}
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
                <div
                  key={r.name}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-sm md:text-base">
                        {r.name}
                      </p>
                      <StatusBadge status={r.status} className="text-[10px]" />
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
      {}
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

      {}
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
        </CardHeader>
        <CardContent className="p-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-800 text-sm">
                Sofia Almeida
              </p>
              <StatusBadge status="confirmed" className="text-[10px]" />
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
              <span className="truncate">
                Email · sofia.almeida@example.com
              </span>
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


const HERO_QUEUE = [
  {
    pos: 1,
    name: "Jessica Martinez",
    meta: "Joined: 8 mins ago · 2 Guests · SMS",
    wait: "Less Than 5 Minutes",
  },
  {
    pos: 2,
    name: "David Kim",
    meta: "Joined: 5 mins ago · 4 Guests · WhatsApp",
    wait: "About 12 Minutes",
  },
];

const HERO_RES_TABS = [
  { label: "Today", count: 3, active: true },
  { label: "Upcoming", count: 8, active: false },
  { label: "Past", count: 0, active: false },
];

function HeroDashboardWindow() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-400/20">
      {}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full bg-red-400/80" />
            <span className="h-3.5 w-3.5 rounded-full bg-amber-400/80" />
            <span className="h-3.5 w-3.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="flex items-center gap-1 text-slate-300">
            <ChevronLeft className="h-5 w-5" />
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>
        <span className="flex w-full max-w-md items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-400">
          <Lock className="h-3.5 w-3.5" />
          seatping.biz
        </span>
        <div className="flex flex-1 items-center justify-end gap-3 text-slate-300">
          <Share className="h-5 w-5" />
          <Plus className="h-5 w-5" />
        </div>
      </div>

      {}
      <div className="space-y-5 bg-slate-50 p-6">
        {}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-800">
                Hello Cafe Milano!
              </h2>
              <p className="text-base text-slate-600">
                Here is your daily statistic
              </p>
              <div className="mt-2 flex gap-2">
                <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-700">
                  Credits: 285
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="h-4 w-4" />
                <span>Today</span>
              </div>
              <div className="relative">
                <span className="flex w-44 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-8 text-sm text-slate-700">
                  Downtown
                </span>
                <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {}
        <Card className="rounded-xl border-0 bg-white shadow-sm">
          <CardHeader className="border-b border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
                  <ListOrdered className="h-5 w-5" />
                  Queue Management
                </CardTitle>
                <CardDescription className="text-sm text-gray-600">
                  Managing queue for: Downtown
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-slate-700">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </span>
                <Badge
                  variant="secondary"
                  className="bg-indigo-100 text-indigo-700"
                >
                  {HERO_QUEUE.length} customers
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {HERO_QUEUE.map((c) => (
                <div
                  key={c.pos}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-4"
                >
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                      #{c.pos}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-gray-800">
                        {c.name}
                      </h3>
                      <p className="text-sm text-gray-600">{c.meta}</p>
                      <p className="mt-1 text-sm font-medium text-indigo-600">
                        Estimated Wait: {c.wait}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill variant="green">Admit</Pill>
                    <Pill variant="outline">Remove</Pill>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {}
        <Card className="rounded-xl border-0 bg-white shadow-sm">
          <CardHeader className="border-b border-gray-100 p-6">
            <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
              <CalendarDays className="h-5 w-5" />
              Reservations Management
            </CardTitle>
            <CardDescription className="mt-0.5 text-sm text-gray-600">
              Bookings for: Downtown
            </CardDescription>
            <div className="!mt-4 flex gap-2">
              {HERO_RES_TABS.map((t) => (
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
          </CardHeader>
          <CardContent className="p-6">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-gray-800">
                  Olivia Bennett
                </p>
                <StatusBadge status="confirmed" className="text-[10px]" />
              </div>
              <div className="mt-1.5 flex items-center gap-x-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> 4
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Today
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> 7:30 PM
                </span>
              </div>
              <span className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span>Email · olivia.bennett@example.com</span>
              </span>
              <div className="mt-3 flex gap-2">
                <Pill variant="dark">Mark Arrived</Pill>
                <Pill variant="danger">No-Show</Pill>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function HeroDashboardPreview({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(0);
  const [designWidth, setDesignWidth] = useState(1120);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      const w = wrap.clientWidth;
      const dw = w < 640 ? 860 : 1120;
      const s = Math.min(1, w / dw);
      setDesignWidth(dw);
      setScale(s);
      setHeight(inner.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn(
        "pointer-events-none relative w-full select-none overflow-hidden",
        className,
      )}
      style={{ height: height || undefined }}
    >
      <div
        ref={innerRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: designWidth, transform: `scale(${scale})` }}
      >
        <HeroDashboardWindow />
      </div>
    </div>
  );
}


function MiniPill({
  children,
  variant = "outline",
}: {
  children: React.ReactNode;
  variant?: "green" | "outline" | "dark";
}) {
  const styles: Record<string, string> = {
    green: "bg-green-600 text-white",
    dark: "bg-slate-900 text-white",
    outline: "border border-slate-200 bg-white text-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 flex-1 items-center justify-center rounded-md px-2 text-[10px] font-medium",
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}

function PhoneScreenContent() {
  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans">
      {}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-[10px] font-medium text-slate-500">
        <span className="tabular-nums">9:41</span>
        <span className="flex items-center gap-1">
          <Signal className="h-3 w-3" />
          <Wifi className="h-3 w-3" />
          <BatteryFull className="h-3.5 w-3.5" />
        </span>
      </div>

      {}
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-slate-900">
            SeatPing
          </p>
          <p className="flex items-center gap-1 text-[10px] text-slate-500">
            <MapPin className="h-2.5 w-2.5" /> Marina Bay
          </p>
        </div>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-medium text-indigo-700">
          Credits 285
        </span>
      </div>

      {}
      <div className="flex-1 space-y-2.5 overflow-hidden px-3 pb-3">
        {}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-800">
              <ListOrdered className="h-3.5 w-3.5" /> Queue Management
            </span>
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">
              2
            </span>
          </div>

          {}
          <div className="mt-2 rounded-lg bg-gray-50 p-2">
            <div className="flex items-start gap-2">
              <span className="inline-flex shrink-0 items-center justify-center rounded border border-gray-200 bg-white px-1 py-0.5 text-[9px] font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                #1
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-[11px] font-semibold text-gray-800">
                    Olivia Reyes
                  </p>
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-medium text-amber-700">
                    Waiting
                  </span>
                </div>
                <p className="truncate text-[9px] text-gray-500">
                  Just now · 1 Guest · SMS
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <MiniPill variant="green">Admit</MiniPill>
              <MiniPill variant="outline">Remove</MiniPill>
            </div>
          </div>

          {}
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-gray-50 p-2">
            <span className="inline-flex shrink-0 items-center justify-center rounded border border-gray-200 bg-white px-1 py-0.5 text-[9px] font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
              #2
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-gray-800">
                Marcus Bennett
              </p>
              <p className="truncate text-[9px] text-gray-500">
                2m ago · 3 Guests
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700">
              Admitted
            </span>
          </div>
        </div>

        {}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-800">
            <CalendarDays className="h-3.5 w-3.5" /> Reservations Management
          </span>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-medium text-white">
              Today
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-600">
              Upcoming
            </span>
          </div>
          <div className="mt-2 rounded-lg border border-slate-200 p-2">
            <div className="flex items-center justify-between gap-1">
              <p className="truncate text-[11px] font-semibold text-gray-800">
                Sofia Almeida
              </p>
              <StatusBadge
                status="confirmed"
                className="px-1.5 py-0.5 text-[8px]"
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-600">
              <span className="inline-flex items-center gap-0.5">
                <Users className="h-2.5 w-2.5" /> 2
              </span>
              <span className="inline-flex items-center gap-0.5">
                <CalendarDays className="h-2.5 w-2.5" /> Fri, Jun 5
              </span>
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" /> 7:30 PM
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhoneInHand({ className }: { className?: string }) {
  const skin = "#e7b489";
  const skinShade = "#d49f72";
  const skinLine = "#c08a5e";

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none select-none", className)}
    >
      <svg
        viewBox="0 0 600 740"
        className="h-auto w-full overflow-visible"
        role="presentation"
      >
        <defs>
          <linearGradient id="sp-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0c6a0" />
            <stop offset="1" stopColor={skin} />
          </linearGradient>
          <linearGradient id="sp-skin-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skin} />
            <stop offset="1" stopColor={skinShade} />
          </linearGradient>
          <clipPath id="sp-screen">
            <rect x="216" y="81" width="213" height="493" rx="30" />
          </clipPath>
          <filter id="sp-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        {}
        <ellipse
          cx="320"
          cy="700"
          rx="180"
          ry="30"
          fill="#0f172a"
          opacity="0.08"
          filter="url(#sp-soft)"
        />

        {}
        <g transform="rotate(-6 300 360)">
          {}
          {}
          <path
            d="M250 545 C 232 600, 232 670, 252 740 L 470 740 C 488 665, 480 595, 458 545 C 420 470, 286 470, 250 545 Z"
            fill="url(#sp-skin-shade)"
          />
          {}
          <path
            d="M236 250 C 198 250, 184 282, 188 332 L 198 470 C 202 522, 256 522, 262 470 L 262 282 C 262 260, 254 250, 236 250 Z"
            fill={skinShade}
          />

          {}
          <ellipse
            cx="322"
            cy="560"
            rx="120"
            ry="60"
            fill="#0f172a"
            opacity="0.10"
          />

          {}
          <rect
            x="205"
            y="70"
            width="235"
            height="515"
            rx="40"
            fill="#0f172a"
          />
          <rect
            x="205"
            y="70"
            width="235"
            height="515"
            rx="40"
            fill="none"
            stroke="#1e293b"
            strokeWidth="2"
          />
          <rect
            x="216"
            y="81"
            width="213"
            height="493"
            rx="30"
            fill="#f8fafc"
          />
          {}
          <rect x="298" y="92" width="49" height="7" rx="3.5" fill="#1e293b" />

          {}
          <foreignObject
            x="216"
            y="81"
            width="213"
            height="493"
            clipPath="url(#sp-screen)"
          >
            <PhoneScreenContent />
          </foreignObject>

          {}
          {[
            { x: 180, y: 236, w: 60, h: 38 },
            { x: 177, y: 300, w: 63, h: 38 },
            { x: 178, y: 364, w: 62, h: 38 },
            { x: 186, y: 426, w: 52, h: 34 },
          ].map((f, i) => (
            <g key={i}>
              <rect
                x={f.x}
                y={f.y}
                width={f.w}
                height={f.h}
                rx={f.h / 2}
                fill="url(#sp-skin)"
              />
              {}
              <path
                d={`M${f.x + 16} ${f.y + 7} L ${f.x + 16} ${f.y + f.h - 7}`}
                stroke={skinLine}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.4"
              />
            </g>
          ))}

          {}
          <path
            d="M384 484 C 420 466, 458 484, 464 520 C 469 554, 448 582, 412 582 C 384 582, 366 556, 370 524 C 372 502, 370 494, 384 484 Z"
            fill="url(#sp-skin)"
          />
          <path
            d="M452 524 C 478 540, 482 600, 462 642 L 430 660 C 408 618, 410 566, 432 540 Z"
            fill={skin}
          />
          {}
          <ellipse
            cx="416"
            cy="520"
            rx="16"
            ry="20"
            fill="#f3d0ac"
            opacity="0.6"
          />
        </g>
      </svg>
    </div>
  );
}

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

export function LiveQueuePreview({ className }: { className?: string }) {
  return (
    <Preview className={className}>
      <div className="space-y-4">
        <QueueCardPreview
          rows={QUEUE.slice(0, 2)}
          className="pointer-events-auto"
        />
        <AwaitingArrivalPreview className="pointer-events-auto" />
      </div>
    </Preview>
  );
}


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
      <Input
        className="h-11"
        type={type}
        value={value}
        readOnly
        tabIndex={-1}
      />
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
      <span className="font-medium capitalize text-slate-800 text-sm">
        {day}
      </span>
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
      {}
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

      {}
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

      {}
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


const miniCard =
  "w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/30";

export function QueueMiniCard({ className }: { className?: string }) {
  return (
    <div className={cn(miniCard, className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <ListOrdered className="h-4 w-4 text-slate-500" />
          Queue
        </span>
        <Badge
          variant="secondary"
          className="bg-indigo-100 text-indigo-700 text-[10px]"
        >
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

export function ReservationMiniCard({ className }: { className?: string }) {
  return (
    <div className={cn(miniCard, className)}>
      <div className="mb-3 flex items-center gap-1.5">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-semibold text-gray-800">
          Reservations
        </span>
        <span className="ml-auto text-xs text-slate-400">Marina Bay</span>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-800 text-sm">Sofia Almeida</p>
          <StatusBadge status="confirmed" className="text-[10px]" />
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
        {}
        <line
          x1="0"
          y1="64"
          x2="240"
          y2="64"
          stroke="#f1f5f9"
          strokeWidth="1"
        />
        {}
        <polyline
          points="0,52 40,48 80,50 120,42 160,36 200,26 240,12"
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {}
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
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tint,
        )}
      >
        <MessageSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-800">{text}</p>
      </div>
    </div>
  );
}

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
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            tint,
          )}
        >
          <Icon className={cn("h-4 w-4", fg)} />
        </span>
      </div>
    </div>
  );
}

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


export function HeroCollage() {
  return (
    <Preview>
      {}
      <div className="relative mx-auto hidden h-[520px] max-w-5xl lg:block">
        {}
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

        {}
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

        {}
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

      {}
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
