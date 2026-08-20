import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock, ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { ALL_DAY_TIME_OPTIONS, formatTimeLabel } from "@/components/timeOptions";

export const FLAT_FIELD =
  "border-0 rounded-none shadow-none px-3 text-sm max-[360px]:px-2 max-[360px]:text-xs md:border md:border-slate-200 md:rounded-xl md:px-4 md:text-sm";

export const FieldTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: React.ComponentType<{ className?: string }>;
    leadingLabel?: string;
  }
>(({ icon: Icon, leadingLabel, children, className, ...props }, ref) => {
  let triggerBody: React.ReactNode;
  if (leadingLabel) {
    triggerBody = (
      <>
        <span className="shrink-0 text-slate-400">{leadingLabel}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{children}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </span>
      </>
    );
  } else {
    triggerBody = (
      <>
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
          <span className="truncate">{children}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-12 w-full items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 data-[state=open]:border-slate-900/40 data-[state=open]:ring-2 data-[state=open]:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white",
        className,
      )}
      {...props}
    >
      {triggerBody}
    </button>
  );
});
FieldTrigger.displayName = "FieldTrigger";

export function OptionRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  let selectedClass: string;
  if (selected) {
    selectedClass = "bg-slate-100 font-semibold text-slate-900";
  } else {
    selectedClass = "text-slate-700 hover:bg-slate-50";
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
        selectedClass,
      )}
    >
      <span>{children}</span>
      {selected && <Check className="h-4 w-4 text-slate-900" />}
    </button>
  );
}

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
  label?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const content = (
    <PopoverPrimitive.Content
      align={align}
      sideOffset={4}
      style={{
        maxHeight: "min(18rem, var(--radix-popover-content-available-height, 18rem))",
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

  let triggerIcon: React.ComponentType<{ className?: string }> | undefined;
  if (label) {
    triggerIcon = undefined;
  } else {
    triggerIcon = Clock;
  }

  let popoverContent: React.ReactNode;
  if (portal) {
    popoverContent = <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal>;
  } else {
    popoverContent = content;
  }

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <FieldTrigger
          icon={triggerIcon}
          leadingLabel={label}
          disabled={disabled}
          aria-label={ariaLabel ?? `Time: ${formatTimeLabel(value)}`}
          className={className}
        >
          {formatTimeLabel(value)}
        </FieldTrigger>
      </PopoverTrigger>
      {popoverContent}
    </Popover>
  );
}
