import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveFloor from "../../src/components/floor/LiveFloor.js";
import type {
  LiveAssignment,
  LiveFloor as LiveFloorData,
  LiveRoom,
  LiveTable,
  UpcomingReservation,
  WaitingParty,
} from "../../src/lib/floorLive.js";

const liveApi = vi.hoisted(() => {
  return {
    fetchLiveFloor: vi.fn(),
    seatParty: vi.fn(),
    seatReservedAssignment: vi.fn(),
    completeVisit: vi.fn(),
    movePartyToTable: vi.fn(),
    markTableCleaning: vi.fn(),
    markTableAvailable: vi.fn(),
    assignTable: vi.fn(),
    resolveReservationTable: vi.fn(),
    admitParty: vi.fn(),
    confirmPartyArrival: vi.fn(),
    markPartyNoShow: vi.fn(),
    removeParty: vi.fn(),
  };
});

vi.mock("@/lib/floorLiveApi", () => liveApi);

const floorApi = vi.hoisted(() => {
  return { blockTable: vi.fn(), unblockTable: vi.fn() };
});

vi.mock("@/lib/floorApi", () => floorApi);

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => {
  return { useToast: () => ({ toast: toastSpy }) };
});

const NOW = "2026-08-26T18:00:00.000Z";

function makeTable(overrides: Partial<LiveTable> = {}): LiveTable {
  return {
    id: "table-1",
    name: "T1",
    capacity: 4,
    minimumPartySize: 1,
    shape: "RECTANGLE",
    x: 10,
    y: 10,
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

function makeAssignment(overrides: Partial<LiveAssignment> = {}): LiveAssignment {
  return {
    id: "assignment-1",
    status: "SEATED",
    source: "MANUAL",
    partySize: 2,
    partyName: "Ada Lovelace",
    queueEntryId: "queue-1",
    reservationId: null,
    expectedStartAt: "2026-08-26T17:30:00.000Z",
    expectedEndAt: "2026-08-26T19:00:00.000Z",
    seatedAt: "2026-08-26T17:30:00.000Z",
    seatedMinutes: 30,
    ...overrides,
  };
}

function makeRoom(tables: LiveTable[], overrides: Partial<LiveRoom> = {}): LiveRoom {
  return {
    id: "room-1",
    name: "Main Dining Room",
    width: 1200,
    height: 800,
    sortOrder: 0,
    zones: [],
    tables,
    ...overrides,
  };
}

function makeParty(overrides: Partial<WaitingParty> = {}): WaitingParty {
  return {
    id: "queue-1",
    name: "Ada Lovelace",
    partySize: 2,
    joinedAt: "2026-08-26T17:30:00.000Z",
    waitingMinutes: 30,
    admittedAt: null,
    admittedMinutes: null,
    assignmentId: null,
    tableId: null,
    tableName: null,
    recommendedTableId: null,
    recommendedTableName: null,
    recommendedReasons: [],
    matchState: "QUEUED" as const,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<UpcomingReservation> = {}): UpcomingReservation {
  return {
    id: "res-1",
    name: "Grace Hopper",
    partySize: 2,
    time: "19:30",
    timeLabel: "7:30 PM",
    status: "CONFIRMED",
    tableId: null,
    tableName: null,
    needsReview: false,
    ...overrides,
  };
}

function floor(overrides: Partial<LiveFloorData> = {}): LiveFloorData {
  return {
    now: NOW,
    rooms: [makeRoom([makeTable()])],
    waitingParties: [],
    admittedParties: [],
    upcomingReservations: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  liveApi.fetchLiveFloor.mockResolvedValue(floor());
  liveApi.seatParty.mockResolvedValue(undefined);
  liveApi.seatReservedAssignment.mockResolvedValue(undefined);
  liveApi.completeVisit.mockResolvedValue(undefined);
  liveApi.movePartyToTable.mockResolvedValue(undefined);
  liveApi.markTableCleaning.mockResolvedValue(undefined);
  liveApi.markTableAvailable.mockResolvedValue(undefined);
  liveApi.assignTable.mockResolvedValue(undefined);
  liveApi.admitParty.mockResolvedValue(undefined);
  liveApi.confirmPartyArrival.mockResolvedValue(undefined);
  liveApi.markPartyNoShow.mockResolvedValue(undefined);
  floorApi.blockTable.mockResolvedValue(undefined);
  floorApi.unblockTable.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderFloor(onDataChange?: () => Promise<void>) {
  render(<LiveFloor locationId="loc-1" onDataChange={onDataChange} />);
  await waitFor(() => {
    expect(liveApi.fetchLiveFloor).toHaveBeenCalled();
  });
}

async function selectTable(name: string) {
  const node = await screen.findByTestId(`live-table-${name}`);
  fireEvent.pointerDown(node);
  return screen.findByTestId("live-table-detail");
}

describe("live floor overview", () => {
  it("prompts the operator to build a layout when there are no tables", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ rooms: [] }));
    await renderFloor();

    expect(await screen.findByText("No Tables Yet")).toBeTruthy();
  });

  it("prompts to build a layout when a room exists but holds no tables", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ rooms: [makeRoom([])] }));
    await renderFloor();

    expect(await screen.findByText("No Tables Yet")).toBeTruthy();
  });

  it("renders every table on the floor", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable(), makeTable({ id: "table-2", name: "T2" })])],
      }),
    );
    await renderFloor();

    expect(await screen.findByTestId("live-table-T1")).toBeTruthy();
    expect(screen.getByTestId("live-table-T2")).toBeTruthy();
  });

  it("labels each table with its status so colour is not the only cue", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable({ status: "CLEANING" })])] }),
    );
    await renderFloor();

    const node = await screen.findByTestId("live-table-T1");
    expect(node.getAttribute("aria-label")).toBe("T1, Cleaning");
    expect(node.getAttribute("data-status")).toBe("CLEANING");
  });

  it("keeps every status label whole so none of them truncate", async () => {
    await renderFloor();

    const labels = ["Available", "Reserved", "Occupied", "Cleaning", "Blocked"];
    for (const label of labels) {
      const node = await screen.findByText(label);
      expect(node.className).toContain("whitespace-nowrap");
    }
  });

  it("counts tables by status in the legend", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ status: "OCCUPIED", currentAssignment: makeAssignment() }),
            makeTable({ id: "table-2", name: "T2", status: "OCCUPIED" }),
            makeTable({ id: "table-3", name: "T3", status: "BLOCKED", isBlocked: true }),
          ]),
        ],
      }),
    );
    await renderFloor();

    const occupied = await screen.findByText("Occupied");
    expect(occupied.parentElement?.textContent).toContain("2");
  });

  it("shows the waiting list when no table is selected", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ waitingParties: [makeParty(), makeParty({ id: "queue-2", name: "Grace Hopper" })] }),
    );
    await renderFloor();

    expect(await screen.findByText("Waiting Parties")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Grace Hopper")).toBeTruthy();
  });

  it("says so when nobody is waiting", async () => {
    await renderFloor();
    expect(await screen.findByText("Nobody Is Waiting")).toBeTruthy();
  });

  it("lists upcoming reservations under the waiting parties", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        waitingParties: [makeParty()],
        upcomingReservations: [
          makeReservation(),
          makeReservation({ id: "res-2", name: "Alan Turing", timeLabel: "8:00 PM" }),
        ],
      }),
    );
    await renderFloor();

    const reservations = await screen.findByTestId("upcoming-reservations");
    expect(within(reservations).getByText("Grace Hopper")).toBeTruthy();
    expect(within(reservations).getByText("Alan Turing")).toBeTruthy();
    expect(reservations.textContent).toContain("7:30 PM");
    expect(reservations.textContent).toContain("Party Of 2");
  });

  it("puts the reservations section after the waiting parties section", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ waitingParties: [makeParty()], upcomingReservations: [makeReservation()] }),
    );
    await renderFloor();

    const waiting = await screen.findByTestId("waiting-parties");
    const reservations = screen.getByTestId("upcoming-reservations");
    const order = waiting.compareDocumentPosition(reservations);

    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says so when nothing else is booked today", async () => {
    await renderFloor();
    const reservations = await screen.findByTestId("upcoming-reservations");
    expect(within(reservations).getByText("No More Reservations Today")).toBeTruthy();
  });

  it("marks a reservation that is already seated at a table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ upcomingReservations: [makeReservation({ tableName: "T4" })] }),
    );
    await renderFloor();

    const row = await screen.findByTestId("reservation-res-1");
    expect(row.textContent).toContain("T4");
    expect(row.textContent).not.toContain("At T4");
    expect(row.children).toHaveLength(2);
    expect((row.children[0] as HTMLElement).textContent).toBe("T4");
    expect(row.textContent).toContain("Grace Hopper");
  });

  it("leaves the table badge off a reservation with no table yet", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ upcomingReservations: [makeReservation()] }));
    await renderFloor();

    const row = await screen.findByTestId("reservation-res-1");
    expect(row.children).toHaveLength(1);
    expect(row.textContent).not.toContain("T1");
    expect(row.textContent).toContain("Grace Hopper");
  });

  it("hides both lists once a table is selected", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ waitingParties: [makeParty()], upcomingReservations: [makeReservation()] }),
    );
    await renderFloor();

    await selectTable("T1");

    expect(screen.queryByTestId("upcoming-reservations")).toBeNull();
    expect(screen.queryByTestId("waiting-parties")).toBeNull();
  });

  it("renders zones behind the tables", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([makeTable()], {
            zones: [{ id: "zone-1", name: "Window Side", x: 0, y: 0, width: 300, height: 200 }],
          }),
        ],
      }),
    );
    await renderFloor();

    expect(await screen.findByTestId("live-zone-Window Side")).toBeTruthy();
  });

  it("switches rooms and clears the selection", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([makeTable()]),
          makeRoom([makeTable({ id: "table-2", name: "P1" })], {
            id: "room-2",
            name: "Patio",
          }),
        ],
      }),
    );
    await renderFloor();

    await selectTable("T1");
    fireEvent.click(screen.getByRole("button", { name: "Patio" }));

    expect(await screen.findByTestId("live-table-P1")).toBeTruthy();
    expect(screen.queryByTestId("live-table-T1")).toBeNull();
    expect(screen.queryByTestId("live-table-detail")).toBeNull();
  });

  it("polls for fresh state on an interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LiveFloor locationId="loc-1" />);
    await waitFor(() => {
      expect(liveApi.fetchLiveFloor).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(15000);
    expect(liveApi.fetchLiveFloor).toHaveBeenCalledTimes(2);
  });

  it("reports a failed load without crashing the view", async () => {
    liveApi.fetchLiveFloor.mockRejectedValue(new Error("Server error"));
    await renderFloor();

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Server error" }),
      );
    });
  });
});

