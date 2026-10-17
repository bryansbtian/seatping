import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function ListSkeleton({
  rows = 4,
  label,
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  const { t } = useLang();
  return (
    <div
      role="status"
      aria-label={label ?? t("common.loading")}
      className={cn("p-4 md:p-6", className)}
    >
      <div aria-hidden="true" className="space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex min-w-0 items-center gap-3">
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
