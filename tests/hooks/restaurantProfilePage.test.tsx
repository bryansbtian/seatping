import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  RestaurantProfile,
  RestaurantReview,
  RestaurantReviewPage,
} from "../../shared/restaurantProfile.js";
import RestaurantPage from "../../src/pages/Restaurant.js";

const state = vi.hoisted(() => ({
  profile: undefined as RestaurantProfile | undefined,
  pages: [] as RestaurantReviewPage[],
  own: null as RestaurantReview | null,
  hasNextPage: true,
  busy: false,
  failed: false,
  customer: false,
  customerId: "customer-1",
  api: vi.fn(),
  toast: vi.fn(),
  fetchNextPage: vi.fn(),
  invalidate: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("@/hooks/useRestaurantProfile", () => ({
  useRestaurantProfile: () => ({ data: state.profile, isPending: !state.profile, error: null }),
}));
vi.mock("@/hooks/useRestaurantReviews", () => ({
  useRestaurantReviews: () => ({
    data: { pages: state.pages },
    hasNextPage: state.hasNextPage,
    isFetchingNextPage: state.busy,
    isError: state.failed,
    fetchNextPage: state.fetchNextPage,
  }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ customer: state.customer, business: null, customerId: state.customerId }),
}));
vi.mock("@/hooks/useMyReview", () => ({ useMyReview: () => ({ data: state.own }) }));
vi.mock("@/hooks/useBooking", () => ({ prefetchBookingSettings: state.prefetch }));
vi.mock("@/lib/queryClient", () => ({ invalidateRestaurantData: state.invalidate }));
vi.mock("@/lib/api", () => ({ api: state.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/components/Header", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEO", () => ({ default: () => null }));
vi.mock("@/components/ReservationBooking", () => ({ default: () => <p>Booking Controls</p> }));
vi.mock("@/components/EditReviewDialog", () => ({ EditReviewDialog: () => null }));

function review(index: number): RestaurantReview {
  return {
    id: `review-${index}`,
    customerName: `Diner ${index}`,
    rating: 5,
    createdAt: "2026-10-15T12:00:00.000Z",
  };
}

function page(reviews: RestaurantReview[]): RestaurantReviewPage {
  return { reviews, nextCursor: "next", hasMore: true, totalReviews: 25, avgRating: 5 };
}

function view() {
  return (
    <MemoryRouter initialEntries={["/sample/location-123?date=2026-10-20&partySize=4"]}>
      <Routes>
        <Route path="/:businessUsername/:locationId" element={<RestaurantPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.api.mockReset();
  state.api.mockResolvedValue({ saved: false });
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  state.profile = {
    businessUsername: "sample",
    businessName: "Sample",
    locationId: "location-123",
    name: "Sample",
    shortAddress: null,
    tagline: null,
    description: null,
    cuisineTypes: [],
    priceRange: null,
    currency: null,
    address: "",
    area: null,
    city: null,
    country: null,
    latitude: null,
    longitude: null,
    googleMapsUrl: null,
    phone: null,
    website: null,
    instagram: null,
    openingHours: null,
    bannerImageUrl: "https://images.unsplash.com/hero?w=2400",
    photos: [{ id: "photo-1", url: "https://images.unsplash.com/photo-1" }],
    menu: [],
    menuUrl: null,
    rating: 5,
    reviewCount: 25,
    reviews: Array.from({ length: 10 }, (_, i) => review(i)),
    reviewsPage: { nextCursor: "next", hasMore: true },
    queueEnabled: true,
    reservationsEnabled: true,
  };
  state.pages = [page(state.profile.reviews)];
  state.own = null;
  state.hasNextPage = true;
  state.busy = false;
  state.failed = false;
  state.customer = false;
  state.customerId = "customer-1";
});

describe("public restaurant review and image rendering", () => {
  it("discards and aborts an earlier customer's saved-state lookup after an account switch", async () => {
    state.customer = true;
    let resolveFirst = (_value: { saved: boolean }) => {};
    const first = new Promise<{ saved: boolean }>((resolve) => {
      resolveFirst = resolve;
    });
    state.api.mockReturnValueOnce(first).mockResolvedValue({ saved: false });
    const result = render(view());
    await waitFor(() => expect(state.api).toHaveBeenCalledOnce());
    const firstSignal = state.api.mock.calls[0][1].signal as AbortSignal;
    state.customerId = "customer-2";
    result.rerender(view());
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      resolveFirst({ saved: true });
    });
    expect(
      screen.getByRole("button", { name: "Save", exact: true }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByRole("button", { name: "Saved", exact: true })).toBeNull();
  });

  it("discards an earlier customer's delayed save mutation response", async () => {
    state.customer = true;
    let resolveSave = () => {};
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    state.api.mockImplementation((_path: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return pendingSave;
      }
      return Promise.resolve({ saved: false });
    });
    const result = render(view());
    await waitFor(() => expect(state.api).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    state.customerId = "customer-2";
    result.rerender(view());
    await act(async () => {
      resolveSave();
    });
    expect(
      screen.getByRole("button", { name: "Save", exact: true }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(state.toast).not.toHaveBeenCalled();
  });

  it("initially displays ten reviews and requests the next page only on demand", () => {
    const result = render(view());
    expect(screen.getAllByText(/^Diner \d+$/)).toHaveLength(10);
    expect(state.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load More Reviews" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
    state.pages.push(page(Array.from({ length: 10 }, (_, i) => review(i + 10))));
    result.rerender(view());
    expect(screen.getAllByText(/^Diner \d+$/)).toHaveLength(20);
    expect(screen.getByText("Showing 20 of 25")).toBeTruthy();
    expect(state.prefetch).toHaveBeenCalledWith("sample", "location-123");
  });

  it("blocks overlapping page loads and allows retrying a failed page", () => {
    state.busy = true;
    const result = render(view());
    expect(
      (screen.getByRole("button", { name: "Load More Reviews" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    state.busy = false;
    state.failed = true;
    result.rerender(view());
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load More Reviews" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("pins a customer-owned review outside the first page without displaying eleven initial reviews", async () => {
    state.customer = true;
    state.own = {
      ...review(99),
      customerUsername: "diner99",
      partySize: 4,
      serviceType: "reservation",
    };
    render(view());
    await waitFor(() => expect(screen.getByText("Diner 99")).toBeTruthy());
    expect(screen.getAllByText(/^Diner \d+$/)).toHaveLength(10);
    expect(screen.getByText("Your Review")).toBeTruthy();
    expect(screen.getByText("@diner99")).toBeTruthy();
    expect(screen.getByText("· Party of 4")).toBeTruthy();
    expect(screen.getByText("· Reservation")).toBeTruthy();
    expect(screen.queryByText("Diner 9")).toBeNull();
  });

  it("prioritizes the main hero and lazy loads responsive photos", () => {
    render(view());
    const hero = screen.getByRole("img", { name: "Sample" });
    const photo = screen.getByRole("img", { name: "Restaurant photo" });
    expect(hero.getAttribute("fetchpriority")).toBe("high");
    expect(hero.getAttribute("srcset")).toContain("1920w");
    expect(photo.getAttribute("loading")).toBe("lazy");
    expect(photo.getAttribute("srcset")).toContain("1200w");
  });
});