describe("table detail", () => {
  it("shows the current party and how long they have been seated", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ status: "OCCUPIED", currentAssignment: makeAssignment() })])],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    expect(within(detail).getByText("Ada Lovelace")).toBeTruthy();
    expect(within(detail).getByText(/Party Of 2/)).toBeTruthy();
    expect(within(detail).getByText(/Seated 30 Min/)).toBeTruthy();
  });

  it("shows the upcoming reservation on a reserved table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({
              status: "RESERVED",
              upcomingAssignment: makeAssignment({
                status: "RESERVED",
                partyName: "Grace Hopper",
                seatedAt: null,
                seatedMinutes: null,
                queueEntryId: null,
                reservationId: "res-1",
              }),
            }),
          ]),
        ],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    expect(within(detail).getByText("Upcoming Reservation")).toBeTruthy();
    expect(within(detail).getByText("Grace Hopper")).toBeTruthy();
  });

  it("shows the recommended waiting party on an available table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ recommendedPartyId: "queue-1" })])],
        waitingParties: [makeParty()],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    expect(within(detail).getByTestId("recommended-party").textContent).toContain("Ada Lovelace");
    expect(within(detail).getByTestId("recommended-party").textContent).toContain("30 Min Wait");
  });

  it("marks a recommended table on the floor itself", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ recommendedPartyId: "queue-1" })])],
        waitingParties: [makeParty()],
      }),
    );
    await renderFloor();

    expect(await screen.findByTestId("table-recommended-T1")).toBeTruthy();
  });

  it("says no party is seated on an idle table", async () => {
    await renderFloor();
    const detail = await selectTable("T1");
    expect(within(detail).getByText("No Party Seated")).toBeTruthy();
  });

  it("shows the capacity range only when a minimum applies", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable({ minimumPartySize: 2, capacity: 6 })])] }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    expect(within(detail).getByText("Seats 2 to 6")).toBeTruthy();
  });

  it("clears the selection when the canvas background is tapped", async () => {
    await renderFloor();
    await selectTable("T1");

    fireEvent.pointerDown(screen.getByTestId("live-floor-canvas"));

    await waitFor(() => {
      expect(screen.queryByTestId("live-table-detail")).toBeNull();
    });
  });
});

