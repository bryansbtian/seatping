// src/pages/ManageReservation.tsx
//
// Account-free reservation management via a secure token in the URL:
//   /reservations/manage/:token
//
// The customer can view their booking, change date/time/number of guests (re-running
// server-side availability), or cancel — no login required.
import { useEffect, useMemo, useState } from "react";
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
import {
  CalendarDays,
  Clock,
  Loader2,
  MapPin,
  Users,
} from "lucide-react";

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
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(t: string): string {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
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
  // Mirrors ReservationBooking: PartyField can emit "larger" for big parties,
  // which is not a bookable size (the customer must contact the restaurant), so
  // it never gets sent to the availability or update APIs.
  const [partySize, setPartySize] = useState<number | "larger">(2);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    setLoading(true);
    api(`/api/reservations/manage/${token}`)
      .then((d) => {
        setReservation(d.reservation);
        setSettings(d.settings);
        setRestaurant(d.restaurant);
        const { date: rd, time: rt } = splitDateTime(
          d.reservation.reservationDateTime,
        );
        setDate(rd);
        setTime(rt);
        setPartySize(d.reservation.partySize);
      })
      .catch((e: any) => setError(e?.message || "Reservation not found"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Fetch availability while editing.
  useEffect(() => {
    // "larger" is not a bookable size, so skip the availability lookup entirely
    // (never put "larger" in the query string) and clear any stale slots.
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
        if (cancelled) return;
        const next: Slot[] = Array.isArray(d?.slots) ? d.slots : [];
        setSlots(next);
        if (!next.find((s) => s.time === time && s.available)) setTime("");
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, date, partySize, restaurant]);

  const todayStr = localDateStr(new Date());
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (settings?.bookingWindowDays ?? 30));
    return localDateStr(d);
  }, [settings?.bookingWindowDays]);

  const isLocked =
    reservation &&
    ["cancelled", "completed", "no_show"].includes(reservation.status);

  const saveChanges = async () => {
    // Never submit a "larger" party: the backend doesn't accept it, so the UI
    // routes those customers to contact the restaurant instead.
    if (!date || !time || partySize === "larger") return;
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

  const current = reservation
    ? splitDateTime(reservation.reservationDateTime)
    : null;

  // An invalid/expired reservation link should land on the standard 404 page
  // rather than a bespoke "Reservation Not Found" card.
  if (!loading && error) {
    return <NotFound />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      {/* Top padding clears the fixed header (~4rem) so the title is never tucked
          under it; `m-auto` on the inner block centers vertically when there's
          spare height and falls back to natural top-aligned scrolling when the
          content is taller than the viewport. */}
      <main className="flex flex-1 flex-col px-4 pb-10 pt-24 sm:pb-14 sm:pt-28">
        <div className="m-auto w-full max-w-lg lg:max-w-2xl">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-slate-900">
                  {isLocked ? "View Your Reservation" : "Manage Your Reservation"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {restaurant?.locationName &&
                  restaurant.locationName !== restaurant?.name
                    ? `${restaurant.name} · ${restaurant.locationName}`
                    : restaurant?.name || restaurant?.locationName}
                </p>
              </div>

              <Card className="mt-6 border border-slate-200 shadow-sm">
                <CardContent className="space-y-4 p-6 lg:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={reservation.status} />
                    <span className="min-w-0 flex-1 text-right text-xs font-medium text-slate-700 sm:text-sm">
                      {reservation.name}
                    </span>
                  </div>

                  {!editing ? (
                    <div className="space-y-2">
                      <DetailRow
                        icon={CalendarDays}
                        label="Date"
                        value={readableDate(current!.date)}
                      />
                      <DetailRow
                        icon={Clock}
                        label="Time"
                        value={formatTimeLabel(current!.time)}
                      />
                      <DetailRow
                        icon={Users}
                        label="Number of Guests"
                        value={`${reservation.partySize} ${
                          reservation.partySize === 1 ? "guest" : "guests"
                        }`}
                      />
                      {restaurant?.address && (
                        <DetailRow
                          icon={MapPin}
                          label="Location"
                          value={restaurant.address}
                          stacked
                        />
                      )}
                      {reservation.notes && (
                        <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
                          <span className="font-medium">Notes: </span>
                          {reservation.notes}
                        </p>
                      )}

                      {isLocked ? (
                        <p className="pt-1 text-xs text-slate-500 sm:text-sm">
                          This reservation can no longer be changed.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                          <Button
                            className="flex-1"
                            onClick={() => setEditing(true)}
                          >
                            Change
                          </Button>
                          <Button
                            variant="destructiveOutline"
                            className="flex-1"
                            onClick={() => setCancelOpen(true)}
                          >
                            Cancel Reservation
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">
                            Number of Guests
                          </Label>
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
                        {partySize === "larger" ? (
                          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                            For larger parties, please contact the restaurant directly.
                          </p>
                        ) : loadingSlots ? (
                          <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />{" "}
                            Checking…
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5">
                            {slots.map((s) => (
                              <button
                                key={s.time}
                                type="button"
                                disabled={!s.available}
                                onClick={() => setTime(s.time)}
                                className={cn(
                                  "rounded-md border px-1 py-1.5 text-xs font-medium transition",
                                  s.time === time
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : s.available
                                      ? "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                                      : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through",
                                )}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          className="flex-1"
                          disabled={!date || !time || partySize === "larger" || saving}
                          onClick={saveChanges}
                        >
                          {saving && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
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
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
      <Footer />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel This Reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              This frees up your table and can't be undone. You'd need to book
              again.
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
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Cancel Reservation"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  stacked,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  // Stacked layout (label above a left-aligned value) — used for long values
  // like the address that read poorly cramped into a right-aligned column.
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="rounded-lg border border-slate-200 px-3 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <Icon className="h-4 w-4" /> {label}
        </span>
        <p className="mt-1 text-xs font-medium leading-snug text-slate-700 sm:text-sm">
          {value}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="text-right text-xs font-medium text-slate-700 sm:text-sm">
        {value}
      </span>
    </div>
  );
}
