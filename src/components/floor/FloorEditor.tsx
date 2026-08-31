import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  LayoutGridIcon,
  RotateClockwiseIcon,
  SquareDashedIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import {
  blockTable as blockTableRequest,
  createRoom,
  createTable,
  createZone,
  deleteRoom as deleteRoomRequest,
  deleteTable as deleteTableRequest,
  deleteZone as deleteZoneRequest,
  fetchRooms,
  unblockTable as unblockTableRequest,
  updateRoom,
  updateTable,
  updateZone,
  type DiningTable,
  type Room,
  type TablePatch,
  type ZonePatch,
} from "@/lib/floorApi";
import {
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_FLOOR_WIDTH,
  defaultSizeForShape,
  findFreeSlot,
  isInvalid,
  nextTableName,
  toNumberOrBlank,
  validateFloorSize,
  type Rect,
  type TableShape,
} from "@/lib/floorGeometry";
import FloorCanvas, { type CanvasSelection } from "@/components/floor/FloorCanvas";
import TableInspector from "@/components/floor/TableInspector";
import ZoneInspector from "@/components/floor/ZoneInspector";
import ShapePalette from "@/components/floor/ShapePalette";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { cn } from "@/lib/utils";

function nextRoomName(existing: string[]): string {
  const used = new Set(existing.map((name) => name.toLowerCase()));
  if (!used.has("main dining room")) {
    return "Main Dining Room";
  }
  let index = 2;
  while (used.has(`room ${index}`)) {
    index += 1;
  }
  return `Room ${index}`;
}

