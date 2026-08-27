import { useEffect, useState } from "react";
import { Star, Users } from "lucide-react";
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
  statusStyle,
  type LiveCombination,
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
  recommendedTableId?: string | null;
};

type AssignTableDialogProps = {
  open: boolean;
  target: AssignTarget | null;
  rooms: LiveRoom[];
  combinations: LiveCombination[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (candidate: TableCandidate) => Promise<void>;
};

const AssignTableDialog = ({
  open,
  target,
  rooms,
  combinations,
  busy,
  onOpenChange,
  onConfirm,
}: AssignTableDialogProps) => {
  const { t } = useLang();
  const [chosen, setChosen] = useState<TableCandidate | null>(null);

  useEffect(() => {
    setChosen(null);
  }, [target?.queueEntryId, target?.reservationId, open]);

  if (!target) {
    return null;
  }

  const candidates = candidateTablesForParty(
    rooms,
    target.partySize,
    target.recommendedTableId ?? null,
    target.currentTableId ?? null,
    combinations,
  );

  let body = (
    <p className="py-6 text-center text-sm text-slate-500">{t("floor.assign.noTables")}</p>
  );

  if (candidates.length > 0) {
    body = (
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1" data-testid="assign-table-options">
        {candidates.map((candidate) => {
          const selected = chosen?.id === candidate.id;

          let seatLabel = t("floor.assign.seats", { n: candidate.capacity });
          if (candidate.kind === "COMBINATION") {
            seatLabel = t("floor.assign.combinedSeats", { n: candidate.capacity });
          }

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
            <span className="shrink-0 text-[11px] text-slate-500">
              {t(`floor.live.status.${candidate.status}` as TKey)}
            </span>
          );
          if (candidate.kind === "COMBINATION") {
            trailing = (
              <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                {t("floor.assign.combination")}
              </span>
            );
          }
          if (candidate.recommended) {
            trailing = (
              <span
                data-testid="assign-recommended-badge"
                className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white"
              >
                <Star className="h-3 w-3" aria-hidden="true" />
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
                    <span className="block truncate text-[11px] text-slate-500">
                      {candidate.detail} &middot; {seatLabel}
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

  let confirmLabel = t("floor.assign.confirm");
  if (chosen) {
    confirmLabel = t("floor.assign.confirmNamed", { table: chosen.name });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("floor.assign.title")}</DialogTitle>
          <DialogDescription asChild>
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {target.name} &middot; {t("floor.live.partyOf", { n: target.partySize })}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        {body}

        {chosen && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status">
            {t("floor.assign.summary", {
              name: target.name,
              n: target.partySize,
              table: chosen.name,
              capacity: chosen.capacity,
            })}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy || !chosen}
            data-testid="assign-confirm"
            onClick={() => {
              if (chosen) {
                onConfirm(chosen);
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
