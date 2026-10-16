import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

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
  const q = query.trim();
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    if (!enabled || !q) {
      setDebounced("");
      return;
    }
    const timer = setTimeout(() => setDebounced(q), 275);
    return () => clearTimeout(timer);
  }, [q, enabled]);
  const active = enabled && Boolean(q) && debounced === q;
  const request = useQuery(
    {
      queryKey: queryKeys.suggestions(q),
      queryFn: async ({ signal }): Promise<Suggestion[]> => {
        const response = await api(
          `/api/locations/search-suggestions?query=${encodeURIComponent(q)}&limit=3`,
          { signal },
        );
        if (Array.isArray(response?.suggestions)) {
          return response.suggestions.slice(0, 3);
        }
        return [];
      },
      enabled: active,
      staleTime: 15_000,
      gcTime: 60_000,
    },
    queryClient,
  );
  useEffect(() => {
    if (!enabled) {
      const key = queryKeys.suggestions(q);
      const query = queryClient.getQueryCache().find({ queryKey: key });
      if (query && !query.isActive()) {
        void queryClient.cancelQueries({ queryKey: key });
      }
    }
  }, [enabled, q]);
  const aborted = request.error?.name === "AbortError";
  let suggestions: Suggestion[] = [];
  if (active) {
    suggestions = request.data ?? [];
  }
  return {
    suggestions,
    loading: enabled && Boolean(q) && (!active || request.isPending || aborted),
    error: active && request.isError && !aborted,
  };
}
