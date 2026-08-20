export const PILL_BASE_CLASS =
  "shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium leading-normal";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  arrived: "Arrived",
  admitted: "Admitted",
  completed: "Completed",
  served: "Served",
  cancelled: "Cancelled",
  no_show: "No-Show",
  waiting: "Waiting",
  removed: "Removed",
  left: "Left Queue",
  past: "Past",
  reservation: "Reservation",
  queue: "Queue",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-100 text-amber-800",
  waiting: "border-amber-200 bg-amber-100 text-amber-800",
  confirmed: "border-emerald-200 bg-emerald-100 text-emerald-700",
  admitted: "border-emerald-200 bg-emerald-100 text-emerald-700",
  arrived: "border-blue-200 bg-blue-100 text-blue-700",
  completed: "border-slate-200 bg-slate-200 text-slate-700",
  served: "border-slate-200 bg-slate-200 text-slate-700",
  past: "border-slate-200 bg-slate-200 text-slate-700",
  left: "border-slate-200 bg-slate-200 text-slate-700",
  cancelled: "border-red-200 bg-red-100 text-red-700",
  no_show: "border-red-200 bg-red-100 text-red-700",
  removed: "border-red-200 bg-red-100 text-red-700",
  reservation: "border-indigo-200 bg-indigo-50 text-indigo-700",
  queue: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

function normalizeStatus(status: string): string {
  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const aliases: Record<string, string> = {
    canceled: "cancelled",
    complete: "completed",
    checked_in: "served",
    no_showed: "no_show",
    no_shows: "no_show",
    noshow: "no_show",
    removed_by_business: "removed",
    reservation_booking: "reservation",
    waitlist: "queue",
  };

  return aliases[normalized] || normalized;
}

export function statusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  return (
    STATUS_LABELS[normalized] ||
    normalized
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function statusBadgeClass(status: string): string {
  const normalized = normalizeStatus(status);
  return STATUS_STYLES[normalized] || "border-slate-200 bg-slate-100 text-slate-700";
}
