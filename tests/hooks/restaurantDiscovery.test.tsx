import { queryClient } from "../../src/lib/queryClient.js";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchResults from "../../src/pages/SearchResults.js";
import { restaurant, SEARCH_RESTAURANTS } from "../helpers/searchRestaurants.js";
import {
  areaLabel,
  filterRestaurants,
  filtersFromSearchParams,
  sortFromSearchParams,
  sortRestaurants,
  type SearchResult,
} from "../../src/lib/restaurantDiscovery.js";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/components/Header", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEO", () => ({ default: () => null, CUSTOMER_DESCRIPTION: "" }));
vi.mock("@/hooks/useSearchSuggestions", () => ({
  useSearchSuggestions: () => ({ suggestions: [], loading: false, error: false }),
}));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="route">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function renderPage(path = "/search/Test%20City?date=2027-10-16&time=19%3A00&partySize=3") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/search" element={<SearchResults />} />
        <Route path="/search/:query" element={<SearchResults />} />
      </Routes>
    </MemoryRouter>,
  );
}

function respondWithRestaurants(restaurants: SearchResult[]) {
  return async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    const results = sortRestaurants(
      filterRestaurants(restaurants, filtersFromSearchParams(params)),
      sortFromSearchParams(params),
    );
    const page = Number(params.get("page") || "1");
    return {
      results: results.slice((page - 1) * 10, page * 10),
      total: results.length,
      page,
      limit: 10,
      totalPages: Math.ceil(results.length / 10),
      hasMore: page * 10 < results.length,
      facets: {
        cuisines: Array.from(new Set(restaurants.flatMap((row) => row.cuisine || []))),
        locations: Array.from(new Set(restaurants.map(areaLabel).filter(Boolean))),
      },
    };
  };
}

beforeEach(() => {
  queryClient.clear();
  apiMock.mockReset().mockImplementation(respondWithRestaurants(SEARCH_RESTAURANTS));
});

async function loadedPage(path?: string) {
  renderPage(path);
  await screen.findByRole("heading", { name: "3 Restaurants In Test City" });
}