describe("table actions", () => {
  it("seats the recommended party in one tap", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ recommendedPartyId: "queue-1" })])],
        waitingParties: [makeParty()],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: /Seat Ada Lovelace/ }));

    await waitFor(() => {
      expect(liveApi.seatParty).toHaveBeenCalledWith("loc-1", "table-1", {
        queueEntryId: "queue-1",
        partySize: 2,
      });
    });
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Party Seated" }));
  });

  it("offers only waiting parties that fit the table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ capacity: 2, minimumPartySize: 2 })])],
        waitingParties: [
          makeParty(),
          makeParty({ id: "queue-2", name: "Big Group", partySize: 8 }),
        ],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Choose Queue Party" }));

    const picker = await screen.findByTestId("seat-party-picker");
    expect(within(picker).getByTestId("seat-party-queue-1")).toBeTruthy();
    expect(within(picker).queryByTestId("seat-party-queue-2")).toBeNull();
  });

  it("says so when no waiting party fits the table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ capacity: 2 })])],
        waitingParties: [makeParty({ partySize: 8 })],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Choose Queue Party" }));

    expect(
      await within(await screen.findByTestId("seat-party-picker")).findByText(
        "No waiting party fits this table right now.",
      ),
    ).toBeTruthy();
  });

  it("seats a chosen waiting party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], waitingParties: [makeParty()] }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Choose Queue Party" }));
    fireEvent.click(await screen.findByTestId("seat-party-queue-1"));

    await waitFor(() => {
      expect(liveApi.seatParty).toHaveBeenCalledWith("loc-1", "table-1", {
        queueEntryId: "queue-1",
        partySize: 2,
      });
    });
  });

  it("seats the party holding the upcoming reservation", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({
              status: "RESERVED",
              upcomingAssignment: makeAssignment({ id: "res-assignment", status: "RESERVED" }),
            }),
          ]),
        ],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Seat Reserved Party" }));

    await waitFor(() => {
      expect(liveApi.seatReservedAssignment).toHaveBeenCalledWith("loc-1", "res-assignment");
    });
  });

  it("completes the current visit", async () => {
    const onDataChange = vi.fn().mockResolvedValue(undefined);
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ status: "OCCUPIED", currentAssignment: makeAssignment() })])],
      }),
    );
    await renderFloor(onDataChange);

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Complete Visit" }));

    await waitFor(() => {
      expect(liveApi.completeVisit).toHaveBeenCalledWith("loc-1", "assignment-1");
    });
    expect(onDataChange).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Visit Completed" }));
  });

  it("moves the party to another table that can take them", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ status: "OCCUPIED", currentAssignment: makeAssignment() }),
            makeTable({ id: "table-2", name: "T2" }),
          ]),
        ],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Move Party" }));
    fireEvent.click(await screen.findByTestId("move-target-T2"));

    await waitFor(() => {
      expect(liveApi.movePartyToTable).toHaveBeenCalledWith("loc-1", "assignment-1", "table-2");
    });
  });

  it("says so when no other table can take the party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ status: "OCCUPIED", currentAssignment: makeAssignment() })])],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Move Party" }));

    expect(
      await within(await screen.findByTestId("move-party-picker")).findByText(
        "No other table can take this party right now.",
      ),
    ).toBeTruthy();
  });

  it("marks an idle table for cleaning", async () => {
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Mark Cleaning" }));

    await waitFor(() => {
      expect(liveApi.markTableCleaning).toHaveBeenCalledWith("loc-1", "table-1");
    });
  });

  it("marks a cleaning table available again", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ status: "CLEANING", cleaningSince: NOW })])],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Mark Available" }));

    await waitFor(() => {
      expect(liveApi.markTableAvailable).toHaveBeenCalledWith("loc-1", "table-1");
    });
  });

  it("blocks and unblocks a table", async () => {
    await renderFloor();

    let detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Block Table" }));
    await waitFor(() => {
      expect(floorApi.blockTable).toHaveBeenCalledWith("loc-1", "table-1");
    });

    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ status: "BLOCKED", isBlocked: true })])],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    detail = await screen.findByTestId("live-table-detail");
    fireEvent.click(await within(detail).findByRole("button", { name: "Unblock Table" }));
    await waitFor(() => {
      expect(floorApi.unblockTable).toHaveBeenCalledWith("loc-1", "table-1");
    });
  });

  it("never offers to seat or clean a table that already has a party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ status: "OCCUPIED", currentAssignment: makeAssignment() })])],
      }),
    );
    await renderFloor();

    const detail = await selectTable("T1");
    expect(within(detail).queryByRole("button", { name: "Choose Queue Party" })).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Mark Cleaning" })).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Block Table" })).toBeNull();
  });

  it("reports a rejected action and leaves the view usable", async () => {
    liveApi.markTableCleaning.mockRejectedValue(new Error("Complete the current visit first"));
    await renderFloor();

    const detail = await selectTable("T1");
    fireEvent.click(within(detail).getByRole("button", { name: "Mark Cleaning" }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Complete the current visit first",
        }),
      );
    });
    expect(screen.getByTestId("live-table-detail")).toBeTruthy();
  });

  it("refetches the floor after a successful action", async () => {
    await renderFloor();
    const detail = await selectTable("T1");

    liveApi.fetchLiveFloor.mockClear();
    fireEvent.click(within(detail).getByRole("button", { name: "Mark Cleaning" }));

    await waitFor(() => {
      expect(liveApi.fetchLiveFloor).toHaveBeenCalled();
    });
  });
});

