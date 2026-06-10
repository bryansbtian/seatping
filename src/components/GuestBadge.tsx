import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PILL_BASE_CLASS } from "@/lib/statusStyles";
import { useLang } from "@/lib/i18n";
import { X } from "lucide-react";

// Shared Guest CRM badge styling so the dashboard "Returning"/"New" chips and
// the Guests page tag chips look identical. Mirrors the outline-badge palette
// used by StatusBadge (border-X-200 bg-X-100 text-X-700/800).

// Deterministic color per known tag; anything custom falls back to slate.
const TAG_STYLES: Record<string, string> = {
  vip: "border-amber-200 bg-amber-100 text-amber-800",
  regular: "border-blue-200 bg-blue-100 text-blue-700",
  "no-show risk": "border-red-200 bg-red-100 text-red-700",
  birthday: "border-pink-200 bg-pink-100 text-pink-700",
  allergy: "border-orange-200 bg-orange-100 text-orange-700",
  "prefers window seat": "border-teal-200 bg-teal-100 text-teal-700",
  "high spender": "border-violet-200 bg-violet-100 text-violet-700",
  "needs follow-up": "border-amber-200 bg-amber-100 text-amber-800",
};

function tagClass(tag: string): string {
  return (
    TAG_STYLES[tag.trim().toLowerCase()] ||
    "border-slate-200 bg-slate-100 text-slate-700"
  );
}

/** Derived New/Returning badge (from visit count, not client guessing). */
export function GuestStatusBadge({
  returning,
  className,
}: {
  returning: boolean;
  className?: string;
}) {
  // Business-only badge; useLang falls back to English outside a provider.
  const { t } = useLang();
  return (
    <Badge
      variant="outline"
      className={cn(
        PILL_BASE_CLASS,
        returning
          ? "border-emerald-200 bg-emerald-100 text-emerald-700"
          : "border-indigo-200 bg-indigo-100 text-indigo-700",
        className,
      )}
    >
      {returning ? t("badge.returning") : t("badge.new")}
    </Badge>
  );
}

/** A single custom guest tag chip, with an optional remove button. */
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
    <Badge
      variant="outline"
      className={cn(PILL_BASE_CLASS, "gap-1", tagClass(tag), className)}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${tag}`}
          className="ml-0.5 -mr-1 inline-flex items-center justify-center rounded-full hover:bg-black/10 p-0.5 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </Badge>
  );
}
