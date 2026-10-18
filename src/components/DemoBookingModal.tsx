import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Clock01Icon,
  Video01Icon,
  CheckmarkCircle02Icon,
  Calendar01Icon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { translate, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { enUS, id as indonesian } from "date-fns/locale";
import {
  dateInTimezone,
  DEMO_HORIZON_DAYS,
  DEMO_TIMEZONE,
  DEMO_SLOT_MS,
  type DemoConfirmation,
} from "@shared/demoBooking";

function initialTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEMO_TIMEZONE;
}

function calendarDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export default function DemoBookingModal({
  open,
  onOpenChange,
  lang,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
  returnFocus: RefObject<HTMLElement>;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  let locale = "en-US";
  let calendarLocale = enUS;
  if (lang === "id") {
    locale = "id-ID";
    calendarLocale = indonesian;
  }
  const [timezone, setTimezone] = useState(initialTimezone);
  const [month, setMonth] = useState(() =>
    calendarDate(`${dateInTimezone(new Date(), initialTimezone()).slice(0, 7)}-01`),
  );
  const [day, setDay] = useState<Date>();
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [hour12, setHour12] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<DemoConfirmation>();
  const [form, setForm] = useState({ name: "", email: "", company: "", notes: "" });
  const heading = useRef<HTMLHeadingElement>(null);
  const notes = useRef<HTMLTextAreaElement>(null);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const meetingStart = selected || confirmation?.start || "";
  const hasMeeting = Boolean(meetingStart);
  useLayoutEffect(() => {
    const element = notes.current;
    if (!open || !element) {
      return;
    }
    element.style.height = "0px";
    const borderHeight = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + borderHeight}px`;
  }, [form.notes, selected, open]);
  useEffect(() => {
    if (!open || selected || confirmation) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSlots([]);
    fetch(`/api/demo/availability?${new URLSearchParams({ month: monthKey, timezone })}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error();
        }
        const data: { slots: string[] } = await response.json();
        if (!controller.signal.aborted) {
          setSlots(data.slots.filter((slot) => Date.parse(slot) > Date.now()));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(translate(lang, "demo.unavailable"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [open, monthKey, timezone, refresh, selected, confirmation, lang]);
  useEffect(() => {
    if (selected || confirmation) {
      heading.current?.focus();
    }
  }, [selected, confirmation]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setInterval(() => {
      setSlots((current) => current.filter((slot) => Date.parse(slot) > Date.now()));
      setRefresh((value) => value + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const daysWithSlots = new Set(slots.map((slot) => dateInTimezone(slot, timezone)));
  let dayKey = "";
  if (day) {
    dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  }
  const daySlots = slots.filter((slot) => dateInTimezone(slot, timezone) === dayKey);
  const noSlotsAvailable = !loading && (Boolean(error) || slots.length === 0);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12,
    }).format(new Date(value));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || uncertain) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/demo/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, start: selected, timezone }),
      });
      const result = await response.json();
      if (response.status === 409) {
        setSelected("");
        setDay(undefined);
        setSlots([]);
        setNotice(t("demo.conflict"));
        setRefresh((value) => value + 1);
        return;
      }
      if (!response.ok) {
        if (result.uncertain) {
          setUncertain(true);
          setError(t("demo.uncertain"));
        } else {
          setError(t("demo.bookingError"));
        }
        return;
      }
      setConfirmation(result);
    } catch {
      setUncertain(true);
      setError(t("demo.uncertain"));
    } finally {
      setSubmitting(false);
    }
  }

  let mainContent;
  if (confirmation) {
    mainContent = (
      <section
        className="flex flex-col items-center justify-center gap-5 p-6 text-center sm:p-10"
        aria-live="polite"
      >
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-10 w-10 text-emerald-600" />
        <h2 ref={heading} tabIndex={-1} className="text-title text-ink outline-none">
          {t("demo.confirmed")}
        </h2>
        <p className="text-body text-ink-subtle">{t("demo.invitation")}</p>
        {!confirmation.meetLink && (
          <p role="status" className="text-body text-ink-subtle">
            {t("demo.meetPending")}
          </p>
        )}
      </section>
    );
  } else if (selected) {
    mainContent = (
      <section className="p-6 sm:p-8 lg:p-10">
        <h2 ref={heading} tabIndex={-1} className="sr-only outline-none">
          {t("demo.details")}
        </h2>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-label">
              <Label htmlFor="demo-name">{t("demo.name")}</Label>
              <span aria-hidden="true">*</span>
            </div>
            <Input
              id="demo-name"
              className="control-lg"
              autoComplete="name"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-label">
              <Label htmlFor="demo-email">{t("demo.email")}</Label>
              <span aria-hidden="true">*</span>
            </div>
            <Input
              id="demo-email"
              className="control-lg"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-company">{t("demo.company")}</Label>
            <Input
              id="demo-company"
              className="control-lg"
              autoComplete="organization"
              maxLength={200}
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-notes">{t("demo.notes")}</Label>
            <Textarea
              id="demo-notes"
              ref={notes}
              className="h-24 min-h-24 resize-none overflow-hidden"
              maxLength={2000}
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {error && (
            <p role="alert" className="text-body text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="control-lg"
              disabled={submitting || uncertain}
              onClick={() => {
                setSelected("");
                setError("");
              }}
            >
              {t("demo.back")}
            </Button>
            <Button
              type="submit"
              className="control-lg"
              disabled={submitting || uncertain || !form.name.trim() || !form.email.trim()}
            >
              {submitting && t("demo.submitting")}
              {!submitting && t("demo.confirm")}
            </Button>
          </div>
        </form>
      </section>
    );
  } else {
    mainContent = (
      <>
        <section
          className="min-w-0 p-5 sm:p-8 lg:border-r lg:border-slate-100"
          aria-label={t("demo.calendar")}
          aria-busy={loading}
        >
          <h2 className="sr-only">{t("demo.calendar")}</h2>
          <Calendar
            locale={calendarLocale}
            labels={{
              labelNext: () => t("demo.nextMonth"),
              labelPrevious: () => t("demo.previousMonth"),
            }}
            mode="single"
            month={month}
            onMonthChange={(value) => {
              setMonth(value);
              setDay(undefined);
            }}
            selected={day}
            onSelect={(value) => {
              setDay(value);
              setNotice("");
            }}
            fromMonth={calendarDate(`${dateInTimezone(new Date(), timezone).slice(0, 7)}-01`)}
            toMonth={calendarDate(
              `${dateInTimezone(new Date(Date.now() + DEMO_HORIZON_DAYS * 86_400_000), timezone).slice(0, 7)}-01`,
            )}
            weekStartsOn={0}
            fixedWeeks
            showOutsideDays={false}
            disabled={(date) =>
              loading ||
              !daysWithSlots.has(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
              )
            }
            className="w-full p-0"
            classNames={{
              months: "w-full",
              month: "w-full space-y-6",
              caption: "relative flex items-center justify-center py-2",
              caption_label: "text-title",
              table: "w-full border-collapse",
              head_row: "flex w-full",
              head_cell: "w-[14.285%] py-2 text-caption font-medium text-ink-subtle",
              row: "mt-1 flex aspect-[7/1] w-full",
              cell: "relative w-[14.285%] p-0.5 text-center",
              day: "flex aspect-square w-full items-center justify-center rounded-xl bg-slate-50 text-label transition-colors duration-150 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:bg-transparent",
              day_selected: "bg-slate-900 text-white hover:bg-slate-900 focus:bg-slate-900",
              day_disabled: "text-slate-300",
              day_today: "font-semibold underline underline-offset-4",
            }}
          />
        </section>
        <section
          className="min-w-0 border-t border-slate-100 p-5 sm:p-8 lg:border-t-0"
          aria-label={t("demo.times")}
        >
          <div className="mb-5 flex items-center justify-between gap-3 lg:pr-8">
            <h2 className="text-title">{t("demo.times")}</h2>
            <div
              className="flex rounded-control bg-slate-100 p-1"
              role="group"
              aria-label={t("demo.timeFormat")}
            >
              {[true, false].map((value) => {
                let label = "24h";
                if (value) {
                  label = "12h";
                }
                let variant: "default" | "outline" = "outline";
                if (hour12 === value) {
                  variant = "default";
                }
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={variant}
                    aria-pressed={hour12 === value}
                    onClick={() => setHour12(value)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
          {notice && (
            <p role="status" className="mb-3 text-body leading-relaxed text-ink-subtle">
              {notice}
            </p>
          )}
          {noSlotsAvailable && (
            <p role="status" className="pb-1 text-body leading-relaxed text-ink-subtle">
              {t("demo.noSlots")}
            </p>
          )}
          {loading && (
            <div role="status" aria-label={t("common.loading")}>
              <div aria-hidden="true" className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="control-lg rounded-control" />
                ))}
              </div>
            </div>
          )}
          {!loading && !noSlotsAvailable && !day && (
            <p className="text-body text-ink-subtle">{t("demo.chooseDay")}</p>
          )}
          {!loading && !noSlotsAvailable && day && (
            <p className="mb-4 text-body text-ink-subtle">
              {new Intl.DateTimeFormat(locale, {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).format(day)}
            </p>
          )}
          {!loading && !noSlotsAvailable && day && daySlots.length === 0 && (
            <p role="status" className="text-body text-ink-subtle">
              {t("demo.noTimes")}
            </p>
          )}
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-1 lg:max-h-[390px] lg:grid-cols-1">
            {daySlots.map((slot) => (
              <Button
                key={slot}
                variant="outline"
                size="lg"
                onClick={() => {
                  setSelected(slot);
                  setError("");
                }}
              >
                {formatTime(slot)}
              </Button>
            ))}
          </div>
        </section>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-slate-950/40 duration-200 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
            if (confirmation) {
              setConfirmation(undefined);
              setSelected("");
              setDay(undefined);
              setNotice("");
              setForm({ name: "", email: "", company: "", notes: "" });
            }
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl [translate:-50%_-50%] overflow-y-auto rounded-3xl border border-slate-200 bg-white text-ink shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98] data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-1 [animation-duration:250ms] data-[state=closed]:[animation-duration:150ms] ease-out motion-reduce:animate-none",
            hasMeeting && "max-w-4xl",
          )}
        >
          <div
            className={cn(
              "grid lg:grid-cols-[0.9fr_1.25fr_0.85fr]",
              hasMeeting && "lg:grid-cols-[0.9fr_1.1fr]",
            )}
          >
            <section
              className={cn(
                "border-b border-slate-100 p-6 sm:p-8 lg:border-b-0 lg:border-r",
                hasMeeting && "lg:p-10",
              )}
            >
              <div
                className="mb-7 text-2xl font-semibold tracking-tight text-slate-900"
                aria-label="SeatPing"
              >
                SeatPing
              </div>
              <DialogTitle className="mb-3 text-title">{t("demo.title")}</DialogTitle>
              <DialogDescription className="leading-relaxed">
                {t("demo.description")}
              </DialogDescription>
              <section
                className="mt-7 space-y-4 text-body text-ink-subtle"
                aria-label={t("demo.meetingDetails")}
              >
                {hasMeeting && (
                  <div className="flex items-start gap-3 text-ink">
                    <HugeiconsIcon icon={Calendar01Icon} className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 space-y-1 font-medium">
                      <p>{formatDate(meetingStart)}</p>
                      <p>
                        {formatTime(meetingStart)} -{" "}
                        {formatTime(
                          new Date(Date.parse(meetingStart) + DEMO_SLOT_MS).toISOString(),
                        )}
                      </p>
                    </div>
                  </div>
                )}
                <p className="flex items-center gap-3">
                  <HugeiconsIcon icon={Clock01Icon} className="h-4 w-4" />
                  {t("demo.duration")}
                </p>
                <p className="flex items-center gap-3">
                  <HugeiconsIcon icon={Video01Icon} className="h-4 w-4" />
                  Google Meet
                </p>
                {hasMeeting && (
                  <p className="flex items-start gap-3">
                    <HugeiconsIcon icon={Globe02Icon} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{timezone.replace(/_/g, " ")}</span>
                  </p>
                )}
                {!hasMeeting && (
                  <div className="space-y-2">
                    <p className="text-label">{t("demo.timezone")}</p>
                    <TimezoneSelect
                      value={timezone}
                      ariaLabel={t("demo.timezone")}
                      searchPlaceholder={t("demo.searchTimezone")}
                      emptyText={t("demo.noTimezone")}
                      className="control-lg min-w-0 rounded-control text-label font-normal text-ink-subtle"
                      onChange={(zone) => {
                        if (zone === timezone) {
                          return;
                        }
                        setTimezone(zone);
                        setDay(undefined);
                        setSlots([]);
                      }}
                    />
                  </div>
                )}
              </section>
            </section>
            {mainContent}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" className="absolute right-3 top-3">
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
              <span className="sr-only">{t("demo.close")}</span>
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
