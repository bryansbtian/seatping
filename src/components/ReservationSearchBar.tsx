import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import {
  Calendar as CalendarIcon,
  Users,
  Search,
  MapPin,
  Loader2,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FieldTrigger,
  OptionRow,
  TimeSelect,
  formatTimeLabel,
} from "@/components/TimeSelect";
import { cn } from "@/lib/utils";
import {
  useSearchSuggestions,
  type Suggestion,
} from "@/hooks/useSearchSuggestions";

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
  if (value === "large") return "Larger party";
  return `${value} ${value === "1" ? "guest" : "guests"}`;
}

function suggestionSubtitle(s: Suggestion): string {
  return [s.cuisine, s.shortAddress || s.area || s.city]
    .filter(Boolean)
    .join(" · ");
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

  // --- Live location suggestions -------------------------------------------
  // `justSelected` keeps the dropdown closed after a pick until the user types
  // again (requirement 10); it also disables the fetch hook.
  const [open, setOpen] = React.useState(false);
  const [justSelected, setJustSelected] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(-1);
  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  const { suggestions, loading, error } = useSearchSuggestions(query, !justSelected);
  const showDropdown = open && !justSelected && query.trim().length > 0;

  // Reset the highlight whenever the result set changes.
  React.useEffect(() => {
    setHighlighted(-1);
  }, [suggestions]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectSuggestion = (s: Suggestion) => {
    setQuery(s.name);
    setJustSelected(true);
    setOpen(false);
    setHighlighted(-1);
    if (s.url) {
      // Carry the current date/time/party into the restaurant page so the
      // "Plan your visit" card prefills without the customer re-selecting.
      const params = new URLSearchParams();
      params.set("date", localDateStr(date));
      params.set("time", time);
      if (people !== "large") params.set("partySize", people);
      navigate(`${s.url}?${params.toString()}`);
    }
  };

  // Path-style /search/:query, carrying the selected date/time/party as query
  // params so the results page (and Book Table) preserve the full search
  // context. Used by both the Search button and Enter (no suggestion picked).
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setOpen(false);
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

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (!showDropdown || suggestions.length === 0) return;
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      if (!showDropdown || suggestions.length === 0) return;
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Highlighted suggestion wins; otherwise let the form run a normal search.
      if (showDropdown && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault();
        selectSuggestion(suggestions[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
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
      className="rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 sm:p-6 animate-fade-in-up animation-delay-400"
    >
      {/*
        Responsive grid:
        - Mobile: 1 column, every field + button full width (stacked).
        - md / lg: date/time/party are content-sized `auto` tracks (compact, just
          enough for their label) and the search input takes the remaining space
          via a `minmax(0,1fr)` track; the button drops to its own full-width row.
        - xl: same, plus an `auto` track so the button sits inline on the right.
      */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-center xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]">
        {/* Date */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <FieldTrigger
              icon={CalendarIcon}
              aria-label={`Date: ${dateLabel}`}
              className="md:w-auto md:min-w-[120px]"
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

        {/* Time — wider at md/xl so the selected label (e.g. "10:30 PM") never
            truncates on tablet or laptop screens. */}
        <TimeSelect
          value={time}
          onChange={setTime}
          options={TIME_OPTIONS}
          aria-label={`Time: ${formatTimeLabel(time)}`}
          className="md:w-auto md:min-w-[132px]"
        />

        {/* People */}
        <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
          <PopoverTrigger asChild>
            <FieldTrigger
              icon={Users}
              aria-label={`Number of guests: ${peopleLabel(people)}`}
              className="md:w-auto md:min-w-[120px]"
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

        {/* Search input + live suggestions dropdown — grows to fill remaining
            row space (the grid's minmax(0,1fr) track). */}
        <div ref={searchBoxRef} className="relative w-full min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setJustSelected(false);
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim() && !justSelected) setOpen(true);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Restaurants, cuisines, or areas"
            className="h-12 w-full pl-9 rounded-xl border-slate-200 placeholder:text-sm sm:placeholder:text-base"
            aria-label="Search restaurants, cuisines, or areas"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            autoComplete="off"
          />

          {showDropdown && (
            <div
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
              role="listbox"
            >
              {loading && suggestions.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              ) : error ? (
                <div className="px-4 py-3 text-sm text-slate-500">
                  Couldn't load suggestions. Press Search to continue.
                </div>
              ) : suggestions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">
                  No matching restaurants found
                </div>
              ) : (
                <ul className="max-h-[320px] overflow-y-auto py-1">
                  {suggestions.map((s, i) => (
                    <li key={s.locationId}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === highlighted}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlighted(i)}
                        onClick={() => selectSuggestion(s)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          i === highlighted ? "bg-slate-100" : "hover:bg-slate-50",
                        )}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                          {s.imageUrl ? (
                            <img
                              src={s.imageUrl}
                              alt={s.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Utensils className="h-4 w-4 text-slate-400" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {s.name}
                          </span>
                          {suggestionSubtitle(s) && (
                            <span className="flex items-center gap-1 truncate text-xs text-slate-500">
                              <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">{suggestionSubtitle(s)}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Search button — SeatPing dark navy. Full width on its own row at
            md/lg (col-span-12); compact inline at xl (col-span-2). */}
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-xl bg-slate-900 text-white px-8 hover:bg-slate-800 transition-colors md:col-span-full xl:col-auto"
        >
          <Search className="h-4 w-4" />
          <span className="font-medium">Search</span>
        </Button>
      </div>
    </form>
  );
};

export default ReservationSearchBar;
