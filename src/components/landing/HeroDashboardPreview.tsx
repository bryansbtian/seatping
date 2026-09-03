import { useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  Calendar01Icon,
  LockIcon,
  LogoutSquare01Icon,
  Share01Icon,
  TrendingDownIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { BUSINESS_NAV_GROUPS, BUSINESS_SETTINGS_ITEM } from "@/lib/businessNav";
import { translate } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

const ACTIVE_NAV_PATH = "/business/overview";

const PREVIEW_LOCATION = "Downtown";
const PREVIEW_BUSINESS = "Cafe Milano";
const PREVIEW_EMAIL = "owner@cafemilano.com";

function en(key: Parameters<typeof translate>[1]) {
  return translate("en", key);
}

function SidebarPreview() {
  return (
    <div className="flex h-full w-56 shrink-0 flex-col bg-sidebar">
      <div className="flex items-center justify-between gap-2 px-3 pb-5 pt-4">
        <span className="flex min-w-0 items-center gap-1.5 rounded-control px-2 py-1.5 text-base font-semibold text-sidebar-accent-foreground">
          <span className="min-w-0 truncate">{PREVIEW_LOCATION}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4 shrink-0 text-sidebar-muted" />
        </span>
        <span className="rounded-control p-1.5 text-sidebar-muted">
          <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="h-5 w-5" />
        </span>
      </div>

      <div className="flex-1 px-3 pb-2">
        {BUSINESS_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="mb-2">
            <p className="business-nav-group-label px-2 pb-1 font-medium uppercase tracking-wide text-sidebar-muted">
              {en(group.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.to === ACTIVE_NAV_PATH;
                return (
                  <li key={item.to}>
                    <span
                      className={cn(
                        "flex h-row items-center gap-3 rounded-control px-3 text-label font-medium",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        !active && "text-sidebar-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={item.icon} className="h-4 w-4 shrink-0" />
                      <span>{en(item.labelKey)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="mt-2 flex items-center gap-2 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-medium text-sidebar-accent-foreground">
              {PREVIEW_BUSINESS}
            </p>
            <p className="truncate text-caption text-sidebar-muted">{PREVIEW_EMAIL}</p>
          </div>
          <span className="rounded-control p-2 text-sidebar-muted">
            <HugeiconsIcon icon={BUSINESS_SETTINGS_ITEM.icon} className="h-4 w-4" />
          </span>
        </div>
        <span className="mt-1 flex h-row items-center gap-3 rounded-control px-3 text-label font-medium text-sidebar-foreground">
          <HugeiconsIcon icon={LogoutSquare01Icon} className="h-4 w-4 shrink-0" />
          <span>{en("nav.logout")}</span>
        </span>
      </div>
    </div>
  );
}

const PREVIEW_DATE = "12 Jun 2026";

const STAT_CARDS: [Parameters<typeof translate>[1], string][] = [
  ["dash.stat.currentQueue", "6"],
  ["dash.stat.reservationsToday", "12"],
  ["dash.stat.avgQueueWaitTime", "9m"],
  ["dash.stat.servedToday", "28"],
  ["dash.stat.leftToday", "3"],
];

const SUMMARY_SERIES: { name: Parameters<typeof translate>[1]; color: string; points: number[] }[] =
  [
    { name: "dash.legend.served", color: "#3b82f6", points: [18, 24, 21, 30, 27, 34, 31] },
    { name: "dash.legend.avgWait", color: "#10b981", points: [12, 9, 11, 8, 10, 7, 9] },
    { name: "dash.legend.noShows", color: "#f59e0b", points: [3, 2, 4, 2, 3, 1, 2] },
  ];

const SUMMARY_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function SummaryChart() {
  const width = 960;
  const height = 168;
  const left = 34;
  const right = width - 12;
  const top = 10;
  const base = height - 34;
  const max = 36;
  const step = (right - left) / (SUMMARY_DAYS.length - 1);
  const y = (value: number) => base - (value / max) * (base - top);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-hidden>
      {[0, 9, 18, 27, 36].map((tick) => (
        <g key={tick}>
          <line x1={left} y1={y(tick)} x2={right} y2={y(tick)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
            {tick}
          </text>
        </g>
      ))}
      {SUMMARY_DAYS.map((day, i) => (
        <text
          key={day}
          x={left + step * i}
          y={base + 18}
          textAnchor="middle"
          fontSize="11"
          fill="#94a3b8"
        >
          {day}
        </text>
      ))}
      {SUMMARY_SERIES.map((series) => (
        <polyline
          key={series.name}
          fill="none"
          stroke={series.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={series.points.map((value, i) => `${left + step * i},${y(value)}`).join(" ")}
        />
      ))}
    </svg>
  );
}

function OverviewPagePreview() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-gradient-to-br from-slate-50 to-indigo-100 px-6 py-5">
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">
              {translate("en", "dash.hello", { name: PREVIEW_BUSINESS })}
            </h2>
            <p className="text-base text-slate-600">{en("dash.dailyStat")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{PREVIEW_LOCATION}</Badge>
              <Badge variant="info">{translate("en", "dash.creditsPill", { n: 285 })}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 text-label text-ink-subtle">
            <HugeiconsIcon icon={Calendar01Icon} className="h-4 w-4" />
            <span>{PREVIEW_DATE}</span>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-4">
        {STAT_CARDS.map(([labelKey, value]) => (
          <div
            key={labelKey}
            className="h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex h-full flex-col">
              <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                {en(labelKey)}
              </p>
              <p className="mt-auto whitespace-nowrap pt-2 text-3xl font-semibold leading-none text-slate-800">
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="flex items-center gap-2 text-title font-medium text-slate-800">
              <HugeiconsIcon icon={TrendingDownIcon} className="h-5 w-5" />
              <span>{en("dash.perf.title")}</span>
            </p>
            <p className="text-sm text-gray-600">{en("dash.perf.desc")}</p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex control-sm items-center rounded-control border border-slate-900 bg-slate-900 px-3 text-label font-medium text-white">
              {en("dash.daily")}
            </span>
            <span className="inline-flex control-sm items-center rounded-control border border-slate-200 bg-white px-3 text-label font-medium text-slate-900">
              {en("dash.weekly")}
            </span>
          </div>
        </div>
        <div className="p-5">
          <SummaryChart />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
            {SUMMARY_SERIES.map((series) => (
              <span
                key={series.name}
                className="flex items-center gap-1.5 text-caption text-slate-600"
              >
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: series.color }}
                />
                {en(series.name)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrowserChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-400/20">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full bg-red-400/80" />
            <span className="h-3.5 w-3.5 rounded-full bg-amber-400/80" />
            <span className="h-3.5 w-3.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="flex items-center gap-1 text-slate-300">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="h-5 w-5" />
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-5 w-5" />
          </div>
        </div>
        <span className="flex w-full max-w-md items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-400">
          <HugeiconsIcon icon={LockIcon} className="h-3.5 w-3.5" />
          seatping.biz/business/overview
        </span>
        <div className="flex flex-1 items-center justify-end gap-3 text-slate-300">
          <HugeiconsIcon icon={Share01Icon} className="h-5 w-5" />
          <HugeiconsIcon icon={Add01Icon} className="h-5 w-5" />
        </div>
      </div>
      {children}
    </div>
  );
}

export function HeroDashboardPreview({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(0);
  const [designWidth, setDesignWidth] = useState(1120);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) {
      return;
    }
    const measure = () => {
      const width = wrap.clientWidth;
      let design: number;
      if (width < 640) {
        design = 900;
      } else {
        design = 1120;
      }
      const next = Math.min(1, width / design);
      setDesignWidth(design);
      setScale(next);
      setHeight(inner.offsetHeight * next);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn("pointer-events-none relative w-full select-none overflow-hidden", className)}
      style={{ height: height || undefined }}
    >
      <div
        ref={innerRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: designWidth, transform: `scale(${scale})` }}
      >
        <BrowserChrome>
          <div className="flex">
            <SidebarPreview />
            <OverviewPagePreview />
          </div>
        </BrowserChrome>
      </div>
    </div>
  );
}
