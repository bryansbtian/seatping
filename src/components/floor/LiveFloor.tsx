import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import {
  LIVE_STATUSES,
  allTables,
  arrivalCountdown,
  countByStatus,
  findTable,
  formatClock,
  statusStyle,
  type LiveFloor as LiveFloorData,
  type TableCandidate,
  type LiveRoom,
  type WaitingParty,
} from "@/lib/floorLive";
import {
  admitParty,
  assignTable,
  confirmPartyArrival,
  resolveReservationTable,
  completeVisit,
  fetchLiveFloor,
  markPartyNoShow,
  markTableAvailable,
  markTableCleaning,
  movePartyToTable,
  removeParty,
  seatParty,
  seatReservedAssignment,
} from "@/lib/floorLiveApi";
import { blockTable, unblockTable } from "@/lib/floorApi";
import LiveFloorCanvas from "@/components/floor/LiveFloorCanvas";
import LiveTableDetail from "@/components/floor/LiveTableDetail";
import AssignTableDialog, {
  type AssignSelection,
  type AssignTarget,
} from "@/components/floor/AssignTableDialog";
import QueuePartyDialog from "@/components/floor/QueuePartyDialog";
import ReservationRow from "@/components/floor/ReservationRow";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15000;

type LiveFloorProps = {
  locationId: string;
  onDataChange?: () => Promise<void>;
};

const EMPTY_FLOOR: LiveFloorData = {
  now: "",
  rooms: [],
  waitingParties: [],
  admittedParties: [],
  upcomingReservations: [],
};

