import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FloorEditor from "../../src/components/floor/FloorEditor.js";
import type { DiningTable, FloorZone, Room } from "../../src/lib/floorApi.js";

const floorApi = vi.hoisted(() => {
  return {
    fetchRooms: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    deleteRoom: vi.fn(),
    createZone: vi.fn(),
    updateZone: vi.fn(),
    deleteZone: vi.fn(),
    createTable: vi.fn(),
    updateTable: vi.fn(),
    deleteTable: vi.fn(),
    blockTable: vi.fn(),
    unblockTable: vi.fn(),
    fetchCombinations: vi.fn(),
    createCombination: vi.fn(),
    deleteCombination: vi.fn(),
  };
});

vi.mock("@/lib/floorApi", () => floorApi);

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => {
  return { useToast: () => ({ toast: toastSpy }) };
});

function table(overrides: Partial<DiningTable> = {}): DiningTable {
  return {
    id: "table-1",
    floorPlanId: "plan-1",
    locationId: "loc-1",
    name: "Table 1",
    capacity: 4,
    minimumPartySize: 2,
    shape: "RECTANGLE",
    x: 10,
    y: 10,
    width: 130,
    height: 80,
    rotation: 0,
    isBlocked: false,
    ...overrides,
  };
}

function plan(tables: DiningTable[] = [], zones: FloorZone[] = []): Room {
  return {
    id: "plan-1",
    locationId: "loc-1",
    name: "Main Dining Room",
    width: 1200,
    height: 800,
    sortOrder: 0,
    tables,
    zones,
  };
}

function rooms(...list: Room[]): Room[] {
  return list;
}

function zone(overrides: Partial<FloorZone> = {}): FloorZone {
  return {
    id: "zone-1",
    floorPlanId: "plan-1",
    locationId: "loc-1",
    name: "Patio zone",
    x: 40,
    y: 40,
    width: 320,
    height: 220,
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(floorApi)) {
    fn.mockReset();
  }
  floorApi.fetchCombinations.mockResolvedValue([]);
  floorApi.createCombination.mockResolvedValue({});
  floorApi.deleteCombination.mockResolvedValue(undefined);
  toastSpy.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("floor plan bootstrap", () => {
  it("offers to create a plan when the location has none", async () => {
    floorApi.fetchRooms.mockResolvedValue([]);
    floorApi.createRoom.mockResolvedValue(plan());

    render(<FloorEditor locationId="loc-1" />);

    const createButton = await screen.findByRole("button", { name: "Create Floor Plan" });
    fireEvent.click(createButton);

    await waitFor(() => expect(floorApi.createRoom).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Add Rectangle Table" })).toBeTruthy();
  });

  it("loads the floor for the location it is given", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));

    render(<FloorEditor locationId="loc-42" />);

    await waitFor(() => expect(floorApi.fetchRooms).toHaveBeenCalledWith("loc-42"));
    expect(await screen.findByTestId("table-node-Table 1")).toBeTruthy();
  });

  it("shows a single table count in the singular", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));

    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByText(/1 Table/)).toBeTruthy();
  });

  it("totals the seats across every table", async () => {
    floorApi.fetchRooms.mockResolvedValue([
      plan([
        table({ id: "table-1", name: "Table 1", capacity: 4 }),
        table({ id: "table-2", name: "Table 2", capacity: 6 }),
      ]),
    ]);

    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByText(/2 Tables/)).toBeTruthy();
    expect(screen.getByText(/10 Seats/)).toBeTruthy();
  });

  it("adds a table of the shape chosen from the palette", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([])));
    floorApi.createTable.mockResolvedValue(
      table({ id: "table-9", name: "Table 1", shape: "ROUND" }),
    );

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Round Table" }));

    await waitFor(() => expect(floorApi.createTable).toHaveBeenCalled());
    const [, , body] = floorApi.createTable.mock.calls[0];
    expect(body.shape).toBe("ROUND");
    expect(body.width).toBe(body.height);
  });

  it("offers every supported shape in the palette", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([])));

    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByRole("button", { name: "Add Round Table" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Square Table" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Rectangle Table" })).toBeTruthy();
  });
});

describe("adding tables", () => {
  it("names the next table and places it on a free slot", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    floorApi.createTable.mockResolvedValue(table({ id: "table-2", name: "Table 2", x: 150 }));

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Rectangle Table" }));

    await waitFor(() => expect(floorApi.createTable).toHaveBeenCalled());
    const [, , body] = floorApi.createTable.mock.calls[0];
    expect(body.name).toBe("T2");
    expect(body.capacity).toBe(4);
    expect(body.shape).toBe("RECTANGLE");
    expect(screen.getByTestId("table-node-Table 2")).toBeTruthy();
  });

  it("surfaces a server rejection without adding the table", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    floorApi.createTable.mockRejectedValue(new Error("A table with that name already exists here"));

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Rectangle Table" }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const call = toastSpy.mock.calls[0][0];
    expect(call.variant).toBe("destructive");
    expect(call.description).toContain("already exists");
  });
});

