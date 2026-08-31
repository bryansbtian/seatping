import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon, Search01Icon, UsersRoundIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FieldTrigger, FLAT_FIELD, OptionRow, TimeSelect } from "@/components/TimeSelect";
import { formatTimeLabel } from "@/components/timeOptions";
import { SearchSuggestInput } from "@/components/SearchSuggestInput";
import { cn } from "@/lib/utils";

const TIME_OPTIONS: string[] = [];
for (let h = 0; h <= 23; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}
const SLOT_INTERVAL_MIN = 30;

function getNextTimeSlot(): string {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainder = minutes % SLOT_INTERVAL_MIN;
  if (remainder !== 0) {
    now.setMinutes(minutes + (SLOT_INTERVAL_MIN - remainder));
  }
  now.setSeconds(0);
  now.setMilliseconds(0);
  const target = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
    2,
    "0",
  )}`;
  return TIME_OPTIONS.find((t) => t >= target) ?? TIME_OPTIONS[0];
}

const PEOPLE_OPTIONS: string[] = [...Array.from({ length: 20 }, (_, i) => String(i + 1)), "large"];

function peopleLabel(value: string) {
  if (value === "large") {
    return "Larger Party";
  }
  let guestWord: string;
  if (value === "1") {
    guestWord = "Guest";
  } else {
    guestWord = "Guests";
  }
  return `${value} ${guestWord}`;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ReservationSearchBar = () => {
  const navigate = useNavigate();

  const [date, setDate] = React.useState<Date>(() => new Date());
  const [time, setTime] = React.useState<string>(() => getNextTimeSlot());
  const [people, setPeople] = React.useState("2");
  const [query, setQuery] = React.useState("");

  const [dateOpen, setDateOpen] = React.useState(false);
  const [peopleOpen, setPeopleOpen] = React.useState(false);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    const params = new URLSearchParams();
    params.set("date", localDateStr(date));
    params.set("time", time);
    if (people !== "large") {
      params.set("partySize", people);
    }
    let searchPath: string;
    if (q) {
      searchPath = `/search/${encodeURIComponent(q)}?${params.toString()}`;
    } else {
      searchPath = `/search?${params.toString()}`;
    }
    navigate(searchPath);
  };

  const startOfToday = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  let dateLabel: string;
  if (isToday(date)) {
    dateLabel = "Today";
  } else if (isTomorrow(date)) {
    dateLabel = "Tomorrow";
  } else {
    dateLabel = format(date, "MMM d");
  }

  return (
    <form
      onSubmit={handleSearch}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 max-[360px]:p-2 sm:p-6 md:shadow-2xl animate-fade-in-up animation-delay-400"
    >
      <div className="flex flex-col md:grid md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-center md:gap-3 xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]">
        <div className="flex items-stretch md:contents">
          <div className="flex-1 min-w-0 md:contents">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <FieldTrigger
                  icon={Calendar01Icon}
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
                    if (d) {
                      setDate(d);
                    }
                    setDateOpen(false);
                  }}
                  disabled={{ before: startOfToday }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

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

        <div className="border-t border-slate-200 md:border-t-0 md:contents">
          <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
            <PopoverTrigger asChild>
              <FieldTrigger
                icon={UsersRoundIcon}
                aria-label={`Number of guests: ${peopleLabel(people)}`}
                className={cn(FLAT_FIELD, "md:w-auto md:min-w-[120px]")}
              >
                {peopleLabel(people)}
              </FieldTrigger>
            </PopoverTrigger>
            <PopoverContent className="w-48 max-h-72 overflow-y-auto p-1" align="start">
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

        <SearchSuggestInput
          value={query}
          onChange={setQuery}
          date={date}
          time={time}
          people={people}
          className="border-t border-slate-200 md:border-t-0"
          inputClassName="rounded-none border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-slate-50 md:rounded-xl md:border md:border-slate-200 md:bg-transparent md:focus-visible:ring-2 md:focus-visible:ring-offset-2 md:focus-visible:bg-transparent placeholder:text-sm max-[360px]:placeholder:text-xs sm:placeholder:text-base"
        />

        <div className="border-t border-slate-200 pt-3 md:border-t-0 md:pt-0 md:contents">
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-xl px-8 md:col-span-full xl:col-auto"
          >
            <HugeiconsIcon icon={Search01Icon} className="h-4 w-4" />
            <span className="font-medium">Search</span>
          </Button>
        </div>
      </div>
    </form>
  );
};

export default ReservationSearchBar;
