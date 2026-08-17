import { useEffect, useState } from "react";

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
        .then((r) => {
          if (r.ok) {
            return r.json();
          }
          return Promise.reject(new Error("request failed"));
        })
        .then((d) => {
          let nextSuggestions: Suggestion[] = [];
          if (Array.isArray(d?.suggestions)) {
            nextSuggestions = d.suggestions.slice(0, 3);
          }
          setSuggestions(nextSuggestions);
          setLoading(false);
        })
        .catch((e) => {
          if (e?.name === "AbortError") {
            return;
          }
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
