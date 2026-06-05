// src/pages/SearchResults.tsx
//
// Public restaurant search results page. Layout inspired by OpenTable but
// styled in SeatPing (navy/slate, rounded cards, no red theme, no map yet).
//
// Routes:
//   /search                — generic browse, no query
//   /search/:query         — path-style query (preferred)
//   /search?query=...      — legacy query-string form (still supported)
import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  MapPin,
  Search as SearchIcon,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  Utensils,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Full-day 30-minute slots so users can pick any time, not just dinner.
const TIME_OPTIONS: string[] = [];
for (let h = 0; h <= 23; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    );
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
  const target = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  // Past the last slot of the day (23:30): wrap to the first slot for next day.
  return TIME_OPTIONS.find((t) => t >= target) ?? TIME_OPTIONS[0];
}

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PEOPLE_OPTIONS: string[] = [
  ...Array.from({ length: 20 }, (_, i) => String(i + 1)),
  "large",
];

function peopleLabel(value: string) {
  if (value === "large") return "Larger Party";
  return `${value} ${value === "1" ? "Guest" : "Guests"}`;
}

type SearchResult = {
  locationId: string;
  businessUsername: string | null;
  businessName: string | null;
  name: string;
  shortAddress: string | null;
  description: string | null;
  tagline: string | null;
  cuisine: string | null;
  priceRange: string | null;
  address: string;
  area: string | null;
  city: string | null;
  bannerImageUrl: string | null;
  rating: number | null;
  reviewCount: number;
  queueEnabled: boolean;
  reservationsEnabled: boolean;
  openNow: boolean | null;
  locationDisplayName: string | null;
  featured: boolean;
};

type SortKey =
  | "recommended"
  | "rating"
  | "reviews"
  | "name-az"
  | "name-za"
  | "price-asc"
  | "price-desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "rating", label: "Highest Rated" },
  { key: "reviews", label: "Most Reviewed" },
  { key: "name-az", label: "Name A-Z" },
  { key: "name-za", label: "Name Z-A" },
  { key: "price-asc", label: "Price Low to High" },
  { key: "price-desc", label: "Price High to Low" },
];

const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$"];

const RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 4.5, label: "4.5+" },
  { value: 4.0, label: "4.0+" },
  { value: 3.5, label: "3.5+" },
];

// A location's filterable "area" label, with safe fallbacks.
function areaLabel(r: SearchResult): string {
  return r.area || r.locationDisplayName || r.city || "";
}

type Filters = {
  cuisine: string | null;
  price: string | null;
  minRating: number | null;
  location: string | null;
  queue: boolean;
  reservations: boolean;
  openNow: boolean;
};

const EMPTY_FILTERS: Filters = {
  cuisine: null,
  price: null,
  minRating: null,
  location: null,
  queue: false,
  reservations: false,
  openNow: false,
};

function countActiveFilters(f: Filters): number {
  return (
    (f.cuisine ? 1 : 0) +
    (f.price ? 1 : 0) +
    (f.minRating != null ? 1 : 0) +
    (f.location ? 1 : 0) +
    (f.queue ? 1 : 0) +
    (f.reservations ? 1 : 0) +
    (f.openNow ? 1 : 0)
  );
}

// Read the active query from either /search/:query or /search?query=...
function useActiveQuery(): string {
  const { query } = useParams();
  const [searchParams] = useSearchParams();
  if (query) {
    try {
      return decodeURIComponent(query);
    } catch {
      return query;
    }
  }
  return searchParams.get("query") || "";
}

