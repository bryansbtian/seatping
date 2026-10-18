import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function ListSkeleton({
  rows = 4,
  label,
  className,
  fill = false,
}: {
  rows?: number;
  label?: string;
  className?: string;
  fill?: boolean;
}) {
  const { t } = useLang();
  const innerRef = useRef<HTMLDivElement>(null);
  const [visibleRows, setVisibleRows] = useState(rows);

  useLayoutEffect(() => {
    if (!fill) {
      return;
    }
    const inner = innerRef.current;
    if (!inner) {
      return;
    }

    const measure = () => {
      const styles = window.getComputedStyle(inner);
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
      const availableHeight = inner.getBoundingClientRect().height - paddingTop - paddingBottom;
      const rowHeight = inner.firstElementChild?.getBoundingClientRect().height || 40;
      const nextRows = Math.max(1, Math.floor((availableHeight + 16) / (rowHeight + 16)));
      setVisibleRows(nextRows);
    };

    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(inner);
    }
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fill, rows]);

  let rowCount = rows;
  let innerStyle: CSSProperties | undefined;
  if (fill) {
    rowCount = visibleRows;
    innerStyle = { padding: "inherit" };
  }

  return (
    <div
      role="status"
      aria-label={label ?? t("common.loading")}
      className={cn("p-4 md:p-6", fill && "relative min-h-56 flex-1 overflow-hidden", className)}
    >
      <div
        ref={innerRef}
        aria-hidden="true"
        className={cn(
          !fill && "space-y-4",
          fill && "absolute inset-0 flex flex-col justify-between gap-4",
        )}
        style={innerStyle}
      >
        {Array.from({ length: rowCount }, (_, index) => (
          <div key={index} className="flex min-w-0 shrink-0 items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-control" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-48" />
              <Skeleton className="h-3 w-1/2 max-w-28" />
            </div>
            <Skeleton className="h-badge w-12 shrink-0 rounded-badge" />
          </div>
        ))}
      </div>
    </div>
  );
}
