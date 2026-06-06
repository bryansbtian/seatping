import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusBadgeClass, statusLabel } from "@/lib/statusStyles";

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-medium",
        statusBadgeClass(status),
        className,
      )}
    >
      {label || statusLabel(status)}
    </Badge>
  );
}
