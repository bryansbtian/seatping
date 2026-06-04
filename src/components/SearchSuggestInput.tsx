import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Loader2, Utensils } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useSearchSuggestions,
  type Suggestion,
} from "@/hooks/useSearchSuggestions";

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
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
  /** Controlled search text. */
  value: string;
  onChange: (value: string) => void;
  /** Carried as query params onto the restaurant page when a suggestion is
   *  picked, so its "Plan your visit" card prefills. */
  date: Date;
  time: string;
  people: string;
  placeholder?: string;
  /** Classes for the positioned wrapper (e.g. row dividers / grid sizing). */
  className?: string;
  /** Classes for the <input> itself (flat-on-mobile styling, bg, etc.). */
  inputClassName?: string;
}

/**
 * Shared restaurant-suggestion search input used by both the homepage hero
 * search (ReservationSearchBar) and the /search results bar (SearchResults) so
 * the two behave identically:
 *  - debounced live suggestions (image · name · cuisine · area) via
 *    {@link useSearchSuggestions};
 *  - ↑/↓ to move, Enter to pick the highlighted one, Esc to close;
 *  - clicking / Enter-picking a suggestion navigates straight to that
 *    restaurant's public page (`/:businessUsername/:locationId`, carrying the
 *    chosen date/time/party) — it does not merely fill the input.
 *
 * The Search button and a plain Enter (no suggestion highlighted) fall through
 * to the surrounding <form onSubmit>, which each page owns as its general
 * "/search" action.
 */
export function SearchSuggestInput({
  value,
  onChange,
  date,
  time,
  people,
  placeholder = "Restaurants, cuisines, or areas",
  className,
  inputClassName,
}: SearchSuggestInputProps) {
  const navigate = useNavigate();

  // `justSelected` keeps the dropdown closed after a pick until the user types
  // again; it also disables the fetch hook.
  const [open, setOpen] = React.useState(false);
  const [justSelected, setJustSelected] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(-1);
  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  const { suggestions, loading, error } = useSearchSuggestions(
    value,
    !justSelected,
  );
  const showDropdown = open && !justSelected && value.trim().length > 0;

  // Reset the highlight whenever the result set changes.
  React.useEffect(() => {
    setHighlighted(-1);
  }, [suggestions]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
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
      if (people !== "large") params.set("partySize", people);
      navigate(`${s.url}?${params.toString()}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (!showDropdown || suggestions.length === 0) return;
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      if (!showDropdown || suggestions.length === 0) return;
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Highlighted suggestion wins; otherwise let the form run a normal search.
      if (showDropdown && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault();
        selectSuggestion(suggestions[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  return (
    <div ref={searchBoxRef} className={cn("relative w-full min-w-0", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none max-[360px]:left-2" />
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setJustSelected(false);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim() && !justSelected) setOpen(true);
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
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-slate-500">
              Couldn't load suggestions. Press Search to continue.
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">
              No matching restaurants found
            </div>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {suggestions.map((s, i) => (
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
                      i === highlighted ? "bg-slate-100" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                      {s.imageUrl ? (
                        <img
                          src={s.imageUrl}
                          alt={s.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Utensils className="h-4 w-4 text-slate-400" />
                      )}
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
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchSuggestInput;
