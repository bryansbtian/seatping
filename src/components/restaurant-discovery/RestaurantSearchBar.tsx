import { useState, type FormEvent } from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon, Search01Icon, UsersRoundIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FieldTrigger, OptionRow, TimeSelect } from "@/components/TimeSelect";
import { ALL_DAY_TIME_OPTIONS } from "@/components/timeOptions";
import { SearchSuggestInput } from "@/components/SearchSuggestInput";

const FIELD_CLASS =
  "h-12 min-w-0 rounded-none border-0 bg-background px-3 text-sm text-foreground shadow-none hover:border-input hover:bg-muted/50 focus:ring-ring/20 data-[state=open]:border-ring max-[360px]:px-2 max-[360px]:text-xs [&_.text-caption]:hidden lg:bg-transparent lg:text-label lg:[&_.text-caption]:block";
const PEOPLE_OPTIONS = [...Array.from({ length: 20 }, (_, i) => String(i + 1)), "large"];

function peopleLabel(value: string): string {
  if (value === "large") {
    return "Larger Party";
  }
  if (value === "1") {
    return "1 Guest";
  }
  return `${value} Guests`;
}

function restorePickerFocus(event: Event) {
  const activeElement = document.activeElement;
  const openPicker = document.querySelector(
    "[data-radix-popper-content-wrapper] [data-state='open']",
  );
  if (
    openPicker ||
    activeElement?.closest("form[role='search'], [data-radix-popper-content-wrapper]")
  ) {
    event.preventDefault();
  }
}

export default function RestaurantSearchBar({
  query,
  onQueryChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  people,
  onPeopleChange,
  onSubmit,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  date: Date;
  onDateChange: (date: Date) => void;
  time: string;
  onTimeChange: (time: string) => void;
  people: string;
  onPeopleChange: (people: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let mobileDateLabel = format(date, "MMM d");
  if (isToday(date)) {
    mobileDateLabel = "Today";
  } else if (isTomorrow(date)) {
    mobileDateLabel = "Tomorrow";
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Search Restaurants"
      role="search"
      className="rounded-2xl border border-input bg-background p-3 shadow-sm max-[360px]:p-2 sm:p-6 lg:rounded-xl lg:p-2 lg:shadow-none"
    >
      <div className="flex min-w-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_200px_136px_144px_108px] lg:items-center lg:gap-0">
        <div className="relative order-3 min-w-0 border-t border-border lg:order-1 lg:border-0 lg:pt-5">
          <span className="pointer-events-none absolute left-9 top-1 hidden text-caption text-ink-subtle lg:block">
            Restaurant, Cuisine Or Area
          </span>
          <SearchSuggestInput
            value={query}
            onChange={onQueryChange}
            date={date}
            time={time}
            people={people}
            inputClassName="h-12 rounded-none border-0 bg-transparent text-body text-foreground shadow-none placeholder:text-sm placeholder:text-ink-subtle focus-visible:bg-muted/50 focus-visible:ring-ring focus-visible:ring-offset-0 max-[360px]:placeholder:text-xs sm:placeholder:text-base lg:h-7 lg:rounded-control lg:placeholder:text-body"
          />
        </div>
        <div className="order-1 flex items-stretch lg:contents">
          <div className="min-w-0 flex-1 lg:order-2 lg:border-l lg:border-border">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <FieldTrigger
                  icon={Calendar01Icon}
                  fieldLabel="Date"
                  aria-label={`Date: ${format(date, "MMM d, yyyy")}`}
                  className={FIELD_CLASS}
                >
                  <span className="lg:hidden">{mobileDateLabel}</span>
                  <span className="hidden lg:inline">{format(date, "MMM d, yyyy")}</span>
                </FieldTrigger>
              </PopoverTrigger>
              <PopoverContent
                onCloseAutoFocus={restorePickerFocus}
                className="w-auto p-0 data-[state=closed]:animate-none motion-reduce:animate-none"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={date}
                  defaultMonth={date}
                  onSelect={(selected) => {
                    if (selected) {
                      onDateChange(selected);
                      setDateOpen(false);
                    }
                  }}
                  disabled={{ before: today }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="min-w-0 flex-1 border-l border-border lg:order-3">
            <TimeSelect
              value={time}
              onChange={onTimeChange}
              options={ALL_DAY_TIME_OPTIONS}
              fieldLabel="Time"
              contentClassName="data-[state=closed]:animate-none motion-reduce:animate-none"
              onCloseAutoFocus={restorePickerFocus}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div className="order-2 min-w-0 border-t border-border lg:order-4 lg:border-l lg:border-t-0">
          <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
            <PopoverTrigger asChild>
              <FieldTrigger
                icon={UsersRoundIcon}
                fieldLabel="Party Size"
                aria-label={`Number of guests: ${peopleLabel(people)}`}
                className={FIELD_CLASS}
              >
                {peopleLabel(people)}
              </FieldTrigger>
            </PopoverTrigger>
            <PopoverContent
              onCloseAutoFocus={restorePickerFocus}
              className="max-h-72 w-48 overflow-y-auto p-1 data-[state=closed]:animate-none motion-reduce:animate-none"
              align="start"
            >
              {PEOPLE_OPTIONS.map((value) => (
                <OptionRow
                  key={value}
                  selected={value === people}
                  onSelect={() => {
                    onPeopleChange(value);
                    setPeopleOpen(false);
                  }}
                >
                  {peopleLabel(value)}
                </OptionRow>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        <div className="order-4 min-w-0 border-t border-border pt-3 lg:order-5 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-xl px-8 lg:control-lg lg:rounded-control lg:px-3 dark:border-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
            Search
          </Button>
        </div>
      </div>
    </form>
  );
}
