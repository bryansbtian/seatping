import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessPerformance from "../../src/pages/BusinessPerformance.js";
import type { PerformanceMetrics } from "../../src/lib/performanceApi.js";

const perfApi = vi.hoisted(() => {
  return { fetchPerformance: vi.fn() };
});
vi.mock("@/lib/performanceApi", async () => {
  const actual = await vi.importActual<any>("../../src/lib/performanceApi.ts");
  return { ...actual, fetchPerformance: perfApi.fetchPerformance };
});

const session = vi.hoisted(() => {
  return { currentLocation: { id: "loc-1" } as any };
});
vi.mock("@/lib/businessSession", () => {
  return { useBusinessSession: () => session };
});

function metrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    covers: 14,
    previousCovers: 10,
    coversDelta: 4,
    granularity: "daily",
    hasActivity: true,
    coverBuckets: [
      { start: "2026-08-22", end: "2026-08-22", covers: 2 },
      { start: "2026-08-23", end: "2026-08-23", covers: 0 },
      { start: "2026-08-24", end: "2026-08-24", covers: 12 },
    ],
    tablesUsed: 3,
    tableCount: 5,
    bookedParties: 6,
    noShowCount: 3,
    guestsServed: 12,
    partiesSeated: 4,
    averageQueueWaitMinutes: 11,
    averageTableTurnMinutes: 70,
    queueAbandonmentRate: 0.4,
    reservationNoShowRate: 0.5,
    averagePartySize: 3.5,
    reservationCovers: 6,
    walkInCovers: 8,
    tableUtilization: 0.01,
    perTableUtilization: [
      { tableId: "t1", tableName: "T1", seatedMinutes: 70, utilization: 0.05 },
      { tableId: "t2", tableName: "T2", seatedMinutes: 0, utilization: 0 },
    ],
    peakServiceTimes: [],
    ...overrides,
  };
}

