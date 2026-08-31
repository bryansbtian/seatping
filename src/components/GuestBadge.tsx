import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PILL_BASE_CLASS } from "@/lib/statusStyles";
import { useLang } from "@/lib/i18n";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

const TAG_STYLES: Record<string, string> = {
  vip: "bg-amber-100 text-amber-800",
  regular: "bg-blue-100 text-blue-700",
  "no-show risk": "bg-red-100 text-red-700",
  birthday: "bg-pink-100 text-pink-700",
  allergy: "bg-orange-100 text-orange-800",
  "prefers window seat": "bg-teal-100 text-teal-700",
  "high spender": "bg-violet-100 text-violet-700",
  "needs follow-up": "bg-amber-100 text-amber-800",
};

function tagClass(tag: string): string {
  return TAG_STYLES[tag.trim().toLowerCase()] || "bg-slate-100 text-slate-700";
}

export function GuestStatusBadge({
  returning,
  className,
}: {
  returning: boolean;
  className?: string;
}) {
  const { t } = useLang();
  let toneClass: string;
  let label: string;
  if (returning) {
    toneClass = "bg-emerald-100 text-emerald-700";
    label = t("badge.returning");
  } else {
    toneClass = "bg-indigo-100 text-indigo-700";
    label = t("badge.new");
  }
  return (
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, toneClass, className)}>
      {label}
    </Badge>
  );
}

export function GuestTagBadge({
  tag,
  onRemove,
  className,
}: {
  tag: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, "gap-1", tagClass(tag), className)}>
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${tag}`}
          className="ml-0.5 -mr-1 inline-flex items-center justify-center rounded-full hover:bg-black/10 p-0.5 transition-colors"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="w-3 h-3" />
        </button>
      )}
    </Badge>
  );
}
