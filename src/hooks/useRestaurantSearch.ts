import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { areaLabel, type SearchResponse, type SearchResult } from "@/lib/restaurantDiscovery";

export function useRestaurantSearch(params: string) {
  return useQuery(
    {
      queryKey: queryKeys.search(params),
      queryFn: async ({ signal }): Promise<SearchResponse> => {
        const response: SearchResponse | SearchResult[] = await api(
          `/api/search/restaurants?${params}`,
          { signal },
        );
        if (Array.isArray(response)) {
          if (response.length > 10) {
            throw new Error("Invalid Paginated Search Response");
          }
          return { results: response, total: response.length };
        }
        if (!Array.isArray(response.results)) {
          throw new Error("Invalid Search Response");
        }
        return {
          ...response,
          facets: response.facets ?? {
            cuisines: Array.from(
              new Set(response.results.flatMap((restaurant) => restaurant.cuisine || [])),
            ),
            locations: Array.from(new Set(response.results.map(areaLabel).filter(Boolean))),
          },
        };
      },
      staleTime: 15_000,
      placeholderData: keepPreviousData,
    },
    queryClient,
  );
}
