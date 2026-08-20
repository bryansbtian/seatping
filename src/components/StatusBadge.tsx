import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusBadgeClass, statusLabel, PILL_BASE_CLASS } from "@/lib/statusStyles";

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
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, statusBadgeClass(status), className)}>
      {label || statusLabel(status)}
    </Badge>
  );
}