const LiveFloor = ({ locationId, onDataChange }: LiveFloorProps) => {
  const { t } = useLang();
  const { toast } = useToast();

  const [data, setData] = useState<LiveFloorData>(EMPTY_FLOOR);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [queueTarget, setQueueTarget] = useState<WaitingParty | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const inFlight = useRef(false);

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

  const load = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const next = await fetchLiveFloor(locationId);
      setData(next);
    } finally {
      inFlight.current = false;
    }
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedTableId(null);
    setActiveRoomId(null);
    fetchLiveFloor(locationId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setData(next);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        reportFailure(err);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, reportFailure]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const awaitingArrival = data.admittedParties.length > 0;

  useEffect(() => {
    if (!awaitingArrival) {
      return undefined;
    }
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [awaitingArrival]);

  const rooms = data.rooms;

  const activeRoom = useMemo<LiveRoom | null>(() => {
    if (rooms.length === 0) {
      return null;
    }
    return rooms.find((room) => room.id === activeRoomId) ?? rooms[0];
  }, [rooms, activeRoomId]);

  const selectedTable = useMemo(() => {
    return findTable(rooms, selectedTableId);
  }, [rooms, selectedTableId]);

  const counts = useMemo(() => countByStatus(allTables(rooms)), [rooms]);

  const now = useMemo(() => {
    const parsed = new Date(data.now);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }, [data.now]);

  const runAction = useCallback(
    async (action: () => Promise<void>, title: TKey) => {
      setBusy(true);
      try {
        await action();
        await load();
        if (onDataChange) {
          await onDataChange();
        }
        toast({ title: t(title) });
      } catch (err) {
        reportFailure(err);
      } finally {
        setBusy(false);
      }
    },
    [load, onDataChange, reportFailure, t, toast],
  );

  const admittedIds = useMemo(() => {
    return new Set(data.admittedParties.map((party) => party.id));
  }, [data.admittedParties]);

  const handleSeatParty = useCallback(
    async (tableId: string, partyId: string | null, partySize: number) => {
      const body: { partySize: number; queueEntryId?: string } = { partySize };
      if (partyId) {
        body.queueEntryId = partyId;
      }
      await runAction(async () => {
        await seatParty(locationId, tableId, body);
        if (partyId && admittedIds.has(partyId)) {
          await confirmPartyArrival(locationId, partyId);
        }
      }, "floor.live.toast.seated" as TKey);
    },
    [admittedIds, locationId, runAction],
  );

  const handleAdmitParty = useCallback(
    async (partyId: string) => {
      await runAction(() => admitParty(locationId, partyId), "floor.live.toast.admitted");
      setQueueTarget(null);
    },
    [locationId, runAction],
  );

  const handleRemoveParty = useCallback(
    async (partyId: string) => {
      await runAction(() => removeParty(locationId, partyId), "floor.live.toast.removed");
      setQueueTarget(null);
    },
    [locationId, runAction],
  );

  const handleConfirmArrival = useCallback(
    async (partyId: string) => {
      await runAction(() => confirmPartyArrival(locationId, partyId), "floor.live.toast.arrived");
    },
    [locationId, runAction],
  );

  const handleNoShow = useCallback(
    async (partyId: string) => {
      await runAction(() => markPartyNoShow(locationId, partyId), "floor.live.toast.noShow");
      setAssignTarget(null);
    },
    [locationId, runAction],
  );

  const openArrivalFor = useCallback((party: WaitingParty) => {
    setAssignTarget({
      name: party.name,
      partySize: party.partySize,
      queueEntryId: party.id,
      recommendedTableId: party.recommendedTableId,
      currentTableId: party.tableId,
      currentTableName: party.tableName,
      awaitingArrival: true,
    });
  }, []);

  const handleSeatHeldTable = useCallback(
    async (partyId: string) => {
      await handleConfirmArrival(partyId);
      setAssignTarget(null);
    },
    [handleConfirmArrival],
  );

  const handleAssignTable = useCallback(
    async (selection: AssignSelection) => {
      if (!assignTarget) {
        return;
      }
      const body: {
        tableId?: string;
        tableIds?: string[];
        partySize: number;
        queueEntryId?: string;
        reservationId?: string;
      } = { partySize: assignTarget.partySize };
      if (selection.tableIds.length > 1) {
        body.tableIds = selection.tableIds;
      } else {
        body.tableId = selection.tableIds[0];
      }
      if (assignTarget.queueEntryId) {
        body.queueEntryId = assignTarget.queueEntryId;
      }
      if (assignTarget.reservationId) {
        body.reservationId = assignTarget.reservationId;
      }

      let title: TKey = "floor.assign.toast.assigned";
      if (assignTarget.currentTableId) {
        title = "floor.assign.toast.moved";
      }
      const queueEntryId = assignTarget.queueEntryId;
      await runAction(async () => {
        await assignTable(locationId, body);
        if (queueEntryId && admittedIds.has(queueEntryId)) {
          await confirmPartyArrival(locationId, queueEntryId);
        }
      }, title);
      setAssignTarget(null);
    },
    [admittedIds, assignTarget, locationId, runAction],
  );

  const handleResolveReservation = useCallback(
    async (reservationId: string) => {
      await runAction(
        () => resolveReservationTable(locationId, reservationId),
        "floor.assign.toast.resolved",
      );
      setAssignTarget(null);
    },
    [locationId, runAction],
  );

  const handleSeatReserved = useCallback(
    async (assignmentId: string) => {
      const holder = data.admittedParties.find((party) => party.assignmentId === assignmentId);
      if (holder) {
        await runAction(
          () => confirmPartyArrival(locationId, holder.id),
          "floor.live.toast.seated" as TKey,
        );
        return;
      }
      await runAction(
        () => seatReservedAssignment(locationId, assignmentId),
        "floor.live.toast.seated" as TKey,
      );
    },
    [data.admittedParties, locationId, runAction],
  );

  const handleCompleteVisit = useCallback(
    async (assignmentId: string) => {
      await runAction(
        () => completeVisit(locationId, assignmentId),
        "floor.live.toast.completed" as TKey,
      );
    },
    [locationId, runAction],
  );

  const handleMoveParty = useCallback(
    async (assignmentId: string, targetTableId: string) => {
      await runAction(
        () => movePartyToTable(locationId, assignmentId, targetTableId),
        "floor.live.toast.moved" as TKey,
      );
      setSelectedTableId(targetTableId);
    },
    [locationId, runAction],
  );

  const handleMarkCleaning = useCallback(
    async (tableId: string) => {
      await runAction(
        () => markTableCleaning(locationId, tableId),
        "floor.live.toast.cleaning" as TKey,
      );
    },
    [locationId, runAction],
  );

  const handleMarkAvailable = useCallback(
    async (tableId: string) => {
      await runAction(
        () => markTableAvailable(locationId, tableId),
        "floor.live.toast.available" as TKey,
      );
    },
    [locationId, runAction],
  );

  const handleToggleBlocked = useCallback(
    async (tableId: string, blocked: boolean) => {
      let title: TKey = "floor.toast.tableUnblocked";
      if (blocked) {
        title = "floor.toast.tableBlocked";
      }
      await runAction(async () => {
        if (blocked) {
          await blockTable(locationId, tableId);
          return;
        }
        await unblockTable(locationId, tableId);
      }, title);
    },
    [locationId, runAction],
  );

  if (loading) {
    return (
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </CardContent>
      </Card>
    );
  }

  if (rooms.length === 0 || allTables(rooms).length === 0) {
    return (
      <Card className="flex flex-1 flex-col border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-1 flex-col p-0">
          <BusinessEmptyState
            icon={LayoutGrid}
            title={t("floor.live.empty.title")}
            body={t("floor.live.empty.body")}
          />
        </CardContent>
      </Card>
    );
  }

  const seatableParties: WaitingParty[] = [
    ...data.admittedParties.filter((party) => !party.tableId),
    ...data.waitingParties,
  ];

  let sidePanel = (
    <div className="flex h-full flex-col gap-3 md:gap-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section className="space-y-2" data-testid="waiting-parties">
          <CardTitle className="text-lg text-slate-800 md:text-xl">
            {t("floor.live.waitingTitle")}
          </CardTitle>
          {data.waitingParties.length === 0 && (
            <p className="text-xs text-slate-500 md:text-sm">{t("floor.live.waitingEmpty")}</p>
          )}
          {data.waitingParties.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.waitingParties.map((party) => (
                <li key={party.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    data-testid={`waiting-party-${party.id}`}
                    aria-label={t("floor.live.waitingActionTitle")}
                    onClick={() => setQueueTarget(party)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 disabled:opacity-60"
                  >
                    {party.recommendedTableName && (
                      <span
                        data-testid={`waiting-suggestion-${party.id}`}
                        className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-micro font-medium text-emerald-800"
                      >
                        {party.recommendedTableName}
                      </span>
                    )}
                    {party.matchState === "NO_CAPACITY" && (
                      <span
                        data-testid={`waiting-nomatch-${party.id}`}
                        title={t("floor.live.noCapacityBody")}
                        className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-micro font-medium text-rose-800"
                      >
                        {t("floor.live.noCapacity")}
                      </span>
                    )}
                    {party.matchState === "NO_AVAILABILITY" && (
                      <span
                        data-testid={`waiting-unavailable-${party.id}`}
                        title={t("floor.live.noAvailabilityBody")}
                        className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-800"
                      >
                        {t("floor.live.noAvailability")}
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-caption leading-none text-slate-500">
                        {t("floor.live.partyOf", { n: party.partySize })} &middot;{" "}
                        {t("floor.live.waitingFor", { n: party.waitingMinutes })}
                      </span>
                      <span className="truncate text-sm font-semibold leading-tight text-slate-800">
                        {party.name}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="space-y-2 border-t border-slate-100 pt-4"
          data-testid="admitted-parties"
        >
          <CardTitle className="text-lg text-slate-800 md:text-xl">
            {t("floor.live.admittedTitle")}
          </CardTitle>
          {data.admittedParties.length === 0 && (
            <p className="text-xs text-slate-500 md:text-sm">{t("floor.live.admittedEmpty")}</p>
          )}
          {data.admittedParties.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.admittedParties.map((party) => {
                const countdown = arrivalCountdown(party.admittedAt, clock);
                let countdownLabel = t("floor.live.arrivalExpired");
                if (countdown) {
                  countdownLabel = t("floor.live.arrivalLeft", { time: countdown });
                }

                let tableBadge = null;
                if (party.tableName) {
                  tableBadge = (
                    <span
                      data-testid={`admitted-table-${party.id}`}
                      className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-micro font-medium text-indigo-800"
                    >
                      {t("floor.live.holdingTable", { table: party.tableName })}
                    </span>
                  );
                } else if (party.recommendedTableName) {
                  tableBadge = (
                    <span
                      data-testid={`admitted-suggestion-${party.id}`}
                      className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-micro font-medium text-emerald-800"
                    >
                      {party.recommendedTableName}
                    </span>
                  );
                }

                let countdownTone = "bg-amber-100 text-amber-800";
                if (!countdown) {
                  countdownTone = "bg-rose-100 text-rose-800";
                }

                return (
                  <li key={party.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      data-testid={`admitted-party-${party.id}`}
                      aria-label={t("floor.live.seatNow")}
                      onClick={() => openArrivalFor(party)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100 disabled:opacity-60"
                    >
                      {tableBadge}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-caption leading-none text-slate-500">
                          {t("floor.live.partyOf", { n: party.partySize })}
                        </span>
                        <span className="truncate text-sm font-semibold leading-tight text-slate-800">
                          {party.name}
                        </span>
                      </span>
                      <span
                        data-testid={`admitted-countdown-${party.id}`}
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-micro font-medium tabular-nums",
                          countdownTone,
                        )}
                      >
                        {countdownLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="space-y-2 border-t border-slate-100 pt-4"
          data-testid="upcoming-reservations"
        >
          <CardTitle className="text-lg text-slate-800 md:text-xl">
            {t("floor.live.reservationsTitle")}
          </CardTitle>
          {data.upcomingReservations.length === 0 && (
            <p className="text-xs text-slate-500 md:text-sm">{t("floor.live.reservationsEmpty")}</p>
          )}
          {data.upcomingReservations.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.upcomingReservations.map((reservation) => (
                <ReservationRow
                  key={reservation.id}
                  reservation={reservation}
                  busy={busy}
                  onSelect={(row) =>
                    setAssignTarget({
                      name: row.name,
                      partySize: row.partySize,
                      reservationId: row.id,
                      currentTableId: row.tableId,
                      currentTableName: row.tableName,
                      needsReview: row.needsReview,
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="border-t border-slate-100 pt-4 text-xs text-slate-500 md:text-sm">
        {t("floor.live.selectHint")}
      </p>
    </div>
  );

  if (selectedTable) {
    sidePanel = (
      <LiveTableDetail
        table={selectedTable}
        rooms={rooms}
        waitingParties={seatableParties}
        now={now}
        busy={busy}
        onSeatParty={handleSeatParty}
        onSeatReserved={handleSeatReserved}
        onCompleteVisit={handleCompleteVisit}
        onMoveParty={handleMoveParty}
        onMarkCleaning={handleMarkCleaning}
        onMarkAvailable={handleMarkAvailable}
        onToggleBlocked={handleToggleBlocked}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 md:flex-1">
      {rooms.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => {
            const active = room.id === activeRoom?.id;
            return (
              <button
                key={room.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveRoomId(room.id);
                  setSelectedTableId(null);
                }}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors md:text-sm",
                  active && "border-slate-900 bg-slate-900 text-white",
                  !active && "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {room.name}
              </button>
            );
          })}
        </div>
      )}

      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex items-center justify-between gap-3 p-3 md:p-4">
          <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 min-[360px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
            {LIVE_STATUSES.map((status) => (
              <span
                key={status}
                className="flex items-center gap-1.5 text-caption text-slate-600 md:text-xs"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-3 w-3 shrink-0 rounded-full border-2",
                    statusStyle(status).swatch,
                  )}
                />
                <span className="whitespace-nowrap">
                  {t(`floor.live.status.${status}` as TKey)}
                </span>
                <span className="ml-auto shrink-0 font-semibold text-slate-800 sm:ml-0">
                  {counts[status]}
                </span>
              </span>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-caption text-slate-500 md:text-xs">
            <span className="hidden sm:inline">
              {t("floor.live.updatedAt", { time: formatClock(data.now) })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={t("floor.live.refresh")}
              disabled={busy}
              onClick={() => {
                load().catch(reportFailure);
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:min-h-0 md:flex-1 lg:landscape:grid-cols-[minmax(0,1fr)_300px] 2xl:landscape:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex flex-col border border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-1 items-center justify-center p-2 md:p-3">
            {activeRoom && (
              <LiveFloorCanvas
                room={activeRoom}
                selectedTableId={selectedTableId}
                onSelect={setSelectedTableId}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm lg:landscape:relative">
          <CardContent className="flex h-full flex-col overflow-y-auto p-4 md:p-5 lg:landscape:absolute lg:landscape:inset-0">
            {sidePanel}
          </CardContent>
        </Card>
      </div>

      <AssignTableDialog
        open={assignTarget !== null}
        target={assignTarget}
        rooms={rooms}
        busy={busy}
        onOpenChange={(next) => {
          if (!next) {
            setAssignTarget(null);
          }
        }}
        onConfirm={handleAssignTable}
        onResolve={handleResolveReservation}
        onNoShow={handleNoShow}
        onSeatHeldTable={handleSeatHeldTable}
      />

      <QueuePartyDialog
        open={queueTarget !== null}
        party={queueTarget}
        busy={busy}
        onOpenChange={(next) => {
          if (!next) {
            setQueueTarget(null);
          }
        }}
        onAdmit={handleAdmitParty}
        onRemove={handleRemoveParty}
      />
    </div>
  );
};

export default LiveFloor;
