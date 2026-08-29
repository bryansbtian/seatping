import { axisLabelStep, MAX_AXIS_LABELS } from "@/lib/chartAxis";
import { compactNumber } from "@/lib/formatNumber";
import { cn } from "@/lib/utils";

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  tooltip?: string;
};

const BarSeries = ({
  data,
  height = 88,
  maxLabels = MAX_AXIS_LABELS,
  testId,
  barClass = "bg-indigo-300",
  containerRef,
}: {
  data: BarDatum[];
  height?: number;
  maxLabels?: number;
  testId?: string;
  barClass?: string;
  containerRef?: (node: HTMLUListElement | null) => void;
}) => {
  const peak = Math.max(1, ...data.map((datum) => datum.value));
  const step = axisLabelStep(data.length, maxLabels);

  return (
    <ul ref={containerRef} className="flex items-end gap-1.5" data-testid={testId}>
      {data.map((datum, index) => {
        const barHeight = Math.max(4, Math.round((datum.value / peak) * height));
        const showLabel = index % step === 0;
        const tooltip = datum.tooltip ?? `${datum.label}: ${datum.value}`;

        return (
          <li key={datum.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="h-4 w-full truncate text-center text-micro font-medium text-slate-500">
              {datum.value > 0 && compactNumber(datum.value)}
            </span>
            <span
              tabIndex={0}
              role="img"
              aria-label={tooltip}
              title={tooltip}
              data-testid={`bar-${datum.key}`}
              className={cn(
                "w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                datum.value > 0 && barClass,
                datum.value === 0 && "bg-slate-200",
              )}
              style={{ height: `${barHeight}px` }}
            />
            <span className="h-4 truncate text-caption text-slate-500">
              {showLabel && datum.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default BarSeries;