describe("manual table assignment", () => {
  it("opens the assign dialog from an admitted party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ recommendedPartyId: "queue-1" })])],
        admittedParties: [makeParty({ recommendedTableId: "table-1", recommendedTableName: "T1" })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));

    const options = await screen.findByTestId("assign-table-options");
    expect(within(options).getByTestId("assign-option-T1")).toBeTruthy();
    expect(within(options).getByTestId("assign-recommended-badge")).toBeTruthy();
  });

  it("lists the recommended table before the others", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "table-1", name: "T1", capacity: 2 }),
            makeTable({ id: "table-2", name: "T2", capacity: 6, recommendedPartyId: "queue-1" }),
          ]),
        ],
        admittedParties: [makeParty({ recommendedTableId: "table-2", recommendedTableName: "T2" })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));

    const options = await screen.findByTestId("assign-table-options");
    const names = within(options)
      .getAllByRole("button")
      .map((b) => b.getAttribute("data-testid"));
    expect(names[0]).toBe("assign-option-T2");
  });

  it("requires a table choice before confirming", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], admittedParties: [makeParty()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    const confirm = await screen.findByTestId("assign-confirm");

    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(liveApi.assignTable).not.toHaveBeenCalled();
  });

  it("shows a confirmation summary once a table is chosen", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], admittedParties: [makeParty()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));

    expect((await screen.findByRole("status")).textContent).toContain("Ada Lovelace");
    expect((await screen.findByTestId("assign-confirm")).textContent).toContain("Assign T1");
  });

  it("assigns the queue guest to the chosen table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], admittedParties: [makeParty()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => {
      expect(liveApi.assignTable).toHaveBeenCalledWith("loc-1", {
        tableId: "table-1",
        partySize: 2,
        queueEntryId: "queue-1",
      });
    });
  });

  it("assigns a reservation to the chosen table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable()])],
        upcomingReservations: [makeReservation()],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => {
      expect(liveApi.assignTable).toHaveBeenCalledWith("loc-1", {
        tableId: "table-1",
        partySize: 2,
        reservationId: "res-1",
      });
    });
  });

  it("leaves out the table a reservation already holds", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "table-1", name: "T1" }),
            makeTable({ id: "table-2", name: "T2" }),
          ]),
        ],
        upcomingReservations: [makeReservation({ tableId: "table-1", tableName: "T1" })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));

    const options = await screen.findByTestId("assign-table-options");
    expect(within(options).queryByTestId("assign-option-T1")).toBeNull();
    expect(within(options).getByTestId("assign-option-T2")).toBeTruthy();
  });

  it("says so when no table can take the party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ capacity: 2 })])],
        admittedParties: [makeParty({ partySize: 8 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));

    expect(await screen.findByText("No single table can take this party right now.")).toBeTruthy();

    const confirm = await screen.findByTestId("assign-confirm");
    expect(confirm.textContent).toContain("Join Tables");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("opens the join picker from the no match action", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ id: "t1", name: "T1", capacity: 4 })])],
        admittedParties: [makeParty({ partySize: 8 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    const options = await screen.findByTestId("assign-join-options");
    expect(within(options).getByTestId("assign-join-T1")).toBeTruthy();
  });

  it("only confirms a join once the chosen tables seat the party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "t1", name: "T1", capacity: 4 }),
            makeTable({ id: "t2", name: "T2", capacity: 4 }),
          ]),
        ],
        admittedParties: [makeParty({ partySize: 7 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    fireEvent.click(await screen.findByTestId("assign-join-T1"));
    expect((await screen.findByTestId("assign-confirm")).hasAttribute("disabled")).toBe(true);

    fireEvent.click(await screen.findByTestId("assign-join-T2"));
    const confirm = await screen.findByTestId("assign-confirm");
    expect(confirm.hasAttribute("disabled")).toBe(false);
    expect(confirm.textContent).toContain("T1 + T2");
  });

  it("disables tables in another room once one is chosen", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([makeTable({ id: "t6", name: "T6", capacity: 4 })]),
          makeRoom([makeTable({ id: "t8", name: "T8", capacity: 4 })], {
            id: "room-2",
            name: "Patio",
          }),
        ],
        admittedParties: [makeParty({ partySize: 7 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    expect((await screen.findByTestId("assign-join-T8")).hasAttribute("disabled")).toBe(false);

    fireEvent.click(await screen.findByTestId("assign-join-T6"));

    expect((await screen.findByTestId("assign-join-T8")).hasAttribute("disabled")).toBe(true);
  });

  it("keeps tables in the same room selectable", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "t6", name: "T6", capacity: 4 }),
            makeTable({ id: "t7", name: "T7", capacity: 4 }),
          ]),
          makeRoom([makeTable({ id: "t8", name: "T8", capacity: 4 })], {
            id: "room-2",
            name: "Patio",
          }),
        ],
        admittedParties: [makeParty({ partySize: 7 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));
    fireEvent.click(await screen.findByTestId("assign-join-T6"));

    expect((await screen.findByTestId("assign-join-T7")).hasAttribute("disabled")).toBe(false);
  });

  it("frees every room again once the selection is cleared", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([makeTable({ id: "t6", name: "T6", capacity: 4 })]),
          makeRoom([makeTable({ id: "t8", name: "T8", capacity: 4 })], {
            id: "room-2",
            name: "Patio",
          }),
        ],
        admittedParties: [makeParty({ partySize: 7 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));
    fireEvent.click(await screen.findByTestId("assign-join-T6"));
    expect((await screen.findByTestId("assign-join-T8")).hasAttribute("disabled")).toBe(true);

    fireEvent.click(await screen.findByTestId("assign-join-T6"));

    expect((await screen.findByTestId("assign-join-T8")).hasAttribute("disabled")).toBe(false);
  });

  it("re anchors the room when the first choice is dropped", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "t6", name: "T6", capacity: 4 }),
            makeTable({ id: "t7", name: "T7", capacity: 4 }),
          ]),
          makeRoom([makeTable({ id: "t8", name: "T8", capacity: 4 })], {
            id: "room-2",
            name: "Patio",
          }),
        ],
        admittedParties: [makeParty({ partySize: 7 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));
    fireEvent.click(await screen.findByTestId("assign-join-T6"));
    fireEvent.click(await screen.findByTestId("assign-join-T7"));
    fireEvent.click(await screen.findByTestId("assign-join-T6"));

    expect((await screen.findByTestId("assign-join-T8")).hasAttribute("disabled")).toBe(true);
  });

  it("sends every joined table to the api", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "t1", name: "T1", capacity: 4 }),
            makeTable({ id: "t2", name: "T2", capacity: 4 }),
          ]),
        ],
        admittedParties: [makeParty({ partySize: 7 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));
    fireEvent.click(await screen.findByTestId("assign-join-T1"));
    fireEvent.click(await screen.findByTestId("assign-join-T2"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => expect(liveApi.assignTable).toHaveBeenCalled());
    const body = liveApi.assignTable.mock.calls[0][1];
    expect(body.tableIds).toEqual(["t1", "t2"]);
    expect(body.tableId).toBeUndefined();
  });

  it("reports a rejected assignment without closing the view", async () => {
    liveApi.assignTable.mockRejectedValue(new Error("That guest already has a table"));
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], admittedParties: [makeParty()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "That guest already has a table",
        }),
      );
    });
  });

  it("refetches the floor after a successful assignment", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], admittedParties: [makeParty()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    liveApi.fetchLiveFloor.mockClear();
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => {
      expect(liveApi.fetchLiveFloor).toHaveBeenCalled();
    });
  });
});

