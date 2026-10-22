import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import ListSkeleton from "@/components/ListSkeleton";

export default function RouteLoading({
  label,
  className,
  fill = false,
}: {
  label?: string;
  className?: string;
  fill?: boolean;
}) {
  const { t } = useLang();
  return (
    <div
      role="status"
      aria-label={label ?? t("common.loadingPage")}
      aria-live="polite"
      className={cn(
        "mx-auto w-full max-w-7xl px-4 py-8 sm:px-6",
        fill && "flex min-h-full flex-1 flex-col",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(!fill && "space-y-6", fill && "flex min-h-0 flex-1 flex-col gap-6")}
      >
        <div className="shrink-0 space-y-3">
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div
          className={cn(
            "grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4",
            fill && "[@media(max-height:640px)]:hidden",
          )}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-4 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <div
          className={cn(
            "rounded-xl border border-border bg-card p-4 sm:p-6",
            !fill && "space-y-5",
            fill && "flex min-h-0 flex-1 flex-col gap-5",
          )}
        >
          <Skeleton className="h-5 w-36" />
          {fill && <ListSkeleton fill className="min-h-10 p-0 md:p-0" />}
          {!fill && (
            <>
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
