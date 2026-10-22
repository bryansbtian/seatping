import ListSkeleton from "@/components/ListSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function BlogEditorLoading() {
  return (
    <div role="status" aria-label="Loading Blog Editor" className="flex flex-1 flex-col gap-5">
      <div aria-hidden="true" className="flex items-center justify-between gap-3">
        <Skeleton className="control-sm w-28" />
        <Skeleton className="control-sm w-48 max-w-[55%]" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-white px-4 py-6 shadow-sm sm:px-10 sm:py-10 lg:px-12">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
          <div aria-hidden="true" className="mb-8 shrink-0 space-y-6 sm:mb-12 sm:space-y-8">
            <div className="flex items-center gap-3">
              <Skeleton className="h-badge w-20 rounded-badge" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-10 w-4/5 sm:h-12" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <ListSkeleton fill label="Loading Article Content" className="min-h-10 p-0 md:p-0" />
        </div>
      </div>
    </div>
  );
}
