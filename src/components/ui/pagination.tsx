import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label?: string;
};

function paginationItems(page: number, total: number): (number | string)[] {
  let start = 1;
  let end = total;
  if (total > 7) {
    if (page <= 5) {
      end = 5;
    } else if (page >= total - 4) {
      start = total - 4;
    } else {
      start = page - 1;
      end = page + 1;
    }
  }
  const items: (number | string)[] = [];
  if (start > 1) {
    items.push(1, "start-gap");
  }
  for (let number = start; number <= end; number++) {
    items.push(number);
  }
  if (end < total) {
    items.push("end-gap", total);
  }
  return items;
}

const CONTROL_CLASS =
  "size-8 shrink-0 rounded-full text-body font-normal text-ink-subtle sm:size-10";

export function Pagination({
  page,
  totalPages,
  onPageChange,
  label = "Pagination",
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-0 sm:gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn(CONTROL_CLASS, "[&_svg]:size-5")}
        aria-label="Previous"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
      </Button>
      {paginationItems(page, totalPages).map((item) => {
        if (typeof item === "string") {
          return (
            <span
              key={item}
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center text-body text-ink-subtle sm:size-10"
            >
              …
            </span>
          );
        }
        let current: "page" | undefined;
        if (item === page) {
          current = "page";
        }
        return (
          <Button
            key={item}
            variant="ghost"
            size="icon"
            aria-label={`Page ${item}`}
            aria-current={current}
            onClick={() => onPageChange(item)}
            className={cn(CONTROL_CLASS, item === page && "text-indigo-600 hover:text-indigo-600")}
          >
            {item}
          </Button>
        );
      })}
      <Button
        variant="ghost"
        size="icon"
        className={cn(CONTROL_CLASS, "[&_svg]:size-5")}
        aria-label="Next"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        Page {page} of {totalPages}
      </span>
    </nav>
  );
}
