import { useCallback, useEffect, useState } from "react";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChartAnalysisIcon } from "@hugeicons/core-free-icons";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { DateField } from "@/components/DateField";
import { localDateStr } from "@/lib/localDate";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import {
  fetchPerformance,
  formatCount,
  formatDeltaWithPercent,
  formatDuration,
  formatMinutes,
  formatPercent,
  bucketAxisLabel,
  bucketGroupSize,
  bucketRangeLabel,
  bucketRangeTooltip,
  bucketTooltip,
  groupBuckets,
  formatRangeLabel,
  type CoverBucket,
  type Granularity,
  type PerformanceMetrics,
  type PerformancePreset,
  type PerformanceResponse,
} from "@/lib/performanceApi";
import BarSeries from "@/components/charts/BarSeries";
import { useElementWidth } from "@/hooks/use-element-width";
import { MAX_AXIS_LABELS } from "@/lib/chartAxis";
import { cn } from "@/lib/utils";

const EARLIEST_DATE = "2020-01-01";

const PRESET_KEYS: [PerformancePreset, TKey][] = [
  ["today", "perf.range.today"],
  ["7d", "perf.range.7d"],
  ["30d", "perf.range.30d"],
  ["custom", "perf.range.custom"],
];

const LABEL_CLASS = "text-caption font-medium uppercase tracking-[0.12em] text-slate-500";

type Rate = {
  key: string;
  label: string;
  display: string;
  context: string | null;
};

function buildRates(
  metrics: PerformanceMetrics,
  t: (key: TKey, vars?: Record<string, unknown>) => string,
): Rate[] {
  let noShowContext: string | null = null;
  if (metrics.bookedParties > 0) {
    noShowContext = t("perf.context.bookedParties", {
      n: metrics.noShowCount,
      total: metrics.bookedParties,
    });
  }

  let utilizationContext: string | null = null;
  if (metrics.tableCount > 0) {
    utilizationContext = t("perf.context.tablesUsed", {
      n: metrics.tablesUsed,
      total: metrics.tableCount,
    });
  }

  return [
    {
      key: "abandonment",
      label: t("perf.metric.abandonment"),
      display: formatPercent(metrics.queueAbandonmentRate),
      context: null,
    },
    {
      key: "noShow",
      label: t("perf.metric.noShowRate"),
      display: formatPercent(metrics.reservationNoShowRate),
      context: noShowContext,
    },
    {
      key: "utilization",
      label: t("perf.metric.utilization"),
      display: formatPercent(metrics.tableUtilization),
      context: utilizationContext,
    },
  ];
}

