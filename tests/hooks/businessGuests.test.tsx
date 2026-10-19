import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessGuests from "../../src/pages/BusinessGuests.js";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/SEO", () => ({
  default: () => null,
  BUSINESS_DESCRIPTION: "Guests",
  BUSINESS_IMAGE: "",
}));
vi.mock("@/lib/businessSession", () => ({
  useBusinessSession: () => ({ currentLocation: { id: "location-1" } }),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { guestCrmOpened: vi.fn(), guestProfileOpened: vi.fn() },
}));

const guest = {
  firstName: null,
  lastName: null,
  phone: "+12025550123",
  normalizedPhone: "+12025550123",
  email: null,
  tags: [],
  totalVisits: 1,
  waitlistVisitCount: 1,
  upcomingReservationCount: 0,
  pastReservationCount: 0,
  noShowCount: 0,
  cancelledCount: 0,
  firstVisitAt: null,
  lastVisitAt: null,
  hasNotes: false,
  returning: false,
  locationId: "location-1",
};
const guests = [
  { ...guest, id: "guest-1", fullName: "Zulu", lastVisitAt: "2026-01-03T12:00:00.000Z" },
  {
    ...guest,
    id: "guest-2",
    fullName: "Bravo",
    totalVisits: 9,
    lastVisitAt: "2026-01-02T12:00:00.000Z",
  },
  { ...guest, id: "guest-3", fullName: "Alpha", lastVisitAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockImplementation((path: string) => {
    if (path === "/api/guests/meta") {
      return Promise.resolve({
        locations: [{ id: "location-1", label: "PIK Avenue" }],
        suggestedTags: ["VIP"],
      });
    }
    return Promise.resolve({ guests });
  });
});

function rowNames() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
}

describe("Guest CRM Toolbar", () => {
  it("replaces the location heading and count with working filter and sort controls", async () => {
    render(<BusinessGuests />);
    await screen.findByRole("table");
    expect(screen.queryByText("Guests At PIK Avenue")).toBeNull();
    expect(screen.queryByText("3 Guests", { exact: true })).toBeNull();
    expect(rowNames()[0]).toContain("Zulu");
    fireEvent.click(screen.getByRole("button", { name: "Sort: Recent Visit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Name (A To Z)" }));
    expect(rowNames()[0]).toContain("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Sort: Name (A To Z)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Most Visits" }));
    expect(rowNames()[0]).toContain("Bravo");
    fireEvent.click(screen.getByRole("button", { name: "Sort: Most Visits" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recent Visit" }));
    expect(rowNames()[0]).toContain("Zulu");
    expect(guests.map((value) => value.fullName)).toEqual(["Zulu", "Bravo", "Alpha"]);
  });

  it("preserves server filters and clears them from the filter panel", async () => {
    render(<BusinessGuests />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Filter", exact: true }));
    const filters = await screen.findByRole("dialog", { name: "Filter" });
    fireEvent.click(within(filters).getByRole("button", { name: "Returning", exact: true }));
    fireEvent.click(within(filters).getByRole("button", { name: "Has Notes", exact: true }));
    fireEvent.click(within(filters).getByRole("button", { name: "VIP", exact: true }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenLastCalledWith(
        "/api/guests?locationId=location-1&type=returning&tags=VIP&hasNotes=true",
      ),
    );
    fireEvent.click(within(filters).getByRole("button", { name: "Clear Filters" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenLastCalledWith("/api/guests?locationId=location-1"),
    );
  });
});