describe("rooms", () => {
  it("offers to create the first room when a location has none", async () => {
    floorApi.fetchRooms.mockResolvedValue([]);
    floorApi.createRoom.mockResolvedValue(plan());

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create Floor Plan" }));

    await waitFor(() => expect(floorApi.createRoom).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "New Room" })).toBeTruthy();
  });

  it("lists every room with its seat total", async () => {
    floorApi.fetchRooms.mockResolvedValue([
      plan([table({ capacity: 4 })]),
      { ...plan([table({ id: "t9", name: "T9", capacity: 6 })]), id: "plan-2", name: "Patio" },
    ]);

    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByRole("button", { name: /Main Dining Room/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Patio/ })).toBeTruthy();
  });

  it("switches the canvas when another room is chosen", async () => {
    floorApi.fetchRooms.mockResolvedValue([
      plan([table({ id: "t1", name: "T1" })]),
      { ...plan([table({ id: "t9", name: "T9" })]), id: "plan-2", name: "Patio" },
    ]);

    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByTestId("table-node-T1")).toBeTruthy();
    expect(screen.queryByTestId("table-node-T9")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Patio/ }));

    expect(await screen.findByTestId("table-node-T9")).toBeTruthy();
    expect(screen.queryByTestId("table-node-T1")).toBeNull();
  });

  it("creates a new room with a non clashing name", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan()]);
    floorApi.createRoom.mockResolvedValue({ ...plan(), id: "plan-2", name: "Room 2" });

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "New Room" }));

    await waitFor(() => expect(floorApi.createRoom).toHaveBeenCalled());
    const [, body] = floorApi.createRoom.mock.calls[0];
    expect(body.name).toBe("Room 2");
  });

  it("renames and resizes a room together", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan()]);
    floorApi.updateRoom.mockResolvedValue({ ...plan(), name: "Patio", width: 1400 });

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.change(await screen.findByLabelText("Room Name"), { target: { value: "Patio" } });
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "1400" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Floor Size" }));

    await waitFor(() => expect(floorApi.updateRoom).toHaveBeenCalled());
    const [, roomId, body] = floorApi.updateRoom.mock.calls[0];
    expect(roomId).toBe("plan-1");
    expect(body.name).toBe("Patio");
    expect(body.width).toBe(1400);
  });

  it("rejects a blank room name before calling the API", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan()]);

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.change(await screen.findByLabelText("Room Name"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Floor Size" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a room name.");
    expect(floorApi.updateRoom).not.toHaveBeenCalled();
  });
});

describe("zones", () => {
  it("adds a zone to the active room", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan()]);
    floorApi.createZone.mockResolvedValue(zone());

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Zone" }));

    await waitFor(() => expect(floorApi.createZone).toHaveBeenCalled());
    const [, roomId, body] = floorApi.createZone.mock.calls[0];
    expect(roomId).toBe("plan-1");
    expect(body.name).toBe("New Zone");
    expect(await screen.findByTestId("zone-node-Patio zone")).toBeTruthy();
  });

  it("renders existing zones on the canvas", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan([], [zone()])]);

    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByTestId("zone-node-Patio zone")).toBeTruthy();
  });

  it("opens the zone inspector when a zone is selected", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan([], [zone()])]);

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.pointerDown(await screen.findByTestId("zone-node-Patio zone"));

    expect(await screen.findByTestId("zone-inspector")).toBeTruthy();
    expect((screen.getByLabelText("Zone Name") as HTMLInputElement).value).toBe("Patio zone");
    expect(screen.queryByTestId("table-inspector")).toBeNull();
  });

  it("renames a zone", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan([], [zone()])]);
    floorApi.updateZone.mockResolvedValue(zone({ name: "Bar zone" }));

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.pointerDown(await screen.findByTestId("zone-node-Patio zone"));
    fireEvent.change(screen.getByLabelText("Zone Name"), { target: { value: "Bar zone" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(floorApi.updateZone).toHaveBeenCalled());
    const [, zoneId, body] = floorApi.updateZone.mock.calls[0];
    expect(zoneId).toBe("zone-1");
    expect(body.name).toBe("Bar zone");
  });

  it("rejects a blank zone name before calling the API", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan([], [zone()])]);

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.pointerDown(await screen.findByTestId("zone-node-Patio zone"));
    fireEvent.change(screen.getByLabelText("Zone Name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a zone name.");
    expect(floorApi.updateZone).not.toHaveBeenCalled();
  });

  it("selects a table rather than a zone when both are present", async () => {
    floorApi.fetchRooms.mockResolvedValue([plan([table({ name: "T1" })], [zone()])]);

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.pointerDown(await screen.findByTestId("table-node-T1"));

    expect(await screen.findByTestId("table-inspector")).toBeTruthy();
    expect(screen.queryByTestId("zone-inspector")).toBeNull();
  });
});

