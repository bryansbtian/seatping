import { cn } from "@/lib/utils";
import { LIVE_STATUSES, statusStyle, type LiveStatus } from "@/lib/floorLive";
import { type PreviewProps } from "@/components/landing/BentoProductPreviews";

const PREVIEW_LABEL_CLASS =
  "text-preview-sm font-medium uppercase tracking-[0.12em] text-slate-500";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;

const ZONE = { x: 16, y: 36, width: 320, height: 153, label: "Window Row" };

const STAR_PATH =
  "M0,-8 L2.35,-2.47 L7.61,-2.47 L3.35,0.94 L4.7,6.47 L0,3.2 L-4.7,6.47 L-3.35,0.94 L-7.61,-2.47 L-2.35,-2.47 Z";

type PreviewTable = {
  name: string;
  status: LiveStatus;
  detail: string;
  x: number;
  y: number;
  width: number;
  height: number;
  round?: boolean;
  recommended?: boolean;
};

const PREVIEW_TABLES: PreviewTable[] = [
  { name: "T1", status: "OCCUPIED", detail: "4", x: 40, y: 81, width: 120, height: 80 },
  {
    name: "T2",
    status: "RESERVED",
    detail: "2",
    x: 200,
    y: 72,
    width: 96,
    height: 96,
    round: true,
  },
  { name: "T3", status: "RESERVED", detail: "2", x: 368, y: 81, width: 120, height: 80 },
  {
    name: "T4",
    status: "AVAILABLE",
    detail: "6",
    x: 512,
    y: 72,
    width: 96,
    height: 96,
    round: true,
    recommended: true,
  },
  { name: "T5", status: "CLEANING", detail: "2", x: 648, y: 81, width: 112, height: 75 },
  { name: "T6", status: "AVAILABLE", detail: "4", x: 40, y: 297, width: 120, height: 80 },
  { name: "T7", status: "OCCUPIED", detail: "6", x: 208, y: 297, width: 144, height: 96 },
  {
    name: "T8",
    status: "BLOCKED",
    detail: "2",
    x: 416,
    y: 288,
    width: 96,
    height: 96,
    round: true,
  },
  { name: "T9", status: "RESERVED", detail: "4", x: 560, y: 297, width: 120, height: 80 },
];

const PREVIEW_COUNTS: Record<LiveStatus, number> = {
  AVAILABLE: 2,
  RESERVED: 3,
  OCCUPIED: 2,
  CLEANING: 1,
  BLOCKED: 1,
};

const STATUS_LABELS: Record<LiveStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
  CLEANING: "Cleaning",
  BLOCKED: "Blocked",
};

const STATUS_SHAPE_CLASS: Record<LiveStatus, string> = {
  AVAILABLE: "fill-emerald-50 stroke-emerald-400",
  RESERVED: "fill-amber-50 stroke-amber-400",
  OCCUPIED: "fill-indigo-50 stroke-indigo-500",
  CLEANING: "fill-sky-50 stroke-sky-400",
  BLOCKED: "fill-slate-300 stroke-slate-400",
};

const STATUS_LABEL_CLASS: Record<LiveStatus, string> = {
  AVAILABLE: "fill-emerald-900",
  RESERVED: "fill-amber-900",
  OCCUPIED: "fill-indigo-900",
  CLEANING: "fill-sky-900",
  BLOCKED: "fill-slate-700",
};

function PreviewTableNode({ table }: { table: PreviewTable }) {
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;

  let shape = (
    <rect
      x={table.x}
      y={table.y}
      width={table.width}
      height={table.height}
      rx="18"
      strokeWidth="4"
      className={STATUS_SHAPE_CLASS[table.status]}
    />
  );
  if (table.round) {
    shape = (
      <circle
        cx={cx}
        cy={cy}
        r={table.width / 2}
        strokeWidth="4"
        className={STATUS_SHAPE_CLASS[table.status]}
      />
    );
  }

  let recommendation = null;
  if (table.recommended) {
    const badgeX = cx + table.width * 0.354;
    const badgeY = cy - table.height * 0.354;
    recommendation = (
      <g>
        <circle
          cx={badgeX}
          cy={badgeY}
          r="17"
          strokeWidth="3"
          className="fill-slate-900 stroke-white"
        />
        <path d={STAR_PATH} transform={`translate(${badgeX} ${badgeY})`} className="fill-white" />
      </g>
    );
  }

  return (
    <g data-status={table.status}>
      {shape}
      <text
        x={cx}
        y={cy - 11}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="23"
        fontWeight="600"
        className={STATUS_LABEL_CLASS[table.status]}
      >
        {table.name}
      </text>
      <text
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="21"
        className={STATUS_LABEL_CLASS[table.status]}
      >
        {table.detail}
      </text>
      {recommendation}
    </g>
  );
}

function FloorCanvasPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50",
        "aspect-[16/9] lg:aspect-auto",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <svg
        data-testid="floor-canvas"
        aria-hidden="true"
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        className="h-auto max-h-full w-full select-none"
      >
        <rect
          x={ZONE.x}
          y={ZONE.y}
          width={ZONE.width}
          height={ZONE.height}
          rx="18"
          strokeWidth="4"
          strokeDasharray="14 10"
          className="fill-slate-100/40 stroke-slate-300"
        />
        <text
          x={ZONE.x + 20}
          y={ZONE.y + 26}
          fontSize="20"
          fontWeight="500"
          className="fill-slate-500"
        >
          {ZONE.label}
        </text>
        {PREVIEW_TABLES.map((table) => (
          <PreviewTableNode key={table.name} table={table} />
        ))}
      </svg>
    </div>
  );
}

function FloorLegendPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4",
        className,
      )}
    >
      {LIVE_STATUSES.map((status) => (
        <span
          key={status}
          className="flex items-center gap-1.5 text-preview-sm text-slate-600 sm:text-caption"
        >
          <span
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full border-2", statusStyle(status).swatch)}
          />
          <span className="whitespace-nowrap">{STATUS_LABELS[status]}</span>
          <span className="ml-auto shrink-0 font-semibold text-slate-800 sm:ml-0">
            {PREVIEW_COUNTS[status]}
          </span>
        </span>
      ))}
      <span className="col-span-3 text-preview-sm text-slate-500 sm:col-auto sm:ml-auto sm:text-caption">
        Updated 7:24 PM
      </span>
    </div>
  );
}

function PanelRow({
  badge,
  badgeTone,
  meta,
  name,
  note,
  trailing,
  trailingTone,
  tone = "bg-slate-50",
}: {
  badge?: string;
  badgeTone?: string;
  meta: string;
  name: string;
  note?: string;
  trailing?: string;
  trailingTone?: string;
  tone?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2", tone)}>
      {badge && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-preview-sm font-medium sm:text-micro",
            badgeTone,
          )}
        >
          {badge}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-preview-sm leading-none text-slate-500 sm:text-caption">
          {meta}
        </span>
        <span className="truncate text-caption font-semibold leading-tight text-slate-800 sm:text-xs">
          {name}
        </span>
        {note && (
          <span className="truncate text-preview-sm leading-tight text-amber-700 sm:text-caption">
            {note}
          </span>
        )}
      </span>
      {trailing && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-preview-sm font-medium tabular-nums sm:text-micro",
            trailingTone,
          )}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}

function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1.5", className)}>
      <p className="text-caption font-semibold text-slate-800 sm:text-xs">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

export function FloorBentoPreview({ className, animated = true }: PreviewProps) {
  let animatedAttr: string | undefined;
  if (!animated) {
    animatedAttr = "false";
  }
  return (
    <div
      data-bento-animated={animatedAttr}
      className={cn("flex h-full w-full flex-col justify-center", className)}
    >
      <FloorLegendPreview className="mb-4" />
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-3">
        <div className="flex min-w-0 flex-1">
          <FloorCanvasPreview className="md:h-full" />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2.5 md:w-60">
          <PanelSection title="Waiting Parties">
            <PanelRow
              badge="T4"
              badgeTone="bg-emerald-100 text-emerald-800"
              meta="Party Of 5 · 6 Min Wait"
              name="Marcus Bennett"
            />
          </PanelSection>
          <PanelSection title="Awaiting Arrival" className="border-t border-slate-100 pt-2.5">
            <PanelRow
              tone="bg-amber-50"
              badge="Holding T2"
              badgeTone="bg-indigo-100 text-indigo-800"
              meta="Party Of 2"
              name="Aisha Rahman"
              trailing="3:12 Left"
              trailingTone="bg-amber-100 text-amber-800"
            />
          </PanelSection>
          <PanelSection title="Reservations" className="border-t border-slate-100 pt-2.5">
            <PanelRow
              badge="T3"
              badgeTone="bg-indigo-100 text-indigo-800"
              meta="Party Of 2 · 7:30 PM"
              name="Sofia Almeida"
            />
          </PanelSection>
        </div>
      </div>
    </div>
  );
}

const PERFORMANCE_RATES: { label: string; value: string; context: string | null }[] = [
  { label: "Queue Abandonment", value: "6%", context: null },
  { label: "Reservation No Shows", value: "3%", context: "2 of 64 booked parties" },
  { label: "Table Utilization", value: "78%", context: "9 of 12 tables used" },
];

const PERFORMANCE_RATE_VISIBILITY = ["md:max-lg:hidden", "md:max-lg:hidden", ""];

export function PerformanceBentoPreview({ className, animated = true }: PreviewProps) {
  let animatedAttr: string | undefined;
  if (!animated) {
    animatedAttr = "false";
  }
  return (
    <div
      data-bento-animated={animatedAttr}
      className={cn("flex h-full w-full flex-col justify-center gap-2", className)}
    >
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 md:max-lg:hidden">
        <p className={PREVIEW_LABEL_CLASS}>Covers Seated</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold leading-none tracking-tight text-slate-900">
            184
          </span>
          <span className="text-micro font-semibold text-teal-700">+12%</span>
        </div>
        <p className="mt-1 text-preview-sm font-medium uppercase tracking-[0.08em] text-slate-500">
          3.2 Guests Per Party &middot; 9m Avg Wait
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
        <p className={PREVIEW_LABEL_CLASS}>Service Rates</p>
        <ul className="mt-2 space-y-2">
          {PERFORMANCE_RATES.map((rate, index) => (
            <li
              key={rate.label}
              className={cn(
                "flex items-center justify-between gap-3",
                PERFORMANCE_RATE_VISIBILITY[index],
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-micro font-medium text-slate-800">
                  {rate.label}
                </span>
                {rate.context && (
                  <span className="block truncate text-preview-sm text-slate-500">
                    {rate.context}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-base font-semibold text-slate-900">{rate.value}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 border-t border-slate-200 pt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-micro font-semibold text-slate-800">Reservations vs Walk Ins</p>
            <span className="text-preview-sm text-slate-500">184 Covers</span>
          </div>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
            <span className="bg-indigo-600" style={{ width: "62%" }} />
            <span className="flex-1 bg-indigo-300" />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-preview-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              Reservations: 114 Covers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
              Walk Ins: 70 Covers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
