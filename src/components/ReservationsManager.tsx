// src/components/ReservationsManager.tsx
//
// Business dashboard reservations panel for a single location. Reservations are
// stored on the location (see server/lib/reservations.ts) and arrive via
// /auth/business/me, so this component is presentational + action dispatch:
// status changes call PATCH /auth/business/locations/:loc/reservations/:id and
// hand the refreshed `user` back to the dashboard via onUpdated.
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TIMEZONE,
  getTodayKeyInTimezone,
  getNowWallClockInTimezone,
} from "@/lib/timezones";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { GuestStatusBadge } from "@/components/GuestBadge";
import { formatPhone } from "@/lib/phone";
import { statusLabel } from "@/lib/statusStyles";
import {
  CalendarDays,
  CalendarClock,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Users,
} from "lucide-react";

type Reservation = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  contactMethod: "sms" | "whatsapp" | "email";
  phone: string;
  countryCode: string;
  email: string;
  partySize: number;
  reservationDateTime: string;
  notes: string;
  status: string;
  source: string;
  createdAt: string;
  // Guest CRM: stamped server-side from the guest profile (repeat detection).
  isReturning?: boolean;
  guestVisits?: number;
};

type TabKey = "today" | "upcoming" | "past" | "cancelled" | "no_shows";

const ACTIVE = ["pending", "confirmed", "arrived"];

function splitDateTime(dt: string) {
  const [date, rest] = String(dt || "").split("T");
  return { date: date || "", time: (rest || "").slice(0, 5) };
}