describe("queue recommendations", () => {
  it("shows the suggested table beside a waiting party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ recommendedPartyId: "queue-1" })])],
        waitingParties: [makeParty({ recommendedTableId: "table-1", recommendedTableName: "T1" })],
      }),
    );
    await renderFloor();

    const badge = await screen.findByTestId("waiting-suggestion-queue-1");
    expect(badge.textContent).toBe("T1");
  });

  it("shows no match when nothing can take the party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ capacity: 2 })])],
        waitingParties: [makeParty({ partySize: 12, matchState: "NO_CAPACITY" })],
      }),
    );
    await renderFloor();

    const badge = await screen.findByTestId("waiting-nomatch-queue-1");
    expect(badge.textContent).toBe("No Table Match");
  });

  it("shows neither badge for a party queued behind another", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable()])],
        waitingParties: [makeParty()],
      }),
    );
    await renderFloor();

    await screen.findByText("Ada Lovelace");
    expect(screen.queryByTestId("waiting-suggestion-queue-1")).toBeNull();
    expect(screen.queryByTestId("waiting-nomatch-queue-1")).toBeNull();
  });

  it("preselects the suggested table when the assign dialog opens", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "table-1", name: "T1", capacity: 2 }),
            makeTable({ id: "table-2", name: "T2", capacity: 6 }),
          ]),
        ],
        admittedParties: [makeParty({ recommendedTableId: "table-2", recommendedTableName: "T2" })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));

    const options = await screen.findByTestId("assign-table-options");
    const first = within(options).getAllByRole("button")[0];
    expect(first.getAttribute("data-testid")).toBe("assign-option-T2");
    expect(within(options).getByTestId("assign-recommended-badge")).toBeTruthy();
  });

  it("never seats a party just because it was recommended", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ recommendedPartyId: "queue-1" })])],
        waitingParties: [makeParty({ recommendedTableId: "table-1", recommendedTableName: "T1" })],
      }),
    );
    await renderFloor();

    await screen.findByTestId("waiting-suggestion-queue-1");

    expect(liveApi.assignTable).not.toHaveBeenCalled();
    expect(liveApi.seatParty).not.toHaveBeenCalled();
  });
});

