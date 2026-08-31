import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon,
  BanIcon,
  SparklesIcon,
  CheckCheckIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import {
  elapsedMinutes,
  formatClock,
  moveTargets,
  seatableParties,
  statusStyle,
  type LiveRoom,
  type LiveTable,
  type WaitingParty,
} from "@/lib/floorLive";
import { statusIcon } from "@/lib/floorLiveIcons";
import { cn } from "@/lib/utils";

type Picker = "none" | "seat" | "move";

type LiveTableDetailProps = {
  table: LiveTable;
  rooms: LiveRoom[];
  waitingParties: WaitingParty[];
  now: Date;
  busy: boolean;
  onSeatParty: (tableId: string, partyId: string | null, partySize: number) => Promise<void>;
  onSeatReserved: (assignmentId: string) => Promise<void>;
  onCompleteVisit: (assignmentId: string) => Promise<void>;
  onMoveParty: (assignmentId: string, targetTableId: string) => Promise<void>;
  onMarkCleaning: (tableId: string) => Promise<void>;
  onMarkAvailable: (tableId: string) => Promise<void>;
  onToggleBlocked: (tableId: string, blocked: boolean) => Promise<void>;
};

function togglePicker(current: Picker, target: Picker): Picker {
  if (current === target) {
    return "none";
  }
  return target;
}