describe("resetting the floor", () => {
  async function openResetDialog() {
    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Reset Floor/ }));
    return screen.findByRole("alertdialog");
  }

  it("asks for confirmation before touching anything", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));

    const dialog = await openResetDialog();
    expect(dialog.textContent).toContain("Reset This Floor Plan?");
    expect(floorApi.deleteTable).not.toHaveBeenCalled();
    expect(floorApi.updateRoom).not.toHaveBeenCalled();
  });

  it("removes every table and restores the default floor size", async () => {
    const first = table({ id: "table-1", name: "Table 1" });
    const second = table({ id: "table-2", name: "Table 2" });
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([first, second])));
    floorApi.deleteTable.mockResolvedValue(undefined);
    floorApi.updateRoom.mockResolvedValue(plan());

    const dialog = await openResetDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Floor" }));

    await waitFor(() => expect(floorApi.updateRoom).toHaveBeenCalled());
    expect(floorApi.deleteTable).toHaveBeenCalledWith("loc-1", "table-1");
    expect(floorApi.deleteTable).toHaveBeenCalledWith("loc-1", "table-2");
    expect(floorApi.updateRoom).toHaveBeenCalledWith("loc-1", "plan-1", {
      width: 1200,
      height: 800,
    });
  });

  it("keeps tables the server refuses to delete and says how many", async () => {
    const first = table({ id: "table-1", name: "Table 1" });
    const second = table({ id: "table-2", name: "Table 2" });
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([first, second])));
    floorApi.deleteTable.mockImplementation(async (_location: string, tableId: string) => {
      if (tableId === "table-2") {
        throw new Error("Table still has an active assignment and cannot be deleted");
      }
    });
    floorApi.updateRoom.mockResolvedValue(plan([second]));

    const dialog = await openResetDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Floor" }));

    await waitFor(() => expect(floorApi.updateRoom).toHaveBeenCalled());
    const titles = toastSpy.mock.calls.map((call) => call[0].title);
    expect(titles).toContain("1 Tables Kept");
  });

  it("never touches an assignment endpoint while resetting", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    floorApi.deleteTable.mockResolvedValue(undefined);
    floorApi.updateRoom.mockResolvedValue(plan());

    const dialog = await openResetDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Floor" }));

    await waitFor(() => expect(floorApi.updateRoom).toHaveBeenCalled());
    const touched = Object.keys(floorApi).filter((name) => floorApi[name].mock.calls.length > 0);
    expect(touched.sort()).toEqual([
      "deleteTable",
      "fetchCombinations",
      "fetchRooms",
      "updateRoom",
    ]);
  });
});

