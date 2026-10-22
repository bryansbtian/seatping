import ListSkeleton from "@/components/ListSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";

export default function BusinessOverviewLoading() {
  const { t } = useLang();

  return (
    <div data-testid="overview-loading" aria-busy="true" className="h-dvh overflow-hidden">
      <div className="container mx-auto flex h-full min-h-0 flex-col gap-6 px-4 py-8 [@media(max-height:480px)]:gap-4 [@media(max-height:480px)]:py-4">
        <div
          aria-hidden="true"
          className="shrink-0 space-y-3 rounded-xl border border-border bg-card p-4 md:p-6"
        >
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <div className="flex gap-2 [@media(max-height:480px)]:hidden">
            <Skeleton className="h-badge w-24 rounded-badge" />
            <Skeleton className="h-badge w-20 rounded-badge" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="hidden shrink-0 grid-cols-5 gap-4 lg:grid [@media(max-height:640px)]:hidden"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="shrink-0 rounded-xl border border-border bg-card p-4 lg:hidden [@media(max-height:640px)]:hidden"
        >
          <Skeleton className="mb-3 h-5 w-36" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex h-row items-center justify-between gap-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
          <div aria-hidden="true" className="shrink-0 border-b border-border p-4 md:p-6">
            <Skeleton className="h-5 w-40 max-w-full" />
          </div>
          <ListSkeleton fill label={t("common.loadingPage")} className="min-h-0" />
        </div>
      </div>
    </div>
  );
}
