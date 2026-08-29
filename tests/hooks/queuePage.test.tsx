import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QueueManager from "../../src/components/queue/QueueManager.js";
import type { LiveFloor as LiveFloorData, LiveRoom, LiveTable } from "../../src/lib/floorLive.js";

const liveApi = vi.hoisted(() => {
  return { fetchLiveFloor: vi.fn(), assignTable: vi.fn() };
});
vi.mock("@/lib/floorLiveApi", () => liveApi);

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => {
  return { api: apiMock };
});

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => {
  return { useToast: () => ({ toast: toastSpy }) };
});

const LOCATION = "loc-1";

function makeTable(overrides: Partial<LiveTable> = {}): LiveTable {
  return {
    id: "t1",
    name: "T1",
    capacity: 4,
    minimumPartySize: 1,
    shape: "RECTANGLE",
    x: 0,
    y: 0,
    width: 130,
    height: 80,
    rotation: 0,
    isBlocked: false,
    cleaningSince: null,
    status: "AVAILABLE",
    currentAssignment: null,
    upcomingAssignment: null,
    recommendedPartyId: null,
    recommendedReasons: [],
    ...overrides,
  };
}

function makeRoom(tables: LiveTable[], overrides: Partial<LiveRoom> = {}): LiveRoom {
  return {
    id: "room-1",
    name: "Main Floor",
    width: 1200,
    height: 800,
    sortOrder: 0,
    zones: [],
    tables,
    ...overrides,
  };
}

function floor(overrides: Partial<LiveFloorData> = {}): LiveFloorData {
  return {
    now: "2026-08-27T18:00:00.000Z",
    rooms: [makeRoom([makeTable()])],
    waitingParties: [],
    upcomingReservations: [],
    ...overrides,
  };
}

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    firstName: "Bryan",
    lastName: "Susanto",
    numGuests: 2,
    joinedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    notificationMethod: "sms",
    ...overrides,
  };
}

function me(queue: any[], admittedCustomers: any[] = []) {
  return {
    username: "bistro",
    locations: [{ id: LOCATION, queue, admittedCustomers }],
  };
}

function renderQueue(user: any) {
  const setMe = vi.fn();
  render(<QueueManager me={user} setMe={setMe} locationId={LOCATION} />);
  return { setMe };
}

beforeEach(() => {
  vi.clearAllMocks();
  liveApi.fetchLiveFloor.mockResolvedValue(floor());
  liveApi.assignTable.mockResolvedValue(undefined);
  apiMock.mockResolvedValue({ user: me([]) });
});