describe("a reservation that already holds a table", () => {
  function onlyTableFloor(reservationOverrides: Record<string, unknown>) {
    return floor({
      rooms: [makeRoom([makeTable({ id: "t5", name: "T5", capacity: 4, status: "RESERVED" })])],
      upcomingReservations: [makeReservation(reservationOverrides)],
    });
  }

  it("names the table it is already on", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      onlyTableFloor({ tableId: "t5", tableName: "T5", partySize: 4 }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));

    const note = await screen.findByTestId("assign-current-table");
    expect(note.textContent).toContain("T5");
  });

  it("says no other table is free rather than none at all", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      onlyTableFloor({ tableId: "t5", tableName: "T5", partySize: 4 }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));

    expect(
      await screen.findByText("No other table is free for this party right now."),
    ).toBeTruthy();
    expect(screen.queryByText("No single table can take this party right now.")).toBeNull();
  });

  it("leaves the note off a reservation with no table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [makeRoom([makeTable({ id: "t1", name: "T1", capacity: 4 })])],
        upcomingReservations: [makeReservation({ partySize: 2 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));
    await screen.findByTestId("assign-table-options");

    expect(screen.queryByTestId("assign-current-table")).toBeNull();
  });

  it("still lets staff switch to a free table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({ id: "t5", name: "T5", capacity: 4, status: "RESERVED" }),
            makeTable({ id: "t6", name: "T6", capacity: 4 }),
          ]),
        ],
        upcomingReservations: [makeReservation({ tableId: "t5", tableName: "T5", partySize: 4 })],
      }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));

    expect(await screen.findByTestId("assign-current-table")).toBeTruthy();
    const options = await screen.findByTestId("assign-table-options");
    expect(within(options).getByTestId("assign-option-T6")).toBeTruthy();
    expect(within(options).queryByTestId("assign-option-T5")).toBeNull();
  });
});

