export const PILL_BASE_CLASS =
  "shrink-0 inline-flex h-badge items-center rounded-badge border-transparent px-2 text-caption font-medium leading-none";

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
  pending: "bg-amber-100 text-amber-800",
  waiting: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-700",
  admitted: "bg-emerald-100 text-emerald-700",
  arrived: "bg-blue-100 text-blue-700",
  completed: "bg-slate-100 text-slate-700",
  served: "bg-slate-100 text-slate-700",
  past: "bg-slate-100 text-slate-700",
  left: "bg-slate-100 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-red-100 text-red-700",
  removed: "bg-red-100 text-red-700",
  reservation: "bg-indigo-100 text-indigo-700",
  queue: "bg-cyan-100 text-cyan-700",
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
  return STATUS_STYLES[normalized] || "bg-slate-100 text-slate-700";
}