describe("restaurant discovery page", () => {
  it("reuses fresh search data when booking selections are submitted without changing the query", async () => {
    await loadedPage();
    const calls = apiMock.mock.calls.length;
    await act(async () => {
      fireEvent.submit(screen.getByRole("search"));
    });
    expect(apiMock).toHaveBeenCalledTimes(calls);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("restores selections on browser history events even when a transition has not committed", async () => {
    await loadedPage();
    fireEvent.click(screen.getByRole("button", { name: "Date: Oct 16, 2027" }));
    fireEvent.click(
      within(screen.getByRole("grid", { name: "October 2027" })).getByRole("gridcell", {
        name: "17",
        exact: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Number of guests: 3 Guests" }));
    fireEvent.click(screen.getByRole("button", { name: "5 Guests", exact: true }));
    const previousUrl = window.location.href;
    try {
      await act(async () => {
        window.history.replaceState(null, "", "/search?date=2027-10-16&time=19%3A00&partySize=3");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(screen.getByRole("button", { name: "Date: Oct 16, 2027" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Number of guests: 3 Guests" })).toBeTruthy();
    } finally {
      window.history.replaceState(null, "", previousUrl);
    }
  });

  it("preserves a larger party in search URLs without passing an invented count to booking", async () => {
    await loadedPage("/search/Test%20City?date=2027-10-16&time=19%3A00&partySize=large");
    expect(screen.getByRole("button", { name: "Number of guests: Larger Party" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Book Table at Bistro Downtown" });
    expect(link.getAttribute("href")).not.toContain("partySize");
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(screen.getByTestId("route").textContent).toContain("partySize=large"),
    );
    expect(screen.getByRole("button", { name: "Number of guests: Larger Party" })).toBeTruthy();
  });

  it("accepts the legacy array response and ignores invalid search selections", async () => {
    apiMock.mockResolvedValue(SEARCH_RESTAURANTS);
    await loadedPage("/search?query=Test%20City&date=2027-02-31&time=99%3A00&partySize=-2");
    expect(screen.getByRole("button", { name: "Number of guests: 2 Guests" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Feb 31|99:00/ })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("does not double decode a literal percent sequence in a search route", async () => {
    renderPage("/search/100%2520Percent");
    await screen.findByRole("heading", { name: "3 Restaurants For “100%20Percent”" });
    expect(apiMock.mock.calls[0][0]).toBe(
      "/api/search/restaurants?version=2&page=1&query=100%2520Percent",
    );
  });

  it("renders API data, metadata, featured state, and truthful missing reviews", async () => {
    await loadedPage();
    const card = screen.getByRole("article", { name: "Bistro Downtown" });
    expect(within(card).getByText("4.7", { exact: true })).toBeTruthy();
    expect(within(card).getByText("(12 Reviews)")).toBeTruthy();
    expect(within(card).getByText("Japanese", { exact: true })).toBeTruthy();
    expect(within(card).getByText("$$", { exact: true })).toBeTruthy();
    expect(within(card).getByText("Main Street")).toBeTruthy();
    expect(within(card).getByText("Featured")).toBeTruthy();
    expect(within(card).getByRole("img").getAttribute("src")).toBe("/test-restaurant.jpg");
    expect(
      within(screen.getByRole("article", { name: "Local Kitchen" })).getByText("No Reviews Yet"),
    ).toBeTruthy();
    expect(apiMock.mock.calls[0][0]).toBe(
      "/api/search/restaurants?version=2&page=1&query=Test+City",
    );
  });

  it("uses globally filtered server totals", async () => {
    apiMock.mockResolvedValueOnce({ results: SEARCH_RESTAURANTS, total: 6 });
    renderPage();
    await screen.findByRole("heading", { name: "6 Restaurants In Test City" });
    fireEvent.click(screen.getAllByRole("button", { name: "Queue Available" })[0]);
    expect(await screen.findByRole("heading", { name: "2 Restaurants In Test City" })).toBeTruthy();
    expect(apiMock.mock.calls.at(-1)?.[0]).toContain("queue=1");
  });

  it("passes date, time, and guest selection to the existing booking route", async () => {
    await loadedPage();
    const link = within(screen.getByRole("article", { name: "Bistro Downtown" })).getByRole(
      "link",
      { name: "Book Table at Bistro Downtown" },
    );
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect(url.pathname).toBe("/bistro/loc-1");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      date: "2027-10-16",
      time: "19:00",
      partySize: "3",
      book: "1",
    });
    expect(
      screen.getByRole("link", { name: "Join Queue at Bistro Downtown" }).getAttribute("href"),
    ).toBe("/queue/bistro/loc-1");
    expect(
      screen.getByRole("button", { name: "Join Queue at Garden Bistro" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Join Queue at Garden Bistro" }).querySelector("svg"),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Reservations Unavailable at Local Kitchen" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Reservations Unavailable at Local Kitchen" })
        .querySelector("svg"),
    ).toBeNull();
  });

  it("shows reservation support on the action without a duplicate note below it", async () => {
    await loadedPage();
    const card = screen.getByRole("article", { name: "Local Kitchen" });
    expect(
      within(card).getByRole("button", { name: "Reservations Unavailable at Local Kitchen" })
        .textContent,
    ).toContain("Reservations Unavailable");
    expect(
      Array.from(card.querySelectorAll("p")).some((paragraph) =>
        paragraph.textContent?.includes("Reservations Unavailable"),
      ),
    ).toBe(false);
  });

  it("disables both actions when a public route is unavailable", async () => {
    apiMock.mockResolvedValue({ results: [restaurant({ businessUsername: null })], total: 1 });
    renderPage();
    const card = await screen.findByRole("article");
    expect(
      within(card)
        .getByRole("button", { name: /Reservations Unavailable/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(card)
        .getByRole("button", { name: /Join Queue/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(within(card).getByText("Virtual Queue Unavailable")).toBeTruthy();
  });

  it("uses image fallback on load failure and does not invent missing metadata", async () => {
    apiMock.mockResolvedValue({
      results: [restaurant({ cuisine: null, priceRange: null, rating: null, reviewCount: 0 })],
      total: 1,
    });
    renderPage();
    const card = await screen.findByRole("article");
    fireEvent.error(within(card).getByRole("img"));
    expect(within(card).getByRole("img", { name: /Photo unavailable/ })).toBeTruthy();
    expect(within(card).queryByText(/Japanese|\$|4.7/)).toBeNull();
  });

  it("searches the typed query and allows discovery with a blank query", async () => {
    await loadedPage();
    fireEvent.change(screen.getByRole("combobox", { name: /Search restaurants/ }), {
      target: { value: "Italian" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(apiMock.mock.calls.at(-1)?.[0]).toBe(
        "/api/search/restaurants?version=2&page=1&query=Italian",
      ),
    );
    expect(screen.getByTestId("route").textContent).toContain(
      "/search/Italian?date=2027-10-16&time=19%3A00&partySize=3",
    );
    fireEvent.change(screen.getByRole("combobox", { name: /Search restaurants/ }), {
      target: { value: "" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(apiMock.mock.calls.at(-1)?.[0]).toBe("/api/search/restaurants?version=2&page=1"),
    );
  });

  it("does not reinterpret restaurant or cuisine queries as locations", async () => {
    renderPage("/search/Japanese");
    expect(
      await screen.findByRole("heading", { name: "3 Restaurants For “Japanese”" }),
    ).toBeTruthy();
    expect(screen.queryByText("Explore Japanese")).toBeNull();
  });

  it("shows skeletons, errors with retry, and successful recovery", async () => {
    let reject: (reason: Error) => void = () => {};
    apiMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    renderPage();
    expect(screen.getByRole("status", { name: "Loading Restaurants" })).toBeTruthy();
    expect(screen.queryByText("Searching Restaurants...")).toBeNull();
    expect(screen.queryByRole("heading", { name: /0 Restaurants/ })).toBeNull();
    await act(async () => reject(new Error("Offline")));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByRole("heading", { name: "3 Restaurants In Test City" })).toBeTruthy();
  });

  it("renders an empty search with an accurate count", async () => {
    apiMock.mockResolvedValue({ results: [], total: 0 });
    renderPage("/search");
    expect(await screen.findByRole("heading", { name: "No Restaurants Found" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "0 Restaurants" })).toBeTruthy();
  });

  it("ignores an outdated search response after navigation", async () => {
    let resolve: (value: unknown) => void = () => {};
    apiMock.mockImplementationOnce(
      () =>
        new Promise((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );
    renderPage();
    fireEvent.change(screen.getByRole("combobox", { name: /Search restaurants/ }), {
      target: { value: "Italian" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await screen.findByRole("heading", { name: "3 Restaurants For “Italian”" });
    await act(async () => resolve({ results: [], total: 0 }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("shows and clears a combined filter empty state", async () => {
    await loadedPage();
    fireEvent.click(screen.getByRole("button", { name: "Cuisine: Cuisine" }));
    fireEvent.click(screen.getByRole("button", { name: "Italian", exact: true }));
    fireEvent.click(screen.getAllByRole("button", { name: "Queue Available" })[0]);
    expect(
      await screen.findByRole("heading", { name: "No Restaurants Match Your Filters" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
  });
});

describe("shared restaurant filters", () => {
  it("applies cuisine, price, rating, location, and availability in the sheet and resets all", async () => {
    await loadedPage();
    fireEvent.click(screen.getByRole("button", { name: /FiltersAll Filters/ }));
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Japanese", exact: true }));
    fireEvent.click(within(sheet).getByRole("button", { name: "$$", exact: true }));
    fireEvent.click(within(sheet).getByRole("button", { name: "4.5+", exact: true }));
    fireEvent.change(within(sheet).getByRole("combobox", { name: "Location" }), {
      target: { value: "Downtown" },
    });
    for (const name of ["Queue Available", "Reservations Available", "Open Now"]) {
      fireEvent.click(within(sheet).getByRole("switch", { name }));
    }
    expect(within(sheet).getByLabelText("7 active filters")).toBeTruthy();
    expect(await within(sheet).findByRole("button", { name: "Show 1 Restaurant" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Clear All" }));
    expect(await within(sheet).findByRole("button", { name: "Show 3 Restaurants" })).toBeTruthy();
    expect(within(sheet).queryByLabelText(/active filters/)).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Show 3 Restaurants" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull());
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
});

describe("database-backed discovery pagination", () => {
  const restaurants = Array.from({ length: 23 }, (_, index) =>
    restaurant({
      locationId: `location-${index}`,
      name: `Restaurant ${String(index).padStart(2, "0")}`,
      featured: false,
      cuisine: "Japanese",
      city: "City",
      area: "Common",
    }),
  );

  beforeEach(() => apiMock.mockImplementation(respondWithRestaurants(restaurants)));

  it("shows ten cards on each complete page and three on the last page with numbered navigation", async () => {
    renderPage("/search?date=2027-10-16&time=19%3A00&partySize=3");
    await screen.findByRole("heading", { name: "23 Restaurants" });
    expect(screen.getAllByRole("article")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("article", { name: "Restaurant 10" });
    expect(screen.getAllByRole("article")).toHaveLength(10);
    expect(screen.getByTestId("route").textContent).toContain("page=2");
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    await screen.findByRole("article", { name: "Restaurant 20" });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Page 3 Of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByRole("article", { name: "Restaurant 10" });
  });

  it("restores page, filters, and sorting on browser back and forward navigation", async () => {
    renderPage(
      "/search?date=2027-10-16&time=19%3A00&partySize=3&sort=name-za&cuisine=Japanese&page=2",
    );
    await screen.findByRole("article", { name: "Restaurant 12" });
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    await screen.findByRole("article", { name: "Restaurant 00" });
    fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
    await screen.findByRole("article", { name: "Restaurant 12" });
    expect(screen.getByTestId("route").textContent).toContain(
      "sort=name-za&cuisine=Japanese&page=2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    await screen.findByRole("article", { name: "Restaurant 00" });
    expect(screen.getByTestId("route").textContent).toContain("page=3");
  });

  it("uses complete matching-set facets and resets to page one when filters change", async () => {
    const catalog = restaurants.map((row, index) => ({ ...row, cuisine: row.cuisine }));
    catalog[22] = { ...catalog[22], cuisine: "Rare Cuisine", area: "Rare District" };
    apiMock.mockImplementation(respondWithRestaurants(catalog));
    renderPage("/search?page=2&sort=name-az&date=2027-10-16&time=19%3A00&partySize=large");
    await screen.findByRole("article", { name: "Restaurant 10" });
    fireEvent.click(screen.getByRole("button", { name: "Cuisine: Cuisine" }));
    fireEvent.click(screen.getByRole("button", { name: "Rare Cuisine", exact: true }));
    await screen.findByRole("heading", { name: "1 Restaurant" });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Restaurant 22" })).toBeTruthy();
    expect(screen.getByTestId("route").textContent).not.toContain("page=");
    expect(screen.getByTestId("route").textContent).toContain("partySize=large");
    expect(screen.getByTestId("route").textContent).toContain("sort=name-az");
  });

  it("resets pagination when the query or sort changes and retains existing booking selections", async () => {
    renderPage("/search?page=2&cuisine=Japanese&date=2027-10-16&time=19%3A00&partySize=3");
    await screen.findByRole("article", { name: "Restaurant 10" });
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Recommended" }));
    fireEvent.click(screen.getByRole("button", { name: "Name Z-A", exact: true }));
    await screen.findByRole("article", { name: "Restaurant 22" });
    expect(screen.getByTestId("route").textContent).not.toContain("page=");
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await screen.findByRole("article", { name: "Restaurant 12" });
    fireEvent.change(screen.getByRole("combobox", { name: /Search restaurants/ }), {
      target: { value: "new query" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await screen.findByRole("article", { name: "Restaurant 22" });
    expect(screen.getByTestId("route").textContent).toContain("/search/new%20query?");
    expect(screen.getByTestId("route").textContent).not.toContain("page=");
    expect(screen.getByTestId("route").textContent).toContain("cuisine=Japanese");
    expect(screen.getByTestId("route").textContent).toContain("partySize=3");
  });

  it("ignores an older page response when a newer page completes first", async () => {
    let finish: (value: unknown) => void = () => {};
    const responder = respondWithRestaurants(restaurants);
    apiMock.mockImplementation((url: string) => {
      if (new URL(url, "http://localhost").searchParams.get("page") === "2") {
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return responder(url);
    });
    renderPage("/search");
    await screen.findByRole("article", { name: "Restaurant 00" });
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
    await screen.findByRole("article", { name: "Restaurant 00" });
    await act(async () => finish(await responder("/api/search/restaurants?version=2&page=2")));
    expect(screen.queryByRole("article", { name: "Restaurant 10" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(10);
  });

  it("recovers an out-of-range page when the catalog shrinks", async () => {
    renderPage("/search?page=99");
    await screen.findByRole("article", { name: "Restaurant 20" });
    expect(screen.getByTestId("route").textContent).toContain("page=3");
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
});
