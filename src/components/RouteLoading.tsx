import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function RouteLoading({ label, className }: { label?: string; className?: string }) {
  const { t } = useLang();
  return (
    <div
      role="status"
      aria-label={label ?? t("common.loadingPage")}
      aria-live="polite"
      className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-6", className)}
    >
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-4 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
