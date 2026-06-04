import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock, ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger } from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Shared time picker used by the homepage reservation search and the business
// Opening Hours editor. Values are stored as 24-hour "HH:mm" and displayed as a
// readable 12-hour label (e.g. "11:00 AM"). Options are in 30-minute steps.
// ---------------------------------------------------------------------------

// "19:00" -> "7:00 PM"
export function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// "HH:mm" options between startHour and endHour (inclusive) in `stepMin` steps.
export function buildTimeOptions(startHour = 0, endHour = 23, stepMin = 30) {
  const out: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

// Full-day options, 00:00 → 23:30. Used by Opening Hours.
export const ALL_DAY_TIME_OPTIONS = buildTimeOptions(0, 23, 30);

// Shared mobile "flat field" override passed to FieldTrigger / Input in the
// Home and Search search bars. Strips the per-field card chrome (border /
// radius / shadow) so each control reads as a flat row inside one unified
// panel on mobile, then restores the bordered "field" look at md+.
// `max-[360px]:` shrinks text + padding on very narrow phones (~320px) so the
// Date / Time labels and placeholders stop truncating.
export const FLAT_FIELD =
  "border-0 rounded-none shadow-none px-3 text-sm max-[360px]:px-2 max-[360px]:text-xs md:border md:border-slate-200 md:rounded-xl md:px-4 md:text-sm";

// Field-style trigger (icon · value · chevron). Shared across pickers so the
// Date / Time / People controls and the Opening Hours selectors look identical.
export const FieldTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    // Either a leading icon (default) OR a leading text label ("From"/"To").
    icon?: React.ComponentType<{ className?: string }>;
    leadingLabel?: string;
  }
>(({ icon: Icon, leadingLabel, children, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex h-12 w-full items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 data-[state=open]:border-slate-900/40 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white",
      className,
    )}
    {...props}
  >
    {leadingLabel ? (
      // Label mode: "From" / "To" on the left, value pushed to the right.
      <>
        <span className="shrink-0 text-slate-400">{leadingLabel}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{children}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </span>
      </>
    ) : (
      <>
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
          <span className="truncate">{children}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </>
    )}
  </button>
));
FieldTrigger.displayName = "FieldTrigger";

// A single option row inside a picker popover.
export function OptionRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
        selected
          ? "bg-slate-100 font-semibold text-slate-900"
          : "text-slate-700 hover:bg-slate-50",
      )}
    >
      <span>{children}</span>
      {selected && <Check className="h-4 w-4 text-slate-900" />}
    </button>
  );
}

/**
 * Reusable time dropdown. Renders a FieldTrigger (clock icon) opening a popover
 * of 30-minute options. `value`/`onChange` use 24-hour "HH:mm".
 *
 * `portal` defaults to true (the homepage search). Pass `portal={false}` when
 * used inside a Radix Dialog so the list renders within the dialog's DOM —
 * otherwise the dialog's scroll-lock (react-remove-scroll) blocks wheel
 * scrolling on the portaled list. The height is capped to the available space
 * so the list always scrolls internally instead of running off-screen.
 */
export function TimeSelect({
  value,
  onChange,
  options = ALL_DAY_TIME_OPTIONS,
  disabled = false,
  className,
  align = "start",
  portal = true,
  label,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  portal?: boolean;
  // When set (e.g. "From" / "To"), shows this leading label instead of the
  // clock icon.
  label?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const content = (
    <PopoverPrimitive.Content
      align={align}
      sideOffset={4}
      style={{
        maxHeight:
          "min(18rem, var(--radix-popover-content-available-height, 18rem))",
      }}
      className="z-50 w-40 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
    >
      {options.map((v) => (
        <OptionRow
          key={v}
          selected={v === value}
          onSelect={() => {
            onChange(v);
            setOpen(false);
          }}
        >
          {formatTimeLabel(v)}
        </OptionRow>
      ))}
    </PopoverPrimitive.Content>
  );

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <FieldTrigger
          icon={label ? undefined : Clock}
          leadingLabel={label}
          disabled={disabled}
          aria-label={ariaLabel ?? `Time: ${formatTimeLabel(value)}`}
          className={className}
        >
          {formatTimeLabel(value)}
        </FieldTrigger>
      </PopoverTrigger>
      {portal ? (
        <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal>
      ) : (
        content
      )}
    </Popover>
  );
}
