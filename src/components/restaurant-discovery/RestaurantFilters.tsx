import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { FilterButton, SortButton } from "@/components/ui/collection-controls";
import { Badge } from "@/components/ui/badge";
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
import {
  countActiveFilters,
  EMPTY_FILTERS,
  PRICE_OPTIONS,
  RATING_OPTIONS,
  type RestaurantFilters as Filters,
} from "@/lib/restaurantDiscovery";

export function SelectFilter({
  label,
  current,
  options,
  onChange,
  clearable = true,
  active = false,
  size = "default",
  kind = "category",
}: {
  label: string;
  current: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
  clearable?: boolean;
  active?: boolean;
  size?: "default" | "sm";
  kind?: "category" | "sort";
}) {
  const [open, setOpen] = useState(false);
  let variant: "default" | "outline" = "outline";
  if (active) {
    variant = "default";
  }
  const selected = options.find((option) => option.value === current)?.label;
  let triggerLabel = label;
  if (selected) {
    triggerLabel = selected;
  }
  let trigger = (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={`${label}: ${triggerLabel}`}
      className="min-w-0 max-w-full"
    >
      <span className="truncate">{triggerLabel}</span>
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0" />
    </Button>
  );
  if (kind === "sort") {
    trigger = (
      <SortButton size={size} aria-label={`${label}: ${triggerLabel}`} title={triggerLabel} />
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
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

function MultiSelectFilter({
  label,
  current,
  options,
  onChange,
}: {
  label: string;
  current: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  let variant: "default" | "outline" = "outline";
  let triggerLabel = label;
  if (current.length > 0) {
    variant = "default";
    triggerLabel = `${label} (${current.length})`;
    if (current.length === 1) {
      triggerLabel = options.find((option) => option.value === current[0])?.label || label;
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          className="min-w-0 max-w-full"
          aria-label={`${label}: ${triggerLabel}`}
        >
          <span className="truncate">{triggerLabel}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        className="max-h-72 w-52 overflow-y-auto p-1"
      >
        <button
          type="button"
          aria-pressed={current.length === 0}
          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-label text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange([])}
        >
          Any {label}
          {current.length === 0 && <HugeiconsIcon icon={Tick02Icon} className="size-4" />}
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={current.includes(option.value)}
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-label text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              let next = [...current, option.value];
              if (current.includes(option.value)) {
                next = current.filter((value) => value !== option.value);
              }
              onChange(next);
            }}
          >
            {option.label}
            {current.includes(option.value) && (
              <HugeiconsIcon icon={Tick02Icon} className="size-4" />
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
  let variant: "default" | "outline" = "outline";
  if (active) {
    variant = "default";
  }
  return (
    <Button
      type="button"
      variant={variant}
      aria-pressed={active}
      onClick={onClick}
      className="shrink-0"
    >
      {children}
    </Button>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
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
  resultCount,
  loading,
  error,
  actions,
}: {
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  cuisines: string[];
  resultCount: number;
  loading: boolean;
  error: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const count = countActiveFilters(filters);
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
      let next = [...previous[key], value];
      if (previous[key].includes(value)) {
        next = previous[key].filter((selected) => selected !== value);
      }
      return { ...previous, [key]: next };
    });
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-5">
        <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex md:flex-1">
          <MultiSelectFilter
            label="Cuisine"
            current={filters.cuisine}
            options={cuisines.map((value) => ({ value, label: value }))}
            onChange={(cuisine) => setFilters((previous) => ({ ...previous, cuisine }))}
          />
          <MultiSelectFilter
            label="Price"
            current={filters.price}
            options={PRICE_OPTIONS.map((value) => ({ value, label: value }))}
            onChange={(price) => setFilters((previous) => ({ ...previous, price }))}
          />
          <MultiSelectFilter
            label="Rating"
            current={filters.minRating.map(String)}
            options={RATING_OPTIONS.map((value) => ({
              value: String(value),
              label: `${value.toFixed(1)}+`,
            }))}
            onChange={(values) =>
              setFilters((previous) => ({ ...previous, minRating: values.map(Number) }))
            }
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
        <div
          role="group"
          aria-label="Restaurant Controls"
          className="flex w-full shrink-0 items-center gap-2 md:ml-auto md:w-auto"
        >
          <SheetTrigger asChild>
            <FilterButton size="default" className="shrink-0">
              Filter
              {count > 0 && (
                <Badge
                  variant="neutral"
                  aria-label={`${count} active filters`}
                  className="min-w-5 justify-center px-1"
                >
                  {count}
                </Badge>
              )}
            </FilterButton>
          </SheetTrigger>
          {actions}
        </div>
        <div className="order-first flex w-full flex-wrap gap-2 md:hidden">
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
            Filter
            {count > 0 && (
              <Badge
                variant="neutral"
                aria-label={`${count} active filters`}
                className="min-w-5 justify-center px-1.5"
              >
                {count}
              </Badge>
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
          Refine restaurants by cuisine, price, rating, and supported services.
        </SheetDescription>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          <FilterGroup label="Cuisine">
            {cuisines.map((cuisine) => (
              <ToggleChip
                key={cuisine}
                active={filters.cuisine.includes(cuisine)}
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
                active={filters.price.includes(price)}
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
                active={filters.minRating.includes(rating)}
                onClick={() =>
                  setFilters((previous) => {
                    let minRating = [...previous.minRating, rating];
                    if (previous.minRating.includes(rating)) {
                      minRating = previous.minRating.filter((value) => value !== rating);
                    }
                    return { ...previous, minRating };
                  })
                }
              >
                {rating.toFixed(1)}+
              </ToggleChip>
            ))}
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
