import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  SlidersHorizontalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  PRICE_OPTIONS,
  RATING_OPTIONS,
  type RestaurantFilters as Filters,
} from "@/lib/restaurantDiscovery";

const CHIP_CLASS =
  "control-md inline-flex min-w-0 items-center justify-center gap-1.5 rounded-control border px-3 text-label font-normal transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const NEUTRAL_CLASS = "border-border bg-background text-ink hover:bg-muted";
const SELECTED_CLASS = "border-primary bg-primary text-primary-foreground";

export function SelectFilter({
  label,
  current,
  options,
  onChange,
  clearable = true,
  active = false,
}: {
  label: string;
  current: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
  clearable?: boolean;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  let stateClass = NEUTRAL_CLASS;
  if (active) {
    stateClass = SELECTED_CLASS;
  }
  const selected = options.find((option) => option.value === current)?.label;
  let triggerLabel = label;
  if (selected) {
    triggerLabel = selected;
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${triggerLabel}`}
          className={cn(CHIP_CLASS, "max-w-full", stateClass)}
        >
          <span className="truncate">{triggerLabel}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-52 overflow-y-auto p-1 data-[state=closed]:animate-none motion-reduce:animate-none"
      >
        {clearable && (
          <button
            type="button"
            aria-pressed={current === null}
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-label text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Any {label}
            {current === null && <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0" />}
          </button>
        )}
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={current === option.value}
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-label text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            <span className="min-w-0 break-words">{option.label}</span>
            {current === option.value && (
              <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  let stateClass = NEUTRAL_CLASS;
  if (active) {
    stateClass = SELECTED_CLASS;
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(CHIP_CLASS, "shrink-0", stateClass)}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-label text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export default function RestaurantFilters({
  filters,
  setFilters,
  cuisines,
  locations,
  resultCount,
  loading,
  error,
}: {
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  cuisines: string[];
  locations: string[];
  resultCount: number;
  loading: boolean;
  error: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const count = countActiveFilters(filters);
  let ratingValue: string | null = null;
  if (filters.minRating !== null) {
    ratingValue = String(filters.minRating);
  }
  let resultWord = "Restaurants";
  if (resultCount === 1) {
    resultWord = "Restaurant";
  }
  let showLabel: ReactNode = `Show ${resultCount} ${resultWord}`;
  if (error) {
    showLabel = "Results Unavailable";
  }
  if (loading) {
    showLabel = (
      <>
        <span className="sr-only">Loading Restaurants</span>
        <Skeleton
          as="span"
          aria-hidden="true"
          className="block h-4 w-28 bg-primary-foreground/20"
        />
      </>
    );
  }
  const selectChip = (key: "cuisine" | "price", value: string) => {
    setFilters((previous) => {
      let next: string | null = value;
      if (previous[key] === value) {
        next = null;
      }
      return { ...previous, [key]: next };
    });
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-5">
        <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
          <SelectFilter
            label="Cuisine"
            current={filters.cuisine}
            active={Boolean(filters.cuisine)}
            options={cuisines.map((value) => ({ value, label: value }))}
            onChange={(cuisine) => setFilters((previous) => ({ ...previous, cuisine }))}
          />
          <SelectFilter
            label="Price"
            current={filters.price}
            active={Boolean(filters.price)}
            options={PRICE_OPTIONS.map((value) => ({ value, label: value }))}
            onChange={(price) => setFilters((previous) => ({ ...previous, price }))}
          />
          <SelectFilter
            label="Rating"
            current={ratingValue}
            active={ratingValue !== null}
            options={RATING_OPTIONS.map((value) => ({
              value: String(value),
              label: `${value.toFixed(1)}+`,
            }))}
            onChange={(value) => {
              let minRating: number | null = null;
              if (value) {
                minRating = Number(value);
              }
              setFilters((previous) => ({ ...previous, minRating }));
            }}
          />
          <SelectFilter
            label="Location"
            current={filters.location}
            active={Boolean(filters.location)}
            options={locations.map((value) => ({ value, label: value }))}
            onChange={(location) => setFilters((previous) => ({ ...previous, location }))}
          />
          <ToggleChip
            active={filters.queue}
            onClick={() => setFilters((previous) => ({ ...previous, queue: !previous.queue }))}
          >
            Queue Available
          </ToggleChip>
          <ToggleChip
            active={filters.reservations}
            onClick={() =>
              setFilters((previous) => ({ ...previous, reservations: !previous.reservations }))
            }
          >
            Reservations Available
          </ToggleChip>
          <ToggleChip
            active={filters.openNow}
            onClick={() => setFilters((previous) => ({ ...previous, openNow: !previous.openNow }))}
          >
            Open Now
          </ToggleChip>
        </div>
        <SheetTrigger asChild>
          <button type="button" className={cn(CHIP_CLASS, NEUTRAL_CLASS, "shrink-0 md:ml-auto")}>
            <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-3.5" />
            <span className="md:hidden">Filters</span>
            <span className="hidden md:inline">All Filters</span>
            {count > 0 && (
              <span
                aria-label={`${count} active filters`}
                className="inline-flex h-badge min-w-5 items-center justify-center rounded-badge bg-primary px-1 text-caption text-primary-foreground"
              >
                {count}
              </span>
            )}
          </button>
        </SheetTrigger>
        <div className="flex flex-wrap gap-2 md:hidden">
          <ToggleChip
            active={filters.openNow}
            onClick={() => setFilters((previous) => ({ ...previous, openNow: !previous.openNow }))}
          >
            Open Now
          </ToggleChip>
          <ToggleChip
            active={filters.queue}
            onClick={() => setFilters((previous) => ({ ...previous, queue: !previous.queue }))}
          >
            Queue Available
          </ToggleChip>
        </div>
      </div>
      <SheetContent
        side="bottom"
        hideClose
        className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <SheetTitle className="flex items-center gap-2">
            Filters
            {count > 0 && (
              <span
                aria-label={`${count} active filters`}
                className="inline-flex h-badge min-w-5 items-center justify-center rounded-badge bg-muted px-1.5 text-caption text-ink"
              >
                {count}
              </span>
            )}
          </SheetTitle>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="control-lg dark:text-foreground dark:hover:bg-muted"
              aria-label="Close Filters"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </Button>
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">
          Refine restaurants by cuisine, price, rating, location, and supported services.
        </SheetDescription>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          <FilterGroup label="Cuisine">
            {cuisines.map((cuisine) => (
              <ToggleChip
                key={cuisine}
                active={filters.cuisine === cuisine}
                onClick={() => selectChip("cuisine", cuisine)}
              >
                {cuisine}
              </ToggleChip>
            ))}
            {cuisines.length === 0 && (
              <p className="text-body text-ink-subtle">No Cuisine Information Available</p>
            )}
          </FilterGroup>
          <FilterGroup label="Price">
            {PRICE_OPTIONS.map((price) => (
              <ToggleChip
                key={price}
                active={filters.price === price}
                onClick={() => selectChip("price", price)}
              >
                {price}
              </ToggleChip>
            ))}
          </FilterGroup>
          <FilterGroup label="Minimum Rating">
            {RATING_OPTIONS.map((rating) => (
              <ToggleChip
                key={rating}
                active={filters.minRating === rating}
                onClick={() =>
                  setFilters((previous) => {
                    let minRating: number | null = rating;
                    if (previous.minRating === rating) {
                      minRating = null;
                    }
                    return { ...previous, minRating };
                  })
                }
              >
                {rating.toFixed(1)}+
              </ToggleChip>
            ))}
          </FilterGroup>
          <FilterGroup label="Location">
            <select
              aria-label="Location"
              value={filters.location ?? ""}
              onChange={(event) =>
                setFilters((previous) => ({ ...previous, location: event.target.value || null }))
              }
              className="control-lg w-full min-w-0 rounded-control border border-input bg-background px-3 text-label text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Locations</option>
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </FilterGroup>
          <fieldset>
            <legend className="mb-2 text-label text-foreground">Availability</legend>
            {(
              [
                { key: "queue", label: "Queue Available" },
                { key: "reservations", label: "Reservations Available" },
                { key: "openNow", label: "Open Now" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex min-h-11 items-center justify-between gap-3">
                <label
                  htmlFor={`${id}-${key}`}
                  className="flex-1 cursor-pointer text-body text-ink"
                >
                  {label}
                </label>
                <Switch
                  id={`${id}-${key}`}
                  checked={filters[key]}
                  onCheckedChange={(checked) =>
                    setFilters((previous) => ({ ...previous, [key]: checked }))
                  }
                />
              </div>
            ))}
            <p className="mt-2 text-caption text-ink-subtle">
              Reservations Available shows restaurants that offer online booking. Table availability
              is checked when booking.
            </p>
          </fieldset>
        </div>
        <div className="discovery-filter-footer flex shrink-0 items-center gap-3 border-t border-border bg-background p-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={count === 0}
            className="shrink-0 px-4 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted"
          >
            Clear All
          </Button>
          <Button
            size="lg"
            disabled={loading || error}
            onClick={() => setOpen(false)}
            className="min-w-0 flex-1 px-2 dark:border-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
          >
            {showLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