function formatTimeLabel(t: string) {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function readableDate(date: string) {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ReservationsManager({
  reservations,
  businessUsername,
  locationId,
  locationLabel,
  reservationsEnabled,
  timeZone,
  onUpdated,
}: {
  reservations: Reservation[];
  businessUsername: string;
  locationId: string;
  locationLabel: string;
  reservationsEnabled: boolean;
  /** Restaurant's IANA timezone; "today" is computed in this zone. */
  timeZone?: string;
  onUpdated: (user: any) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("today");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Collapsed by default so long lists don't clutter the card. The visible
  // count is breakpoint-driven (2 on mobile, 4 on tablet/desktop) via CSS.
  const [expanded, setExpanded] = useState(false);

  // "Today" is the restaurant's local calendar date (reservationDateTime is a
  // naive wall-clock value in that same zone), so the tab is correct no matter
  // where the owner views the dashboard from.
  const todayStr = getTodayKeyInTimezone(timeZone || DEFAULT_TIMEZONE);
  // Current local wall-clock in the restaurant's timezone, used to decide
  // whether a reservation time has already passed (and so can be marked
  // arrived / no-show). Never the browser's timezone.
  const nowLocal = getNowWallClockInTimezone(timeZone || DEFAULT_TIMEZONE);

  const buckets = useMemo(() => {
    const list = Array.isArray(reservations) ? reservations : [];
    const sortByTime = (a: Reservation, b: Reservation) =>
      a.reservationDateTime.localeCompare(b.reservationDateTime);

    const today = list
      .filter(
        (r) =>
          splitDateTime(r.reservationDateTime).date === todayStr &&
          ACTIVE.includes(r.status),
      )
      .sort(sortByTime);
    const upcoming = list
      .filter(
        (r) =>
          splitDateTime(r.reservationDateTime).date > todayStr &&
          ACTIVE.includes(r.status),
      )
      .sort(sortByTime);
    const past = list
      .filter(
        (r) =>
          r.status === "completed" ||
          (splitDateTime(r.reservationDateTime).date < todayStr &&
            ACTIVE.includes(r.status)),
      )
      .sort((a, b) => sortByTime(b, a));
    const cancelled = list
      .filter((r) => r.status === "cancelled")
      .sort((a, b) => sortByTime(b, a));
    const no_shows = list
      .filter((r) => r.status === "no_show")
      .sort((a, b) => sortByTime(b, a));

    return { today, upcoming, past, cancelled, no_shows };
  }, [reservations, todayStr]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "today", label: "Today", count: buckets.today.length },
    { key: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { key: "past", label: "Past", count: buckets.past.length },
    { key: "cancelled", label: "Cancelled", count: buckets.cancelled.length },
    { key: "no_shows", label: "No-Shows", count: buckets.no_shows.length },
  ];

  const visible = buckets[tab];

  const changeStatus = async (r: Reservation, status: string) => {
    setBusyId(r.id);
    try {
      const res = await api(
        `/auth/business/locations/${locationId}/reservations/${r.id}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      onUpdated(res.user);
      toast({
        title: "Reservation updated",
        description: `${r.name} marked ${statusLabel(status)}.`,
      });
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
      <CardHeader className="border-b border-gray-100 p-4 md:p-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
              <CalendarDays className="w-5 h-5" />
              Reservations Management
            </CardTitle>
            <CardDescription className="text-gray-600 text-sm mt-0.5">
              {!locationId
                ? "No Location Selected"
                : reservationsEnabled
                  ? `Bookings for: ${locationLabel}`
                  : "Reservations are disabled for this location."}
            </CardDescription>
          </div>
        </div>

        {/* Tabs — `!mt-4` overrides the CardHeader's `space-y-1.5`, whose
            `> * + *` selector otherwise wins on specificity and pins the gap. */}
        <div className="!mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setExpanded(false);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                tab === t.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 text-[10px]",
                    tab === t.key
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-500",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6">
        {!reservationsEnabled && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Enable reservations in Settings to start accepting bookings.
          </p>
        )}

        {reservationsEnabled && visible.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center text-slate-400">
            <CalendarClock className="h-8 w-8" />
            <p className="mt-2 text-sm">No reservations here.</p>
          </div>
        )}

        <div className="space-y-3">
          {visible.map((r, i) => {
            // Hide overflow rows until expanded: keep 2 on mobile, 4 on md+.
            const hideCls = expanded
              ? ""
              : i < 2
                ? ""
                : i < 4
                  ? "max-md:hidden"
                  : "hidden";
            return (
              <div key={r.id} className={hideCls}>
                <ReservationCard
                  r={r}
                  busy={busyId === r.id}
                  onChange={changeStatus}
                  nowLocal={nowLocal}
                />
              </div>
            );
          })}
        </div>

        {visible.length > 2 && (
          <div
            className={cn(
              "mt-3 flex justify-center",
              // When collapsed: mobile needs the toggle once >2, but tablet/
              // desktop only once >4. When expanded, mirror that visibility so
              // "View less" appears wherever rows were actually hidden.
              visible.length > 4 ? "" : "md:hidden",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            >
              {expanded ? "View Less" : `View All (${visible.length})`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactLine({ r }: { r: Reservation }) {
  const Icon =
    r.contactMethod === "email"
      ? Mail
      : r.contactMethod === "whatsapp"
        ? MessageSquare
        : Phone;
  const codeDigits = String(r.countryCode || "").replace(/\D/g, "");
  const nationalDigits = String(r.phone || "").replace(/\D/g, "");
  const value =
    r.contactMethod === "email"
      ? r.email
      : (codeDigits
          ? formatPhone(`${codeDigits}${nationalDigits}`, null)
          : formatPhone(null, nationalDigits)) ||
        `${r.countryCode || ""} ${r.phone}`.trim();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      <span className="capitalize">
        {r.contactMethod === "sms" ? "SMS" : r.contactMethod}
      </span>
      <span className="text-slate-400">·</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function ReservationCard({
  r,
  busy,
  onChange,
  nowLocal,
}: {
  r: Reservation;
  busy: boolean;
  onChange: (r: Reservation, status: string) => void;
  /** Restaurant-local "YYYY-MM-DDTHH:MM" now, for arrived/no-show eligibility. */
  nowLocal: string;
}) {
  const { date, time } = splitDateTime(r.reservationDateTime);

  // Has the reservation time already passed in the restaurant's timezone?
  // Arrived / No-Show are only valid after the booked time; before it, a future
  // reservation can only be cancelled.
  const hasPassed = r.reservationDateTime.slice(0, 16) <= nowLocal;

  // Action sets vary by current status (no actions for terminal states).
  const actions: { label: string; status: string; variant?: "destructive" }[] =
    [];
  if (r.status === "pending") {
    actions.push({ label: "Confirm", status: "confirmed" });
    actions.push({
      label: "Cancel",
      status: "cancelled",
      variant: "destructive",
    });
  } else if (r.status === "confirmed") {
    // Only allow marking arrived / no-show once the booked time has passed.
    if (hasPassed) {
      actions.push({ label: "Mark Arrived", status: "arrived" });
      actions.push({
        label: "No-Show",
        status: "no_show",
        variant: "destructive",
      });
    }
    actions.push({
      label: "Cancel",
      status: "cancelled",
      variant: "destructive",
    });
  } else if (r.status === "arrived") {
    actions.push({ label: "Mark Completed", status: "completed" });
    actions.push({
      label: "No-Show",
      status: "no_show",
      variant: "destructive",
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-800 text-sm md:text-base">
              {r.name}
            </p>
            <StatusBadge status={r.status} />
            {r.isReturning && <GuestStatusBadge returning />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {r.partySize}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {readableDate(date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {formatTimeLabel(time)}
            </span>
          </div>
          <div className="mt-1.5">
            <ContactLine r={r} />
          </div>
          {r.notes && (
            <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
              {r.notes}
            </p>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant={
                a.variant === "destructive"
                  ? "destructiveOutline"
                  : "default"
              }
              disabled={busy}
              onClick={() => onChange(r, a.status)}
              className="h-8 text-xs"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                a.label
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
