import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Calendar01Icon,
  Cancel01Icon,
  Image01Icon,
  Restaurant02Icon,
  Loading02Icon,
  Location01Icon,
  Search01Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StarIcon,
  Tick02Icon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FieldTrigger, FLAT_FIELD, OptionRow, TimeSelect } from "@/components/TimeSelect";
import { formatTimeLabel } from "@/components/timeOptions";
import { SearchSuggestInput } from "@/components/SearchSuggestInput";
import { api } from "@/lib/api";
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

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  "recommended" | "rating" | "reviews" | "name-az" | "name-za" | "price-asc" | "price-desc";

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
  let count = 0;
  if (f.cuisine) {
    count += 1;
  }
  if (f.price) {
    count += 1;
  }
  if (f.minRating != null) {
    count += 1;
  }
  if (f.location) {
    count += 1;
  }
  if (f.queue) {
    count += 1;
  }
  if (f.reservations) {
    count += 1;
  }
  if (f.openNow) {
    count += 1;
  }
  return count;
}

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

  const [date, setDate] = useState<Date>(() => {
    const dp = searchParams.get("date");
    if (dp && /^\d{4}-\d{2}-\d{2}$/.test(dp)) {
      const d = new Date(`${dp}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        return d;
      }
    }
    return new Date();
  });
  const [time, setTime] = useState<string>(() => {
    const tp = searchParams.get("time");
    if (tp && TIME_OPTIONS.includes(tp)) {
      return tp;
    }
    return getNextTimeSlot();
  });
  const [people, setPeople] = useState(() => {
    const pp = searchParams.get("partySize");
    if (pp && PEOPLE_OPTIONS.includes(pp)) {
      return pp;
    }
    return "2";
  });
  const [inputQuery, setInputQuery] = useState(activeQuery);
  const [dateOpen, setDateOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  useEffect(() => {
    setInputQuery(activeQuery);
  }, [activeQuery]);

  const startOfToday = useMemo(() => {
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
  const searchDateStr = localDateStr(date);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = inputQuery.trim();
    if (!q) {
      return;
    }
    const params = new URLSearchParams();
    params.set("date", searchDateStr);
    params.set("time", time);
    if (people !== "large") {
      params.set("partySize", people);
    }
    navigate(`/search/${encodeURIComponent(q)}?${params.toString()}`);
  };

  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResults(null);
    let url: string;
    if (activeQuery) {
      url = `/api/search/restaurants?query=${encodeURIComponent(activeQuery)}`;
    } else {
      url = `/api/search/restaurants`;
    }
    api(url)
      .then((res: any) => {
        if (cancelled) {
          return;
        }
        let list: SearchResult[];
        if (Array.isArray(res)) {
          list = res;
        } else if (Array.isArray(res?.results)) {
          list = res.results;
        } else {
          list = [];
        }
        setResults(list);
      })
      .catch((e: any) => {
        if (cancelled) {
          return;
        }
        console.error("Search failed:", e);
        setResults([]);
        setError("We couldn’t load restaurants right now. Please try again.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeQuery]);

  const cuisineOptions = useMemo(
    () =>
      Array.from(new Set((results || []).map((r) => r.cuisine).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b),
      ),
    [results],
  );
  const locationOptions = useMemo(
    () =>
      Array.from(new Set((results || []).map(areaLabel).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [results],
  );

  const visible = useMemo(() => {
    if (!results) {
      return [];
    }
    let list = results.filter((r) => {
      if (filters.cuisine && r.cuisine !== filters.cuisine) {
        return false;
      }
      if (filters.price && r.priceRange !== filters.price) {
        return false;
      }
      if (filters.minRating != null && (r.rating ?? 0) < filters.minRating) {
        return false;
      }
      if (filters.location && areaLabel(r) !== filters.location) {
        return false;
      }
      if (filters.queue && !r.queueEnabled) {
        return false;
      }
      if (filters.reservations && !r.reservationsEnabled) {
        return false;
      }
      if (filters.openNow && r.openNow !== true) {
        return false;
      }
      return true;
    });

    const priceRank = (p: string | null) => {
      if (p) {
        return p.length;
      }
      return 0;
    };
    const byName = (a: SearchResult, b: SearchResult) => a.name.localeCompare(b.name);

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
        list = [...list].sort((a, b) => priceRank(a.priceRange) - priceRank(b.priceRange));
        break;
      case "price-desc":
        list = [...list].sort((a, b) => priceRank(b.priceRange) - priceRank(a.priceRange));
        break;
      case "recommended":
      default:
        list = [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
        break;
    }
    return list;
  }, [results, filters, sort]);

  const activeFilterCount = countActiveFilters(filters);
  const filtersApplied = activeFilterCount > 0;
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const summaryText = (() => {
    if (loading) {
      return "Searching restaurants…";
    }
    if (error) {
      if (activeQuery) {
        return `Showing restaurants for "${activeQuery}"`;
      }
      return "Restaurants";
    }
    const count = visible.length;
    if (activeQuery) {
      let resultWord: string;
      if (count === 1) {
        resultWord = "result";
      } else {
        resultWord = "results";
      }
      return `${count} ${resultWord} for "${activeQuery}"`;
    }
    let restaurantWord: string;
    if (count === 1) {
      restaurantWord = "Restaurant";
    } else {
      restaurantWord = "Restaurants";
    }
    return `${count} ${restaurantWord} Available`;
  })();

  let ratingFilterCurrent: string | null;
  if (filters.minRating != null) {
    ratingFilterCurrent = String(filters.minRating);
  } else {
    ratingFilterCurrent = null;
  }

  let ratingFilterDisplayValue: string | undefined;
  if (filters.minRating != null) {
    ratingFilterDisplayValue = `${filters.minRating}+`;
  } else {
    ratingFilterDisplayValue = undefined;
  }

  let resultsContent: React.ReactNode;
  if (loading) {
    resultsContent = <ResultsSkeleton />;
  } else if (error) {
    resultsContent = (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  } else if (visible.length === 0) {
    if (filtersApplied && (results?.length ?? 0) > 0) {
      resultsContent = <NoFilterMatch onClear={clearFilters} />;
    } else {
      resultsContent = <EmptyState query={activeQuery} />;
    }
  } else {
    resultsContent = (
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
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <SEO
        title="Search Restaurants | SeatPing"
        description={CUSTOMER_DESCRIPTION}
        canonical="/search"
      />
      <Header />

      <section className="bg-slate-900 pt-24 pb-5">
        <form onSubmit={submit} className="container mx-auto px-4" aria-label="Search restaurants">
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm max-[360px]:p-2 md:grid md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-center md:gap-3 xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]">
            <div className="flex items-stretch md:contents">
              <div className="flex-1 min-w-0 md:contents">
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <FieldTrigger
                      icon={Calendar01Icon}
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
                  className={cn(FLAT_FIELD, "bg-white md:w-auto md:min-w-[132px]")}
                />
              </div>
            </div>

            <div className="border-t border-slate-200 md:border-t-0 md:contents">
              <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
                <PopoverTrigger asChild>
                  <FieldTrigger
                    icon={UsersRoundIcon}
                    aria-label={`Number of guests: ${peopleLabel(people)}`}
                    className={cn(FLAT_FIELD, "bg-white md:w-auto md:min-w-[120px]")}
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
              value={inputQuery}
              onChange={setInputQuery}
              date={date}
              time={time}
              people={people}
              className="border-t border-slate-200 md:border-t-0"
              inputClassName="rounded-none border-0 bg-white text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-slate-50 max-[360px]:text-xs md:rounded-xl md:border md:border-slate-200 md:text-base md:focus-visible:ring-2 md:focus-visible:ring-offset-2 md:focus-visible:bg-white"
            />

            <div className="border-t border-slate-200 pt-3 md:border-t-0 md:pt-0 md:contents">
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={!inputQuery.trim()}
                className="h-12 w-full rounded-xl md:col-span-full xl:col-auto"
              >
                <HugeiconsIcon icon={Search01Icon} className="h-4 w-4" />
                <span className="font-medium">Search</span>
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
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
              current={ratingFilterCurrent}
              displayValue={ratingFilterDisplayValue}
              options={RATING_OPTIONS.map((r) => ({
                value: String(r.value),
                label: r.label,
              }))}
              onChange={(v) => {
                let nextMinRating: number | null;
                if (v) {
                  nextMinRating = Number(v);
                } else {
                  nextMinRating = null;
                }
                setFilters((f) => ({ ...f, minRating: nextMinRating }));
              }}
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
              onClick={() => setFilters((f) => ({ ...f, reservations: !f.reservations }))}
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

          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 md:hidden"
          >
            <HugeiconsIcon icon={SlidersHorizontalIcon} className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs font-medium text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filtersApplied && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </section>

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

      <main className="container mx-auto w-full px-4 py-6 flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-sm font-medium text-slate-700">{summaryText}</h1>
        </div>

        {resultsContent}
      </main>

      <Footer />
    </div>
  );
}

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
  let detailsPath: string | null;
  if (r.businessUsername && r.locationId) {
    detailsPath = `/${encodeURIComponent(r.businessUsername)}/${encodeURIComponent(r.locationId)}`;
  } else {
    detailsPath = null;
  }
  let queuePath: string | null;
  if (r.businessUsername && r.locationId) {
    queuePath = `/queue/${encodeURIComponent(r.businessUsername)}/${encodeURIComponent(r.locationId)}`;
  } else {
    queuePath = null;
  }

  const bookPath = (() => {
    if (!detailsPath) {
      return null;
    }
    const params = new URLSearchParams();
    if (searchDate) {
      params.set("date", searchDate);
    }
    if (searchTime) {
      params.set("time", searchTime);
    }
    if (searchPartySize && searchPartySize !== "large") {
      params.set("partySize", searchPartySize);
    }
    params.set("book", "1");
    return `${detailsPath}?${params.toString()}`;
  })();

  const openDetails = () => {
    if (detailsPath) {
      navigate(detailsPath);
    }
  };

  const subAddress = r.shortAddress || r.city || r.area || r.address || "";

  const cuisinePrice = [r.cuisine, r.priceRange].filter(Boolean).join(" · ");

  let articleRole: string | undefined;
  if (detailsPath) {
    articleRole = "link";
  } else {
    articleRole = undefined;
  }

  let articleTabIndex: number | undefined;
  if (detailsPath) {
    articleTabIndex = 0;
  } else {
    articleTabIndex = undefined;
  }

  let bannerContent: React.ReactNode;
  if (r.bannerImageUrl) {
    bannerContent = (
      <img
        src={r.bannerImageUrl}
        alt={r.name}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
    );
  } else {
    bannerContent = (
      <div className="absolute inset-0 flex items-center justify-center text-slate-300">
        <HugeiconsIcon icon={Image01Icon} className="h-10 w-10" />
      </div>
    );
  }

  let ratingContent: React.ReactNode;
  if (r.reviewCount > 0 && r.rating != null) {
    let reviewWord: string;
    if (r.reviewCount === 1) {
      reviewWord = "review";
    } else {
      reviewWord = "reviews";
    }
    ratingContent = (
      <>
        <Stars rating={r.rating} />
        <span className="font-medium text-slate-700">{r.rating.toFixed(1)}</span>
        <span className="text-slate-500">
          ({r.reviewCount} {reviewWord})
        </span>
      </>
    );
  } else {
    ratingContent = <span className="text-slate-500">No Reviews Yet</span>;
  }

  let bookAction: React.ReactNode;
  if (bookPath && r.reservationsEnabled) {
    bookAction = (
      <Button
        asChild
        onClick={(e) => e.stopPropagation()}
        className="flex-1 min-w-0 justify-center whitespace-nowrap px-3"
      >
        <Link to={bookPath}>
          <HugeiconsIcon icon={Restaurant02Icon} className="h-4 w-4" />
          <span>Book Table</span>
        </Link>
      </Button>
    );
  } else {
    bookAction = !r.reservationsEnabled && (
      <div
        aria-disabled="true"
        title="Reservations unavailable"
        className="flex h-10 flex-1 min-w-0 cursor-not-allowed select-none items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-400 max-[320px]:px-2 max-[320px]:text-xs"
      >
        Reservations Unavailable
      </div>
    );
  }

  return (
    <article
      onClick={openDetails}
      onKeyDown={(e) => {
        if (!detailsPath) {
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails();
        }
      }}
      role={articleRole}
      tabIndex={articleTabIndex}
      className={cn(
        "group rounded-2xl border border-slate-200 bg-white overflow-hidden transition-shadow",
        detailsPath &&
          "cursor-pointer hover:shadow-md focus:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900/20",
      )}
    >
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-[280px] sm:shrink-0 aspect-[16/10] sm:aspect-auto sm:h-auto sm:min-h-[200px] bg-slate-100 relative">
          {bannerContent}
          {r.featured && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-slate-900/90 text-white text-xs font-medium px-2.5 py-1">
              <HugeiconsIcon icon={SparklesIcon} className="h-3 w-3" />
              Featured
            </span>
          )}
        </div>

        <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 truncate">{r.name}</h2>

          <div className="flex items-center gap-2 text-sm">{ratingContent}</div>

          {cuisinePrice && <p className="text-sm text-slate-600">{cuisinePrice}</p>}

          {subAddress && (
            <p className="inline-flex items-center gap-1.5 text-sm text-slate-600">
              <HugeiconsIcon icon={Location01Icon} className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{subAddress}</span>
            </p>
          )}

          {r.description && <p className="text-sm text-slate-600 line-clamp-2">{r.description}</p>}

          <div className="mt-2 flex items-center gap-2 sm:gap-3">
            {bookAction}
            {queuePath && r.queueEnabled && (
              <Button
                asChild
                variant="outline"
                aria-label={`Join queue at ${r.name}`}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 justify-center whitespace-nowrap px-3"
              >
                <Link to={queuePath}>
                  <HugeiconsIcon icon={UsersRoundIcon} className="h-4 w-4" />
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
      {[1, 2, 3, 4, 5].map((i) => {
        let starClassName: string;
        if (i <= filled) {
          starClassName = "fill-amber-400 text-amber-400";
        } else {
          starClassName = "fill-slate-200 text-slate-200";
        }
        return (
          <HugeiconsIcon icon={StarIcon} key={i} className={cn("h-3.5 w-3.5", starClassName)} />
        );
      })}
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
        <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin" /> Loading results…
      </p>
    </div>
  );
}

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
  const selectedLabel = displayValue ?? options.find((o) => o.value === current)?.label ?? null;
  const isActive = current != null && current !== neutralValue;

  let triggerStateClassName: string;
  if (isActive) {
    triggerStateClassName = "border-slate-900 bg-slate-900 text-white";
  } else {
    triggerStateClassName =
      "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  }

  let triggerLabel: string;
  if (current != null && selectedLabel) {
    triggerLabel = `${label}: ${selectedLabel}`;
  } else {
    triggerLabel = label;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            triggerStateClassName,
          )}
        >
          {triggerLabel}
          <HugeiconsIcon icon={ArrowDown01Icon} className="h-3.5 w-3.5 opacity-60" />
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
            {current == null && <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" />}
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
            {current === o.value && <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" />}
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
  let stateClassName: string;
  if (active) {
    stateClassName = "border-slate-900 bg-slate-900 text-white";
  } else {
    stateClassName =
      "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        stateClassName,
      )}
    >
      {children}
    </button>
  );
}

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
  const pill = (active: boolean) => {
    let stateClassName: string;
    if (active) {
      stateClassName = "border-slate-900 bg-slate-900 text-white";
    } else {
      stateClassName = "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
    }
    return cn("rounded-full border px-3 py-1.5 text-sm transition-colors", stateClassName);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl p-0 max-sm:overflow-hidden max-sm:p-0 sm:max-w-md">
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
                    setFilters((f) => {
                      let nextCuisine: string | null;
                      if (f.cuisine === c) {
                        nextCuisine = null;
                      } else {
                        nextCuisine = c;
                      }
                      return { ...f, cuisine: nextCuisine };
                    })
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
                  setFilters((f) => {
                    let nextPrice: string | null;
                    if (f.price === p) {
                      nextPrice = null;
                    } else {
                      nextPrice = p;
                    }
                    return { ...f, price: nextPrice };
                  })
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
                  setFilters((f) => {
                    let nextMinRating: number | null;
                    if (f.minRating === r.value) {
                      nextMinRating = null;
                    } else {
                      nextMinRating = r.value;
                    }
                    return { ...f, minRating: nextMinRating };
                  })
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
                    setFilters((f) => {
                      let nextLocation: string | null;
                      if (f.location === l) {
                        nextLocation = null;
                      } else {
                        nextLocation = l;
                      }
                      return { ...f, location: nextLocation };
                    })
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
              onClick={() => setFilters((f) => ({ ...f, reservations: !f.reservations }))}
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
          <Button className="flex-1" onClick={() => onOpenChange(false)}>
            Show Results
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
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
      <HugeiconsIcon icon={SlidersHorizontalIcon} className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="text-base font-medium text-slate-800">No restaurants match your filters.</p>
      <Button variant="outline" className="mt-4 rounded-full" onClick={onClear}>
        Clear Filters
      </Button>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  let hintText: string;
  if (query) {
    hintText = "Try searching for another restaurant, cuisine, or area.";
  } else {
    hintText = "Try a search above to discover restaurants.";
  }
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <HugeiconsIcon icon={Search01Icon} className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="text-base font-medium text-slate-800">No Restaurants Found</p>
      <p className="mt-1 text-sm text-slate-500">{hintText}</p>
    </div>
  );
}
