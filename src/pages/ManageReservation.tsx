import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import NotFound from "@/pages/NotFound";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DateField, PartyField } from "@/components/ReservationBooking";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CalendarDaysIcon,
  Clock01Icon,
  Loading02Icon,
  Location01Icon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";

type Slot = {
  time: string;
  label: string;
  available: boolean;
  remaining: number;
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function splitDateTime(dt: string): { date: string; time: string } {
  const [date, rest] = String(dt || "").split("T");
  return { date: date || "", time: (rest || "").slice(0, 5) };
}

function readableDate(date: string): string {
  if (!date) {
    return "";
  }
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return date;
  }
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(t: string): string {
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

export default function ManageReservation() {
  const { token = "" } = useParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<any | null>(null);
  const [settings, setSettings] = useState<any | null>(null);
  const [restaurant, setRestaurant] = useState<any | null>(null);

  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState<number | "larger">(2);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const timeRef = useRef(time);
  timeRef.current = time;

  const load = useCallback(() => {
    setLoading(true);
    api(`/api/reservations/manage/${token}`)
      .then((d) => {
        setReservation(d.reservation);
        setSettings(d.settings);
        setRestaurant(d.restaurant);
        const { date: rd, time: rt } = splitDateTime(d.reservation.reservationDateTime);
        setDate(rd);
        setTime(rt);
        setPartySize(d.reservation.partySize);
      })
      .catch((e: any) => setError(e?.message || "Reservation not found"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editing || !restaurant || !date || partySize === "larger") {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    api(
      `/api/reservations/${restaurant.businessUsername}/${restaurant.locationId}/availability?date=${encodeURIComponent(
        date,
      )}&partySize=${partySize}`,
    )
      .then((d) => {
        if (cancelled) {
          return;
        }
        let next: Slot[];
        if (Array.isArray(d?.slots)) {
          next = d.slots;
        } else {
          next = [];
        }
        setSlots(next);
        if (!next.find((s) => s.time === timeRef.current && s.available)) {
          setTime("");
        }
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [editing, date, partySize, restaurant]);

  const todayStr = localDateStr(new Date());
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (settings?.bookingWindowDays ?? 30));
    return localDateStr(d);
  }, [settings?.bookingWindowDays]);

  const isLocked =
    reservation && ["cancelled", "completed", "no_show"].includes(reservation.status);

  const saveChanges = async () => {
    if (!date || !time || partySize === "larger") {
      return;
    }
    setSaving(true);
    try {
      const d = await api(`/api/reservations/manage/${token}`, {
        method: "PUT",
        body: JSON.stringify({ date, time, partySize }),
      });
      setReservation(d.reservation);
      setEditing(false);
      toast({ title: "Reservation updated" });
    } catch (e: any) {
      toast({
        title: "Could not update",
        description: e?.message || "Please try another time.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelReservation = async () => {
    setCancelling(true);
    try {
      const d = await api(`/api/reservations/manage/${token}/cancel`, {
        method: "POST",
      });
      setReservation(d.reservation);
      setCancelOpen(false);
      toast({ title: "Reservation cancelled" });
    } catch (e: any) {
      toast({
        title: "Could not cancel",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  let current: { date: string; time: string } | null;
  if (reservation) {
    current = splitDateTime(reservation.reservationDateTime);
  } else {
    current = null;
  }

  if (!loading && error) {
    return <NotFound />;
  }

  let timePickerContent: React.ReactNode;
  if (partySize === "larger") {
    timePickerContent = (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        For larger parties, please contact the restaurant directly.
      </p>
    );
  } else if (loadingSlots) {
    timePickerContent = (
      <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
        <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin" /> Checking…
      </div>
    );
  } else {
    timePickerContent = (
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((s) => {
          let slotClass =
            "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through";
          if (s.time === time) {
            slotClass = "border-slate-900 bg-slate-900 text-white";
          } else if (s.available) {
            slotClass = "border-slate-200 bg-white text-slate-700 hover:border-slate-400";
          }
          return (
            <button
              key={s.time}
              type="button"
              disabled={!s.available}
              onClick={() => setTime(s.time)}
              className={cn(
                "rounded-md border px-1 py-1.5 text-xs font-medium transition",
                slotClass,
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    );
  }

  let lockedActions: React.ReactNode;
  if (isLocked) {
    lockedActions = (
      <p className="pt-1 text-xs text-slate-500 sm:text-sm">
        This reservation can no longer be changed.
      </p>
    );
  } else {
    lockedActions = (
      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Button className="flex-1" onClick={() => setEditing(true)}>
          Change
        </Button>
        <Button variant="destructiveOutline" className="flex-1" onClick={() => setCancelOpen(true)}>
          Cancel Reservation
        </Button>
      </div>
    );
  }

  let reservationGuestWord = "guests";
  if (reservation?.partySize === 1) {
    reservationGuestWord = "guest";
  }

  let pageTitle = "Manage Your Reservation";
  if (isLocked) {
    pageTitle = "View Your Reservation";
  }

  let restaurantSubtitle: string | undefined;
  if (restaurant?.locationName && restaurant.locationName !== restaurant?.name) {
    restaurantSubtitle = `${restaurant.name} · ${restaurant.locationName}`;
  } else {
    restaurantSubtitle = restaurant?.name || restaurant?.locationName;
  }

  let cancelActionContent: React.ReactNode;
  if (cancelling) {
    cancelActionContent = <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin" />;
  } else {
    cancelActionContent = "Cancel Reservation";
  }

  let detailsOrEditor: React.ReactNode = null;
  if (!reservation) {
    detailsOrEditor = null;
  } else if (!editing) {
    detailsOrEditor = (
      <div className="space-y-2">
        <DetailRow icon={CalendarDaysIcon} label="Date" value={readableDate(current!.date)} />
        <DetailRow icon={Clock01Icon} label="Time" value={formatTimeLabel(current!.time)} />
        <DetailRow
          icon={UsersRoundIcon}
          label="Number of Guests"
          value={`${reservation.partySize} ${reservationGuestWord}`}
        />
        {restaurant?.address && (
          <DetailRow icon={Location01Icon} label="Location" value={restaurant.address} stacked />
        )}
        {reservation.notes && (
          <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
            <span className="font-medium">Notes: </span>
            {reservation.notes}
          </p>
        )}

        {lockedActions}
      </div>
    );
  } else {
    detailsOrEditor = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Number of Guests</Label>
            <PartyField
              value={partySize}
              onChange={setPartySize}
              max={settings?.maxPartySize ?? 8}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Date</Label>
            <DateField
              value={date}
              onChange={setDate}
              todayStr={todayStr}
              maxDateStr={maxDateStr}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Time</Label>
          {timePickerContent}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={!date || !time || partySize === "larger" || saving}
            onClick={saveChanges}
          >
            {saving && <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setEditing(false);
              setDate(current!.date);
              setTime(current!.time);
              setPartySize(reservation.partySize);
            }}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  let pageContent: React.ReactNode;
  if (loading) {
    pageContent = (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <HugeiconsIcon icon={Loading02Icon} className="h-6 w-6 animate-spin" />
      </div>
    );
  } else {
    pageContent = (
      <>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{restaurantSubtitle}</p>
        </div>

        <Card className="mt-6 border border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-6 lg:p-8">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={reservation.status} />
              <span className="min-w-0 flex-1 text-right text-xs font-medium text-slate-700 sm:text-sm">
                {reservation.name}
              </span>
            </div>

            {detailsOrEditor}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <main className="flex flex-1 flex-col px-4 pb-10 pt-24 sm:pb-14 sm:pt-28">
        <div className="m-auto w-full max-w-lg lg:max-w-2xl">{pageContent}</div>
      </main>
      <Footer />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel This Reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              This frees up your table and can't be undone. You'd need to book again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep It</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                cancelReservation();
              }}
            >
              {cancelActionContent}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  stacked,
}: {
  icon: IconSvgElement;
  label: string;
  value: string;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="rounded-lg border border-slate-200 px-3 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <HugeiconsIcon icon={icon} className="h-4 w-4" /> {label}
        </span>
        <p className="mt-1 text-xs font-medium leading-snug text-slate-700 sm:text-sm">{value}</p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
        <HugeiconsIcon icon={icon} className="h-4 w-4" /> {label}
      </span>
      <span className="text-right text-xs font-medium text-slate-700 sm:text-sm">{value}</span>
    </div>
  );
}
