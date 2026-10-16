import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestaurantProfile } from "../../shared/restaurantProfile.js";
import { useSession, useCustomerContact } from "../../src/hooks/useSession.js";
import { useMyReview } from "../../src/hooks/useMyReview.js";
import { useRestaurantSearch } from "../../src/hooks/useRestaurantSearch.js";
import { useRestaurantProfile } from "../../src/hooks/useRestaurantProfile.js";
import { useRestaurantReviews } from "../../src/hooks/useRestaurantReviews.js";
import { useBookingAvailability, prefetchBooking } from "../../src/hooks/useBooking.js";
import { useFeaturedRestaurants } from "../../src/hooks/useFeaturedRestaurants.js";
import {
  queryClient,
  resetSessionQueries,
  invalidateRestaurantData,
  invalidateRestaurantConfiguration,
} from "../../src/lib/queryClient.js";
import { queryKeys } from "../../src/lib/queryKeys.js";

function response(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function session(customerId: string | null) {
  let customer = null;
  if (customerId) {
    customer = { name: customerId };
  }
  return { customerId, customer, business: { name: "Business Session" } };
}

const profile: RestaurantProfile = {
  businessUsername: "bistro",
  businessName: "Bistro",
  locationId: "loc-1",
  name: "Bistro",
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
  bannerImageUrl: null,
  photos: [],
  menu: [],
  menuUrl: null,
  rating: 4.5,
  reviewCount: 11,
  reviews: Array.from({ length: 10 }, (_, index) => ({
    id: `review-${index}`,
    rating: 4,
    createdAt: "2026-10-15T00:00:00Z",
  })),
  reviewsPage: { nextCursor: "cursor-10", hasMore: true },
  queueEnabled: true,
  reservationsEnabled: true,
};

beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("shared session queries", () => {
  it("deduplicates concurrent session consumers and preserves simultaneous business cookies", async () => {
    vi.mocked(fetch).mockImplementation(async () => response(session("customer-a")));
    const first = renderHook(() => useSession());
    const second = renderHook(() => useSession());
    await waitFor(() => expect(first.result.current?.customerId).toBe("customer-a"));
    expect(second.result.current?.business?.name).toBe("Business Session");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");
  });

  it("shares narrow customer contact and scoped review queries under the resolved account", async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path) === "/auth/session") {
        return response(session("customer-a"));
      }
      if (String(path) === "/auth/me?view=contact") {
        return response({
          user: { id: "customer-a", name: "Customer", email: "example@invalid.test" },
        });
      }
      return response({ reviews: [{ id: "own-review", locationId: "loc-1" }] });
    });
    const first = renderHook(() => ({
      contact: useCustomerContact(),
      review: useMyReview("loc-1"),
    }));
    const second = renderHook(() => useCustomerContact());
    await waitFor(() => expect(first.result.current.review.data?.id).toBe("own-review"));
    expect(first.result.current.contact.data?.id).toBe("customer-a");
    expect(second.result.current.data?.id).toBe("customer-a");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(queryClient.getQueryData(queryKeys.myReview("customer-a", "loc-1"))).toEqual({
      id: "own-review",
      locationId: "loc-1",
    });
  });

  it("does not request contact or private review history for anonymous consumers", async () => {
    vi.mocked(fetch).mockImplementation(async () => response(session(null)));
    const view = renderHook(() => ({
      contact: useCustomerContact(),
      review: useMyReview("loc-1"),
    }));
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.session)).toBeDefined());
    expect(view.result.current.contact.data).toBeUndefined();
    expect(view.result.current.review.data).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched contact identity", async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path) === "/auth/session") {
        return response(session("customer-a"));
      }
      return response({ user: { id: "customer-b", name: "Other", email: "other@invalid.test" } });
    });
    const view = renderHook(() => useCustomerContact());
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data).toBeNull();
  });

  it("clears old account data before publishing a changed session", async () => {
    let customerId = "customer-a";
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path) === "/auth/session") {
        return response(session(customerId));
      }
      return response({
        user: { id: customerId, name: customerId, email: "example@invalid.test" },
      });
    });
    const view = renderHook(() => ({ session: useSession(), contact: useCustomerContact() }));
    await waitFor(() => expect(view.result.current.contact.data?.id).toBe("customer-a"));
    customerId = "customer-b";
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    });
    await waitFor(() => expect(view.result.current.contact.data?.id).toBe("customer-b"));
    expect(view.result.current.session?.customerId).toBe("customer-b");
    expect(queryClient.getQueryData(queryKeys.contact("customer-a"))).toBeUndefined();
  });

  it("fails closed and removes private account data on session failure", async () => {
    queryClient.setQueryData(queryKeys.session, session("customer-a"));
    queryClient.setQueryData(queryKeys.contact("customer-a"), { id: "customer-a" });
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const view = renderHook(() => useSession());
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    });
    await waitFor(() => expect(view.result.current?.customer).toBeNull());
    expect(queryClient.getQueryData(queryKeys.contact("customer-a"))).toBeUndefined();
  });

  it("aborts old private requests and discards their late responses across account changes", async () => {
    let customerId = "customer-a";
    let finishOld = (_value: Response) => {};
    let oldSignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation(async (path, init) => {
      if (String(path) === "/auth/session") {
        return response(session(customerId));
      }
      if (customerId === "customer-a") {
        oldSignal = init?.signal;
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      }
      return response({ user: { id: "customer-b", name: "New", email: "new@invalid.test" } });
    });
    const view = renderHook(() => ({ session: useSession(), contact: useCustomerContact() }));
    await waitFor(() => expect(oldSignal).toBeInstanceOf(AbortSignal));
    customerId = "customer-b";
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    });
    await waitFor(() => expect(view.result.current.contact.data?.id).toBe("customer-b"));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      finishOld(response({ user: { id: "customer-a", name: "Old", email: "old@invalid.test" } }));
    });
    expect(view.result.current.contact.data?.id).toBe("customer-b");
    expect(queryClient.getQueryData(queryKeys.contact("customer-a"))).toBeUndefined();
  });

  it("broadcasts an identifier-free auth change and retains public data on logout", async () => {
    queryClient.setQueryData(queryKeys.contact("customer-a"), { id: "customer-a" });
    queryClient.setQueryData(queryKeys.featured, [{ locationId: "public-location" }]);
    await resetSessionQueries();
    expect(queryClient.getQueryData(queryKeys.contact("customer-a"))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.featured)).toEqual([
      { locationId: "public-location" },
    ]);
    expect(localStorage.getItem("seatping:session-change")).toMatch(/^\d+:[\d.]+$/);
  });

  it("refreshes once for a cross-tab auth notification with multiple subscribers", async () => {
    vi.mocked(fetch).mockImplementation(async () => response(session("customer-a")));
    renderHook(() => ({ first: useSession(), second: useSession() }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "seatping:session-change", newValue: "changed" }),
      );
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});

