// src/components/ReservationBooking.tsx
//
// Customer-facing "Plan your visit" action card for the public restaurant page.
// Waitlist (Join Queue) is always available; reservations are an optional,
// account-free booking flow:
//   pick number of guests → date → time slot → Book Table → short modal → confirmation.
//
// Availability comes from GET /api/reservations/:user/:loc/availability and is
// computed server-side from max number of guests + max reserved guests per hour.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldTrigger, OptionRow } from "@/components/TimeSelect";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Copy,
  Loader2,
  MapPin,
  Users,
  Utensils,
} from "lucide-react";

type ReservationSettings = {
  reservationStartTime: string;
  reservationEndTime: string;
  maxPartySize: number;
  maxReservedGuestsPerHour: number;
  bookingWindowDays: number;
  minNoticeMinutes: number;
  confirmationMode: "auto" | "manual";
  cancellationPolicy: string;
};

type Slot = {
  time: string;
  label: string;
  available: boolean;
  remaining: number;
  reason?: "full" | "too_soon" | "party_too_large" | "closed";
};

type Props = {
  businessUsername: string;
  locationId: string;
  name: string;
  reservationsEnabled: boolean;
  queueEnabled: boolean;
  queueHref: string;
  heroImage: string | null;
  locationText: string;
  // Prefill from the homepage search bar (via URL query params). All optional.
  initialDate?: string; // "YYYY-MM-DD"
  initialTime?: string; // "HH:MM"
  initialPartySize?: number;
  // Auto-open the booking modal on mount (set when the user arrived via the
  // search results "Book Table" button, so they don't have to click again).
  autoOpen?: boolean;
};

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readableDate(date: string): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ReservationBooking({
  businessUsername,
  locationId,
  name,
  reservationsEnabled,
  queueEnabled,
  queueHref,
  heroImage,
  locationText,
  initialDate,
  initialTime,
  initialPartySize,
  autoOpen,
}: Props) {
  const [settings, setSettings] = useState<ReservationSettings | null>(null);
  const [partySize, setPartySize] = useState(
    initialPartySize && initialPartySize > 0 ? initialPartySize : 2,
  );
  // Default the date to today (instead of an empty "Pick a date" placeholder)
  // so the time slots load right away. A prefilled date from search wins.
  const [date, setDate] = useState(initialDate || localDateStr(new Date()));
  const [time, setTime] = useState(initialTime || "");
  // A requested time (prefilled or previously selected) that turned out to be
  // fully booked. We don't keep it *selected* — we just remember it so we can
  // show the "… is fully booked" hint while the user picks another slot.
  const [fullNotice, setFullNotice] = useState("");
  // Mirrors `time` so the availability effect (which doesn't depend on `time`)
  // can read the current selection when slots reload.
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsLoaded, setSlotsLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);

  // Open the booking modal once on mount when arriving from "Book Table".
  useEffect(() => {
    if (autoOpen && reservationsEnabled) setModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logged-in customer (if any) — used to prefill the booking form. Errors/401
  // (guest or business session) are ignored and leave the form blank.
  const [account, setAccount] = useState<{
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api("/auth/me")
      .then((d) => {
        if (cancelled || !d?.user) return;
        const full = String(d.user.name || "").trim();
        const sp = full.indexOf(" ");
        setAccount({
          firstName: sp === -1 ? full : full.slice(0, sp),
          lastName: sp === -1 ? "" : full.slice(sp + 1),
          email: d.user.email || "",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load reservation settings once (only if enabled).
  useEffect(() => {
    if (!reservationsEnabled) return;
    let cancelled = false;
    api(`/api/reservations/${businessUsername}/${locationId}/settings`)
      .then((d) => {
        if (cancelled) return;
        if (d?.settings) setSettings(d.settings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessUsername, locationId, reservationsEnabled]);

  const todayStr = localDateStr(new Date());
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (settings?.bookingWindowDays ?? 30));
    return localDateStr(d);
  }, [settings?.bookingWindowDays]);

  const maxParty = settings?.maxPartySize ?? 8;

  // Fetch availability whenever date or number of guests changes.
  useEffect(() => {
    if (!reservationsEnabled || !date) {
      setSlots([]);
      setSlotsLoaded(false);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    api(
      `/api/reservations/${businessUsername}/${locationId}/availability?date=${encodeURIComponent(
        date,
      )}&partySize=${partySize}`,
    )
      .then((d) => {
        if (cancelled) return;
        const next: Slot[] = Array.isArray(d?.slots) ? d.slots : [];
        setSlots(next);
        setSlotsLoaded(true);
        // Reconcile the current/prefilled time against the freshly loaded slots:
        //  • available  → keep it selected
        //  • fully booked → DON'T auto-select a full slot; deselect it and
        //    remember it so the "… is fully booked" hint still shows
        //  • not a slot for this date (outside hours) → drop it silently
        const prev = timeRef.current;
        const slot = prev ? next.find((s) => s.time === prev) : undefined;
        if (slot && slot.available) {
          setTime(prev);
          setFullNotice("");
        } else if (slot) {
          setTime("");
          setFullNotice(prev);
        } else {
          setTime("");
          setFullNotice("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setSlotsLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessUsername, locationId, date, partySize, reservationsEnabled]);

  const selectedSlot = slots.find((s) => s.time === time);
  const canBook = Boolean(
    date && time && partySize > 0 && selectedSlot?.available,
  );
  const anyAvailable = slots.some((s) => s.available);

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-5">
        {/* Thumbnail + name */}
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
            {heroImage ? (
              <img
                src={heroImage}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <Utensils className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{name}</p>
            {locationText && (
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{locationText}</span>
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        <p className="text-base font-semibold text-slate-900">
          Plan Your Visit
        </p>

        {reservationsEnabled ? (
          <>
            {/* Number of guests + date — same field design as the homepage search bar. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">
                  Number of Guests
                </Label>
                <PartyField
                  value={partySize}
                  onChange={setPartySize}
                  max={maxParty}
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

            {/* Time slots */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Time</Label>
              {!date ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Pick a date to see available times.
                </p>
              ) : loadingSlots ? (
                <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking
                  availability…
                </div>
              ) : slots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  No reservation times for this date.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((s) => {
                      const selected = s.time === time;
                      return (
                        <button
                          key={s.time}
                          type="button"
                          disabled={!s.available}
                          onClick={() => {
                            setTime(s.time);
                            setFullNotice("");
                          }}
                          title={
                            s.available
                              ? `${s.remaining} seats left this hour`
                              : s.reason === "full"
                                ? `${s.label} is fully booked`
                                : s.reason === "too_soon"
                                  ? "Too close to booking time"
                                  : "Unavailable"
                          }
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-xs font-medium transition",
                            selected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : s.available
                                ? "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                                : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through",
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {slotsLoaded && !anyAvailable && (
                    <p className="text-xs text-amber-600">
                      No times are available for this number of guests on this
                      date. Try another date or a smaller party.
                    </p>
                  )}
                  {fullNotice &&
                    !time &&
                    anyAvailable &&
                    (() => {
                      const sel = slots.find((s) => s.time === fullNotice);
                      if (!sel) return null;
                      const nearby = slots
                        .filter((s) => s.available)
                        .slice(0, 3)
                        .map((s) => s.label)
                        .join(", ");
                      return (
                        <p className="text-xs text-amber-600">
                          {sel.label} is fully booked.
                          {nearby
                            ? ` Try ${nearby}.`
                            : " Try another nearby time."}
                        </p>
                      );
                    })()}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p className="font-medium text-slate-900">
              Reservations are currently unavailable.
            </p>
            <p className="mt-0.5 text-xs">
              Join the waitlist to save your spot.
            </p>
          </div>
        )}

        {/* Actions — Book Table sits above Join Queue. */}
        <div className="space-y-2">
          {reservationsEnabled ? (
            <Button
              variant={queueEnabled ? "outline" : "default"}
              className={cn(
                "w-full",
                queueEnabled
                  ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "bg-slate-900 text-white hover:bg-slate-800",
              )}
              disabled={!canBook}
              onClick={() => setModalOpen(true)}
            >
              <Utensils className="h-4 w-4" />
              <span>Book Table</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full border-slate-200 text-slate-400"
              disabled
            >
              <Utensils className="h-4 w-4" />
              <span>Reservations Unavailable</span>
            </Button>
          )}
          {reservationsEnabled && (!date || !time) && (
            <p className="text-center text-xs text-slate-400">
              Select number of guests, date, and time to book.
            </p>
          )}
          {queueEnabled !== false && (
            <Button
              asChild
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
            >
              <Link to={queueHref}>
                <Users className="h-4 w-4" />
                <span>Join Queue</span>
              </Link>
            </Button>
          )}
        </div>
      </CardContent>

      {modalOpen && settings && (
        <BookingModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          businessUsername={businessUsername}
          locationId={locationId}
          restaurantName={name}
          settings={settings}
          initialPartySize={partySize}
          initialDate={date}
          initialTime={time}
          maxDateStr={maxDateStr}
          todayStr={todayStr}
          defaultFirstName={account?.firstName || ""}
          defaultLastName={account?.lastName || ""}
          defaultEmail={account?.email || ""}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Booking modal — short form, editable date/time/party, then confirmation.
// ---------------------------------------------------------------------------

function BookingModal({
  open,
  onClose,
  businessUsername,
  locationId,
  restaurantName,
  settings,
  initialPartySize,
  initialDate,
  initialTime,
  maxDateStr,
  todayStr,
  defaultFirstName,
  defaultLastName,
  defaultEmail,
}: {
  open: boolean;
  onClose: () => void;
  businessUsername: string;
  locationId: string;
  restaurantName: string;
  settings: ReservationSettings;
  initialPartySize: number;
  initialDate: string;
  initialTime: string;
  maxDateStr: string;
  todayStr: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  defaultEmail?: string;
}) {
  const { toast } = useToast();

  const [partySize, setPartySize] = useState(initialPartySize);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Prefilled from the logged-in customer's account when available.
  const [firstName, setFirstName] = useState(defaultFirstName || "");
  const [lastName, setLastName] = useState(defaultLastName || "");
  // Reservations are email-only — confirmations always go to this address.
  const [email, setEmail] = useState(defaultEmail || "");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<any | null>(null);

  // Re-fetch availability when the editable controls change (within the modal).
  useEffect(() => {
    if (!date || confirmation) return;
    let cancelled = false;
    setLoadingSlots(true);
    api(
      `/api/reservations/${businessUsername}/${locationId}/availability?date=${encodeURIComponent(
        date,
      )}&partySize=${partySize}`,
    )
      .then((d) => {
        if (cancelled) return;
        const next: Slot[] = Array.isArray(d?.slots) ? d.slots : [];
        setSlots(next);
        // Drop the chosen time if it's no longer bookable.
        const stillOk = next.find((s) => s.time === time && s.available);
        if (!stillOk) setTime("");
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, partySize]);

  const maxParty = settings.maxPartySize;
  const contactValid = email.trim().length > 3 && email.includes("@");
  const canSubmit =
    firstName.trim() && lastName.trim() && date && time && contactValid;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api(
        `/api/reservations/${businessUsername}/${locationId}`,
        {
          method: "POST",
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            contactMethod: "email",
            email: email.trim(),
            partySize,
            date,
            time,
            notes: notes.trim(),
          }),
        },
      );
      setConfirmation(res);
    } catch (e: any) {
      toast({
        title: "Could not book",
        description: e?.message || "Please try another time.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const manageUrl: string | undefined = confirmation?.manageUrl;
  const manageToken: string | undefined = confirmation?.manageToken;
  const reservation = confirmation?.reservation;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl p-0 sm:max-w-md">
        {/* Body scrolls; DialogContent stays clipped so the X close button (top
            right) and the rounded card edges stay fixed on screen, including on
            mobile where the card is centered with margin around it. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {confirmation ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <DialogTitle className="mt-3 text-lg">
                  {reservation?.status === "pending"
                    ? "Reservation Requested"
                    : "Reservation Confirmed"}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {reservation?.status === "pending"
                    ? `${restaurantName} will confirm your request shortly.`
                    : `You're booked at ${restaurantName}.`}
                </DialogDescription>
              </div>

              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <Row label="Name" value={`${firstName} ${lastName}`} />
                <Row label="Date" value={readableDate(date)} />
                <Row
                  label="Time"
                  value={slots.find((s) => s.time === time)?.label || time}
                />
                <Row label="Number of Guests" value={`${partySize}`} />
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-700">
                  Manage Your Reservation
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Use this link to change or cancel, no account needed.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    readOnly
                    value={manageUrl || ""}
                    className="h-9 text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      if (manageUrl) navigator.clipboard?.writeText(manageUrl);
                      toast({ title: "Link copied" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                {manageToken && (
                  <Button
                    asChild
                    className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <Link to={`/reservations/manage/${manageToken}`}>
                      Manage Reservation
                    </Link>
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Book a Table</DialogTitle>
                <DialogDescription>{restaurantName}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Editable party / date / time — homepage-style fields. */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">
                      Number of Guests
                    </Label>
                    <PartyField
                      value={partySize}
                      onChange={setPartySize}
                      max={maxParty}
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
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {slots.map((s) => (
                        <button
                          key={s.time}
                          type="button"
                          disabled={!s.available}
                          onClick={() => {
                            setTime(s.time);
                            setFullNotice("");
                          }}
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

                <div className="border-t border-slate-100" />

                {/* Contact details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label
                      htmlFor="bk-first"
                      className="text-xs text-slate-500"
                    >
                      First Name
                    </Label>
                    <Input
                      id="bk-first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bk-last" className="text-xs text-slate-500">
                      Last Name
                    </Label>
                    <Input
                      id="bk-last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bk-email" className="text-xs text-slate-500">
                    Email
                  </Label>
                  <Input
                    id="bk-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <p className="text-xs text-slate-400">
                    We'll send your confirmation and manage link here.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bk-notes" className="text-xs text-slate-500">
                    Notes (Optional)
                  </Label>
                  <Textarea
                    id="bk-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Allergies, special requests, seating preference…"
                  />
                </div>

                {settings.cancellationPolicy && (
                  <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">Policy: </span>
                    {settings.cancellationPolicy}
                  </p>
                )}

                <Button
                  className="w-full bg-slate-900 text-white hover:bg-slate-800"
                  disabled={!canSubmit || submitting}
                  onClick={submit}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Confirm Reservation</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

/**
 * Date picker matching the homepage search bar: a FieldTrigger that opens a
 * Popover calendar, with a "Today / Tomorrow / MMM d" label. `value`/`onChange`
 * use "YYYY-MM-DD" strings; the calendar is bounded by today + booking window.
 */
export function DateField({
  value,
  onChange,
  todayStr,
  maxDateStr,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  todayStr: string;
  maxDateStr: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const start = new Date(`${todayStr}T00:00:00`);
  const end = new Date(`${maxDateStr}T00:00:00`);
  const label =
    selected && !Number.isNaN(selected.getTime())
      ? isToday(selected)
        ? "Today"
        : isTomorrow(selected)
          ? "Tomorrow"
          : format(selected, "MMM d")
      : "Pick A Date";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FieldTrigger
          icon={CalendarIcon}
          aria-label={`Date: ${label}`}
          className={className}
        >
          {label}
        </FieldTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) onChange(localDateStr(d));
            setOpen(false);
          }}
          disabled={{ before: start, after: end }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** Party-size picker matching the homepage "guests" field (FieldTrigger + list). */
export function PartyField({
  value,
  onChange,
  max,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FieldTrigger
          icon={Users}
          aria-label={`Number of guests: ${value}`}
          className={className}
        >
          {value} {value === 1 ? "guest" : "guests"}
        </FieldTrigger>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 max-h-72 overflow-y-auto p-1"
        align="start"
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <OptionRow
            key={n}
            selected={n === value}
            onSelect={() => {
              onChange(n);
              setOpen(false);
            }}
          >
            {n} {n === 1 ? "guest" : "guests"}
          </OptionRow>
        ))}
      </PopoverContent>
    </Popover>
  );
}
