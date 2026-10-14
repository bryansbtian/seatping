import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_DAY_TIME_OPTIONS } from "@/components/timeOptions";
import RestaurantSearchBar from "@/components/restaurant-discovery/RestaurantSearchBar";
import RestaurantCard from "@/components/restaurant-discovery/RestaurantCard";
import RestaurantFilters, {
  SelectFilter,
} from "@/components/restaurant-discovery/RestaurantFilters";
import { api } from "@/lib/api";
import {
  areaLabel,
  countActiveFilters,
  EMPTY_FILTERS,
  filterRestaurants,
  searchLocation,
  SORT_OPTIONS,
  sortRestaurants,
  type SearchResponse,
  type SearchResult,
  type SortKey,
} from "@/lib/restaurantDiscovery";
import "./SearchResults.css";

const SHELL_CLASS = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10";
const GRID_CLASS = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6";

function dateFromQuery(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime()) && format(date, "yyyy-MM-dd") === value) {
      return date;
    }
  }
  return new Date();
}

function timeFromQuery(value: string | null): string {
  if (value && ALL_DAY_TIME_OPTIONS.includes(value)) {
    return value;
  }
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
  return format(now, "HH:mm");
}

function peopleFromQuery(value: string | null): string {
  if (value === "large") {
    return value;
  }
  if (value && /^([1-9]|1[0-9]|20)$/.test(value)) {
    return value;
  }
  return "2";
}

