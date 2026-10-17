import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerLanding from "../../src/pages/CustomerLanding.js";
import Profile from "../../src/pages/Profile.js";
import ManageReservation from "../../src/pages/ManageReservation.js";
import QueueBusiness from "../../src/pages/QueueBusiness.js";
import { queryClient } from "../../src/lib/queryClient.js";
import { restaurant } from "../helpers/searchRestaurants.js";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/components/Header", () => ({ default: () => <nav>Navigation</nav> }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEO", () => ({ default: () => null, CUSTOMER_DESCRIPTION: "" }));
vi.mock("@/components/ReservationSearchBar", () => ({ default: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("queue_bistro_loc-1");
});

beforeEach(() => {
  queryClient.clear();
  apiMock.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

describe("customer content loading", () => {
  it.each(["available", "failed"])(
    "replaces the queue estimate skeleton when the request is %s",
    async (outcome) => {
      let finish = (_value: unknown) => {};
      let fail = (_error: Error) => {};
      const pending = new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      localStorage.setItem("queue_bistro_loc-1", "test-queue-token");
      apiMock.mockImplementation(async (path: string) => {
        if (path.endsWith("/addresses")) {
          return { addresses: [{ id: "loc-1", businessName: "Bistro", address: "1 Main Street" }] };
        }
        if (path.endsWith("/status")) {
          return {
            position: 2,
            customer: {
              firstName: "Test",
              lastName: "Guest",
              numGuests: 2,
              joinedAt: "2026-10-16T12:00:00Z",
            },
          };
        }
        if (path.endsWith("/eta")) {
          return pending;
        }
        return { user: null };
      });
      render(
        <MemoryRouter initialEntries={["/queue/bistro/loc-1"]}>
          <Routes>
            <Route path="/queue/:businessUsername/:locationId" element={<QueueBusiness />} />
          </Routes>
        </MemoryRouter>,
      );
      const skeleton = await screen.findByRole("status", { name: "Loading Estimated Wait" });
      expect(skeleton.textContent).toBe("");
      expect(screen.queryByText(/Calculating wait time/)).toBeNull();
      let expected = "10-15 Minutes";
      await act(async () => {
        if (outcome === "failed") {
          expected = "Updating Soon";
          fail(new Error("Offline"));
        } else {
          finish({
            eta: {
              status: "ETA",
              displayText: expected,
              estimatedWaitMin: 10,
              estimatedWaitMax: 15,
            },
          });
        }
      });
      expect(await screen.findByText(expected)).toBeTruthy();
      expect(screen.queryByRole("status", { name: "Loading Estimated Wait" })).toBeNull();
    },
  );

  it("replaces featured card skeletons with restaurant links when the request completes", async () => {
    let finish = (_value: unknown) => {};
    apiMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <CustomerLanding />
      </MemoryRouter>,
    );
    const skeleton = screen.getByRole("status", { name: "Loading Featured Restaurants" });
    expect(skeleton.textContent).toBe("");
    expect(skeleton.querySelector("a, button")).toBeNull();
    expect(screen.getByRole("navigation").textContent).toBe("Navigation");
    await act(async () => {
      finish({ featured: [{ ...restaurant(), id: "featured-1" }] });
    });
    expect(await screen.findByRole("link", { name: "View Bistro Downtown" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Join queue at Bistro Downtown" }).getAttribute("href"),
    ).toBe("/queue/bistro/loc-1");
  });

  it("shows an empty state after an empty response rather than leaving skeletons visible", async () => {
    apiMock.mockResolvedValue({ featured: [] });
    render(
      <MemoryRouter>
        <CustomerLanding />
      </MemoryRouter>,
    );
    expect(await screen.findByText("No featured restaurants yet.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the request error instead of an endless skeleton", async () => {
    apiMock.mockRejectedValue(new Error("Offline"));
    render(
      <MemoryRouter>
        <CustomerLanding />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Couldn't load featured restaurants.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    { Page: Profile, name: "Loading Profile" },
    { Page: ManageReservation, name: "Loading Reservation" },
  ])("keeps $name accessible without visible loading text", ({ Page, name }) => {
    apiMock.mockImplementation(() => new Promise(() => {}));
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    const skeleton = screen.getByRole("status", { name });
    expect(skeleton.textContent).toBe("");
    expect(skeleton.querySelector("button, input, a")).toBeNull();
    expect(screen.getByRole("navigation")).toBeTruthy();
  });
});
