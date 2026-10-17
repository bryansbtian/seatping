import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function TimeSlotsSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading Available Times">
      <div aria-hidden="true" className={cn("grid grid-cols-4 gap-1.5", className)}>
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="control-md rounded-control" />
        ))}
      </div>
    </div>
  );
}
