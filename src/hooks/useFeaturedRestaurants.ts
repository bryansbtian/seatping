import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

type FeaturedRestaurant = {
  id: string;
  locationId: string;
  businessUsername: string | null;
  businessName: string | null;
  name: string;
  shortAddress: string | null;
  address: string;
  area: string | null;
  city: string | null;
  cuisine: string | null;
  priceRange: string | null;
  bannerImageUrl: string | null;
  rating: number | null;
  reviewCount: number;
  reservationsEnabled?: boolean;
  queueEnabled?: boolean;
};

export function useFeaturedRestaurants() {
  return useQuery(
    {
      queryKey: queryKeys.featured,
      queryFn: async ({ signal }): Promise<FeaturedRestaurant[]> => {
        const response = await api("/api/featured-restaurants", { signal });
        if (Array.isArray(response.featured)) {
          return response.featured;
        }
        return [];
      },
      staleTime: 15_000,
    },
    queryClient,
  );
}