const LiveTableDetail = ({
  table,
  rooms,
  waitingParties,
  now,
  busy,
  onSeatParty,
  onSeatReserved,
  onCompleteVisit,
  onMoveParty,
  onMarkCleaning,
  onMarkAvailable,
  onToggleBlocked,
}: LiveTableDetailProps) => {
  const { t } = useLang();
  const [picker, setPicker] = useState<Picker>("none");

  useEffect(() => {
    setPicker("none");
  }, [table.id, table.status]);

  const style = statusStyle(table.status);
  const StatusIcon = statusIcon(table.status);
  const statusLabel = t(`floor.live.status.${table.status}` as TKey);

  let capacityLabel = t("floor.live.capacityExact", { max: table.capacity });
  if (table.minimumPartySize > 1) {
    capacityLabel = t("floor.live.capacityRange", {
      min: table.minimumPartySize,
      max: table.capacity,
    });
  }

  const current = table.currentAssignment;
  const upcoming = table.upcomingAssignment;
  const recommended = waitingParties.find((party) => party.id === table.recommendedPartyId) ?? null;
  const eligible = seatableParties(table, waitingParties);
  const targets = moveTargets(rooms, table, current?.partySize ?? table.minimumPartySize);

  const actions: JSX.Element[] = [];

  if (table.status === "AVAILABLE" || table.status === "RESERVED") {
    if (upcoming) {
      actions.push(
        <Button
          key="seat-reserved"
          className="h-9 w-full text-xs md:h-10 md:text-sm"
          disabled={busy}
          onClick={() => onSeatReserved(upcoming.id)}
        >
          <HugeiconsIcon icon={UserAdd01Icon} className="mr-2 h-4 w-4" />
          {t("floor.live.seatReserved")}
        </Button>,
      );
    }
    if (recommended) {
      actions.push(
        <Button
          key="seat-recommended"
          className="h-9 w-full text-xs md:h-10 md:text-sm"
          disabled={busy}
          onClick={() => onSeatParty(table.id, recommended.id, recommended.partySize)}
        >
          <HugeiconsIcon icon={UserAdd01Icon} className="mr-2 h-4 w-4" />
          {t("floor.live.seatNamed", { name: recommended.name })}
        </Button>,
      );
    }
    actions.push(
      <Button
        key="choose-party"
        variant="outline"
        className="h-9 w-full text-xs md:h-10 md:text-sm"
        disabled={busy}
        onClick={() => setPicker((previous) => togglePicker(previous, "seat"))}
      >
        {t("floor.live.chooseParty")}
      </Button>,
    );
  }

  if (current) {
    actions.push(
      <Button
        key="complete"
        className="h-9 w-full text-xs md:h-10 md:text-sm"
        disabled={busy}
        onClick={() => onCompleteVisit(current.id)}
      >
        <HugeiconsIcon icon={CheckCheckIcon} className="mr-2 h-4 w-4" />
        {t("floor.live.completeVisit")}
      </Button>,
      <Button
        key="move"
        variant="outline"
        className="h-9 w-full text-xs md:h-10 md:text-sm"
        disabled={busy}
        onClick={() => setPicker((previous) => togglePicker(previous, "move"))}
      >
        <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} className="mr-2 h-4 w-4" />
        {t("floor.live.moveParty")}
      </Button>,
    );
  }

  if (table.status === "CLEANING") {
    actions.push(
      <Button
        key="available"
        className="h-9 w-full text-xs md:h-10 md:text-sm"
        disabled={busy}
        onClick={() => onMarkAvailable(table.id)}
      >
        <HugeiconsIcon icon={SparklesIcon} className="mr-2 h-4 w-4" />
        {t("floor.live.markAvailable")}
      </Button>,
    );
  }

  if (!current && table.status !== "CLEANING" && table.status !== "BLOCKED") {
    actions.push(
      <Button
        key="cleaning"
        variant="outline"
        className="h-9 w-full text-xs md:h-10 md:text-sm"
        disabled={busy}
        onClick={() => onMarkCleaning(table.id)}
      >
        <HugeiconsIcon icon={SparklesIcon} className="mr-2 h-4 w-4" />
        {t("floor.live.markCleaning")}
      </Button>,
    );
  }

  if (!current) {
    let blockLabel = t("floor.block");
    if (table.isBlocked) {
      blockLabel = t("floor.unblock");
    }
    actions.push(
      <Button
        key="block"
        variant="outline"
        className="h-9 w-full text-xs md:h-10 md:text-sm"
        disabled={busy}
        onClick={() => onToggleBlocked(table.id, !table.isBlocked)}
      >
        <HugeiconsIcon icon={BanIcon} className="mr-2 h-4 w-4" />
        {blockLabel}
      </Button>,
    );
  }

  let seatedLabel = t("floor.live.justSeated");
  const seatedFor = elapsedMinutes(current?.seatedAt ?? null, now);
  if (seatedFor !== null && seatedFor > 0) {
    seatedLabel = t("floor.live.seatedFor", { n: seatedFor });
  }

  let pickerPanel = null;
  if (picker === "seat") {
    let rows = <p className="px-3 py-2 text-xs text-slate-500">{t("floor.live.chooseEmpty")}</p>;
    if (eligible.length > 0) {
      rows = (
        <ul className="h-full overflow-y-auto">
          {eligible.map((party) => (
            <li key={party.id}>
              <button
                type="button"
                disabled={busy}
                data-testid={`seat-party-${party.id}`}
                onClick={() => onSeatParty(table.id, party.id, party.partySize)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-60 md:text-sm"
              >
                <span className="min-w-0 truncate font-medium text-slate-800">{party.name}</span>
                <span className="shrink-0 text-slate-500">
                  {t("floor.live.partyOf", { n: party.partySize })} &middot;{" "}
                  {t("floor.live.waitingFor", { n: party.waitingMinutes })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
    }
    pickerPanel = (
      <div
        data-testid="seat-party-picker"
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200"
      >
        {rows}
      </div>
    );
  }

  if (picker === "move" && current) {
    let rows = <p className="px-3 py-2 text-xs text-slate-500">{t("floor.live.moveEmpty")}</p>;
    if (targets.length > 0) {
      rows = (
        <ul className="h-full overflow-y-auto">
          {targets.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                disabled={busy}
                data-testid={`move-target-${target.name}`}
                onClick={() => onMoveParty(current.id, target.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-60 md:text-sm"
              >
                <span className="min-w-0 truncate font-medium text-slate-800">{target.name}</span>
                <span className="shrink-0 text-slate-500">
                  {t(`floor.live.status.${target.status}` as TKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
    }
    pickerPanel = (
      <div
        data-testid="move-party-picker"
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200"
      >
        {rows}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full shrink-0 flex-col gap-3 md:gap-4"
      data-testid="live-table-detail"
    >
      <div className="flex shrink-0 flex-nowrap items-center gap-3">
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <CardTitle className="truncate text-lg text-slate-800 md:text-xl">{table.name}</CardTitle>
          <span aria-hidden="true" className="shrink-0 text-xs text-slate-300 md:text-sm">
            &middot;
          </span>
          <span className="shrink-0 text-xs text-slate-500 md:text-sm">{capacityLabel}</span>
        </div>
        <span
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            style.badge,
          )}
        >
          <HugeiconsIcon icon={StatusIcon} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap leading-none">{statusLabel}</span>
        </span>
      </div>

      {current && (
        <div className="shrink-0 rounded-xl bg-slate-50 p-3">
          <p className="text-caption font-medium uppercase tracking-wide text-slate-500">
            {t("floor.live.currentParty")}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">
            {current.partyName ?? t("floor.live.currentParty")}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {t("floor.live.partyOf", { n: current.partySize })} &middot; {seatedLabel}
          </p>
        </div>
      )}

      {upcoming && (
        <div className="shrink-0 rounded-xl bg-amber-50 p-3">
          <p className="text-caption font-medium uppercase tracking-wide text-amber-700">
            {t("floor.live.upcoming")}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-amber-900">
            {upcoming.partyName ?? t("floor.live.upcoming")}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {t("floor.live.partyOf", { n: upcoming.partySize })} &middot;{" "}
            {t("floor.live.arrivesAt", { time: formatClock(upcoming.expectedStartAt) })}
          </p>
        </div>
      )}

      {recommended && !current && (
        <div className="shrink-0 rounded-xl bg-emerald-50 p-3" data-testid="recommended-party">
          <p className="text-caption font-medium uppercase tracking-wide text-emerald-700">
            {t("floor.live.recommended")}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-emerald-900">{recommended.name}</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            {t("floor.live.partyOf", { n: recommended.partySize })} &middot;{" "}
            {t("floor.live.waitingFor", { n: recommended.waitingMinutes })}
          </p>
          <p className="mt-1 text-caption text-emerald-700">{t("floor.live.recommendedHint")}</p>
        </div>
      )}

      {!current && !upcoming && !recommended && (
        <p className="shrink-0 text-xs text-slate-500 md:text-sm">{t("floor.live.noParty")}</p>
      )}

      {pickerPanel}

      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-slate-100 pt-4">
        {actions}
      </div>
    </div>
  );
};

export default LiveTableDetail;