export default function SearchResults() {
  const navigate = useNavigate();
  const activeQuery = useActiveQuery();
  const [searchParams] = useSearchParams();

  // Search bar form state. Initialized from the URL params (date/time/partySize)
  // so the values selected on the homepage are preserved here — falling back to
  // defaults (today / next slot / 2) only when a param is missing or invalid.
  // The "next available time" default only runs when no valid `time` param.
  const [date, setDate] = useState<Date>(() => {
    const dp = searchParams.get("date");
    if (dp && /^\d{4}-\d{2}-\d{2}$/.test(dp)) {
      const d = new Date(`${dp}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [time, setTime] = useState<string>(() => {
    const tp = searchParams.get("time");
    return tp && TIME_OPTIONS.includes(tp) ? tp : getNextTimeSlot();
  });
  const [people, setPeople] = useState(() => {
    const pp = searchParams.get("partySize");
    return pp && PEOPLE_OPTIONS.includes(pp) ? pp : "2";
  });
  const [inputQuery, setInputQuery] = useState(activeQuery);
  const [dateOpen, setDateOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  // Keep the input in sync when navigating between /search/:query values.
  useEffect(() => {
    setInputQuery(activeQuery);
  }, [activeQuery]);

  // Disable past dates in the calendar.
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dateLabel = isToday(date)
    ? "Today"
    : isTomorrow(date)
      ? "Tomorrow"
      : format(date, "MMM d");
  const searchDateStr = localDateStr(date);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = inputQuery.trim();
    if (!q) return;
    const params = new URLSearchParams();
    params.set("date", searchDateStr);
    params.set("time", time);
    if (people !== "large") params.set("partySize", people);
    navigate(`/search/${encodeURIComponent(q)}?${params.toString()}`);
  };

  // Result list + filter/sort state.
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Fetch whenever the URL query changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResults(null);
    const url = activeQuery
      ? `/api/search/restaurants?query=${encodeURIComponent(activeQuery)}`
      : `/api/search/restaurants`;
    api(url)
      .then((res: any) => {
        if (cancelled) return;
        // Accept { results: [...] }, a bare array, or anything else (treated as empty).
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.results)
            ? res.results
            : [];
        setResults(list);
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error("Search failed:", e);
        setResults([]);
        setError("We couldn’t load restaurants right now. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeQuery]);

  // Cuisine / location options derived from the loaded results.
  const cuisineOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (results || []).map((r) => r.cuisine).filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [results],
  );
  const locationOptions = useMemo(
    () =>
      Array.from(new Set((results || []).map(areaLabel).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [results],
  );

  // Apply client-side filters then sorting on top of the server results.
  const visible = useMemo(() => {
    if (!results) return [];
    let list = results.filter((r) => {
      if (filters.cuisine && r.cuisine !== filters.cuisine) return false;
      if (filters.price && r.priceRange !== filters.price) return false;
      if (filters.minRating != null && (r.rating ?? 0) < filters.minRating)
        return false;
      if (filters.location && areaLabel(r) !== filters.location) return false;
      if (filters.queue && !r.queueEnabled) return false;
      if (filters.reservations && !r.reservationsEnabled) return false;
      if (filters.openNow && r.openNow !== true) return false;
      return true;
    });

    const priceRank = (p: string | null) => (p ? p.length : 0);
    const byName = (a: SearchResult, b: SearchResult) =>
      a.name.localeCompare(b.name);

    switch (sort) {
      case "rating":
        list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "reviews":
        list = [...list].sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case "name-az":
        list = [...list].sort(byName);
        break;
      case "name-za":
        list = [...list].sort((a, b) => byName(b, a));
        break;
      case "price-asc":
        list = [...list].sort(
          (a, b) => priceRank(a.priceRange) - priceRank(b.priceRange),
        );
        break;
      case "price-desc":
        list = [...list].sort(
          (a, b) => priceRank(b.priceRange) - priceRank(a.priceRange),
        );
        break;
      case "recommended":
      default:
        // Featured first, otherwise keep the server order.
        list = [...list].sort(
          (a, b) => Number(b.featured) - Number(a.featured),
        );
        break;
    }
    return list;
  }, [results, filters, sort]);

  const activeFilterCount = countActiveFilters(filters);
  const filtersApplied = activeFilterCount > 0;
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const summaryText = (() => {
    if (loading) return "Searching restaurants…";
    if (error) {
      // Don't echo the error in the summary — the error card below has it.
      return activeQuery
        ? `Showing restaurants for "${activeQuery}"`
        : "Restaurants";
    }
    const count = visible.length;
    if (activeQuery) {
      return `${count} ${count === 1 ? "result" : "results"} for "${activeQuery}"`;
    }
    return `${count} ${count === 1 ? "restaurant" : "restaurants"} available`;
  })();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <SEO
        title="Search Restaurants | SeatPing"
        description={CUSTOMER_DESCRIPTION}
        canonical="/search"
      />
      <Header />

      {/* Dark SeatPing search bar. Sits flush below the fixed header. */}
      <section className="bg-slate-900 pt-24 pb-5">
        <form
          onSubmit={submit}
          className="container mx-auto px-4"
          aria-label="Search restaurants"
        >
          {/* Mirrors the Home page search bar (ReservationSearchBar):
              - Mobile: one unified white flat panel. Fields are flat rows split
                by thin dividers (carried on wrapper divs, not the fields); Date
                + Time share row 1 via a vertical divider. The dark Search button
                is the last row of the panel.
              - md+: the panel chrome drops away (transparent) and the fields
                become individual white cards on the dark bar — Date/Time/Party
                content-sized (auto), the input filling the minmax(0,1fr) track,
                and Search dropping to its own full-width row (inline at xl). */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm max-[360px]:p-2 md:grid md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-center md:gap-3 xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]">
            {/* Row 1: Date + Time, vertical divider on mobile. */}
            <div className="flex items-stretch md:contents">
              <div className="flex-1 min-w-0 md:contents">
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <FieldTrigger
                      icon={CalendarIcon}
                      aria-label={`Date: ${dateLabel}`}
                      className={cn(FLAT_FIELD, "bg-white md:w-auto md:min-w-[120px]")}
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

              <div className="flex-1 min-w-0 border-l border-slate-200 md:border-l-0 md:contents">
                <TimeSelect
                  value={time}
                  onChange={setTime}
                  options={TIME_OPTIONS}
                  aria-label={`Time: ${formatTimeLabel(time)}`}
                  className={cn(FLAT_FIELD, "bg-white md:w-auto md:min-w-[132px]")}
                />
              </div>
            </div>

            {/* Row 2: Guests. */}
            <div className="border-t border-slate-200 md:border-t-0 md:contents">
              <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
                <PopoverTrigger asChild>
                  <FieldTrigger
                    icon={Users}
                    aria-label={`Number of guests: ${peopleLabel(people)}`}
                    className={cn(FLAT_FIELD, "bg-white md:w-auto md:min-w-[120px]")}
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

            {/* Row 3: Search input + live restaurant suggestions — same
                component (and behavior) as the homepage hero search. */}
            <SearchSuggestInput
              value={inputQuery}
              onChange={setInputQuery}
              date={date}
              time={time}
              people={people}
              className="border-t border-slate-200 md:border-t-0"
              inputClassName="rounded-none border-0 bg-white text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-slate-50 max-[360px]:text-xs md:rounded-xl md:border md:border-slate-200 md:text-base md:focus-visible:ring-2 md:focus-visible:ring-offset-2 md:focus-visible:bg-white"
            />

            {/* Row 4: Search button — dark inside the mobile panel; white card on
                the dark bar at md+. */}
            <div className="border-t border-slate-200 pt-3 md:border-t-0 md:pt-0 md:contents">
              <Button
                type="submit"
                size="lg"
                disabled={!inputQuery.trim()}
                className="h-12 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors md:col-span-full md:bg-white md:text-slate-900 md:hover:bg-slate-100 xl:col-auto"
              >
                <SearchIcon className="h-4 w-4" />
                <span className="font-medium">Search</span>
              </Button>
            </div>
          </div>
        </form>
      </section>

      {/* Filter / sort bar. Inline dropdowns on desktop; a single "Filters"
          sheet on mobile. Sort is always visible. */}
      <section className="border-b border-slate-200 bg-white">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          {/* Sort — always shown */}
          <SelectFilter
            label="Sort"
            current={sort}
            options={SORT_OPTIONS.map((s) => ({
              value: s.key,
              label: s.label,
            }))}
            onChange={(v) => setSort((v as SortKey) || "recommended")}
            clearable={false}
          />

          {/* Desktop inline filters */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {cuisineOptions.length > 0 && (
              <SelectFilter
                label="Cuisine"
                current={filters.cuisine}
                options={cuisineOptions.map((c) => ({ value: c, label: c }))}
                onChange={(v) => setFilters((f) => ({ ...f, cuisine: v }))}
              />
            )}
            <SelectFilter
              label="Price"
              current={filters.price}
              options={PRICE_OPTIONS.map((p) => ({ value: p, label: p }))}
              onChange={(v) => setFilters((f) => ({ ...f, price: v }))}
            />
            <SelectFilter
              label="Rating"
              current={
                filters.minRating != null ? String(filters.minRating) : null
              }
              displayValue={
                filters.minRating != null ? `${filters.minRating}+` : undefined
              }
              options={RATING_OPTIONS.map((r) => ({
                value: String(r.value),
                label: r.label,
              }))}
              onChange={(v) =>
                setFilters((f) => ({ ...f, minRating: v ? Number(v) : null }))
              }
            />
            {locationOptions.length > 0 && (
              <SelectFilter
                label="Location"
                current={filters.location}
                options={locationOptions.map((l) => ({ value: l, label: l }))}
                onChange={(v) => setFilters((f) => ({ ...f, location: v }))}
              />
            )}
            <ToggleChip
              active={filters.queue}
              onClick={() => setFilters((f) => ({ ...f, queue: !f.queue }))}
            >
              Queue Available
            </ToggleChip>
            <ToggleChip
              active={filters.reservations}
              onClick={() =>
                setFilters((f) => ({ ...f, reservations: !f.reservations }))
              }
            >
              Reservations Available
            </ToggleChip>
            <ToggleChip
              active={filters.openNow}
              onClick={() => setFilters((f) => ({ ...f, openNow: !f.openNow }))}
            >
              Open Now
            </ToggleChip>
          </div>

          {/* Mobile filters trigger */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 md:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs font-medium text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Clear — when any filter is active */}
          {filtersApplied && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Mobile filters sheet */}
      <MobileFiltersDialog
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        filters={filters}
        setFilters={setFilters}
        cuisineOptions={cuisineOptions}
        locationOptions={locationOptions}
        onClear={clearFilters}
        activeCount={activeFilterCount}
      />

      {/* Results */}
      <main className="container mx-auto w-full px-4 py-6 flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-sm font-medium text-slate-700">{summaryText}</h1>
        </div>

        {loading ? (
          <ResultsSkeleton />
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : visible.length === 0 ? (
          filtersApplied && (results?.length ?? 0) > 0 ? (
            <NoFilterMatch onClear={clearFilters} />
          ) : (
            <EmptyState query={activeQuery} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((r) => (
              <RestaurantCard
                key={r.locationId}
                r={r}
                searchDate={searchDateStr}
                searchTime={time}
                searchPartySize={people}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card + helpers
// ---------------------------------------------------------------------------

function RestaurantCard({
  r,
  searchDate,
  searchTime,
  searchPartySize,
}: {
  r: SearchResult;
  searchDate: string;
  searchTime: string;
  searchPartySize: string;
}) {
  const navigate = useNavigate();
  const detailsPath =
    r.businessUsername && r.locationId
      ? `/${encodeURIComponent(r.businessUsername)}/${encodeURIComponent(r.locationId)}`
      : null;
  const queuePath =
    r.businessUsername && r.locationId
      ? `/queue/${encodeURIComponent(r.businessUsername)}/${encodeURIComponent(r.locationId)}`
      : null;

  // Book Table carries the search context (date/time/party) into the restaurant
  // page so Plan Your Visit prefills, and `book=1` auto-opens the modal.
  const bookPath = (() => {
    if (!detailsPath) return null;
    const params = new URLSearchParams();
    if (searchDate) params.set("date", searchDate);
    if (searchTime) params.set("time", searchTime);
    if (searchPartySize && searchPartySize !== "large")
      params.set("partySize", searchPartySize);
    params.set("book", "1");
    return `${detailsPath}?${params.toString()}`;
  })();

  const openDetails = () => {
    if (detailsPath) navigate(detailsPath);
  };

  // Address summary: "City" or fall back to the area or full address.
  const subAddress = r.shortAddress || r.city || r.area || r.address || "";

  // Cuisine · Price line.
  const cuisinePrice = [r.cuisine, r.priceRange].filter(Boolean).join(" · ");

  return (
    <article
      onClick={openDetails}
      onKeyDown={(e) => {
        if (!detailsPath) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails();
        }
      }}
      role={detailsPath ? "link" : undefined}
      tabIndex={detailsPath ? 0 : undefined}
      className={cn(
        "group rounded-2xl border border-slate-200 bg-white overflow-hidden transition-shadow",
        detailsPath &&
          "cursor-pointer hover:shadow-md focus:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900/20",
      )}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Image: 280px wide on desktop, full-width on mobile. */}
        <div className="sm:w-[280px] sm:shrink-0 aspect-[16/10] sm:aspect-auto sm:h-auto sm:min-h-[200px] bg-slate-100 relative">
          {r.bannerImageUrl ? (
            <img
              src={r.bannerImageUrl}
              alt={r.name}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
          {r.featured && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-slate-900/90 text-white text-xs font-medium px-2.5 py-1">
              <Sparkles className="h-3 w-3" />
              Featured
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 truncate">
            {r.name}
          </h2>

          {/* Rating */}
          <div className="flex items-center gap-2 text-sm">
            {r.reviewCount > 0 && r.rating != null ? (
              <>
                <Stars rating={r.rating} />
                <span className="font-medium text-slate-700">
                  {r.rating.toFixed(1)}
                </span>
                <span className="text-slate-500">
                  ({r.reviewCount} {r.reviewCount === 1 ? "review" : "reviews"})
                </span>
              </>
            ) : (
              <span className="text-slate-500">No Reviews Yet</span>
            )}
          </div>

          {/* Cuisine · Price */}
          {cuisinePrice && (
            <p className="text-sm text-slate-600">{cuisinePrice}</p>
          )}

          {/* Location */}
          {subAddress && (
            <p className="inline-flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{subAddress}</span>
            </p>
          )}

          {/* Description (clamped to 2 lines) */}
          {r.description && (
            <p className="text-sm text-slate-600 line-clamp-2">
              {r.description}
            </p>
          )}

          {/* Actions — Book Table first, then Join Queue. Same button style as
              the Featured Restaurants cards: filled-dark Book Table + outlined
              Join Queue, default size, matching radius/height/padding/icons. */}
          <div className="mt-2 flex items-center gap-2 sm:gap-3">
            {bookPath && r.reservationsEnabled ? (
              <Button
                asChild
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 justify-center whitespace-nowrap px-3 text-sm bg-slate-900 text-white hover:bg-slate-800"
              >
                <Link to={bookPath}>
                  <Utensils className="h-4 w-4" />
                  <span>Book Table</span>
                </Link>
              </Button>
            ) : (
              !r.reservationsEnabled && (
                <Button
                  disabled
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 justify-center whitespace-nowrap px-3 text-sm"
                  variant="ghost"
                >
                  Reservations Unavailable
                </Button>
              )
            )}
            {queuePath && r.queueEnabled && (
              <Button
                asChild
                variant="outline"
                aria-label={`Join queue at ${r.name}`}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 justify-center whitespace-nowrap px-3 text-sm border-slate-200 text-slate-900 hover:bg-slate-50"
              >
                <Link to={queuePath}>
                  <Users className="h-4 w-4" />
                  <span>Join Queue</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= filled
              ? "fill-amber-400 text-amber-400"
              : "fill-slate-200 text-slate-200",
          )}
        />
      ))}
    </span>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-pulse"
        >
          <div className="flex flex-col sm:flex-row">
            <div className="sm:w-[280px] sm:shrink-0 aspect-[16/10] sm:aspect-auto sm:min-h-[200px] bg-slate-100" />
            <div className="flex-1 p-5 space-y-3">
              <div className="h-5 w-2/3 rounded bg-slate-200" />
              <div className="h-3 w-1/3 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-200" />
              <div className="h-3 w-3/4 rounded bg-slate-200" />
              <div className="h-8 w-40 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
      <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
      </p>
    </div>
  );
}

// Generic single-select dropdown styled like a filter chip. `neutralValue` is a
// selected-but-not-"filtering" value (used by Sort's "recommended" default).
function SelectFilter({
  label,
  current,
  options,
  onChange,
  clearable = true,
  displayValue,
  neutralValue,
}: {
  label: string;
  current: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
  clearable?: boolean;
  displayValue?: string;
  neutralValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    displayValue ?? options.find((o) => o.value === current)?.label ?? null;
  const isActive = current != null && current !== neutralValue;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            isActive
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
          )}
        >
          {current != null && selectedLabel
            ? `${label}: ${selectedLabel}`
            : label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {clearable && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Any {label}
            {current == null && <Check className="h-4 w-4" />}
          </button>
        )}
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {o.label}
            {current === o.value && <Check className="h-4 w-4" />}
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

// Mobile bottom-sheet-style filters. All controls stacked; applies live.
function MobileFiltersDialog({
  open,
  onOpenChange,
  filters,
  setFilters,
  cuisineOptions,
  locationOptions,
  onClear,
  activeCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  cuisineOptions: string[];
  locationOptions: string[];
  onClear: () => void;
  activeCount: number;
}) {
  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-sm transition-colors",
      active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="border-b border-slate-100 p-4 text-left">
          <DialogTitle>Filters</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {cuisineOptions.length > 0 && (
            <FilterGroup label="Cuisine">
              {cuisineOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={pill(filters.cuisine === c)}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      cuisine: f.cuisine === c ? null : c,
                    }))
                  }
                >
                  {c}
                </button>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Price">
            {PRICE_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={pill(filters.price === p)}
                onClick={() =>
                  setFilters((f) => ({ ...f, price: f.price === p ? null : p }))
                }
              >
                {p}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup label="Minimum rating">
            {RATING_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={pill(filters.minRating === r.value)}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    minRating: f.minRating === r.value ? null : r.value,
                  }))
                }
              >
                {r.label}
              </button>
            ))}
          </FilterGroup>

          {locationOptions.length > 0 && (
            <FilterGroup label="Location">
              {locationOptions.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={pill(filters.location === l)}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      location: f.location === l ? null : l,
                    }))
                  }
                >
                  {l}
                </button>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Availability">
            <button
              type="button"
              className={pill(filters.queue)}
              onClick={() => setFilters((f) => ({ ...f, queue: !f.queue }))}
            >
              Queue Available
            </button>
            <button
              type="button"
              className={pill(filters.reservations)}
              onClick={() =>
                setFilters((f) => ({ ...f, reservations: !f.reservations }))
              }
            >
              Reservations Available
            </button>
            <button
              type="button"
              className={pill(filters.openNow)}
              onClick={() => setFilters((f) => ({ ...f, openNow: !f.openNow }))}
            >
              Open Now
            </button>
          </FilterGroup>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 p-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClear}
            disabled={activeCount === 0}
          >
            Clear
          </Button>
          <Button
            className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => onOpenChange(false)}
          >
            Show Results
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-900">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function NoFilterMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <SlidersHorizontal className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="text-base font-medium text-slate-800">
        No restaurants match your filters.
      </p>
      <Button variant="outline" className="mt-4 rounded-full" onClick={onClear}>
        Clear Filters
      </Button>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <SearchIcon className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="text-base font-medium text-slate-800">
        No Restaurants Found
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {query
          ? "Try searching for another restaurant, cuisine, or area."
          : "Try a search above to discover restaurants."}
      </p>
    </div>
  );
}
