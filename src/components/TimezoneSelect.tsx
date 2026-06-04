import { useCallback, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

/**
 * Searchable timezone selector — same Popover + Command combobox as
 * CountryCodeSelect, backed by the full IANA timezone list. Stores/returns the
 * IANA value (e.g. "Asia/Jakarta") via `onChange`.
 */
export function TimezoneSelect({
  value,
  onChange,
  ariaLabel = "Timezone",
  className,
}: {
  value: string;
  onChange: (timezone: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = TIMEZONE_OPTIONS.find((t) => t.value === value);
  const cleanupRef = useRef<(() => void) | null>(null);

  // The modal is a Radix Dialog, whose scroll-lock (react-remove-scroll) adds a
  // non-passive `wheel`/`touchmove` listener on `document` that calls
  // preventDefault() for any element outside the dialog — and this popover is
  // portaled to <body>, so its native wheel/trackpad scroll gets cancelled
  // (arrow-key scrolling still works, which is the tell-tale symptom). Rather
  // than fight the lock, we drive the scroll ourselves: a callback ref attaches
  // non-passive wheel/touch handlers the moment the list mounts and translates
  // the deltas into scrollTop directly. preventDefault avoids any double-scroll
  // and stopPropagation keeps the modal behind from scrolling.
  const attachScrollHandlers = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      el.scrollTop += e.deltaY;
      e.preventDefault();
      e.stopPropagation();
    };

    let lastTouchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (lastTouchY == null) return;
      const y = e.touches[0]?.clientY ?? lastTouchY;
      el.scrollTop += lastTouchY - y;
      lastTouchY = y;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    cleanupRef.current = () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring",
            className,
          )}
        >
          <span className="truncate">
            {selected ? selected.label : "Select timezone"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        // Portaled to <body> (see ui/popover.tsx) so it is never clipped by the
        // modal/card. z-[60] keeps it above the dialog overlay.
        className="z-[60] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        align="start"
        sideOffset={4}
        collisionPadding={16}
      >
        <Command
          // No height cap / scroll here — the search input must stay fixed while
          // ONLY the list scrolls, so the scroll container is CommandList below.
          className="overflow-hidden"
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
          }
        >
          {/* Search stays pinned at the top; only the list below scrolls. */}
          <CommandInput placeholder="Search timezone or city..." />
          {/* The actual scroll container: a hard max-height + overflow-y-auto so
              the options scroll internally instead of running off-screen. The
              callback ref attaches the wheel/touch handlers that drive the
              scroll manually (see attachScrollHandlers above). */}
          <CommandList
            ref={attachScrollHandlers}
            className="pointer-events-auto max-h-[300px] overflow-y-auto overscroll-contain [touch-action:pan-y]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {TIMEZONE_OPTIONS.map((t) => (
                <CommandItem
                  key={t.value}
                  // Searchable by offset, region, and city (e.g. "jakarta",
                  // "asia", "+07", "07:00").
                  value={`${t.label} ${t.value}`}
                  onSelect={() => {
                    onChange(t.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === t.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{t.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default TimezoneSelect;