function RateRow({ row }: { row: Rate }) {
  return (
    <li className="flex items-center justify-between gap-3" data-testid={`perf-rate-${row.key}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{row.label}</span>
        {row.context && (
          <span className="mt-0.5 block text-caption text-slate-500">{row.context}</span>
        )}
      </span>
      <span className="shrink-0 text-xl font-semibold text-slate-900">{row.display}</span>
    </li>
  );
}

function CoversChart({
  buckets,
  granularity,
}: {
  buckets: CoverBucket[];
  granularity: Granularity;
}) {
  const [chartRef, width] = useElementWidth<HTMLUListElement>();

  const groupSize = bucketGroupSize(buckets.length, width);
  const shown = groupBuckets(buckets, groupSize);

  const data = shown.map((bucket) => {
    let label = bucketAxisLabel(bucket, granularity);
    let tooltip = bucketTooltip(bucket, granularity);
    if (groupSize > 1) {
      label = bucketRangeLabel(bucket);
      tooltip = bucketRangeTooltip(bucket);
    }
    return {
      key: bucket.start,
      label,
      value: bucket.covers,
      tooltip: `${tooltip}: ${bucket.covers}`,
    };
  });

  let maxLabels = MAX_AXIS_LABELS;
  if (width && width < 450) {
    maxLabels = 4;
  } else if (width && width < 700) {
    maxLabels = 6;
  }

  return (
    <BarSeries
      containerRef={chartRef}
      data={data}
      maxLabels={maxLabels}
      testId="perf-covers-chart"
    />
  );
}

const BusinessPerformance = () => {
  const { t } = useLang();
  const { currentLocation } = useBusinessSession();
  const locationId = currentLocation?.id ?? null;

  const todayStr = localDateStr(new Date());
  const [preset, setPreset] = useState<PerformancePreset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUsedOnly, setShowUsedOnly] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const openCustom = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setCustomOpen(true);
  };

  const draftValid = Boolean(draftFrom) && Boolean(draftTo) && draftFrom <= draftTo;

  const applyCustom = () => {
    if (!draftValid) {
      return;
    }
    setFrom(draftFrom);
    setTo(draftTo);
    setPreset("custom");
    setCustomOpen(false);
  };

  const choosePreset = (key: PerformancePreset) => {
    if (key === "custom") {
      openCustom();
      return;
    }
    setPreset(key);
  };

  const load = useCallback(async () => {
    if (!locationId) {
      return;
    }
    if (preset === "custom" && (!from || !to)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchPerformance(locationId, { preset, from, to });
      setData(response);
    } catch (err: any) {
      setError(err?.message || t("perf.error"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [locationId, preset, from, to, t]);

  useEffect(() => {
    load();
  }, [load]);

  let body: React.ReactNode = null;

  if (!locationId) {
    body = <p className="text-sm text-slate-600">{t("perf.noLocation")}</p>;
  } else if (loading && !data) {
    body = <p className="text-sm text-slate-500">{t("perf.loading")}</p>;
  } else if (error) {
    body = (
      <Card className="border border-rose-200 bg-rose-50 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-rose-800">{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            {t("common.refresh")}
          </Button>
        </CardContent>
      </Card>
    );
  } else if (data && !data.metrics.hasActivity) {
    body = (
      <Card className="flex flex-1 flex-col border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-1 flex-col p-0">
          <BusinessEmptyState
            icon={ChartAnalysisIcon}
            title={t("perf.empty.title")}
            body={t("perf.empty.body")}
            testId="perf-empty"
          />
        </CardContent>
      </Card>
    );
  } else if (data) {
    const metrics: PerformanceMetrics = data.metrics;
    const rates = buildRates(metrics, t);
    const noRates =
      metrics.queueAbandonmentRate === null &&
      metrics.reservationNoShowRate === null &&
      metrics.tableUtilization === null;
    const noCovers = metrics.covers === 0;

    const turn = metrics.averageTableTurnMinutes;

    const reservationShare = Math.round(
      (metrics.reservationCovers / Math.max(1, metrics.covers)) * 100,
    );

    const hasPriorComparison = metrics.covers > 0 || metrics.previousCovers > 0;
    let deltaLabel = t("perf.hero.noPrior");
    if (hasPriorComparison) {
      deltaLabel = formatDeltaWithPercent(metrics.coversDelta, metrics.previousCovers);
    }

    let utilizationRows = metrics.perTableUtilization;
    if (showUsedOnly) {
      utilizationRows = utilizationRows.filter((row) => row.seatedMinutes > 0);
    }

    body = (
      <div className="space-y-4">
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5 lg:p-6">
            <div
              className={cn("perf-summary grid gap-6", noCovers && "perf-summary-no-covers")}
              data-testid="perf-summary"
            >
              <div className="perf-covers min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 max-[325px]:gap-x-1.5">
                  <p
                    className={cn(
                      LABEL_CLASS,
                      "max-[325px]:text-micro max-[325px]:tracking-[0.08em]",
                    )}
                  >
                    {t("perf.hero.coversSeated")}
                  </p>
                  <p
                    className="text-xs text-slate-500 max-[325px]:text-micro"
                    data-testid="perf-range-label"
                  >
                    {formatRangeLabel(data.range.from, data.range.to)}
                  </p>
                </div>
                <div className="mt-1 flex flex-nowrap items-center gap-x-4 max-[325px]:gap-x-2">
                  <span
                    data-testid="perf-covers"
                    className="text-5xl font-semibold leading-none tracking-tight text-slate-900"
                  >
                    {metrics.covers}
                  </span>
                  <span className="shrink-0">
                    <span
                      data-testid="perf-delta"
                      className={cn(
                        "block whitespace-nowrap text-sm font-semibold leading-tight max-[325px]:text-caption",
                        hasPriorComparison && metrics.coversDelta > 0 && "text-teal-700",
                        hasPriorComparison && metrics.coversDelta < 0 && "text-rose-600",
                        (!hasPriorComparison || metrics.coversDelta === 0) && "text-slate-500",
                      )}
                    >
                      {deltaLabel}
                    </span>
                    <span className="block whitespace-nowrap text-caption font-medium uppercase leading-tight tracking-[0.08em] text-slate-500 max-[325px]:text-preview-sm max-[325px]:tracking-normal">
                      {t("perf.hero.perParty", { n: formatCount(metrics.averagePartySize) })}{" "}
                      &middot;{" "}
                      {t("perf.hero.avgWait", {
                        v: formatMinutes(metrics.averageQueueWaitMinutes),
                      })}
                    </span>
                  </span>
                </div>

                {metrics.coverBuckets.length > 1 && (
                  <div className="mt-5">
                    <CoversChart buckets={metrics.coverBuckets} granularity={metrics.granularity} />
                  </div>
                )}
              </div>

              <section
                className={cn(
                  "perf-rates h-fit self-start rounded-xl border border-slate-200 bg-slate-50/60 p-4",
                  noRates && "flex flex-col",
                )}
                data-testid="perf-rates"
              >
                <p className={LABEL_CLASS}>{t("perf.rates.title")}</p>
                {noRates && (
                  <div
                    className="perf-rates-empty-content flex flex-col items-center px-2 pb-2 pt-4 text-center"
                    data-testid="perf-rates-empty"
                  >
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                      <HugeiconsIcon
                        icon={ChartAnalysisIcon}
                        className="h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      {t("perf.rates.empty.title")}
                    </h3>
                    <p className="mt-1 max-w-[15rem] text-xs text-slate-500">
                      {t("perf.rates.empty.body")}
                    </p>
                  </div>
                )}
                {!noRates && (
                  <ul className="mt-4 space-y-4">
                    {rates.map((row) => (
                      <RateRow key={row.key} row={row} />
                    ))}
                  </ul>
                )}
              </section>

              <div className="perf-mix border-t border-slate-100 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-800">{t("perf.mix.title")}</h2>
                  <span className="text-xs text-slate-500">
                    {t("perf.hero.totalCovers", { n: metrics.covers })}
                  </span>
                </div>
                <div
                  className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100"
                  data-testid="perf-mix-bar"
                >
                  {metrics.covers > 0 && (
                    <>
                      <span className="bg-indigo-600" style={{ width: `${reservationShare}%` }} />
                      <span className="flex-1 bg-indigo-300" />
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                  <span data-testid="perf-reservation-covers" className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    {t("perf.mix.reservations", { n: metrics.reservationCovers })}
                  </span>
                  <span data-testid="perf-walkin-covers" className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-300" />
                    {t("perf.mix.walkIns", { n: metrics.walkInCovers })}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="grid divide-y divide-slate-100 p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-4 md:p-5">
              <p className={LABEL_CLASS}>{t("perf.metric.queueWait")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMinutes(metrics.averageQueueWaitMinutes)}
              </p>
            </div>
            <div className="p-4 md:p-5">
              <p className={LABEL_CLASS}>{t("perf.metric.turnTime")}</p>
              <p data-testid="perf-turn" className="mt-1 text-2xl font-semibold text-slate-900">
                {formatDuration(turn)}
              </p>
            </div>
            <div className="p-4 md:p-5">
              <p className={LABEL_CLASS}>{t("perf.metric.guestsServed")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatCount(metrics.guestsServed)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="min-w-0 text-base font-semibold text-slate-800">
                {t("perf.tables.title")}
              </h2>
              <div className="ml-auto flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  data-testid="perf-tables-used"
                  onClick={() => setShowUsedOnly(true)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    showUsedOnly && "bg-white text-slate-900 shadow-sm",
                    !showUsedOnly && "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {t("perf.tables.used")}
                </button>
                <button
                  type="button"
                  data-testid="perf-tables-all"
                  onClick={() => setShowUsedOnly(false)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    !showUsedOnly && "bg-white text-slate-900 shadow-sm",
                    showUsedOnly && "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {t("perf.tables.all")}
                </button>
              </div>
            </div>

            {utilizationRows.length === 0 && (
              <BusinessEmptyState
                icon={ChartAnalysisIcon}
                title={t("perf.tables.empty.title")}
                body={t("perf.tables.empty.body")}
                className="min-h-40 px-4 py-8"
              />
            )}
            {utilizationRows.length > 0 && (
              <ul className="mt-4 space-y-2.5" data-testid="perf-table-utilization">
                {utilizationRows.map((row) => {
                  const idle = row.seatedMinutes === 0;
                  return (
                    <li key={row.tableId} className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-14 shrink-0 truncate text-sm font-medium",
                          idle && "text-slate-400",
                          !idle && "text-slate-700",
                        )}
                      >
                        {row.tableName}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-indigo-600"
                          style={{ width: `${Math.min(100, Math.round(row.utilization * 100))}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "w-12 shrink-0 text-right text-sm",
                          idle && "text-slate-400",
                          !idle && "text-slate-700",
                        )}
                      >
                        {formatPercent(row.utilization)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Business Performance | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="perf-shell container mx-auto flex min-h-full flex-col px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-800 md:text-2xl">{t("perf.title")}</h1>
            <p className="text-sm text-gray-600 md:text-base">{t("perf.subtitle")}</p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-xl border border-slate-200 bg-white p-1 max-sm:w-full max-sm:shrink">
            {PRESET_KEYS.map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                data-testid={`perf-preset-${key}`}
                onClick={() => choosePreset(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors max-sm:flex-1 max-sm:px-2 max-[425px]:text-xs max-[325px]:px-1.5 max-[325px]:text-micro",
                  preset === key && "bg-slate-900 text-white",
                  preset !== key && "text-slate-600 hover:bg-slate-50",
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="max-w-sm" data-testid="perf-custom-dialog">
            <DialogHeader>
              <DialogTitle>{t("perf.custom.title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className={LABEL_CLASS}>{t("perf.range.from")}</p>
                <DateField
                  value={draftFrom}
                  onChange={setDraftFrom}
                  todayStr={EARLIEST_DATE}
                  maxDateStr={todayStr}
                  ariaLabel={t("perf.range.from")}
                  placeholder={t("perf.range.from")}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <p className={LABEL_CLASS}>{t("perf.range.to")}</p>
                <DateField
                  value={draftTo}
                  onChange={setDraftTo}
                  todayStr={EARLIEST_DATE}
                  maxDateStr={todayStr}
                  ariaLabel={t("perf.range.to")}
                  placeholder={t("perf.range.to")}
                  className="w-full"
                />
              </div>
              {Boolean(draftFrom) && Boolean(draftTo) && !draftValid && (
                <p className="text-xs text-rose-600" data-testid="perf-custom-error">
                  {t("perf.custom.invalid")}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setCustomOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!draftValid} data-testid="perf-custom-apply" onClick={applyCustom}>
                {t("perf.custom.apply")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {body}
      </div>
    </>
  );
};

export default BusinessPerformance;
