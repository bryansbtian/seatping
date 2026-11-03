import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusBadgeClass, statusLabel, PILL_BASE_CLASS } from "@/lib/statusStyles";
import { usePublicLanguage } from "@/lib/publicLanguage";

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const { t } = usePublicLanguage();
  return (
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, statusBadgeClass(status), className)}>
      {t(label || statusLabel(status))}
    </Badge>
  );
}
