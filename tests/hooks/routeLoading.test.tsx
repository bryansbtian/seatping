import { queryClient } from "../../src/lib/queryClient.js";
import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App.js";
import RouteErrorBoundary from "../../src/components/RouteErrorBoundary.js";
import RouteLoading from "../../src/components/RouteLoading.js";
import { lazyRoute } from "../../src/lib/lazyRoute.js";

vi.mock("@/components/AnalyticsRouteTracker", () => ({ default: () => null }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/LanguageProvider", () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/BusinessLayout", () => ({
  default: () => (
    <div>
      <p>Business Navigation</p>
      <Link to="/business/queue">Open Queue</Link>
      <Outlet />
    </div>
  ),
}));
vi.mock("../../src/pages/Login", () => ({ default: () => <h1>Customer Login</h1> }));
vi.mock("../../src/pages/BusinessLogin", () => ({ default: () => <h1>Business Login</h1> }));
vi.mock("../../src/pages/Profile", () => ({ default: () => <h1>Customer Profile</h1> }));
vi.mock("../../src/pages/BusinessOverview", () => ({
  default: () => <h1>Business Overview</h1>,
}));
vi.mock("../../src/pages/BusinessQueue", () => ({ default: () => <h1>Business Queue</h1> }));
vi.mock("../../src/pages/Restaurant", () => ({
  default: function RestaurantRoute() {
    const { pathname, search } = useLocation();
    return <h1>{`${pathname}${search}`}</h1>;
  },
}));

function renderAt(path: string) {
  window.history.replaceState({}, "", path);
  return render(<App />);
}

function preventReportedError(event: ErrorEvent) {
  event.preventDefault();
}

beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.addEventListener("error", preventReportedError);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.removeEventListener("error", preventReportedError);
  window.history.replaceState({}, "", "/");
});

describe("lazy routes", () => {
  it("announces an accessible loading state until a route module resolves", async () => {
    let finish = (_value: { default: () => JSX.Element }) => {};
    const Page = lazyRoute(
      () =>
        new Promise<{ default: () => JSX.Element }>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <Suspense fallback={<RouteLoading />}>
        <Page />
      </Suspense>,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading Page...");
    await act(async () => {
      finish({ default: () => <h1>Loaded Route</h1> });
    });
    expect(screen.getByRole("heading", { name: "Loaded Route" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows recovery controls without exposing an application error", () => {
    function BrokenPage(): JSX.Element {
      throw new Error("Private account details must not appear");
    }
    render(
      <RouteErrorBoundary>
        <BrokenPage />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload Page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back To Home" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText(/Private account details/)).toBeNull();
  });

  it("shows deployment recovery after a repeated chunk failure without reloading again", async () => {
    sessionStorage.setItem("seatping:chunk-reload-at", String(Date.now()));
    const Page = lazyRoute(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module: /assets/old.js")),
    );
    render(
      <RouteErrorBoundary>
        <Suspense fallback={<RouteLoading />}>
          <Page />
        </Suspense>
      </RouteErrorBoundary>,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "This Page Needs An Update" })).toBeTruthy(),
    );
  });

  it("recovers from route errors on navigation without replacing healthy layouts", () => {
    function BrokenPage(): JSX.Element {
      throw new Error("Page failed");
    }
    const view = render(
      <RouteErrorBoundary resetKey="/broken">
        <BrokenPage />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    view.rerender(
      <RouteErrorBoundary resetKey="/healthy">
        <h1>Healthy Page</h1>
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Healthy Page" })).toBeTruthy();
  });

  it("keeps the customer guard pending until session resolution and redirects anonymous users", async () => {
    let finish = (_value: Response) => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderAt("/profile");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Customer Profile" })).toBeNull();
    await act(async () => {
      finish(new Response(JSON.stringify({ customer: null, business: null })));
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Customer Login" })).toBeTruthy(),
    );
    expect(window.location.pathname).toBe("/login");
  });

  it("allows authenticated customer deep links", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ customer: { name: "Customer" }, business: null })),
    );
    renderAt("/profile");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Customer Profile" })).toBeTruthy(),
    );
  });

  it("redirects anonymous business users before showing a private module", async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response(JSON.stringify({ customer: null, business: null })),
    );
    renderAt("/business/queue");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Business Login" })).toBeTruthy(),
    );
    expect(screen.queryByText("Business Navigation")).toBeNull();
  });

  it("keeps the business layout mounted while navigating independent modules", async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response(JSON.stringify({ customer: null, business: { name: "Business" } })),
    );
    renderAt("/business/overview");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Business Overview" })).toBeTruthy(),
    );
    const navigation = screen.getByText("Business Navigation");
    fireEvent.click(screen.getByRole("link", { name: "Open Queue" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Business Queue" })).toBeTruthy(),
    );
    expect(screen.getByText("Business Navigation")).toBe(navigation);
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === "/auth/session")).toHaveLength(
      1,
    );
    expect(
      vi.mocked(fetch).mock.calls.filter(([path]) => path === "/auth/business/me"),
    ).toHaveLength(1);
  });

  it("retains query parameters when redirecting legacy restaurant deep links", async () => {
    renderAt("/restaurants/demo/location-1?date=2026-10-16&party=4");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "/demo/location-1?date=2026-10-16&party=4" }),
      ).toBeTruthy(),
    );
    expect(window.location.pathname).toBe("/demo/location-1");
  });
});
