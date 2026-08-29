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
      <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-micro font-medium text-indigo-800">
        {reservation.tableName}
      </span>
    );
  }
  if (reservation.needsReview) {
    badge = (
      <span
        data-testid={`reservation-review-${reservation.id}`}
        className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-900"
      >
        {t("floor.live.needsReview")}
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
        className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 disabled:opacity-60"
      >
        {badge}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-caption leading-none text-slate-500">
            {t("floor.live.partyOf", { n: reservation.partySize })} &middot; {reservation.timeLabel}
          </span>
          <span className="truncate text-sm font-semibold leading-tight text-slate-800">
            {reservation.name}
          </span>
          {reservation.needsReview && (
            <span className="truncate text-caption leading-tight text-amber-700">
              {t("floor.live.noTableAssigned")}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};

export default ReservationRow;