describe("the join tables toggle", () => {
  function twoTableFloor(partySize: number) {
    return floor({
      rooms: [
        makeRoom([
          makeTable({ id: "t1", name: "T1", capacity: 4 }),
          makeTable({ id: "t2", name: "T2", capacity: 4 }),
        ]),
      ],
      admittedParties: [makeParty({ partySize })],
    });
  }

  it("sits in the header beside the party details", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(twoTableFloor(2));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));

    const toggle = await screen.findByTestId("assign-join-toggle");
    expect(toggle.textContent).toBe("Join Tables Instead");
    expect(toggle.closest("[data-testid='assign-table-options']")).toBeNull();
    expect(within(toggle.parentElement as HTMLElement).getByText(/Party Of 2/)).toBeTruthy();
  });

  it("swaps to the single table label once joining", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(twoTableFloor(2));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-join-toggle"));

    const toggle = await screen.findByTestId("assign-join-toggle");
    expect(toggle.textContent).toBe("Use a Single Table Instead");
    expect(within(toggle.parentElement as HTMLElement).getByText(/Party Of 2/)).toBeTruthy();
  });

  it("takes the toggle back to the single table list", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(twoTableFloor(2));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    fireEvent.click(await screen.findByTestId("assign-join-toggle"));
    await screen.findByTestId("assign-join-options");

    fireEvent.click(await screen.findByTestId("assign-join-toggle"));

    expect(await screen.findByTestId("assign-table-options")).toBeTruthy();
  });

  it("is left out when the primary action already offers joining", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(twoTableFloor(7));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-1"));
    await screen.findByTestId("assign-confirm");

    expect(screen.queryByTestId("assign-join-toggle")).toBeNull();
  });
});

describe("reservations that need review", () => {
  it("marks the row so staff can spot it", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ upcomingReservations: [makeReservation({ needsReview: true })] }),
    );
    await renderFloor();

    expect(await screen.findByTestId("reservation-review-res-1")).toBeTruthy();
    expect(screen.getByText("No Table Assigned")).toBeTruthy();
  });

  it("leaves a seated reservation unmarked", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        upcomingReservations: [makeReservation({ tableId: "table-1", tableName: "T1" })],
      }),
    );
    await renderFloor();

    await screen.findByTestId("reservation-res-1");
    expect(screen.queryByTestId("reservation-review-res-1")).toBeNull();
  });

  it("offers the smart assign action only for a flagged reservation", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ upcomingReservations: [makeReservation({ needsReview: true })] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));

    expect(await screen.findByTestId("assign-resolve")).toBeTruthy();
  });

  it("hides the smart assign action for a healthy reservation", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ upcomingReservations: [makeReservation()] }));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));
    await screen.findByTestId("assign-confirm");

    expect(screen.queryByTestId("assign-resolve")).toBeNull();
  });

  it("asks the api to resolve the table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ upcomingReservations: [makeReservation({ needsReview: true })] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));
    fireEvent.click(await screen.findByTestId("assign-resolve"));

    await waitFor(() =>
      expect(liveApi.resolveReservationTable).toHaveBeenCalledWith("loc-1", "res-1"),
    );
  });

  it("keeps the dialog open when nothing can be resolved", async () => {
    liveApi.resolveReservationTable.mockRejectedValue(
      new Error("No table can take this reservation yet."),
    );
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ upcomingReservations: [makeReservation({ needsReview: true })] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));
    fireEvent.click(await screen.findByTestId("assign-resolve"));

    expect(await screen.findByTestId("assign-resolve")).toBeTruthy();
  });
});