function nextZoneName(existing: string[], base: string): string {
  const used = new Set(existing.map((name) => name.toLowerCase()));
  if (!used.has(base.toLowerCase())) {
    return base;
  }
  let index = 2;
  while (used.has(`${base.toLowerCase()} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}

const FloorEditor = ({ locationId }: { locationId: string }) => {
  const { t } = useLang();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomWidth, setRoomWidth] = useState<number | "">("");
  const [roomHeight, setRoomHeight] = useState<number | "">("");
  const [roomError, setRoomError] = useState<TKey | null>(null);

  const activeRoom = useMemo(() => {
    return rooms.find((room) => room.id === activeRoomId) ?? null;
  }, [rooms, activeRoomId]);

  const syncRoomForm = useCallback((room: Room | null) => {
    if (!room) {
      setRoomName("");
      setRoomWidth("");
      setRoomHeight("");
      return;
    }
    setRoomName(room.name);
    setRoomWidth(room.width);
    setRoomHeight(room.height);
  }, []);

  const reportFailure = useCallback(
    (err: unknown) => {
      let description = "";
      if (err instanceof Error) {
        description = err.message;
      }
      toast({ title: t("floor.toast.failed"), description, variant: "destructive" });
    },
    [t, toast],
  );

  const loadRooms = useCallback(
    async (preferredRoomId: string | null) => {
      const loaded = await fetchRooms(locationId);
      setRooms(loaded);
      let nextActive: Room | null = null;
      if (preferredRoomId) {
        nextActive = loaded.find((room) => room.id === preferredRoomId) ?? null;
      }
      if (!nextActive) {
        nextActive = loaded[0] ?? null;
      }
      setActiveRoomId(nextActive?.id ?? null);
      syncRoomForm(nextActive);
      return loaded;
    },
    [locationId, syncRoomForm],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelection(null);
    fetchRooms(locationId)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setRooms(loaded);
        const first = loaded[0] ?? null;
        setActiveRoomId(first?.id ?? null);
        syncRoomForm(first);
      })
      .catch((err) => {
        if (!cancelled) {
          reportFailure(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, reportFailure, syncRoomForm]);

  const selectRoom = (roomId: string) => {
    const room = rooms.find((candidate) => candidate.id === roomId) ?? null;
    setActiveRoomId(roomId);
    setSelection(null);
    syncRoomForm(room);
    setRoomError(null);
  };

  const handleCreateRoom = async () => {
    setSaving(true);
    try {
      const created = await createRoom(locationId, {
        name: nextRoomName(rooms.map((room) => room.name)),
      });
      setRooms((previous) => [...previous, created]);
      setActiveRoomId(created.id);
      setSelection(null);
      syncRoomForm(created);
      toast({ title: t("floor.toast.roomCreated") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRoom = async () => {
    if (!activeRoom) {
      return;
    }
    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setRoomError("floor.error.roomNameRequired");
      return;
    }
    const sizeCheck = validateFloorSize(roomWidth, roomHeight);
    if (isInvalid(sizeCheck)) {
      setRoomError(`floor.error.${sizeCheck.reason}` as TKey);
      return;
    }

    setRoomError(null);
    setSaving(true);
    try {
      const updated = await updateRoom(locationId, activeRoom.id, {
        name: trimmedName,
        width: roomWidth as number,
        height: roomHeight as number,
      });
      setRooms((previous) =>
        previous.map((room) => {
          if (room.id !== updated.id) {
            return room;
          }
          return updated;
        }),
      );
      toast({ title: t("floor.toast.roomUpdated") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!activeRoom) {
      return;
    }
    try {
      await deleteRoomRequest(locationId, activeRoom.id);
      setSelection(null);
      await loadRooms(null);
      toast({ title: t("floor.toast.roomDeleted") });
    } catch (err) {
      reportFailure(err);
      throw err;
    }
  };

  const handleResetRoom = async () => {
    if (!activeRoom) {
      return;
    }
    setSaving(true);
    try {
      let kept = 0;
      for (const table of activeRoom.tables) {
        try {
          await deleteTableRequest(locationId, table.id);
        } catch {
          kept += 1;
        }
      }
      for (const zone of activeRoom.zones) {
        await deleteZoneRequest(locationId, zone.id).catch(() => undefined);
      }
      await updateRoom(locationId, activeRoom.id, {
        width: DEFAULT_FLOOR_WIDTH,
        height: DEFAULT_FLOOR_HEIGHT,
      });

      setSelection(null);
      await loadRooms(activeRoom.id);

      if (kept > 0) {
        toast({
          title: t("floor.toast.resetPartial", { n: kept }),
          description: t("floor.toast.resetPartialBody"),
        });
        return;
      }
      toast({ title: t("floor.toast.reset") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const patchRoom = useCallback((roomId: string, updater: (room: Room) => Room) => {
    setRooms((previous) =>
      previous.map((room) => {
        if (room.id !== roomId) {
          return room;
        }
        return updater(room);
      }),
    );
  }, []);

  const handleAddTable = async (shape: TableShape) => {
    if (!activeRoom) {
      return;
    }
    setSaving(true);
    try {
      const size = defaultSizeForShape(shape);
      const occupied: Rect[] = activeRoom.tables.map((table) => ({
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
      }));
      const slot = findFreeSlot(occupied, size, activeRoom);
      const usedNames = rooms.flatMap((room) => room.tables.map((table) => table.name));

      const created = await createTable(locationId, activeRoom.id, {
        name: nextTableName(usedNames),
        capacity: 4,
        minimumPartySize: 1,
        shape,
        x: slot.x,
        y: slot.y,
        width: size.width,
        height: size.height,
        rotation: 0,
      });

      patchRoom(activeRoom.id, (room) => ({ ...room, tables: [...room.tables, created] }));
      setSelection({ kind: "table", id: created.id });
      toast({ title: t("floor.toast.tableCreated") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddZone = async () => {
    if (!activeRoom) {
      return;
    }
    setSaving(true);
    try {
      const created = await createZone(locationId, activeRoom.id, {
        name: nextZoneName(
          activeRoom.zones.map((zone) => zone.name),
          t("floor.newZoneName"),
        ),
        x: 40,
        y: 40,
        width: 320,
        height: 220,
      });
      patchRoom(activeRoom.id, (room) => ({ ...room, zones: [...room.zones, created] }));
      setSelection({ kind: "zone", id: created.id });
      toast({ title: t("floor.toast.zoneCreated") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = useCallback(
    (target: "table" | "zone", id: string, rect: Rect) => {
      if (!activeRoomId) {
        return;
      }
      patchRoom(activeRoomId, (room) => {
        if (target === "zone") {
          return {
            ...room,
            zones: room.zones.map((zone) => {
              if (zone.id !== id) {
                return zone;
              }
              return { ...zone, ...rect };
            }),
          };
        }
        return {
          ...room,
          tables: room.tables.map((table) => {
            if (table.id !== id) {
              return table;
            }
            return { ...table, ...rect };
          }),
        };
      });
    },
    [activeRoomId, patchRoom],
  );

  const handleCommit = useCallback(
    async (target: "table" | "zone", id: string, rect: Rect) => {
      if (!activeRoomId) {
        return;
      }
      try {
        if (target === "zone") {
          const updatedZone = await updateZone(locationId, id, rect);
          patchRoom(activeRoomId, (room) => ({
            ...room,
            zones: room.zones.map((zone) => {
              if (zone.id !== id) {
                return zone;
              }
              return updatedZone;
            }),
          }));
          return;
        }
        const updatedTable = await updateTable(locationId, id, rect);
        patchRoom(activeRoomId, (room) => ({
          ...room,
          tables: room.tables.map((table) => {
            if (table.id !== id) {
              return table;
            }
            return updatedTable;
          }),
        }));
      } catch (err) {
        reportFailure(err);
        await loadRooms(activeRoomId).catch(() => undefined);
      }
    },
    [locationId, activeRoomId, patchRoom, reportFailure, loadRooms],
  );

  const selectedTable = useMemo(() => {
    if (!activeRoom || selection?.kind !== "table") {
      return null;
    }
    return activeRoom.tables.find((table) => table.id === selection.id) ?? null;
  }, [activeRoom, selection]);

  const selectedZone = useMemo(() => {
    if (!activeRoom || selection?.kind !== "zone") {
      return null;
    }
    return activeRoom.zones.find((zone) => zone.id === selection.id) ?? null;
  }, [activeRoom, selection]);

  const handleSaveTable = async (patch: TablePatch) => {
    if (!selectedTable || !activeRoomId) {
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTable(locationId, selectedTable.id, patch);
      patchRoom(activeRoomId, (room) => ({
        ...room,
        tables: room.tables.map((table) => {
          if (table.id !== updated.id) {
            return table;
          }
          return updated;
        }),
      }));
      toast({ title: t("floor.toast.tableUpdated") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!selectedTable || !activeRoomId) {
      return;
    }
    const tableId = selectedTable.id;
    try {
      await deleteTableRequest(locationId, tableId);
      patchRoom(activeRoomId, (room) => ({
        ...room,
        tables: room.tables.filter((table) => table.id !== tableId),
      }));
      setSelection(null);
      toast({ title: t("floor.toast.tableDeleted") });
    } catch (err) {
      reportFailure(err);
      throw err;
    }
  };

  const handleToggleBlocked = async (blocked: boolean) => {
    if (!selectedTable || !activeRoomId) {
      return;
    }
    setSaving(true);
    try {
      let updated: DiningTable;
      if (blocked) {
        updated = await blockTableRequest(locationId, selectedTable.id);
        toast({ title: t("floor.toast.tableBlocked") });
      } else {
        updated = await unblockTableRequest(locationId, selectedTable.id);
        toast({ title: t("floor.toast.tableUnblocked") });
      }
      patchRoom(activeRoomId, (room) => ({
        ...room,
        tables: room.tables.map((table) => {
          if (table.id !== updated.id) {
            return table;
          }
          return updated;
        }),
      }));
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveZone = async (patch: ZonePatch) => {
    if (!selectedZone || !activeRoomId) {
      return;
    }
    setSaving(true);
    try {
      const updated = await updateZone(locationId, selectedZone.id, patch);
      patchRoom(activeRoomId, (room) => ({
        ...room,
        zones: room.zones.map((zone) => {
          if (zone.id !== updated.id) {
            return zone;
          }
          return updated;
        }),
      }));
      toast({ title: t("floor.toast.zoneUpdated") });
    } catch (err) {
      reportFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async () => {
    if (!selectedZone || !activeRoomId) {
      return;
    }
    const zoneId = selectedZone.id;
    try {
      await deleteZoneRequest(locationId, zoneId);
      patchRoom(activeRoomId, (room) => ({
        ...room,
        zones: room.zones.filter((zone) => zone.id !== zoneId),
      }));
      setSelection(null);
      toast({ title: t("floor.toast.zoneDeleted") });
    } catch (err) {
      reportFailure(err);
      throw err;
    }
  };

  if (loading) {
    return (
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </CardContent>
      </Card>
    );
  }

  if (!activeRoom) {
    return (
      <Card className="flex flex-1 flex-col border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-1 flex-col p-0">
          <BusinessEmptyState
            icon={LayoutGridIcon}
            title={t("floor.empty.title")}
            body={t("floor.empty.body")}
          >
            <Button disabled={saving} onClick={handleCreateRoom}>
              <HugeiconsIcon icon={Add01Icon} className="mr-2 h-4 w-4" />
              {t("floor.createPlan")}
            </Button>
          </BusinessEmptyState>
        </CardContent>
      </Card>
    );
  }

  let tableCountLabel = t("floor.tableCount", { n: activeRoom.tables.length });
  if (activeRoom.tables.length === 1) {
    tableCountLabel = t("floor.tableCountOne");
  }

  const totalSeats = activeRoom.tables.reduce((sum, table) => sum + table.capacity, 0);
  let seatCountLabel = t("floor.seatCount", { n: totalSeats });
  if (totalSeats === 1) {
    seatCountLabel = t("floor.seatCountOne");
  }

  let inspector = <p className="text-xs text-slate-600 md:text-sm">{t("floor.selectHintRoom")}</p>;
  if (selectedTable) {
    inspector = (
      <TableInspector
        table={selectedTable}
        saving={saving}
        onSave={handleSaveTable}
        onDelete={handleDeleteTable}
        onToggleBlocked={handleToggleBlocked}
      />
    );
  }
  if (selectedZone) {
    inspector = (
      <ZoneInspector
        zone={selectedZone}
        saving={saving}
        onSave={handleSaveZone}
        onDelete={handleDeleteZone}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 md:flex-1 md:gap-4">
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-3 md:space-y-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg text-slate-800 md:text-xl">
              {t("floor.settings.title")}
            </CardTitle>
            <span className="text-xs text-slate-600 md:text-sm">
              {tableCountLabel} &middot; {seatCountLabel}
            </span>
          </div>

          <div className="space-y-1.5">
            <p className="text-caption font-semibold uppercase tracking-wide text-slate-400">
              {t("floor.rooms")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {rooms.map((room) => {
                const active = room.id === activeRoom.id;
                const seats = room.tables.reduce((sum, table) => sum + table.capacity, 0);
                return (
                  <button
                    key={room.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectRoom(room.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors md:text-sm",
                      active && "border-indigo-600 bg-indigo-600 text-white",
                      !active && "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <span className="max-w-[10rem] truncate">{room.name}</span>
                    <span className={cn(active && "text-indigo-100", !active && "text-slate-400")}>
                      {seats}
                    </span>
                  </button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs md:h-9"
                disabled={saving}
                onClick={handleCreateRoom}
              >
                <HugeiconsIcon icon={Add01Icon} className="mr-1.5 h-4 w-4" />
                {t("floor.newRoom")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-end xl:justify-between xl:gap-4">
            <div className="space-y-1.5">
              <p className="text-caption font-semibold uppercase tracking-wide text-slate-400">
                {t("floor.addTable")}
              </p>
              <div className="flex flex-wrap items-stretch gap-2 lg:flex-nowrap">
                <ShapePalette disabled={saving} onAdd={handleAddTable} />
                <button
                  type="button"
                  disabled={saving}
                  aria-label={t("floor.addZone")}
                  onClick={handleAddZone}
                  className="flex min-w-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-2 py-2.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-[80px] lg:w-[76px] lg:min-w-0 lg:shrink-0"
                >
                  <span className="flex h-6 items-center justify-center">
                    <HugeiconsIcon icon={SquareDashedIcon} className="h-6 w-6 text-slate-400" />
                  </span>
                  <span className="text-caption font-medium leading-tight text-slate-600 md:text-xs">
                    {t("floor.addZone")}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 md:gap-3 xl:flex-nowrap xl:gap-2">
              <div className="grid w-full grid-cols-[2fr_1fr_1fr] items-end gap-2 md:gap-3 xl:contents">
                <div className="min-w-0 space-y-1 xl:shrink-0">
                  <Label htmlFor="room-name" className="text-caption md:text-xs">
                    {t("floor.roomName")}
                  </Label>
                  <Input
                    id="room-name"
                    className="h-9 w-full text-xs md:h-10 md:text-sm xl:w-32"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1 xl:flex-none xl:shrink-0">
                  <Label htmlFor="floor-width" className="text-caption md:text-xs">
                    {t("floor.width")}
                  </Label>
                  <Input
                    id="floor-width"
                    type="number"
                    className="h-9 w-full text-xs md:h-10 md:text-sm xl:w-20"
                    min={200}
                    max={6000}
                    value={roomWidth}
                    onChange={(event) => setRoomWidth(toNumberOrBlank(event.target.value))}
                  />
                </div>
                <div className="min-w-0 space-y-1 xl:flex-none xl:shrink-0">
                  <Label htmlFor="floor-height" className="text-caption md:text-xs">
                    {t("floor.height")}
                  </Label>
                  <Input
                    id="floor-height"
                    type="number"
                    className="h-9 w-full text-xs md:h-10 md:text-sm xl:w-20"
                    min={200}
                    max={6000}
                    value={roomHeight}
                    onChange={(event) => setRoomHeight(toNumberOrBlank(event.target.value))}
                  />
                </div>
              </div>
              <div className="flex w-full flex-wrap gap-2 xl:contents">
                <Button
                  size="sm"
                  className="h-9 flex-1 whitespace-nowrap px-2 text-xs max-[425px]:w-full max-[425px]:basis-full md:h-10 md:text-sm xl:flex-none xl:px-3"
                  disabled={saving}
                  onClick={handleSaveRoom}
                >
                  {t("floor.savePlanSize")}
                </Button>

                <ConfirmModal
                  title={t("floor.reset.title")}
                  description={t("floor.reset.body")}
                  cancelText={t("common.cancel")}
                  confirmText={t("floor.reset.confirm")}
                  icon="warning"
                  onConfirm={handleResetRoom}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("floor.reset")}
                      className="h-9 flex-1 whitespace-nowrap border-red-200 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 md:h-10 md:text-sm xl:flex-none xl:px-3"
                      disabled={saving}
                    >
                      <HugeiconsIcon icon={RotateClockwiseIcon} className="mr-1.5 h-4 w-4" />
                      {t("floor.reset")}
                    </Button>
                  }
                />

                <ConfirmModal
                  title={t("floor.delete.roomTitle")}
                  description={t("floor.delete.roomBody")}
                  cancelText={t("common.cancel")}
                  confirmText={t("floor.deleteRoom")}
                  onConfirm={handleDeleteRoom}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("floor.deleteRoom")}
                      className="h-9 flex-1 whitespace-nowrap border-red-200 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 md:h-10 md:text-sm xl:flex-none xl:px-3"
                      disabled={saving}
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="mr-1.5 h-4 w-4" />
                      {t("floor.deleteRoom")}
                    </Button>
                  }
                />
              </div>
            </div>
          </div>

          {roomError && (
            <p role="alert" className="text-xs text-red-600 md:text-sm">
              {t(roomError)}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:min-h-0 md:flex-1 md:gap-4 lg:landscape:grid-cols-[minmax(0,1fr)_300px] 2xl:landscape:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex flex-col border border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-1 items-center justify-center p-2 pt-2 md:p-3 md:pt-3">
            <FloorCanvas
              room={activeRoom}
              tables={activeRoom.tables}
              zones={activeRoom.zones}
              selection={selection}
              onSelect={setSelection}
              onPreview={handlePreview}
              onCommit={handleCommit}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col border border-slate-200 bg-white shadow-sm lg:landscape:relative">
          <CardContent className="flex-1 overflow-y-auto p-3 pt-3 md:p-5 md:pt-5 lg:landscape:absolute lg:landscape:inset-0">
            {inspector}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FloorEditor;
