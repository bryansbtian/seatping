import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => {
  return { api: apiMock };
});

import {
  blockTable,
  createCombination,
  createRoom,
  createTable,
  createZone,
  deleteCombination,
  deleteRoom,
  deleteTable,
  deleteZone,
  fetchCombinations,
  fetchRooms,
  unblockTable,
  updateRoom,
  updateTable,
  updateZone,
} from "../../src/lib/floorApi.js";

const LOCATION = "loc-1";
const ROOM = "room-1";
const TABLE = "table-1";
const ZONE = "zone-1";

function lastCall(): [string, { method?: string; body?: string }] {
  const call = apiMock.mock.calls[apiMock.mock.calls.length - 1];
  return [call[0], call[1] ?? {}];
}

function sentBody(): any {
  const [, init] = lastCall();
  return JSON.parse(init.body ?? "{}");
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({});
});

describe("fetchRooms", () => {
  it("reads the rooms for a location", async () => {
    apiMock.mockResolvedValue({ rooms: [{ id: ROOM }] });

    const rooms = await fetchRooms(LOCATION);

    expect(lastCall()[0]).toBe("/api/floor/loc-1");
    expect(rooms).toEqual([{ id: ROOM }]);
  });

  it("treats a missing rooms field as an empty layout", async () => {
    apiMock.mockResolvedValue({});
    expect(await fetchRooms(LOCATION)).toEqual([]);
  });
});

describe("room requests", () => {
  it("creates a room", async () => {
    apiMock.mockResolvedValue({ room: { id: ROOM } });

    const room = await createRoom(LOCATION, { name: "Patio", width: 1400, height: 900 });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/rooms");
    expect(init.method).toBe("POST");
    expect(sentBody()).toEqual({ name: "Patio", width: 1400, height: 900 });
    expect(room).toEqual({ id: ROOM });
  });

  it("updates a room by id", async () => {
    apiMock.mockResolvedValue({ room: { id: ROOM } });

    await updateRoom(LOCATION, ROOM, { name: "Main Dining Room" });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/rooms/room-1");
    expect(init.method).toBe("PATCH");
    expect(sentBody()).toEqual({ name: "Main Dining Room" });
  });

  it("deletes a room by id", async () => {
    await deleteRoom(LOCATION, ROOM);

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/rooms/room-1");
    expect(init.method).toBe("DELETE");
  });
});

describe("table requests", () => {
  it("creates a table inside a room", async () => {
    apiMock.mockResolvedValue({ table: { id: TABLE } });

    const table = await createTable(LOCATION, ROOM, {
      name: "T1",
      capacity: 4,
      minimumPartySize: 1,
      shape: "RECTANGLE",
      x: 10,
      y: 20,
      width: 130,
      height: 80,
      rotation: 0,
    });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/rooms/room-1/tables");
    expect(init.method).toBe("POST");
    expect(sentBody().name).toBe("T1");
    expect(sentBody().shape).toBe("RECTANGLE");
    expect(table).toEqual({ id: TABLE });
  });

  it("updates a table by id", async () => {
    apiMock.mockResolvedValue({ table: { id: TABLE } });

    await updateTable(LOCATION, TABLE, { x: 100, y: 200 });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/tables/table-1");
    expect(init.method).toBe("PATCH");
    expect(sentBody()).toEqual({ x: 100, y: 200 });
  });

  it("deletes a table by id", async () => {
    await deleteTable(LOCATION, TABLE);

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/tables/table-1");
    expect(init.method).toBe("DELETE");
  });

  it("blocks a table without sending a reason", async () => {
    apiMock.mockResolvedValue({ table: { id: TABLE, isBlocked: true } });

    const table = await blockTable(LOCATION, TABLE);

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/tables/table-1/block");
    expect(init.method).toBe("POST");
    expect(sentBody()).toEqual({});
    expect(table.isBlocked).toBe(true);
  });

  it("unblocks a table", async () => {
    apiMock.mockResolvedValue({ table: { id: TABLE, isBlocked: false } });

    const table = await unblockTable(LOCATION, TABLE);

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/tables/table-1/unblock");
    expect(init.method).toBe("POST");
    expect(table.isBlocked).toBe(false);
  });
});

describe("zone requests", () => {
  it("creates a zone inside a room", async () => {
    apiMock.mockResolvedValue({ zone: { id: ZONE } });

    const zone = await createZone(LOCATION, ROOM, {
      name: "Patio zone",
      x: 40,
      y: 40,
      width: 320,
      height: 220,
    });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/rooms/room-1/zones");
    expect(init.method).toBe("POST");
    expect(sentBody().name).toBe("Patio zone");
    expect(zone).toEqual({ id: ZONE });
  });

  it("updates a zone by id, outside the room path", async () => {
    apiMock.mockResolvedValue({ zone: { id: ZONE } });

    await updateZone(LOCATION, ZONE, { name: "Bar zone" });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/zones/zone-1");
    expect(init.method).toBe("PATCH");
    expect(sentBody()).toEqual({ name: "Bar zone" });
  });

  it("deletes a zone by id", async () => {
    await deleteZone(LOCATION, ZONE);

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/zones/zone-1");
    expect(init.method).toBe("DELETE");
  });
});

describe("error propagation", () => {
  it("lets a failed request reject so callers can report it", async () => {
    apiMock.mockRejectedValue(new Error("Table already has an assignment during that time"));

    await expect(createTable(LOCATION, ROOM, {} as never)).rejects.toThrow(
      "Table already has an assignment during that time",
    );
  });
});

describe("combination requests", () => {
  it("reads the combinations for a location", async () => {
    apiMock.mockResolvedValue({ combinations: [{ id: "combo-1" }] });

    const combinations = await fetchCombinations(LOCATION);

    expect(lastCall()[0]).toBe("/api/floor/loc-1/combinations");
    expect(combinations).toEqual([{ id: "combo-1" }]);
  });

  it("treats a missing combinations field as none configured", async () => {
    apiMock.mockResolvedValue({});
    expect(await fetchCombinations(LOCATION)).toEqual([]);
  });

  it("creates a combination from a list of tables", async () => {
    apiMock.mockResolvedValue({ combination: { id: "combo-1" } });

    const created = await createCombination(LOCATION, { tableIds: ["a", "b"] });

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/combinations");
    expect(init.method).toBe("POST");
    expect(sentBody()).toEqual({ tableIds: ["a", "b"] });
    expect(created).toEqual({ id: "combo-1" });
  });

  it("passes an explicit name and minimum party size when given", async () => {
    apiMock.mockResolvedValue({ combination: { id: "combo-1" } });

    await createCombination(LOCATION, {
      tableIds: ["a", "b"],
      name: "Big Setup",
      minimumPartySize: 5,
    });

    expect(sentBody()).toEqual({
      tableIds: ["a", "b"],
      name: "Big Setup",
      minimumPartySize: 5,
    });
  });

  it("deletes a combination by id", async () => {
    await deleteCombination(LOCATION, "combo-1");

    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/combinations/combo-1");
    expect(init.method).toBe("DELETE");
  });

  it("lets a rejected combination request reject so the caller can report it", async () => {
    apiMock.mockRejectedValue(new Error("A combination needs at least 2 tables"));

    await expect(createCombination(LOCATION, { tableIds: ["a"] })).rejects.toThrow(
      "A combination needs at least 2 tables",
    );
  });
});