describe("admitting and seating from the floor", () => {
  function admittedParty(overrides: Partial<WaitingParty> = {}): WaitingParty {
    return makeParty({
      id: "queue-2",
      name: "Alan Turing",
      admittedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      admittedMinutes: 1,
      ...overrides,
    });
  }

  it("admits a waiting party without leaving the floor", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ waitingParties: [makeParty()] }));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("waiting-party-queue-1"));
    fireEvent.click(await screen.findByTestId("queue-party-admit"));

    await waitFor(() => expect(liveApi.admitParty).toHaveBeenCalledWith("loc-1", "queue-1"));
  });

  it("removes a waiting party from the same dialog", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ waitingParties: [makeParty()] }));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("waiting-party-queue-1"));
    fireEvent.click(await screen.findByTestId("queue-party-remove"));

    await waitFor(() => expect(liveApi.removeParty).toHaveBeenCalledWith("loc-1", "queue-1"));
    expect(liveApi.admitParty).not.toHaveBeenCalled();
  });

  it("never assigns a table straight from a waiting party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], waitingParties: [makeParty()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("waiting-party-queue-1"));

    expect(await screen.findByTestId("queue-party-dialog")).toBeTruthy();
    expect(screen.queryByTestId("assign-table-options")).toBeNull();
  });

  it("says so when nobody has been admitted yet", async () => {
    await renderFloor();

    const section = await screen.findByTestId("admitted-parties");
    expect(within(section).getByText("Nobody Has Been Admitted")).toBeTruthy();
  });

  it("counts down the arrival window of an admitted party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ admittedParties: [admittedParty()] }));
    await renderFloor();

    const countdown = await screen.findByTestId("admitted-countdown-queue-2");
    expect(countdown.textContent).toContain("Left");
  });

  it("flags an admitted party whose arrival window ran out", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        admittedParties: [
          admittedParty({ admittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }),
        ],
      }),
    );
    await renderFloor();

    const countdown = await screen.findByTestId("admitted-countdown-queue-2");
    expect(countdown.textContent).toBe("Expired");
    expect(countdown.className).toContain("text-micro");
  });

  it("shows the smart assign suggestion for an admitted party", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        admittedParties: [
          admittedParty({ recommendedTableId: "table-1", recommendedTableName: "T1" }),
        ],
      }),
    );
    await renderFloor();

    expect((await screen.findByTestId("admitted-suggestion-queue-2")).textContent).toBe("T1");
  });

  it("confirms arrival in one tap when the party already holds a table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        admittedParties: [
          admittedParty({ assignmentId: "assignment-9", tableId: "table-1", tableName: "T1" }),
        ],
      }),
    );
    await renderFloor();

    expect((await screen.findByTestId("admitted-table-queue-2")).textContent).toContain("T1");
    fireEvent.click(await screen.findByTestId("admitted-party-queue-2"));

    const confirm = await screen.findByTestId("assign-confirm");
    expect(confirm.textContent).toContain("Seat");
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(liveApi.confirmPartyArrival).toHaveBeenCalledWith("loc-1", "queue-2"),
    );
    expect(liveApi.assignTable).not.toHaveBeenCalled();
  });

  it("picks a table for an admitted party and confirms their arrival", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ admittedParties: [admittedParty()] }));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-2"));
    fireEvent.click(await screen.findByTestId("assign-option-T1"));
    fireEvent.click(await screen.findByTestId("assign-confirm"));

    await waitFor(() => {
      expect(liveApi.assignTable).toHaveBeenCalledWith("loc-1", {
        tableId: "table-1",
        partySize: 2,
        queueEntryId: "queue-2",
      });
    });
    await waitFor(() =>
      expect(liveApi.confirmPartyArrival).toHaveBeenCalledWith("loc-1", "queue-2"),
    );
  });

  it("marks an admitted party as a no-show", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ admittedParties: [admittedParty()] }));
    await renderFloor();

    fireEvent.click(await screen.findByTestId("admitted-party-queue-2"));
    fireEvent.click(await screen.findByTestId("assign-no-show"));

    await waitFor(() => expect(liveApi.markPartyNoShow).toHaveBeenCalledWith("loc-1", "queue-2"));
  });

  it("keeps the no-show action out of the reservation dialog", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({ rooms: [makeRoom([makeTable()])], upcomingReservations: [makeReservation()] }),
    );
    await renderFloor();

    fireEvent.click(await screen.findByTestId("reservation-res-1"));

    await screen.findByTestId("assign-table-options");
    expect(screen.queryByTestId("assign-no-show")).toBeNull();
  });

  it("offers an admitted party when choosing who to seat at a table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(floor({ admittedParties: [admittedParty()] }));
    await renderFloor();

    await selectTable("T1");
    fireEvent.click(screen.getByText("Choose Queue Party"));
    fireEvent.click(await screen.findByTestId("seat-party-queue-2"));

    await waitFor(() => {
      expect(liveApi.seatParty).toHaveBeenCalledWith("loc-1", "table-1", {
        partySize: 2,
        queueEntryId: "queue-2",
      });
    });
    await waitFor(() =>
      expect(liveApi.confirmPartyArrival).toHaveBeenCalledWith("loc-1", "queue-2"),
    );
  });

  it("confirms arrival instead of a bare seating when a queue party holds the table", async () => {
    liveApi.fetchLiveFloor.mockResolvedValue(
      floor({
        rooms: [
          makeRoom([
            makeTable({
              status: "RESERVED",
              upcomingAssignment: makeAssignment({
                id: "assignment-9",
                status: "RESERVED",
                seatedAt: null,
                seatedMinutes: null,
              }),
            }),
          ]),
        ],
        admittedParties: [
          admittedParty({ assignmentId: "assignment-9", tableId: "table-1", tableName: "T1" }),
        ],
      }),
    );
    await renderFloor();

    await selectTable("T1");
    fireEvent.click(screen.getByText("Seat Reserved Party"));

    await waitFor(() =>
      expect(liveApi.confirmPartyArrival).toHaveBeenCalledWith("loc-1", "queue-2"),
    );
    expect(liveApi.seatReservedAssignment).not.toHaveBeenCalled();
  });
});
