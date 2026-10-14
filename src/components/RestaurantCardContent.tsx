import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Location01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { CardContent } from "@/components/ui/card";

export default function RestaurantCardContent({
  name,
  title,
  rating,
  reviewCount,
  cuisine,
  priceRange,
  locationText,
  stackActionsOnMobile = false,
  children,
}: {
  name: string;
  title?: ReactNode;
  rating: number | null;
  reviewCount: number;
  cuisine: string | null;
  priceRange: string | null;
  locationText: string;
  stackActionsOnMobile?: boolean;
  children: ReactNode;
}) {
  let ratingContent = <span>No Reviews Yet</span>;
  if (rating !== null && reviewCount > 0) {
    let reviewWord = "Reviews";
    if (reviewCount === 1) {
      reviewWord = "Review";
    }
    ratingContent = (
      <span className="inline-flex items-center gap-1 font-medium text-ink">
        <HugeiconsIcon icon={StarIcon} className="size-3.5 fill-yellow-400 text-yellow-400" />
        {rating.toFixed(1)}
        <span className="font-normal text-ink-subtle">
          ({reviewCount} {reviewWord})
        </span>
      </span>
    );
  }
  let actionsClass = "mt-auto grid grid-cols-2 gap-3 pt-4";
  if (stackActionsOnMobile) {
    actionsClass = "mt-auto grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2";
  }
  return (
    <CardContent className="flex flex-1 flex-col p-4">
      <h3 className="truncate text-base font-semibold text-foreground" title={name}>
        {title ?? name}
      </h3>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-body text-ink-subtle">
        {ratingContent}
        {cuisine && (
          <>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>{cuisine}</span>
          </>
        )}
        {priceRange && (
          <>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>{priceRange}</span>
          </>
        )}
      </div>
      {locationText && (
        <p
          className="mt-2 flex min-w-0 items-center gap-1.5 text-body text-ink-subtle"
          title={locationText}
        >
          <HugeiconsIcon icon={Location01Icon} className="size-4 shrink-0 text-slate-400" />
          <span className="truncate">{locationText}</span>
        </p>
      )}
      <div className={actionsClass}>{children}</div>
    </CardContent>
  );
}