describe("the queue page", () => {
  it("shows an empty state when nobody is waiting", async () => {
    renderQueue(me([]));

    const emptyState = await screen.findByTestId("queue-empty");
    expect(emptyState).toBeTruthy();
    expect(emptyState.parentElement?.classList.contains("flex-1")).toBe(true);
    expect(emptyState.parentElement?.parentElement?.classList.contains("flex-1")).toBe(true);
    expect(screen.getByText("No Guests Waiting Yet")).toBeTruthy();
  });

  it("lists the guests waiting at the selected location", async () => {
    renderQueue(me([queueRow(), queueRow({ id: "q2", firstName: "Kevin", lastName: "Nguyen" })]));

    const list = await screen.findByTestId("queue-list");
    expect(within(list).getByText("Bryan Susanto")).toBeTruthy();
    expect(within(list).getByText("Kevin Nguyen")).toBeTruthy();
  });

  it("loads the floor for the selected location", async () => {
    renderQueue(me([queueRow()]));

    await waitFor(() => expect(liveApi.fetchLiveFloor).toHaveBeenCalledWith(LOCATION));
  });

  it("keeps working when the floor cannot be read", async () => {
    liveApi.fetchLiveFloor.mockRejectedValue(new Error("floor down"));
    renderQueue(me([queueRow()]));

    expect(await screen.findByTestId("queue-floor-error")).toBeTruthy();
    expect(screen.getByTestId("queue-list")).toBeTruthy();
  });

  it("offers smart table assignment after the guest is admitted", async () => {
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));

    expect(await screen.findByTestId("assign-table-options")).toBeTruthy();
    expect(screen.getByTestId("assign-recommended-badge")).toBeTruthy();
    expect(liveApi.assignTable).not.toHaveBeenCalled();
  });

  it("seats an admitted guest at the table staff picked and confirms arrival", async () => {
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => expect(liveApi.assignTable).toHaveBeenCalled());
    const body = liveApi.assignTable.mock.calls[0][1];
    expect(body.queueEntryId).toBe("a1");
    expect(body.tableId).toBe("t1");
    expect(body.partySize).toBe(2);
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/confirm-arrival"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends every joined table when staff combine", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "t1", name: "T1", capacity: 4 }),
            makeTable({ id: "t2", name: "T2", capacity: 4 }),
          ]),
        ],
      }),
    );
    renderQueue(me([], [queueRow({ id: "a1", numGuests: 7, finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));
    fireEvent.click(await screen.findByTestId("assign-join-T1"));
    fireEvent.click(await screen.findByTestId("assign-join-T2"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => expect(liveApi.assignTable).toHaveBeenCalled());
    expect(liveApi.assignTable.mock.calls[0][1].tableIds).toEqual(["t1", "t2"]);
  });

  it("seats an admitted guest outright when the location has no tables", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ rooms: [] }));
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("/confirm-arrival"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(screen.queryByTestId("assign-table-options")).toBeNull();
    expect(liveApi.assignTable).not.toHaveBeenCalled();
  });

  it("seats an admitted guest outright when the floor has rooms but no tables", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ rooms: [makeRoom([])] }));
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("/confirm-arrival"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(liveApi.assignTable).not.toHaveBeenCalled();
  });

  it("never offers a table smaller than the party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable({ id: "t1", name: "T1", capacity: 2 })])] }),
    );
    renderQueue(me([], [queueRow({ id: "a1", numGuests: 6, finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));

    expect(await screen.findByText(/No single table can take this party/)).toBeTruthy();
    expect(screen.queryByTestId("assign-option-T1")).toBeNull();
  });

  it("reports a stale recommendation instead of seating", async () => {
    liveApi.assignTable.mockRejectedValue(
      new Error("Table already has an assignment during that time"),
    );
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("admits a waiting guest", async () => {
    renderQueue(me([queueRow()]));

    fireEvent.click(await screen.findByTestId("queue-admit-q1"));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("/queue/BryanSusanto"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("removes a waiting guest", async () => {
    renderQueue(me([queueRow()]));

    fireEvent.click(await screen.findByTestId("queue-remove-q1"));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("/queue/BryanSusanto"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("confirms an admitted guest that already has a floor table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({
              status: "OCCUPIED",
              currentAssignment: {
                id: "assignment-1",
                status: "SEATED",
                source: "MANUAL",
                partySize: 2,
                partyName: "Bryan Susanto",
                queueEntryId: "a1",
                reservationId: null,
                expectedStartAt: new Date().toISOString(),
                expectedEndAt: new Date(Date.now() + 60 * 60000).toISOString(),
                seatedAt: new Date().toISOString(),
                seatedMinutes: 0,
              },
            }),
          ]),
        ],
      }),
    );
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-seat-a1"));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("/confirm-arrival"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(liveApi.assignTable).not.toHaveBeenCalled();
  });

  it("marks an admitted guest a no show", async () => {
    renderQueue(me([], [queueRow({ id: "a1", finalStatus: "pending" })]));

    fireEvent.click(await screen.findByTestId("queue-noshow-a1"));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("/mark-no-show"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("leaves the awaiting section out when nobody is admitted", async () => {
    renderQueue(me([queueRow()]));

    await screen.findByTestId("queue-list");
    expect(screen.queryByTestId("queue-awaiting")).toBeNull();
  });
});