function respond(overrides: Partial<PerformanceMetrics> = {}) {
  perfApi.fetchPerformance.mockResolvedValue({
    range: { preset: "7d", from: "2026-08-22T00:00:00.000Z", to: "2026-08-25T00:00:00.000Z" },
    metrics: metrics(overrides),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.currentLocation = { id: "loc-1" };
  respond();
});

describe("the performance page", () => {
  it("leads with the covers seated for the range", async () => {
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-covers")).textContent).toBe("14");
  });

  it("compares against the prior period with a percentage", async () => {
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-delta")).textContent).toBe("+4 (+40%)");
  });

  it("shows a fall against the prior period", async () => {
    respond({ coversDelta: -3 });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-delta")).textContent).toBe("-3 (-30%)");
  });

  it("still shows a percentage when the prior period was empty", async () => {
    respond({ previousCovers: 0, coversDelta: 14 });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-delta")).textContent).toBe("+14 (+100%)");
  });

  it("charts a bar for every day in the range", async () => {
    render(<BusinessPerformance />);

    const chart = await screen.findByTestId("perf-covers-chart");
    expect(within(chart).getAllByRole("listitem")).toHaveLength(3);
  });

  it("leaves the chart out for a single day range", async () => {
    respond({ coverBuckets: [{ start: "2026-08-24", end: "2026-08-24", covers: 12 }] });
    render(<BusinessPerformance />);

    await screen.findByTestId("perf-covers");
    expect(screen.queryByTestId("perf-covers-chart")).toBeNull();
  });

  it("reports each service rate as a plain value", async () => {
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-rate-abandonment")).textContent).toContain("40%");
    expect(screen.getByTestId("perf-rate-noShow").textContent).toContain("50%");
    expect(screen.getByTestId("perf-rate-utilization").textContent).toContain("1%");
  });

  it("sets no targets against the rates", async () => {
    render(<BusinessPerformance />);

    await screen.findByTestId("perf-rates");
    expect(screen.queryByText(/off target/)).toBeNull();
    expect(screen.queryByText(/target/)).toBeNull();
  });

  it("gives the no show rate its booked party count", async () => {
    render(<BusinessPerformance />);

    const row = await screen.findByTestId("perf-rate-noShow");
    expect(row.textContent).toContain("3 of 6 booked parties");
  });

  it("gives utilization its table count", async () => {
    render(<BusinessPerformance />);

    const row = await screen.findByTestId("perf-rate-utilization");
    expect(row.textContent).toContain("3 of 5 tables used");
  });

  it("splits the covers between reservations and walk ins", async () => {
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-reservation-covers")).textContent).toContain("6");
    expect(screen.getByTestId("perf-walkin-covers").textContent).toContain("8");
  });

  it("writes a long turn time in hours and minutes", async () => {
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-turn")).textContent).toBe("1h 10m");
  });

  it("writes a long turn time plainly with no warning", async () => {
    respond({ averageTableTurnMinutes: 632 });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-turn")).textContent).toBe("10h 32m");
    expect(screen.queryByTestId("perf-turn-warning")).toBeNull();
  });

  it("sets no rules against the summary strip", async () => {
    render(<BusinessPerformance />);

    await screen.findByTestId("perf-turn");
    expect(screen.queryByText("check data")).toBeNull();
  });

  it("lists every table by default", async () => {
    render(<BusinessPerformance />);

    const list = await screen.findByTestId("perf-table-utilization");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("narrows to the tables that were used", async () => {
    render(<BusinessPerformance />);

    fireEvent.click(await screen.findByTestId("perf-tables-used"));

    const list = await screen.findByTestId("perf-table-utilization");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list.textContent).toContain("T1");
    expect(list.textContent).not.toContain("T2");
  });

  it("asks the api again when the range changes", async () => {
    render(<BusinessPerformance />);
    await screen.findByTestId("perf-covers");

    fireEvent.click(screen.getByTestId("perf-preset-30d"));

    await waitFor(() =>
      expect(perfApi.fetchPerformance).toHaveBeenCalledWith(
        "loc-1",
        expect.objectContaining({ preset: "30d" }),
      ),
    );
  });

  it("waits for both dates before asking for a custom range", async () => {
    render(<BusinessPerformance />);
    await screen.findByTestId("perf-covers");
    perfApi.fetchPerformance.mockClear();

    fireEvent.click(screen.getByTestId("perf-preset-custom"));

    expect(await screen.findByTestId("perf-custom-dialog")).toBeTruthy();
    expect(perfApi.fetchPerformance).not.toHaveBeenCalled();
  });

  it("reports a failure without blanking the page", async () => {
    perfApi.fetchPerformance.mockRejectedValue(new Error("Server error"));
    render(<BusinessPerformance />);

    expect(await screen.findByText("Server error")).toBeTruthy();
  });

  it("asks for a location before loading anything", async () => {
    session.currentLocation = null;
    render(<BusinessPerformance />);

    expect(await screen.findByText("Choose a location to see its performance.")).toBeTruthy();
    expect(perfApi.fetchPerformance).not.toHaveBeenCalled();
  });
});

describe("the performance page with no service data", () => {
  it("shows the empty state instead of a blank chart", async () => {
    respond({ hasActivity: false });
    render(<BusinessPerformance />);

    expect(await screen.findByTestId("perf-empty")).toBeTruthy();
    expect(screen.queryByTestId("perf-covers-chart")).toBeNull();
  });

  it("raises no false alarms when there is nothing to measure", async () => {
    respond({ hasActivity: false });
    render(<BusinessPerformance />);

    await screen.findByTestId("perf-empty");
    expect(screen.queryByTestId("perf-rates")).toBeNull();
  });

  it("keeps the range filters reachable", async () => {
    respond({ hasActivity: false });
    render(<BusinessPerformance />);

    await screen.findByTestId("perf-empty");
    expect(screen.getByTestId("perf-preset-7d")).toBeTruthy();
  });

  it("still shows a measured zero as real data", async () => {
    respond({ covers: 0, hasActivity: true, queueAbandonmentRate: 1 });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-covers")).textContent).toBe("0");
    expect(screen.queryByTestId("perf-empty")).toBeNull();
    expect(screen.getByTestId("perf-summary").className).toContain("perf-summary-no-covers");
  });

  it("writes unavailable metrics as a dash", async () => {
    respond({
      queueAbandonmentRate: null,
      reservationNoShowRate: null,
      tableUtilization: null,
      averageQueueWaitMinutes: null,
      averageTableTurnMinutes: null,
    });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-turn")).textContent).toBe("--");
    expect(screen.getByTestId("perf-rates-empty")).toBeTruthy();
    expect(screen.queryByTestId("perf-rate-utilization")).toBeNull();
  });

  it("keeps showing the metrics that do have data", async () => {
    respond({ averageTableTurnMinutes: null, covers: 2 });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-covers")).textContent).toBe("2");
    expect(screen.getByTestId("perf-turn").textContent).toBe("--");
  });

  it("says there is no prior comparison when both periods are empty", async () => {
    respond({ covers: 0, previousCovers: 0, coversDelta: 0 });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-delta")).textContent).toBe("No prior comparison");
  });
});

describe("the custom range dialog", () => {
  it("opens a dialog rather than changing the range straight away", async () => {
    render(<BusinessPerformance />);
    await screen.findByTestId("perf-covers");
    perfApi.fetchPerformance.mockClear();

    fireEvent.click(screen.getByTestId("perf-preset-custom"));

    expect(await screen.findByTestId("perf-custom-dialog")).toBeTruthy();
    expect(perfApi.fetchPerformance).not.toHaveBeenCalled();
  });

  it("keeps apply disabled until both dates are chosen", async () => {
    render(<BusinessPerformance />);
    await screen.findByTestId("perf-covers");

    fireEvent.click(screen.getByTestId("perf-preset-custom"));

    expect((await screen.findByTestId("perf-custom-apply")).hasAttribute("disabled")).toBe(true);
  });

  it("leaves the active range alone when cancelled", async () => {
    render(<BusinessPerformance />);
    await screen.findByTestId("perf-covers");
    perfApi.fetchPerformance.mockClear();

    fireEvent.click(screen.getByTestId("perf-preset-custom"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByTestId("perf-custom-dialog")).toBeNull());
    expect(perfApi.fetchPerformance).not.toHaveBeenCalled();
  });

  it("labels the range that is being shown", async () => {
    render(<BusinessPerformance />);

    const label = await screen.findByTestId("perf-range-label");
    expect(label.textContent).toContain("2026");
  });
});

describe("the service rates panel", () => {
  it("says there is no data when every rate is unavailable", async () => {
    respond({
      queueAbandonmentRate: null,
      reservationNoShowRate: null,
      tableUtilization: null,
    });
    render(<BusinessPerformance />);

    expect(await screen.findByTestId("perf-rates-empty")).toBeTruthy();
    expect(screen.getByText("No Data Available Yet")).toBeTruthy();
  });

  it("shows the rates as soon as one can be measured", async () => {
    respond({
      queueAbandonmentRate: 0.2,
      reservationNoShowRate: null,
      tableUtilization: null,
    });
    render(<BusinessPerformance />);

    expect((await screen.findByTestId("perf-rate-abandonment")).textContent).toContain("20%");
    expect(screen.getByTestId("perf-rate-noShow").textContent).toContain("--");
    expect(screen.queryByTestId("perf-rates-empty")).toBeNull();
    expect(screen.getByTestId("perf-summary").className).not.toContain("perf-summary-no-covers");
  });
});
