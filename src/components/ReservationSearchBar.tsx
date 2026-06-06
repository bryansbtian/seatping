import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { Calendar as CalendarIcon, Users, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FieldTrigger,
  FLAT_FIELD,
  OptionRow,
  TimeSelect,
  formatTimeLabel,
} from "@/components/TimeSelect";
import { SearchSuggestInput } from "@/components/SearchSuggestInput";
import { cn } from "@/lib/utils";

// Full-day 30-minute slots: 12:00 AM → 11:30 PM. Values are "HH:mm".
const TIME_OPTIONS: string[] = [];
for (let h = 0; h <= 23; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}
const SLOT_INTERVAL_MIN = 30;

/**
 * Default time: round NOW up to the next 30-minute slot. If now is past the
 * last slot of the day (23:30), wrap to the first slot ("00:00", representing
 * the next day's midnight).
 */
function getNextTimeSlot(): string {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainder = minutes % SLOT_INTERVAL_MIN;
  if (remainder !== 0) {
    now.setMinutes(minutes + (SLOT_INTERVAL_MIN - remainder));
  }
  now.setSeconds(0);
  now.setMilliseconds(0);
  const target = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  // TIME_OPTIONS are sorted "HH:mm" strings — lexicographic order matches time order.
  return TIME_OPTIONS.find((t) => t >= target) ?? TIME_OPTIONS[0];
}

// 1–20 guests, then a "Larger party" escape hatch (value "large").
const PEOPLE_OPTIONS: string[] = [
  ...Array.from({ length: 20 }, (_, i) => String(i + 1)),
  "large",
];

function peopleLabel(value: string) {
  if (value === "large") return "Larger Party";
  return `${value} ${value === "1" ? "Guest" : "Guests"}`;
}

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ReservationSearchBar = () => {
  const navigate = useNavigate();

  // Sensible reservation defaults: today, the next upcoming dinner slot, 2 people.
  const [date, setDate] = React.useState<Date>(() => new Date());
  const [time, setTime] = React.useState<string>(() => getNextTimeSlot());
  const [people, setPeople] = React.useState("2");
  const [query, setQuery] = React.useState("");

  const [dateOpen, setDateOpen] = React.useState(false);
  const [peopleOpen, setPeopleOpen] = React.useState(false);

  // Path-style /search/:query, carrying the selected date/time/party as query
  // params so the results page (and Book Table) preserve the full search
  // context. Used by the Search button and Enter (no suggestion picked); the
  // suggestion dropdown and direct restaurant navigation live in
  // SearchSuggestInput below.
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    const params = new URLSearchParams();
    params.set("date", localDateStr(date));
    params.set("time", time);
    if (people !== "large") params.set("partySize", people);
    // An empty search box is allowed — go to the results page carrying just the
    // chosen date / time / guests so the user can still browse availability.
    navigate(
      q
        ? `/search/${encodeURIComponent(q)}?${params.toString()}`
        : `/search?${params.toString()}`,
    );
  };

  // Disable past days in the calendar.
  const startOfToday = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dateLabel = isToday(date)
    ? "Today"
    : isTomorrow(date)
      ? "Tomorrow"
      : format(date, "MMM d");

  return (
    <form
      onSubmit={handleSearch}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 max-[360px]:p-2 sm:p-6 md:shadow-2xl animate-fade-in-up animation-delay-400"
    >
      {/*
        Layout:
        - Mobile: one unified flat panel. Fields are flat rows separated by thin
          dividers (carried on wrapper divs, not the fields). Date + Time share
          the first row split by a vertical divider; Guests, the search input,
          and the button each get their own full-width row.
        - md / lg: date/time/party are content-sized `auto` tracks (compact, just
          enough for their label) and the search input takes the remaining space
          via a `minmax(0,1fr)` track; the button drops to its own full-width row.
          The mobile wrapper divs collapse via `md:contents` so the fields drop
          straight into this grid.
        - xl: same, plus an `auto` track so the button sits inline on the right.
      */}
      <div className="flex flex-col md:grid md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-center md:gap-3 xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]">
        {/* Row 1: Date + Time, side by side with a vertical divider on mobile. */}
        <div className="flex items-stretch md:contents">
          {/* Date */}
          <div className="flex-1 min-w-0 md:contents">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <FieldTrigger
                  icon={CalendarIcon}
                  aria-label={`Date: ${dateLabel}`}
                  className={cn(FLAT_FIELD, "md:w-auto md:min-w-[120px]")}
                >
                  {dateLabel}
                </FieldTrigger>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) setDate(d);
                    setDateOpen(false);
                  }}
                  disabled={{ before: startOfToday }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time — wider at md/xl so the selected label (e.g. "10:30 PM") never
              truncates on tablet or laptop screens. */}
          <div className="flex-1 min-w-0 border-l border-slate-200 md:border-l-0 md:contents">
            <TimeSelect
              value={time}
              onChange={setTime}
              options={TIME_OPTIONS}
              aria-label={`Time: ${formatTimeLabel(time)}`}
              className={cn(FLAT_FIELD, "md:w-auto md:min-w-[132px]")}
            />
          </div>
        </div>

        {/* Row 2: Guests — full width. */}
        <div className="border-t border-slate-200 md:border-t-0 md:contents">
          <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
            <PopoverTrigger asChild>
              <FieldTrigger
                icon={Users}
                aria-label={`Number of guests: ${peopleLabel(people)}`}
                className={cn(FLAT_FIELD, "md:w-auto md:min-w-[120px]")}
              >
                {peopleLabel(people)}
              </FieldTrigger>
            </PopoverTrigger>
            <PopoverContent
              className="w-48 max-h-72 overflow-y-auto p-1"
              align="start"
            >
              {PEOPLE_OPTIONS.map((value) => (
                <OptionRow
                  key={value}
                  selected={value === people}
                  onSelect={() => {
                    setPeople(value);
                    setPeopleOpen(false);
                  }}
                >
                  {peopleLabel(value)}
                </OptionRow>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 3: Search input + live restaurant suggestions (shared with the
            /search bar). Grows to fill the remaining row space (the grid's
            minmax(0,1fr) track) at md+. */}
        <SearchSuggestInput
          value={query}
          onChange={setQuery}
          date={date}
          time={time}
          people={people}
          className="border-t border-slate-200 md:border-t-0"
          inputClassName="rounded-none border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-slate-50 md:rounded-xl md:border md:border-slate-200 md:bg-transparent md:focus-visible:ring-2 md:focus-visible:ring-offset-2 md:focus-visible:bg-transparent placeholder:text-sm max-[360px]:placeholder:text-xs sm:placeholder:text-base"
        />

        {/* Row 4: Search button — SeatPing dark navy. On mobile it's the last
            row of the panel (thin divider above, small top padding so it reads
            as part of the panel rather than a floating card). Full width on its
            own row at md/lg (col-span-full); compact inline at xl (col-auto). */}
        <div className="border-t border-slate-200 pt-3 md:border-t-0 md:pt-0 md:contents">
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-xl px-8 md:col-span-full xl:col-auto"
          >
            <Search className="h-4 w-4" />
            <span className="font-medium">Search</span>
          </Button>
        </div>
      </div>
    </form>
  );
};

export default ReservationSearchBar;
