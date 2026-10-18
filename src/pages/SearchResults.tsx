import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RestaurantCardSkeleton from "@/components/restaurant-discovery/RestaurantCardSkeleton";
import { ALL_DAY_TIME_OPTIONS } from "@/components/timeOptions";
import RestaurantSearchBar from "@/components/restaurant-discovery/RestaurantSearchBar";
import RestaurantCard from "@/components/restaurant-discovery/RestaurantCard";
import RestaurantFilters, {
  SelectFilter,
} from "@/components/restaurant-discovery/RestaurantFilters";
import { useRestaurantSearch } from "@/hooks/useRestaurantSearch";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  filtersFromSearchParams,
  filterSearchParams,
  pageFromSearchParams,
  restaurantSearchParams,
  searchLocation,
  SORT_OPTIONS,
  sortFromSearchParams,
  RESTAURANT_PAGE_SIZE,
  type RestaurantFilters as Filters,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = query || searchParams.get("query") || "";
  const dateQuery = searchParams.get("date");
  const timeQuery = searchParams.get("time");
  const peopleQuery = searchParams.get("partySize");
  const [date, setDate] = useState(() => dateFromQuery(dateQuery));
  const [time, setTime] = useState(() => timeFromQuery(timeQuery));
  const [people, setPeople] = useState(() => peopleFromQuery(peopleQuery));
  const [inputQuery, setInputQuery] = useState(activeQuery);
  const sort = sortFromSearchParams(searchParams);
  const page = pageFromSearchParams(searchParams);
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  const requestParams = restaurantSearchParams({
    query: activeQuery,
    page,
    sort,
    ...filters,
  }).toString();
  const search = useRestaurantSearch(requestParams);
  const loading = search.isPending || search.isPlaceholderData;
  const error = search.isError;
  const results = search.data?.results ?? [];
  const total = search.data?.total ?? 0;
  const facets = search.data?.facets ?? { cuisines: [], locations: [] };
  const setFilters = (next: SetStateAction<Filters>) => {
    let value: Filters;
    if (typeof next === "function") {
      value = next(filters);
    } else {
      value = next;
    }
    setSearchParams(filterSearchParams(searchParams, value));
  };

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

  const cuisines = facets.cuisines;
  const locations = facets.locations;
  const visible = results;
  const activeCount = countActiveFilters(filters);
  const location = searchLocation(results, activeQuery, filters);
  const resultCount = total;
  const totalPages = Math.ceil(total / RESTAURANT_PAGE_SIZE);
  useEffect(() => {
    const lastPage = Math.max(1, totalPages);
    if (!loading && !error && page > lastPage) {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          next.set("page", String(lastPage));
          return next;
        },
        { replace: true },
      );
    }
  }, [loading, error, page, totalPages, setSearchParams]);
  const changePage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nextPage));
    setSearchParams(params);
  };
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
  if (error) {
    summary = "Restaurants";
  }
  let summaryContent: ReactNode = summary;
  if (loading) {
    summaryContent = (
      <Skeleton as="span" aria-hidden="true" className="block h-5 w-56 max-w-full" />
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = inputQuery.trim();
    const params = new URLSearchParams(searchParams);
    params.delete("query");
    params.delete("page");
    params.set("date", format(date, "yyyy-MM-dd"));
    params.set("time", time);
    params.set("partySize", people);
    let path = "/search";
    if (nextQuery) {
      path += `/${encodeURIComponent(nextQuery)}`;
    }
    navigate(`${path}?${params.toString()}`);
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
          onClick={() => void search.refetch()}
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
      <main className={`${SHELL_CLASS} pt-6 md:pt-8`} aria-busy={loading}>
        <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3 md:mb-6">
          <h2
            aria-live="polite"
            aria-atomic="true"
            className="min-w-0 break-words text-title font-semibold text-foreground"
          >
            {summaryContent}
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
                  const params = new URLSearchParams(searchParams);
                  params.delete("page");
                  params.set("sort", option.key);
                  setSearchParams(params);
                }
              }}
              clearable={false}
            />
          </div>
        </div>
        {content}
        {!loading && !error && totalPages > 1 && (
          <nav
            aria-label="Restaurant Pages"
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
          >
            <Button variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)}>
              Previous
            </Button>
            {paginationPages(page, totalPages).map((number) => (
              <Button
                key={number}
                variant="outline"
                aria-label={`Page ${number}`}
                aria-current={number === page}
                onClick={() => changePage(number)}
              >
                {number}
              </Button>
            ))}
            <span className="text-caption text-ink-subtle">
              Page {page} Of {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => changePage(page + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}

function paginationPages(page: number, total: number): number[] {
  const pages = new Set([1, total]);
  for (let number = Math.max(1, page - 2); number <= Math.min(total, page + 2); number++) {
    pages.add(number);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Loading Restaurants">
      <span className="sr-only">Loading Restaurants</span>
      <div className={GRID_CLASS}>
        {Array.from({ length: 6 }, (_, index) => (
          <RestaurantCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
