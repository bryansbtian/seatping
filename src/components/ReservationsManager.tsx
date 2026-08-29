import { useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TIMEZONE,
  getTodayKeyInTimezone,
  getNowWallClockInTimezone,
} from "@/lib/timezones";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { GuestStatusBadge } from "@/components/GuestBadge";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { formatPhoneParts } from "@shared/phone";
import { useLang, type TKey } from "@/lib/i18n";
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
  isReturning?: boolean;
  guestVisits?: number;
};

type TabKey = "today" | "upcoming" | "past" | "cancelled" | "no_shows";

const ACTIVE = ["confirmed", "arrived"];

function splitDateTime(dt: string) {
  const [date, rest] = String(dt || "").split("T");
  return { date: date || "", time: (rest || "").slice(0, 5) };
}

function formatTimeLabel(t: string) {
  if (!t) {
    return "";
  }
  const [hStr, m] = t.split(":");
  let h = Number(hStr);
  let ampm: string;
  if (h >= 12) {
    ampm = "PM";
  } else {
    ampm = "AM";
  }
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function readableDate(date: string) {
  if (!date) {
    return "";
  }
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return date;
  }
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
  reservationsEnabled,
  timeZone,
  onUpdated,
}: {
  reservations: Reservation[];
  businessUsername: string;
  locationId: string;
  reservationsEnabled: boolean;
  timeZone?: string;
  onUpdated: (user: any) => void;
}) {
  const { toast } = useToast();
  const { t, tStatus } = useLang();
  const [tab, setTab] = useState<TabKey>("today");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const todayStr = getTodayKeyInTimezone(timeZone || DEFAULT_TIMEZONE);
  const nowLocal = getNowWallClockInTimezone(timeZone || DEFAULT_TIMEZONE);

  const buckets = useMemo(() => {
    let list: Reservation[];
    if (Array.isArray(reservations)) {
      list = reservations;
    } else {
      list = [];
    }
    const sortByTime = (a: Reservation, b: Reservation) =>
      a.reservationDateTime.localeCompare(b.reservationDateTime);

    const today = list
      .filter(
        (r) => splitDateTime(r.reservationDateTime).date === todayStr && ACTIVE.includes(r.status),
      )
      .sort(sortByTime);
    const upcoming = list
      .filter(
        (r) => splitDateTime(r.reservationDateTime).date > todayStr && ACTIVE.includes(r.status),
      )
      .sort(sortByTime);
    const past = list
      .filter(
        (r) =>
          r.status === "completed" ||
          (splitDateTime(r.reservationDateTime).date < todayStr && ACTIVE.includes(r.status)),
      )
      .sort((a, b) => sortByTime(b, a));
    const cancelled = list.filter((r) => r.status === "cancelled").sort((a, b) => sortByTime(b, a));
    const no_shows = list.filter((r) => r.status === "no_show").sort((a, b) => sortByTime(b, a));

    return { today, upcoming, past, cancelled, no_shows };
  }, [reservations, todayStr]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "today", label: t("res.tab.today"), count: buckets.today.length },
    {
      key: "upcoming",
      label: t("res.tab.upcoming"),
      count: buckets.upcoming.length,
    },
    { key: "past", label: t("res.tab.past"), count: buckets.past.length },
    {
      key: "cancelled",
      label: t("res.tab.cancelled"),
      count: buckets.cancelled.length,
    },
    {
      key: "no_shows",
      label: t("res.tab.noShows"),
      count: buckets.no_shows.length,
    },
  ];

  const visible = buckets[tab];

  const changeStatus = async (r: Reservation, status: string) => {
    setBusyId(r.id);
    try {
      const res = await api(`/auth/business/locations/${locationId}/reservations/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onUpdated(res.user);
      toast({
        title: t("res.toast.updated.title"),
        description: t("res.toast.updated.desc", {
          name: r.name,
          status: tStatus(status),
        }),
      });
    } catch (e: any) {
      toast({
        title: t("res.toast.updateFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  let reservationsDescription = "";
  if (!locationId) {
    reservationsDescription = t("res.noLocationSelected");
  } else if (!reservationsEnabled) {
    reservationsDescription = t("res.disabled");
  }

  let expandToggleWrapperClass: string;
  if (visible.length > 4) {
    expandToggleWrapperClass = "";
  } else {
    expandToggleWrapperClass = "md:hidden";
  }

  let expandToggleLabel: string;
  if (expanded) {
    expandToggleLabel = t("res.viewLess");
  } else {
    expandToggleLabel = t("res.viewAll", { n: visible.length });
  }

  return (
    <Card className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-100 p-4 md:p-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
              <CalendarDays className="w-5 h-5" />
              {t("res.title")}
            </CardTitle>
            {reservationsDescription && (
              <CardDescription className="mt-0.5 text-sm text-gray-600">
                {reservationsDescription}
              </CardDescription>
            )}
          </div>
        </div>

        <div className="!mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => {
            let tabToneClass: string;
            if (tab === t.key) {
              tabToneClass = "bg-slate-900 text-white";
            } else {
              tabToneClass = "bg-slate-100 text-slate-600 hover:bg-slate-200";
            }

            let countToneClass: string;
            if (tab === t.key) {
              countToneClass = "bg-white/20 text-white";
            } else {
              countToneClass = "bg-white text-slate-500";
            }

            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setExpanded(false);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  tabToneClass,
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={cn("ml-1.5 rounded-full px-1.5 text-micro", countToneClass)}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col p-4 md:p-6">
        {!reservationsEnabled && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            {t("res.enableHint")}
          </p>
        )}

        {reservationsEnabled && visible.length === 0 && (
          <BusinessEmptyState
            icon={CalendarClock}
            title={t("res.empty.title")}
            body={t("res.empty.body")}
            className="py-10"
          />
        )}

        <div className="space-y-3">
          {visible.map((r, i) => {
            let hideCls: string;
            if (expanded) {
              hideCls = "";
            } else if (i < 2) {
              hideCls = "";
            } else if (i < 4) {
              hideCls = "max-md:hidden";
            } else {
              hideCls = "hidden";
            }
            return (
              <div key={r.id} className={hideCls}>
                <ReservationCard
                  r={r}
                  busy={busyId === r.id}
                  onChange={changeStatus}
                  nowLocal={nowLocal}
                  t={t}
                  tStatus={tStatus}
                />
              </div>
            );
          })}
        </div>

        {visible.length > 2 && (
          <div className={cn("mt-3 flex justify-center", expandToggleWrapperClass)}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            >
              {expandToggleLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactLine({ r }: { r: Reservation }) {
  let Icon: typeof Mail;
  if (r.contactMethod === "email") {
    Icon = Mail;
  } else if (r.contactMethod === "whatsapp") {
    Icon = MessageSquare;
  } else {
    Icon = Phone;
  }
  let value: string;
  if (r.contactMethod === "email") {
    value = r.email;
  } else {
    const formattedPhone = formatPhoneParts(r.countryCode, r.phone);
    value = formattedPhone || `${r.countryCode || ""} ${r.phone}`.trim();
  }

  let contactMethodLabel: string;
  if (r.contactMethod === "sms") {
    contactMethodLabel = "SMS";
  } else {
    contactMethodLabel = r.contactMethod;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      <span className="capitalize">{contactMethodLabel}</span>
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
  t,
  tStatus,
}: {
  r: Reservation;
  busy: boolean;
  onChange: (r: Reservation, status: string) => void;
  nowLocal: string;
  t: (key: TKey, params?: Record<string, string | number>) => string;
  tStatus: (status: string) => string;
}) {
  const { date, time } = splitDateTime(r.reservationDateTime);

  const canMarkOutcome = r.reservationDateTime.slice(0, 10) <= nowLocal.slice(0, 10);

  const actions: { labelKey: TKey; status: string; variant?: "destructive" }[] = [];
  if (r.status === "confirmed") {
    if (canMarkOutcome) {
      actions.push({ labelKey: "res.action.markArrived", status: "arrived" });
      actions.push({
        labelKey: "res.action.noShow",
        status: "no_show",
        variant: "destructive",
      });
    }
    actions.push({
      labelKey: "res.action.cancel",
      status: "cancelled",
      variant: "destructive",
    });
  } else if (r.status === "arrived") {
    actions.push({ labelKey: "res.action.markCompleted", status: "completed" });
    actions.push({
      labelKey: "res.action.noShow",
      status: "no_show",
      variant: "destructive",
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-800 text-sm md:text-base">{r.name}</p>
            <StatusBadge status={r.status} label={tStatus(r.status)} />
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
            <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">{r.notes}</p>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => {
            let buttonVariant: "destructiveOutline" | "default";
            if (a.variant === "destructive") {
              buttonVariant = "destructiveOutline";
            } else {
              buttonVariant = "default";
            }

            let buttonContent: ReactNode;
            if (busy) {
              buttonContent = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
            } else {
              buttonContent = t(a.labelKey);
            }

            return (
              <Button
                key={a.status}
                size="sm"
                variant={buttonVariant}
                disabled={busy}
                onClick={() => onChange(r, a.status)}
                className="h-8 text-xs"
              >
                {buttonContent}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
