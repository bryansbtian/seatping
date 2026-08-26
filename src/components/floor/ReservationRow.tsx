import { useLang } from "@/lib/i18n";
import type { UpcomingReservation } from "@/lib/floorLive";

type ReservationRowProps = {
  reservation: UpcomingReservation;
  busy: boolean;
  onSelect: (reservation: UpcomingReservation) => void;
};

const ReservationRow = ({ reservation, busy, onSelect }: ReservationRowProps) => {
  const { t } = useLang();

  let badge = null;
  if (reservation.tableName) {
    badge = (
      <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
        {reservation.tableName}
      </span>
    );
  }

  return (
    <li>
      <button
        type="button"
        disabled={busy}
        data-testid={`reservation-${reservation.id}`}
        aria-label={t("floor.assign.action")}
        onClick={() => onSelect(reservation)}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-slate-100 disabled:opacity-60"
      >
        {badge}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 md:text-sm">
          {reservation.name}
        </span>
        <span className="shrink-0 text-[11px] text-slate-500 md:text-xs">
          {t("floor.live.partyOf", { n: reservation.partySize })} &middot; {reservation.timeLabel}
        </span>
      </button>
    </li>
  );
};

export default ReservationRow;
