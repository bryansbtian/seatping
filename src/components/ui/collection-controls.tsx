import { forwardRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SlidersHorizontalIcon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { Button, type ButtonProps } from "@/components/ui/button";

type CollectionButtonProps = Omit<ButtonProps, "variant" | "asChild">;

export const FilterButton = forwardRef<HTMLButtonElement, CollectionButtonProps>(
  ({ children = "Filter", size = "sm", ...props }, ref) => (
    <Button {...props} ref={ref} type="button" variant="ghost" size={size}>
      <HugeiconsIcon icon={SlidersHorizontalIcon} aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </Button>
  ),
);
FilterButton.displayName = "FilterButton";

export const SortButton = forwardRef<HTMLButtonElement, CollectionButtonProps>(
  ({ children = "Sort", size = "sm", ...props }, ref) => (
    <Button {...props} ref={ref} type="button" variant="ghost" size={size}>
      <HugeiconsIcon icon={Sorting05Icon} aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </Button>
  ),
);
SortButton.displayName = "SortButton";
