import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Loader2, Utensils } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useSearchSuggestions,
  type Suggestion,
} from "@/hooks/useSearchSuggestions";

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function suggestionSubtitle(s: Suggestion): string {
  return [s.cuisine, s.shortAddress || s.area || s.city]
    .filter(Boolean)
    .join(" · ");
}

export interface SearchSuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  date: Date;
  time: string;
  people: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function SearchSuggestInput({
  value,
  onChange,
  date,
  time,
  people,
  placeholder = "Restaurants, Cuisines, Or Areas",
  className,
  inputClassName,
}: SearchSuggestInputProps) {
  const navigate = useNavigate();

  const [open, setOpen] = React.useState(false);
  const [justSelected, setJustSelected] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(-1);
  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  const { suggestions, loading, error } = useSearchSuggestions(
    value,
    !justSelected,
  );
  const showDropdown = open && !justSelected && value.trim().length > 0;

  React.useEffect(() => {
    setHighlighted(-1);
  }, [suggestions]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectSuggestion = (s: Suggestion) => {
    onChange(s.name);
    setJustSelected(true);
    setOpen(false);
    setHighlighted(-1);
    if (s.url) {
      const params = new URLSearchParams();
      params.set("date", localDateStr(date));
      params.set("time", time);
      if (people !== "large") {
        params.set("partySize", people);
      }
      navigate(`${s.url}?${params.toString()}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (!showDropdown || suggestions.length === 0) {
        return;
      }
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      if (!showDropdown || suggestions.length === 0) {
        return;
      }
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (showDropdown && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault();
        selectSuggestion(suggestions[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  let dropdownContent: React.ReactNode = null;
  if (showDropdown) {
    if (loading && suggestions.length === 0) {
      dropdownContent = (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching…
        </div>
      );
    } else if (error) {
      dropdownContent = (
        <div className="px-4 py-3 text-sm text-slate-500">
          Couldn't load suggestions. Press Search to continue.
        </div>
      );
    } else if (suggestions.length === 0) {
      dropdownContent = (
        <div className="px-4 py-3 text-sm text-slate-500">
          No matching restaurants found
        </div>
      );
    } else {
      dropdownContent = (
        <ul className="max-h-[320px] overflow-y-auto py-1">
          {suggestions.map((s, i) => {
            let rowStateClass: string;
            if (i === highlighted) {
              rowStateClass = "bg-slate-100";
            } else {
              rowStateClass = "hover:bg-slate-50";
            }
            let thumbnail: React.ReactNode;
            if (s.imageUrl) {
              thumbnail = (
                <img
                  src={s.imageUrl}
                  alt={s.name}
                  className="h-full w-full object-cover"
                />
              );
            } else {
              thumbnail = <Utensils className="h-4 w-4 text-slate-400" />;
            }
            return (
              <li key={s.locationId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => selectSuggestion(s)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    rowStateClass,
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {thumbnail}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {s.name}
                    </span>
                    {suggestionSubtitle(s) && (
                      <span className="flex items-center gap-1 truncate text-xs text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{suggestionSubtitle(s)}</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      );
    }
  }

  return (
    <div
      ref={searchBoxRef}
      className={cn("relative w-full min-w-0", className)}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none max-[360px]:left-2" />
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setJustSelected(false);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim() && !justSelected) {
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn("h-12 w-full pl-9 max-[360px]:pl-8", inputClassName)}
        aria-label="Search restaurants, cuisines, or areas"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          role="listbox"
        >
          {dropdownContent}
        </div>
      )}
    </div>
  );
}

export default SearchSuggestInput;