export default function SearchResults() {
  const navigate = useNavigate();
  const { query } = useParams();
  const [searchParams] = useSearchParams();
  const activeQuery = query || searchParams.get("query") || "";
  const dateQuery = searchParams.get("date");
  const timeQuery = searchParams.get("time");
  const peopleQuery = searchParams.get("partySize");
  const [date, setDate] = useState(() => dateFromQuery(dateQuery));
  const [time, setTime] = useState(() => timeFromQuery(timeQuery));
  const [people, setPeople] = useState(() => peopleFromQuery(peopleQuery));
  const [inputQuery, setInputQuery] = useState(activeQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => setInputQuery(activeQuery), [activeQuery]);
  useEffect(() => setDate(dateFromQuery(dateQuery)), [dateQuery]);
  useEffect(() => setTime(timeFromQuery(timeQuery)), [timeQuery]);
  useEffect(() => setPeople(peopleFromQuery(peopleQuery)), [peopleQuery]);

  useEffect(() => {
    const restoreSelections = () => {
      const params = new URLSearchParams(window.location.search);
      setDate(dateFromQuery(params.get("date")));
      setTime(timeFromQuery(params.get("time")));
      setPeople(peopleFromQuery(params.get("partySize")));
      setInputQuery(activeQuery);
    };
    window.addEventListener("popstate", restoreSelections);
    return () => window.removeEventListener("popstate", restoreSelections);
  }, [activeQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setResults([]);
    setTotal(0);
    let url = "/api/search/restaurants";
    if (activeQuery) {
      url += `?query=${encodeURIComponent(activeQuery)}`;
    }
    api(url, { signal: controller.signal })
      .then((response: SearchResponse | SearchResult[]) => {
        if (controller.signal.aborted) {
          return;
        }
        if (Array.isArray(response)) {
          setResults(response);
          setTotal(response.length);
        } else if (Array.isArray(response.results)) {
          setResults(response.results);
          let resultTotal = response.results.length;
          if (Number.isFinite(response.total) && response.total >= 0) {
            resultTotal = response.total;
          }
          setTotal(resultTotal);
        } else {
          throw new Error("Invalid Search Response");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [activeQuery, retry]);

  const cuisines = useMemo(
    () =>
      Array.from(
        new Set(
          results.flatMap((restaurant) => {
            if (restaurant.cuisine) {
              return [restaurant.cuisine];
            }
            return [];
          }),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [results],
  );
  const locations = useMemo(
    () =>
      Array.from(new Set(results.map(areaLabel).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [results],
  );
  const visible = useMemo(
    () => sortRestaurants(filterRestaurants(results, filters), sort),
    [results, filters, sort],
  );
  const activeCount = countActiveFilters(filters);
  const location = searchLocation(results, activeQuery, filters);
  let resultCount = total;
  if (activeCount > 0) {
    resultCount = visible.length;
  }
  let restaurantWord = "Restaurants";
  if (resultCount === 1) {
    restaurantWord = "Restaurant";
  }
  let summary = `${resultCount} ${restaurantWord}`;
  if (location) {
    summary += ` In ${location}`;
  } else if (activeQuery) {
    summary += ` For “${activeQuery}”`;
  }
  if (loading) {
    summary = "Searching Restaurants...";
  } else if (error) {
    summary = "Restaurants";
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = inputQuery.trim();
    const params = new URLSearchParams({ date: format(date, "yyyy-MM-dd"), time });
    params.set("partySize", people);
    let path = "/search";
    if (nextQuery) {
      path += `/${encodeURIComponent(nextQuery)}`;
    }
    navigate(`${path}?${params.toString()}`);
    if (nextQuery === activeQuery) {
      setRetry((previous) => previous + 1);
    }
  };

  let content: ReactNode;
  if (loading) {
    content = <ResultsSkeleton />;
  } else if (error) {
    content = (
      <div role="alert" className="rounded-xl border border-border bg-card p-8 text-center">
        <h3 className="text-title text-foreground">Unable To Load Restaurants</h3>
        <p className="mt-2 text-body text-ink-subtle">
          We couldn't load restaurants right now. Please try again.
        </p>
        <Button
          variant="outline"
          onClick={() => setRetry((previous) => previous + 1)}
          className="mt-4 dark:border-border dark:bg-background dark:text-foreground"
        >
          Try Again
        </Button>
      </div>
    );
  } else if (visible.length === 0) {
    let title = "No Restaurants Found";
    let hint = "Try searching for another restaurant, cuisine, or area.";
    let icon = Search01Icon;
    if (activeCount > 0) {
      title = "No Restaurants Match Your Filters";
      hint = "Clear your filters or try a different search to find a place you'll love.";
      icon = SlidersHorizontalIcon;
    }
    content = (
      <div className="rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
        <HugeiconsIcon icon={icon} className="mx-auto mb-3 size-8 text-ink-subtle" />
        <h3 className="text-title text-foreground">{title}</h3>
        <p className="mt-2 text-body text-ink-subtle">{hint}</p>
        {activeCount > 0 && (
          <Button
            variant="outline"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="mt-4 dark:border-border dark:bg-background dark:text-foreground"
          >
            Clear Filters
          </Button>
        )}
      </div>
    );
  } else {
    content = (
      <div className={GRID_CLASS}>
        {visible.map((restaurant) => (
          <RestaurantCard
            key={restaurant.locationId}
            restaurant={restaurant}
            date={format(date, "yyyy-MM-dd")}
            time={time}
            people={people}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      data-page-background="discovery"
      className="discovery-page flex min-h-screen flex-col bg-background text-foreground"
    >
      <SEO
        title="Search Restaurants | SeatPing"
        description={CUSTOMER_DESCRIPTION}
        canonical="/search"
      />
      <Header />
      <section className="bg-background pt-24 md:pt-28 md:pb-3">
        <div className={SHELL_CLASS}>
          <div className="mb-6 flex min-w-0 items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Search Restaurants
              </h1>
              <p className="mt-2 text-body text-ink-subtle">
                Find a place you'll love. Book a table or join a virtual queue.
              </p>
            </div>
            {location && (
              <span
                className="hidden max-w-xs truncate pb-0.5 text-label font-normal text-ink md:block"
                title={location}
              >
                Explore {location}
              </span>
            )}
          </div>
          <RestaurantSearchBar
            query={inputQuery}
            onQueryChange={setInputQuery}
            date={date}
            onDateChange={setDate}
            time={time}
            onTimeChange={setTime}
            people={people}
            onPeopleChange={setPeople}
            onSubmit={submit}
          />
          <RestaurantFilters
            filters={filters}
            setFilters={setFilters}
            cuisines={cuisines}
            locations={locations}
            resultCount={resultCount}
            loading={loading}
            error={error}
          />
        </div>
      </section>
      <main className={`${SHELL_CLASS} flex-1 py-6 md:py-8`} aria-busy={loading}>
        <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3 md:mb-6">
          <h2
            aria-live="polite"
            aria-atomic="true"
            className="min-w-0 break-words text-title font-semibold text-foreground"
          >
            {summary}
          </h2>
          <div className="flex max-w-full items-center gap-2">
            <span className="hidden shrink-0 text-caption text-ink-subtle md:inline">Sort By</span>
            <SelectFilter
              label="Sort By"
              current={sort}
              options={SORT_OPTIONS.map(({ key, label }) => ({ value: key, label }))}
              onChange={(value) => {
                const option = SORT_OPTIONS.find(({ key }) => key === value);
                if (option) {
                  setSort(option.key);
                }
              }}
              clearable={false}
            />
          </div>
        </div>
        {content}
      </main>
      <Footer />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Loading Restaurants">
      <span className="sr-only">Loading Restaurants</span>
      <div className={GRID_CLASS}>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
