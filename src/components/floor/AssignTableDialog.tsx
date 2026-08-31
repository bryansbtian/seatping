import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon, Tick02Icon, UsersRoundIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import {
  candidateTablesForParty,
  combinableTables,
  combinedCapacity,
  combinedName,
  joinedRoomId,
  statusStyle,
  type LiveRoom,
  type TableCandidate,
} from "@/lib/floorLive";
import { cn } from "@/lib/utils";

export type AssignTarget = {
  name: string;
  partySize: number;
  queueEntryId?: string;
  reservationId?: string;
  currentTableId?: string | null;
  currentTableName?: string | null;
  recommendedTableId?: string | null;
  needsReview?: boolean;
  awaitingArrival?: boolean;
};

export type AssignSelection = {
  tableIds: string[];
  name: string;
  capacity: number;
};

type AssignTableDialogProps = {
  open: boolean;
  target: AssignTarget | null;
  rooms: LiveRoom[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: AssignSelection) => Promise<void>;
  onResolve: (reservationId: string) => Promise<void>;
  onNoShow?: (queueEntryId: string) => Promise<void>;
  onSeatHeldTable?: (queueEntryId: string) => Promise<void>;
};

const AssignTableDialog = ({
  open,
  target,
  rooms,
  busy,
  onOpenChange,
  onConfirm,
  onResolve,
  onNoShow,
  onSeatHeldTable,
}: AssignTableDialogProps) => {
  const { t } = useLang();
  const [chosen, setChosen] = useState<TableCandidate | null>(null);
  const [combining, setCombining] = useState(false);
  const [joined, setJoined] = useState<string[]>([]);

  useEffect(() => {
    setChosen(null);
    setCombining(false);
    setJoined([]);
  }, [target?.queueEntryId, target?.reservationId, open]);

  if (!target) {
    return null;
  }

  const candidates = candidateTablesForParty(
    rooms,
    target.partySize,
    target.recommendedTableId ?? null,
    target.currentTableId ?? null,
  );
  const joinable = combinableTables(rooms, target.currentTableId ?? null);
  const picked = joined
    .map((id) => joinable.find((option) => option.id === id))
    .filter((option): option is TableCandidate => Boolean(option));
  const pickedSeats = combinedCapacity(picked);
  const enoughSeats = pickedSeats >= target.partySize;
  const lockedRoomId = joinedRoomId(picked);

  const enterCombining = () => {
    setCombining(true);
    setChosen(null);
    setJoined([]);
  };

  const leaveCombining = () => {
    setCombining(false);
    setChosen(null);
    setJoined([]);
  };

  const toggleJoined = (id: string) => {
    setJoined((current) => {
      if (current.includes(id)) {
        return current.filter((entry) => entry !== id);
      }
      return [...current, id];
    });
  };

  let emptyMessage = t("floor.assign.noTables");
  if (target.currentTableName) {
    emptyMessage = t("floor.assign.noOtherTables");
  }

  let body = <p className="pt-2 text-center text-sm text-slate-500">{emptyMessage}</p>;

  if (!combining && candidates.length > 0) {
    body = (
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1" data-testid="assign-table-options">
        {candidates.map((candidate) => {
          const selected = chosen?.id === candidate.id;

          let swatch = null;
          if (candidate.status) {
            swatch = (
              <span
                aria-hidden="true"
                className={cn(
                  "h-3 w-3 shrink-0 rounded-full border-2",
                  statusStyle(candidate.status).swatch,
                )}
              />
            );
          }

          let trailing = (
            <span className="shrink-0 text-caption text-slate-500">
              {t(`floor.live.status.${candidate.status}` as TKey)}
            </span>
          );
          if (candidate.recommended) {
            trailing = (
              <span
                data-testid="assign-recommended-badge"
                className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-micro font-medium text-white"
              >
                <HugeiconsIcon icon={StarIcon} className="h-3 w-3" aria-hidden="true" />
                {t("floor.assign.recommended")}
              </span>
            );
          }

          return (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={busy}
                data-testid={`assign-option-${candidate.name}`}
                aria-pressed={selected}
                onClick={() => setChosen(candidate)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  selected && "border-slate-900 bg-slate-50",
                  !selected && "border-slate-200 hover:bg-slate-50",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {swatch}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {candidate.name}
                    </span>
                    <span className="block truncate text-caption text-slate-500">
                      {candidate.detail} &middot;{" "}
                      {t("floor.assign.seats", { n: candidate.capacity })}
                    </span>
                  </span>
                </span>
                {trailing}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (combining) {
    body = (
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1" data-testid="assign-join-options">
        {joinable.map((option) => {
          const selected = joined.includes(option.id);
          const otherRoom = Boolean(lockedRoomId) && option.roomId !== lockedRoomId;

          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={busy || otherRoom}
                data-testid={`assign-join-${option.name}`}
                aria-pressed={selected}
                onClick={() => toggleJoined(option.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  selected && "border-slate-900 bg-slate-50",
                  !selected && "border-slate-200 hover:bg-slate-50",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      selected && "border-slate-900 bg-slate-900 text-white",
                      !selected && "border-slate-300",
                    )}
                  >
                    {selected && <HugeiconsIcon icon={Tick02Icon} className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {option.name}
                    </span>
                    <span className="block truncate text-caption text-slate-500">
                      {option.detail} &middot; {t("floor.assign.seats", { n: option.capacity })}
                    </span>
                  </span>
                </span>
                {otherRoom && (
                  <span className="shrink-0 text-caption text-slate-400">
                    {t("floor.assign.otherRoom")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const noSingleTable = !combining && candidates.length === 0 && joinable.length > 0;

  let confirmLabel = t("floor.assign.confirm");
  if (noSingleTable) {
    confirmLabel = t("floor.assign.joinTables");
  }
  if (!combining && chosen) {
    confirmLabel = t("floor.assign.confirmNamed", { table: chosen.name });
  }
  if (combining && picked.length > 0) {
    confirmLabel = t("floor.assign.confirmNamed", { table: combinedName(picked) });
  }

  let confirmDisabled = busy || !chosen;
  if (noSingleTable) {
    confirmDisabled = busy;
  }
  if (combining) {
    confirmDisabled = busy || picked.length === 0 || !enoughSeats;
  }

  const arrivalTarget = Boolean(target.awaitingArrival) && Boolean(target.queueEntryId);
  const seatHeldTable = Boolean(
    arrivalTarget && onSeatHeldTable && target.currentTableId && !combining && !chosen,
  );
  if (seatHeldTable) {
    confirmLabel = t("floor.live.seatNow");
    confirmDisabled = busy;
  }

  let currentNote = null;
  if (target.currentTableName && !combining) {
    currentNote = (
      <p
        data-testid="assign-current-table"
        className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900"
        role="status"
      >
        {t("floor.assign.currentTable", { table: target.currentTableName })}
      </p>
    );
  }

  let note = null;
  if (!combining && chosen) {
    note = (
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status">
        {t("floor.assign.summary", {
          name: target.name,
          n: target.partySize,
          table: chosen.name,
          capacity: chosen.capacity,
        })}
      </p>
    );
  }
  if (combining) {
    let joinNote = t("floor.assign.joinHelp");
    if (picked.length > 0) {
      joinNote = t("floor.assign.joinSummary", {
        tables: combinedName(picked),
        capacity: pickedSeats,
        n: target.partySize,
      });
    }
    note = (
      <p
        data-testid="assign-join-summary"
        className={cn(
          "rounded-xl px-3 py-2 text-xs",
          enoughSeats && picked.length > 0 && "bg-slate-50 text-slate-600",
          (!enoughSeats || picked.length === 0) && "bg-amber-50 text-amber-800",
        )}
        role="status"
      >
        {joinNote}
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("floor.assign.title")}</DialogTitle>
          <DialogDescription asChild>
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-slate-600">
              <span className="flex min-w-0 items-center gap-2">
                <HugeiconsIcon
                  icon={UsersRoundIcon}
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">
                  {target.name} &middot; {t("floor.live.partyOf", { n: target.partySize })}
                </span>
              </span>
              {combining && joinable.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="assign-join-toggle"
                  onClick={leaveCombining}
                  className="shrink-0 text-xs font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900 disabled:opacity-60"
                >
                  {t("floor.assign.useOneTable")}
                </button>
              )}
              {!combining && candidates.length > 0 && joinable.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="assign-join-toggle"
                  onClick={enterCombining}
                  className="shrink-0 text-xs font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900 disabled:opacity-60"
                >
                  {t("floor.assign.joinTablesInstead")}
                </button>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {currentNote}

          {body}

          {note}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {arrivalTarget && onNoShow && (
            <Button
              variant="destructiveOutline"
              disabled={busy}
              data-testid="assign-no-show"
              onClick={() => onNoShow(target.queueEntryId as string)}
            >
              {t("floor.live.noShow")}
            </Button>
          )}
          {target.needsReview && target.reservationId && !combining && (
            <Button
              variant="outline"
              disabled={busy}
              data-testid="assign-resolve"
              onClick={() => onResolve(target.reservationId as string)}
            >
              {t("floor.assign.resolve")}
            </Button>
          )}
          <Button
            disabled={confirmDisabled}
            data-testid="assign-confirm"
            onClick={() => {
              if (seatHeldTable && onSeatHeldTable) {
                onSeatHeldTable(target.queueEntryId as string);
                return;
              }
              if (noSingleTable) {
                enterCombining();
                return;
              }
              if (combining && picked.length > 0) {
                onConfirm({
                  tableIds: picked.map((option) => option.id),
                  name: combinedName(picked),
                  capacity: pickedSeats,
                });
                return;
              }
              if (chosen) {
                onConfirm({
                  tableIds: [chosen.id],
                  name: chosen.name,
                  capacity: chosen.capacity,
                });
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignTableDialog;
