import { Skeleton } from "@/components/ui/skeleton";

export default function RestaurantCardSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 flex-1 rounded-control" />
          <Skeleton className="h-10 flex-1 rounded-control" />
        </div>
      </div>
    </div>
  );
}