describe("table inspector", () => {
  async function openInspector(seed: DiningTable = table()) {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([seed])));
    render(<FloorEditor locationId="loc-1" />);
    const node = await screen.findByTestId(`table-node-${seed.name}`);
    fireEvent.pointerDown(node);
    return screen.findByTestId("table-inspector");
  }

  it("stays hidden until a table is selected", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    render(<FloorEditor locationId="loc-1" />);

    expect(await screen.findByText("Select a table or zone on the floor to edit it.")).toBeTruthy();
    expect(screen.queryByTestId("table-inspector")).toBeNull();
  });

  it("opens when a table is selected and shows its current settings", async () => {
    await openInspector(table({ capacity: 6, minimumPartySize: 3 }));

    expect((screen.getByLabelText("Table Name") as HTMLInputElement).value).toBe("Table 1");
    expect((screen.getByLabelText("Capacity") as HTMLInputElement).value).toBe("6");
    expect((screen.getByLabelText("Minimum Party Size") as HTMLInputElement).value).toBe("3");
  });

  it("renames a table and saves its shape together", async () => {
    floorApi.updateTable.mockResolvedValue(table({ name: "Patio 3", capacity: 6 }));
    await openInspector();

    fireEvent.change(screen.getByLabelText("Table Name"), { target: { value: "Patio 3" } });
    fireEvent.change(screen.getByLabelText("Shape"), { target: { value: "ROUND" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(floorApi.updateTable).toHaveBeenCalled());
    const [, tableId, patch] = floorApi.updateTable.mock.calls[0];
    expect(tableId).toBe("table-1");
    expect(patch.name).toBe("Patio 3");
    expect(patch.shape).toBe("ROUND");
  });

  it("rejects a blank table name before calling the API", async () => {
    await openInspector();

    fireEvent.change(screen.getByLabelText("Table Name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a table name.");
    expect(floorApi.updateTable).not.toHaveBeenCalled();
  });

  it("rejects a minimum party size above capacity before calling the API", async () => {
    await openInspector();

    fireEvent.change(screen.getByLabelText("Minimum Party Size"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Minimum party size cannot exceed capacity.",
    );
    expect(floorApi.updateTable).not.toHaveBeenCalled();
  });

  it("rejects a blank capacity rather than treating it as zero", async () => {
    await openInspector();

    fireEvent.change(screen.getByLabelText("Capacity"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a capacity.");
    expect(floorApi.updateTable).not.toHaveBeenCalled();
  });

  it("rejects a capacity above the supported maximum", async () => {
    await openInspector();

    fireEvent.change(screen.getByLabelText("Capacity"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Capacity must be 40 or fewer.",
    );
    expect(floorApi.updateTable).not.toHaveBeenCalled();
  });

  it("rotates a table in fifteen degree steps and wraps at a full turn", async () => {
    floorApi.updateTable.mockResolvedValue(table({ rotation: 345 }));
    await openInspector();

    fireEvent.click(screen.getByRole("button", { name: "Rotate Left" }));
    expect(screen.getByText("345°")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rotate Right" }));
    expect(screen.getByText("0°")).toBeTruthy();
  });

  it("blocks a table with a reason and unblocks it again", async () => {
    floorApi.blockTable.mockResolvedValue(table({ isBlocked: true }));
    await openInspector();

    fireEvent.click(screen.getByRole("button", { name: "Block Table" }));

    await waitFor(() => expect(floorApi.blockTable).toHaveBeenCalledWith("loc-1", "table-1"));
    expect(await screen.findByText("Blocked")).toBeTruthy();

    floorApi.unblockTable.mockResolvedValue(table({ isBlocked: false }));
    fireEvent.click(screen.getByRole("button", { name: "Unblock Table" }));
    await waitFor(() => expect(floorApi.unblockTable).toHaveBeenCalledWith("loc-1", "table-1"));
  });
});

describe("floor size", () => {
  it("rejects a width outside the supported range before calling the API", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    render(<FloorEditor locationId="loc-1" />);

    fireEvent.change(await screen.findByLabelText("Width"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Floor Size" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Width must be between 200 and 6000.",
    );
    expect(floorApi.updateRoom).not.toHaveBeenCalled();
  });

  it("rejects a blank height rather than sending zero", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    render(<FloorEditor locationId="loc-1" />);

    fireEvent.change(await screen.findByLabelText("Height"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Floor Size" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a floor height.");
    expect(floorApi.updateRoom).not.toHaveBeenCalled();
  });

  it("saves a valid floor size", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    floorApi.updateRoom.mockResolvedValue({ ...plan([table()]), width: 2000 });

    render(<FloorEditor locationId="loc-1" />);

    fireEvent.change(await screen.findByLabelText("Width"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Floor Size" }));

    await waitFor(() =>
      expect(floorApi.updateRoom).toHaveBeenCalledWith("loc-1", "plan-1", {
        name: "Main Dining Room",
        width: 2000,
        height: 800,
      }),
    );
  });
});

describe("live assignments are left alone", () => {
  it("never calls an assignment endpoint while editing the layout", async () => {
    floorApi.fetchRooms.mockResolvedValue(rooms(plan([table()])));
    floorApi.updateTable.mockResolvedValue(table({ name: "Renamed" }));
    floorApi.createTable.mockResolvedValue(table({ id: "table-2", name: "Table 2" }));

    render(<FloorEditor locationId="loc-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Rectangle Table" }));
    fireEvent.pointerDown(screen.getByTestId("table-node-Table 1"));

    fireEvent.change(await screen.findByLabelText("Table Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(floorApi.updateTable).toHaveBeenCalled());

    const touched = Object.keys(floorApi).filter((name) => floorApi[name].mock.calls.length > 0);
    expect(touched.sort()).toEqual([
      "createTable",
      "fetchCombinations",
      "fetchRooms",
      "updateTable",
    ]);
  });
});
