import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App.js";
import NotFound from "../../src/pages/NotFound.js";
import { queryClient } from "../../src/lib/queryClient.js";

vi.mock("../../src/pages/Restaurant", () => ({
  default: function RestaurantRoute() {
    const { businessUsername, locationId } = useParams();
    return <p>{`Restaurant Route: ${businessUsername}/${locationId}`}</p>;
  },
}));

const HEADLINE = /We couldn’t find the page you’re looking for\./;

function emptySession() {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ customer: null, business: null }),
  });
}

function renderAppAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  queryClient.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => emptySession()),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("NotFound page", () => {
  it("shows the headline, the supporting copy, and the dotted seating illustration", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(HEADLINE);
    expect(screen.getByText(/Looks like this seat isn’t on the list\./)).toBeTruthy();
    const illustrations = screen.getAllByTestId("dotted-seating-illustration");

    expect(illustrations.map((svg) => svg.getAttribute("data-variant"))).toEqual([
      "compact",
      "wide",
    ]);
    for (const svg of illustrations) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("sends the reader to the public home route when the action is activated", () => {
    render(
      <MemoryRouter initialEntries={["/a-seat-that-does-not-exist"]}>
        <Routes>
          <Route path="/" element={<p>Home Route</p>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Back to Home" }));

    expect(screen.getByText("Home Route")).toBeTruthy();
  });

  it("points the single action back at the public home route", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Back to Home" });

    expect(link.getAttribute("href")).toBe("/");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("catch-all routing", () => {
  it("renders the 404 page for an unknown route", async () => {
    renderAppAt("/this-route-does-not-exist");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(HEADLINE);
    });
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/");
  });

  it("keeps resolving a known public route", async () => {
    renderAppAt("/terms");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeTruthy();
    });
    expect(screen.queryAllByTestId("dotted-seating-illustration")).toHaveLength(0);
  });

  it("shows the restaurant skeleton while resolving the known dynamic restaurant route", async () => {
    let release = (_response: Response) => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/api/restaurants/")) {
        return pending;
      }
      return emptySession();
    });
    renderAppAt("/demo-restaurant/location-1");

    const skeleton = await screen.findByRole("status", { name: "Loading Restaurant" });
    expect(skeleton.textContent).toBe("");
    expect(skeleton.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Loading Page")).toBeNull();
    expect(screen.queryAllByTestId("dotted-seating-illustration")).toHaveLength(0);
    await act(async () => {
      release(
        Response.json({
          restaurant: { reviews: [], reviewsPage: { nextCursor: null, hasMore: false } },
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Restaurant Route: demo-restaurant/location-1")).toBeTruthy();
    });
    expect(screen.queryByRole("status", { name: "Loading Restaurant" })).toBeNull();
  });
});
