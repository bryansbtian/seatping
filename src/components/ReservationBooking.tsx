import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Clock3,
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

type AvailabilityNotice = {
  status: "available" | "closed" | "outside_operating_hours";
  dayName?: string | null;
  hoursLabel?: string | null;
  message?: string;
  helper?: string;
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
  initialDate?: string;
  initialTime?: string;
  initialPartySize?: number;
  autoOpen?: boolean;
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  let initialPartyValue: number | "larger";
  if (initialPartySize && initialPartySize > 0) {
    if (initialPartySize > 10) {
      initialPartyValue = "larger";
    } else {
      initialPartyValue = initialPartySize;
    }
  } else {
    initialPartyValue = 2;
  }
  const [partySize, setPartySize] = useState<number | "larger">(initialPartyValue);
  const [date, setDate] = useState(initialDate || localDateStr(new Date()));
  const [time, setTime] = useState(initialTime || "");
  const [fullNotice, setFullNotice] = useState("");
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilityNotice, setAvailabilityNotice] = useState<AvailabilityNotice | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsLoaded, setSlotsLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const autoOpenRef = useRef(autoOpen);
  const reservationsEnabledRef = useRef(reservationsEnabled);

  useEffect(() => {
    if (autoOpenRef.current && reservationsEnabledRef.current) {
      setModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (modalOpen) {
      analytics.reservationStarted(locationId);
    }
  }, [modalOpen, locationId]);

  const [account, setAccount] = useState<{
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api("/auth/me")
      .then((d) => {
        if (cancelled || !d?.user) {
          return;
        }
        const full = String(d.user.name || "").trim();
        const sp = full.indexOf(" ");
        let accountFirstName: string;
        let accountLastName: string;
        if (sp === -1) {
          accountFirstName = full;
          accountLastName = "";
        } else {
          accountFirstName = full.slice(0, sp);
          accountLastName = full.slice(sp + 1);
        }
        setAccount({
          firstName: accountFirstName,
          lastName: accountLastName,
          email: d.user.email || "",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!reservationsEnabled) {
      return;
    }
    let cancelled = false;
    api(`/api/reservations/${businessUsername}/${locationId}/settings`)
      .then((d) => {
        if (cancelled) {
          return;
        }
        if (d?.settings) {
          setSettings(d.settings);
        }
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

  useEffect(() => {
    if (!reservationsEnabled || !date || partySize === "larger") {
      setSlots([]);
      setAvailabilityNotice(null);
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
        setAvailabilityNotice(d?.availability || null);
        setSlotsLoaded(true);
        const prev = timeRef.current;
        let slot: Slot | undefined;
        if (prev) {
          slot = next.find((s) => s.time === prev);
        } else {
          slot = undefined;
        }
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
          setAvailabilityNotice(null);
          setSlotsLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessUsername, locationId, date, partySize, reservationsEnabled]);

  const selectedSlot = slots.find((s) => s.time === time);
  const canBook = Boolean(
    date && time && partySize !== "larger" && partySize > 0 && selectedSlot?.available,
  );
  const anyAvailable = slots.some((s) => s.available);
  const isClosed =
    availabilityNotice?.status === "closed" ||
    availabilityNotice?.status === "outside_operating_hours";

  let heroContent: JSX.Element;
  if (heroImage) {
    heroContent = <img src={heroImage} alt={name} className="h-full w-full object-cover" />;
  } else {
    heroContent = (
      <div className="flex h-full w-full items-center justify-center text-slate-400">
        <Utensils className="h-5 w-5" />
      </div>
    );
  }

  let planContent: JSX.Element;
  if (reservationsEnabled) {
    let timeContent: JSX.Element;
    if (partySize === "larger") {
      timeContent = (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          For larger parties, please contact the restaurant directly.
        </p>
      );
    } else if (!date) {
      timeContent = (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Pick a date to see available times.
        </p>
      );
    } else if (loadingSlots) {
      timeContent = (
        <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
        </div>
      );
    } else if (slots.length === 0) {
      timeContent = <AvailabilityEmptyState notice={availabilityNotice} />;
    } else {
      timeContent = (
        <>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const selected = s.time === time;
              let slotTitle: string;
              if (s.available) {
                slotTitle = `${s.remaining} seats left this hour`;
              } else if (s.reason === "full") {
                slotTitle = `${s.label} is fully booked`;
              } else if (s.reason === "too_soon") {
                slotTitle = "Too close to booking time";
              } else {
                slotTitle = "Unavailable";
              }
              let slotClass: string;
              if (selected) {
                slotClass = "border-slate-900 bg-slate-900 text-white";
              } else if (s.available) {
                slotClass = "border-slate-200 bg-white text-slate-700 hover:border-slate-400";
              } else {
                slotClass =
                  "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through";
              }
              return (
                <button
                  key={s.time}
                  type="button"
                  disabled={!s.available}
                  onClick={() => {
                    setTime(s.time);
                    setFullNotice("");
                  }}
                  title={slotTitle}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium transition",
                    slotClass,
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {slotsLoaded && !anyAvailable && (
            <p className="text-xs text-amber-600">
              No times are available for this number of guests on this date. Try another date or a
              smaller party.
            </p>
          )}
          {fullNotice &&
            !time &&
            anyAvailable &&
            (() => {
              const sel = slots.find((s) => s.time === fullNotice);
              if (!sel) {
                return null;
              }
              const nearby = slots
                .filter((s) => s.available)
                .slice(0, 3)
                .map((s) => s.label)
                .join(", ");
              let nearbyText: string;
              if (nearby) {
                nearbyText = ` Try ${nearby}.`;
              } else {
                nearbyText = " Try another nearby time.";
              }
              return (
                <p className="text-xs text-amber-600">
                  {sel.label} is fully booked.
                  {nearbyText}
                </p>
              );
            })()}
        </>
      );
    }
    planContent = (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Number of Guests</Label>
            <PartyField value={partySize} onChange={setPartySize} max={maxParty} />
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

        <div className="space-y-2">
          <Label className="text-xs text-slate-500">Time</Label>
          {timeContent}
        </div>
      </>
    );
  } else {
    planContent = (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Reservations are currently unavailable.</p>
        <p className="mt-0.5 text-xs">Join the waitlist to save your spot.</p>
      </div>
    );
  }

  let primaryAction: JSX.Element;
  if (reservationsEnabled) {
    if (isClosed) {
      primaryAction = (
        <Button asChild className="w-full" variant="default">
          <Link to="/search">Explore Other Restaurants</Link>
        </Button>
      );
    } else {
      primaryAction = (
        <Button className="w-full" disabled={!canBook} onClick={() => setModalOpen(true)}>
          <Utensils className="h-4 w-4" />
          <span>Book Table</span>
        </Button>
      );
    }
  } else {
    primaryAction = (
      <Button variant="outline" className="w-full border-slate-200 text-slate-400" disabled>
        <Utensils className="h-4 w-4" />
        <span>Reservations Unavailable</span>
      </Button>
    );
  }

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
            {heroContent}
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

        <p className="text-base font-semibold text-slate-900">Plan Your Visit</p>

        {planContent}

        <div className="space-y-2">
          {primaryAction}
          {reservationsEnabled && (!date || !time) && partySize !== "larger" && !isClosed && (
            <p className="text-center text-xs text-slate-400">
              Select number of guests, date, and time to book.
            </p>
          )}
          {queueEnabled !== false && (
            <Button variant="outline" asChild className="w-full">
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
  initialPartySize: number | "larger";
  initialDate: string;
  initialTime: string;
  maxDateStr: string;
  todayStr: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  defaultEmail?: string;
}) {
  const { toast } = useToast();

  const [partySize, setPartySize] = useState<number | "larger">(initialPartySize);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const timeRef = useRef(time);
  timeRef.current = time;
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilityNotice, setAvailabilityNotice] = useState<AvailabilityNotice | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [firstName, setFirstName] = useState(defaultFirstName || "");
  const [lastName, setLastName] = useState(defaultLastName || "");
  const [email, setEmail] = useState(defaultEmail || "");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<any | null>(null);

  useEffect(() => {
    if (!date || confirmation || partySize === "larger") {
      if (partySize === "larger") {
        setSlots([]);
        setAvailabilityNotice(null);
      }
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
        setAvailabilityNotice(d?.availability || null);
        const stillOk = next.find((s) => s.time === timeRef.current && s.available);
        if (!stillOk) {
          setTime("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setAvailabilityNotice(null);
        }
      })
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [date, partySize, confirmation, businessUsername, locationId]);

  const maxParty = settings.maxPartySize;
  const contactValid = email.trim().length > 3 && email.includes("@");
  const selectedSlot = slots.find((slot) => slot.time === time);
  const isClosed =
    availabilityNotice?.status === "closed" ||
    availabilityNotice?.status === "outside_operating_hours";
  const canSubmit = Boolean(
    firstName.trim() &&
    lastName.trim() &&
    date &&
    time &&
    partySize !== "larger" &&
    contactValid &&
    selectedSlot?.available &&
    !loadingSlots,
  );

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await api(`/api/reservations/${businessUsername}/${locationId}`, {
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
      });
      analytics.reservationCompleted(locationId);
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

  let modalTimeContent: JSX.Element;
  if (partySize === "larger") {
    modalTimeContent = (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 max-[320px]:p-2.5 max-[320px]:text-xs text-sm text-slate-600">
        For larger parties, please contact the restaurant directly.
      </div>
    );
  } else if (loadingSlots) {
    modalTimeContent = (
      <div className="flex items-center gap-2 py-1 max-[320px]:text-xs text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking…
      </div>
    );
  } else if (slots.length === 0) {
    modalTimeContent = <AvailabilityEmptyState notice={availabilityNotice} />;
  } else {
    modalTimeContent = (
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((s) => {
          let slotClass: string;
          if (s.time === time) {
            slotClass = "border-slate-900 bg-slate-900 text-white";
          } else if (s.available) {
            slotClass = "border-slate-200 bg-white text-slate-700 hover:border-slate-400";
          } else {
            slotClass =
              "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through";
          }
          return (
            <button
              key={s.time}
              type="button"
              disabled={!s.available}
              onClick={() => setTime(s.time)}
              className={cn(
                "rounded-md border px-1 py-1.5 max-[320px]:py-1 max-[320px]:text-[10px] text-xs font-medium transition",
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

  let dialogBody: JSX.Element;
  if (confirmation) {
    dialogBody = (
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <DialogTitle className="mt-3 text-lg">Reservation Confirmed</DialogTitle>
          <DialogDescription className="mt-1">
            {`You're booked at ${restaurantName}.`}
          </DialogDescription>
        </div>

        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <Row label="Name" value={`${firstName} ${lastName}`} />
          <Row label="Date" value={readableDate(date)} />
          <Row label="Time" value={slots.find((s) => s.time === time)?.label || time} />
          <Row label="Number of Guests" value={`${partySize}`} />
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-700">Manage Your Reservation</p>
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
                if (manageUrl) {
                  navigator.clipboard?.writeText(manageUrl);
                }
                toast({ title: "Link copied" });
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          {manageToken && (
            <Button asChild className="flex-1">
              <Link to={`/reservations/manage/${manageToken}`}>Manage Reservation</Link>
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  } else {
    dialogBody = (
      <>
        <DialogHeader>
          <DialogTitle className="max-[320px]:text-base text-lg">Book a Table</DialogTitle>
          <DialogDescription className="max-[320px]:text-xs text-sm">
            {restaurantName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="max-[320px]:text-[10px] text-xs text-slate-500">
                Number of Guests
              </Label>
              <PartyField
                value={partySize}
                onChange={setPartySize}
                max={maxParty}
                className="max-[320px]:h-9 max-[320px]:text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="max-[320px]:text-[10px] text-xs text-slate-500">Date</Label>
              <DateField
                value={date}
                onChange={setDate}
                todayStr={todayStr}
                maxDateStr={maxDateStr}
                className="max-[320px]:h-9 max-[320px]:text-[11px]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="max-[320px]:text-[10px] text-xs text-slate-500">Time</Label>
            {modalTimeContent}
          </div>

          {isClosed && (
            <div className="pt-2">
              <Button
                asChild
                className="w-full h-10 text-sm sm:h-11 sm:text-base"
                variant="default"
              >
                <Link to="/search">Explore Other Restaurants</Link>
              </Button>
            </div>
          )}

          {!isClosed && partySize !== "larger" && (
            <>
              <div className="border-t border-slate-100" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="bk-first"
                    className="max-[320px]:text-[10px] text-xs text-slate-500"
                  >
                    First Name
                  </Label>
                  <Input
                    id="bk-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="max-[320px]:h-8 max-[320px]:text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="bk-last"
                    className="max-[320px]:text-[10px] text-xs text-slate-500"
                  >
                    Last Name
                  </Label>
                  <Input
                    id="bk-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="max-[320px]:h-8 max-[320px]:text-[11px]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="bk-email"
                  className="max-[320px]:text-[10px] text-xs text-slate-500"
                >
                  Email
                </Label>
                <Input
                  id="bk-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="max-[320px]:h-8 max-[320px]:text-[11px]"
                />
                <p className="max-[320px]:text-[10px] text-xs text-slate-400">
                  We'll send your confirmation and manage link here.
                </p>
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="bk-notes"
                  className="max-[320px]:text-[10px] text-xs text-slate-500"
                >
                  Notes (Optional)
                </Label>
                <Textarea
                  id="bk-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, special requests, seating preference…"
                  className="max-[320px]:min-h-0 max-[320px]:text-[11px]"
                />
              </div>

              {settings.cancellationPolicy && (
                <p className="rounded-md bg-slate-50 p-2.5 max-[320px]:p-2 max-[320px]:text-[10px] text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Policy: </span>
                  {settings.cancellationPolicy}
                </p>
              )}

              <Button className="w-full" disabled={!canSubmit || submitting} onClick={submit}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Confirm Reservation</span>
              </Button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl p-0 max-sm:overflow-hidden max-sm:p-0 sm:max-w-md">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">{dialogBody}</div>
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

function AvailabilityEmptyState({ notice }: { notice: AvailabilityNotice | null }) {
  const message = notice?.message || "No reservation times are available for this date.";
  const helper = notice?.helper || "Choose another date to view available reservation times.";

  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
        <Clock3 className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{message}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{helper}</p>
      </div>
    </div>
  );
}

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
  let selected: Date | undefined;
  if (value) {
    selected = new Date(`${value}T00:00:00`);
  } else {
    selected = undefined;
  }
  const start = new Date(`${todayStr}T00:00:00`);
  const end = new Date(`${maxDateStr}T00:00:00`);
  let label: string;
  if (selected && !Number.isNaN(selected.getTime())) {
    if (isToday(selected)) {
      label = "Today";
    } else if (isTomorrow(selected)) {
      label = "Tomorrow";
    } else {
      label = format(selected, "MMM d");
    }
  } else {
    label = "Pick A Date";
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FieldTrigger icon={CalendarIcon} aria-label={`Date: ${label}`} className={className}>
          {label}
        </FieldTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(localDateStr(d));
            }
            setOpen(false);
          }}
          disabled={{ before: start, after: end }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export function PartyField({
  value,
  onChange,
  max,
  className,
}: {
  value: number | "larger";
  onChange: (v: number | "larger") => void;
  max: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  let partyLabel: string;
  if (value === "larger") {
    partyLabel = "Larger Party";
  } else {
    let guestWord: string;
    if (value === 1) {
      guestWord = "Guest";
    } else {
      guestWord = "Guests";
    }
    partyLabel = `${value} ${guestWord}`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FieldTrigger icon={Users} aria-label={`Number of guests: ${value}`} className={className}>
          {partyLabel}
        </FieldTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-44 max-h-72 overflow-y-auto p-1" align="start">
        {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((n) => {
          let optionGuestWord: string;
          if (n === 1) {
            optionGuestWord = "Guest";
          } else {
            optionGuestWord = "Guests";
          }
          return (
            <OptionRow
              key={n}
              selected={n === value}
              onSelect={() => {
                onChange(n);
                setOpen(false);
              }}
            >
              {n} {optionGuestWord}
            </OptionRow>
          );
        })}
        {max > 10 && (
          <OptionRow
            selected={value === "larger"}
            onSelect={() => {
              onChange("larger");
              setOpen(false);
            }}
          >
            Larger Party
          </OptionRow>
        )}
      </PopoverContent>
    </Popover>
  );
}
