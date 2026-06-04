import { useMemo, useState } from "react";
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
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_ISO,
  type CountryCode,
} from "@/lib/countryCodes";

/**
 * Searchable country dialing-code selector — same Popover + Command combobox the
 * queue "Wait Anywhere" flow uses, but backed by the full country list.
 *
 * Stores/returns only the dial code (e.g. "+1") via `onChange`. Because multiple
 * countries share a dial code, the chosen country is tracked internally by ISO
 * so the checkmark lands on exactly one row.
 */
export function CountryCodeSelect({
  value,
  onChange,
  ariaLabel = "Country code",
  className,
}: {
  value: string;
  onChange: (dial: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIso, setSelectedIso] = useState<string>(() => {
    // Several countries share a dial code (e.g. +1). Prefer the default country
    // (US) when its code matches, so "+1" shows 🇺🇸 rather than the first
    // alphabetical match.
    const def = COUNTRY_CODES.find((c) => c.iso === DEFAULT_COUNTRY_ISO);
    if (def && def.dial === value) return def.iso;
    const match = COUNTRY_CODES.find((c) => c.dial === value);
    return match?.iso ?? DEFAULT_COUNTRY_ISO;
  });

  const selected: CountryCode = useMemo(
    () =>
      COUNTRY_CODES.find((c) => c.iso === selectedIso) ??
      COUNTRY_CODES.find((c) => c.iso === DEFAULT_COUNTRY_ISO)!,
    [selectedIso]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-28 shrink-0 items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring",
            className
          )}
        >
          <span className="truncate">
            {selected.flag} {selected.dial}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command
          filter={(value, search) => {
            const term = search.toLowerCase().replace(/\+/g, "");
            return value.toLowerCase().includes(term) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search country or code..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRY_CODES.map((c) => (
                <CommandItem
                  key={c.iso}
                  value={`${c.name} ${c.dial} ${c.iso}`}
                  onSelect={() => {
                    setSelectedIso(c.iso);
                    onChange(c.dial);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedIso === c.iso ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="mr-2">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-muted-foreground">{c.dial}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CountryCodeSelect;