describe("public query reuse and freshness", () => {
  it.each([{}, { featured: null }, { featured: {} }])(
    "defaults missing or malformed featured results to an empty list: %j",
    async (body) => {
      vi.mocked(fetch).mockResolvedValue(response(body));
      const view = renderHook(() => useFeaturedRestaurants());

      await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
      expect(view.result.current.data).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/featured-restaurants");
    },
  );

  it("defaults missing booking data without inventing settings or slots", async () => {
    vi.mocked(fetch).mockImplementation(async () => response({}));

    await prefetchBooking("bistro", "loc-1", "2027-10-16", 2);

    expect(queryClient.getQueryData(queryKeys.settings("bistro", "loc-1"))).toBeNull();
    expect(
      queryClient.getQueryData(queryKeys.availability("bistro", "loc-1", "2027-10-16", 2)),
    ).toEqual({ slots: [], availability: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { date: "", partySize: 2 },
    { date: "2027-10-16", partySize: "larger" as const },
  ])("prefetches only settings without a supported slot query: %j", async ({ date, partySize }) => {
    vi.mocked(fetch).mockImplementation(async () => response({ settings: null }));

    await prefetchBooking("bistro", "loc-1", date, partySize);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/reservations/bistro/loc-1/settings");
    expect(queryClient.getQueryData(queryKeys.settings("bistro", "loc-1"))).toBeNull();
    expect(
      queryClient.getQueryData(queryKeys.availability("bistro", "loc-1", date, partySize)),
    ).toBeUndefined();
  });

  it("hydrates review pages before enabling the observer when a slow profile arrives", async () => {
    let finish = (_value: Response) => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderHook(() => {
      const restaurant = useRestaurantProfile("bistro", "loc-1");
      const reviews = useRestaurantReviews("bistro", "loc-1", restaurant.data);
      return { restaurant, reviews };
    });
    expect(view.result.current.reviews.data).toBeUndefined();
    await act(async () => {
      finish(response({ restaurant: profile }));
    });
    await waitFor(() =>
      expect(view.result.current.reviews.data?.pages[0].reviews).toHaveLength(10),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("?version=2");
  });
  it("deduplicates profile and featured consumers without moving data into HTTP caches", async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path).includes("featured")) {
        return response({ featured: [{ locationId: "loc-1" }] });
      }
      return response({ restaurant: profile });
    });
    const first = renderHook(() => ({
      profile: useRestaurantProfile("bistro", "loc-1"),
      featured: useFeaturedRestaurants(),
    }));
    renderHook(() => ({
      profile: useRestaurantProfile("bistro", "loc-1"),
      featured: useFeaturedRestaurants(),
    }));
    await waitFor(() => expect(first.result.current.profile.data?.name).toBe("Bistro"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("seeds the first ten review rows and only fetches another cursor on demand", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      response({
        reviews: [{ id: "review-11", rating: 5, createdAt: "2026-10-14T00:00:00Z" }],
        nextCursor: null,
        hasMore: false,
        totalReviews: 11,
        avgRating: 4.5,
      }),
    );
    const view = renderHook(() => useRestaurantReviews("bistro", "loc-1", profile));
    expect(view.result.current.data?.pages[0].reviews).toHaveLength(10);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    await waitFor(() => expect(view.result.current.data?.pages).toHaveLength(2));
    expect(view.result.current.data?.pages[0].totalReviews).toBe(11);
    expect(view.result.current.hasNextPage).toBe(false);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("cursor=cursor-10");
  });

  it("uses previous-page placeholders without letting slow older queries overwrite the latest key", async () => {
    let finish = (_value: Response) => {};
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path).includes("page=2")) {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return response({ results: [{ locationId: String(path) }], total: 21 });
    });
    const view = renderHook(({ params }) => useRestaurantSearch(params), {
      initialProps: { params: "version=2&page=1" },
    });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    view.rerender({ params: "version=2&page=2" });
    expect(view.result.current.isPlaceholderData).toBe(true);
    view.rerender({ params: "version=2&page=3" });
    await waitFor(() => expect(view.result.current.isPlaceholderData).toBe(false));
    await act(async () => {
      finish(response({ results: [{ locationId: "stale" }], total: 21 }));
    });
    expect(view.result.current.data?.results[0].locationId).toContain("page=3");
  });

  it("shares prefetched booking requests and refreshes advisory availability once stale", async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path).endsWith("settings")) {
        return response({ settings: { maxPartySize: 10 } });
      }
      return response({
        slots: [{ time: "18:00", available: true }],
        availability: { status: "available" },
      });
    });
    await prefetchBooking("bistro", "loc-1", "2027-10-16", 2);
    const view = renderHook(() => useBookingAvailability("bistro", "loc-1", "2027-10-16", 2));
    expect(view.result.current.data?.slots[0].available).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    queryClient.setQueryData(
      queryKeys.availability("bistro", "loc-1", "2027-10-16", 2),
      view.result.current.data,
      { updatedAt: Date.now() - 6_000 },
    );
    renderHook(() => useBookingAvailability("bistro", "loc-1", "2027-10-16", 2));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });

  it("does not fetch unsupported services or invented larger-party availability", async () => {
    renderHook(() => useBookingAvailability("bistro", "loc-1", "2027-10-16", 2, false));
    renderHook(() => useBookingAvailability("bistro", "loc-1", "2027-10-16", "larger"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invalidates public restaurant and booking configuration without invalidating private accounts", async () => {
    for (const key of [
      queryKeys.search("version=2"),
      queryKeys.featured,
      queryKeys.suggestions("bistro"),
      queryKeys.settings("bistro", "loc-1"),
      queryKeys.availability("bistro", "loc-1", "2026-10-16", 2),
      queryKeys.session,
      queryKeys.contact("customer-a"),
    ]) {
      queryClient.setQueryData(key, {});
    }
    await invalidateRestaurantConfiguration();
    for (const query of queryClient.getQueryCache().getAll()) {
      expect(query.state.isInvalidated).toBe(query.queryKey[0] === "public");
    }
  });

  it("invalidates rating, review, profile and discovery caches after mutations", async () => {
    for (const key of [
      queryKeys.profile("bistro", "loc-1"),
      queryKeys.reviews("bistro", "loc-1"),
      queryKeys.featured,
      queryKeys.search("version=2"),
      queryKeys.myReview("customer-a", "loc-1"),
    ]) {
      queryClient.setQueryData(key, {});
    }
    await invalidateRestaurantData("bistro", "loc-1");
    for (const query of queryClient.getQueryCache().getAll()) {
      expect(query.state.isInvalidated).toBe(true);
    }
  });
});
