import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePublicLanguage } from "@/lib/publicLanguage";

export default function TimeSlotsSkeleton({ className }: { className?: string }) {
  const { t } = usePublicLanguage();
  return (
    <div role="status" aria-label={t("Loading Available Times")}>
      <div aria-hidden="true" className={cn("grid grid-cols-4 gap-1.5", className)}>
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="control-sm rounded-control" />
        ))}
      </div>
    </div>
  );
}
