import { useEffect, useState } from "react";

// One location suggestion from GET /api/locations/search-suggestions.
export type Suggestion = {
  locationId: string;
  businessId: string | null;
  businessUsername: string | null;
  businessName: string | null;
  name: string;
  shortAddress: string | null;
  cuisine: string | null;
  area: string | null;
  city: string | null;
  imageUrl: string | null;
  url: string | null;
};

/**
 * Debounced live location suggestions for the hero search input.
 * - Debounces ~275ms and aborts in-flight requests on the next keystroke.
 * - Returns nothing (and never loads) while `enabled` is false or the query is
 *   empty — the caller disables it right after a selection so the dropdown
 *   doesn't reopen until the user types again.
 */
export function useSearchSuggestions(query: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 1) {
      setSuggestions([]);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(
        `/api/locations/search-suggestions?query=${encodeURIComponent(q)}&limit=3`,
        { signal: ctrl.signal, credentials: "include" },
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("request failed"))))
        .then((d) => {
          setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions.slice(0, 3) : []);
          setLoading(false);
        })
        .catch((e) => {
          if (e?.name === "AbortError") return;
          setError(true);
          setSuggestions([]);
          setLoading(false);
        });
    }, 275);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, enabled]);

  return { suggestions, loading, error };
}
