import { Profiler } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessOverview from "../../src/pages/BusinessOverview.js";
import BusinessSettings from "../../src/pages/BusinessSettings.js";
import {
  BusinessSessionContext,
  type BusinessMe,
  type BusinessSessionValue,
} from "../../src/lib/businessSession.js";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/lib/analytics", () => ({ analytics: { businessDashboardOpened: vi.fn() } }));
vi.mock("recharts", () => ({
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: () => null,
  Legend: () => null,
}));
vi.mock("@/components/charts/BarSeries", () => ({ default: () => null }));
vi.mock("@/components/LanguageSelector", () => ({ default: () => null }));
vi.mock("@/components/LocationManagement", () => ({
  default: ({ onChanged }: { onChanged: (user: BusinessMe) => void }) => (
    <button onClick={() => onChanged({ id: "biz-1", name: "Updated" })}>Save Location</button>
  ),
}));

function context(overrides: Partial<BusinessMe> = {}): BusinessSessionValue {
  const location = {
    id: "loc-1",
    address: "Test Street",
    credits: 123,
    queue: [],
    reservations: [],
  };
  const me: BusinessMe = {
    id: "biz-1",
    username: "test",
    trial: true,
    trialDurationDays: 7,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    locations: [location],
    ...overrides,
  };
  return {
    me,
    setMe: vi.fn(),
    refreshMe: vi.fn(),
    locations: [location],
    currentLocation: location,
    currentLocationIndex: 0,
    selectedLocationId: location.id,
    selectLocation: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset().mockResolvedValue({ etas: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Phase 1 overview trial behavior", () => {
  it.each([0, 123])("bounds expired-trial renders with a server balance of %i", async (credits) => {
    const value = context();
    value.currentLocation!.credits = credits;
    const rendered = vi.fn();
    render(
      <BusinessSessionContext.Provider value={value}>
        <Profiler id="overview" onRender={rendered}>
          <BusinessOverview />
        </Profiler>
      </BusinessSessionContext.Provider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(value.setMe).not.toHaveBeenCalled();
    expect(rendered.mock.calls.length).toBeLessThan(10);
    expect(screen.getAllByText("Credits: 0").length).toBeGreaterThan(0);
    expect(screen.getByText("Trial Expired")).toBeTruthy();
    expect(value.currentLocation!.credits).toBe(credits);
    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));
    expect(value.setMe).not.toHaveBeenCalled();
  });

  it.each([
    { trial: true, createdAt: new Date().toISOString() },
    { trial: true, createdAt: new Date().toISOString(), trialDurationDays: undefined },
    { trial: false },
  ])("preserves server balances for active trials and paid accounts: %o", async (overrides) => {
    const value = context(overrides);
    render(
      <BusinessSessionContext.Provider value={value}>
        <BusinessOverview />
      </BusinessSessionContext.Provider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getAllByText("Credits: 123").length).toBeGreaterThan(0);
    expect(value.setMe).not.toHaveBeenCalled();
    expect(screen.queryByText("Trial Expired")).toBeNull();
  });

  it("reuses provider data in Settings and sends location updates back to it", () => {
    const value = context({ name: "Provider Restaurant" });
    const { rerender } = render(
      <BusinessSessionContext.Provider value={value}>
        <BusinessSettings />
      </BusinessSessionContext.Provider>,
    );
    expect(screen.getByDisplayValue("Provider Restaurant")).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Location" }));
    expect(value.setMe).toHaveBeenCalledWith({ id: "biz-1", name: "Updated" });
    rerender(
      <BusinessSessionContext.Provider value={{ ...value, me: null }}>
        <BusinessSettings />
      </BusinessSessionContext.Provider>,
    );
    expect(screen.queryByDisplayValue("Provider Restaurant")).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
