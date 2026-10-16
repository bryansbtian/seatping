import { useQuery } from "@tanstack/react-query";
import type { RestaurantProfile, RestaurantReviewPage } from "@shared/restaurantProfile";
import type { InfiniteData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export function useRestaurantProfile(username: string, locationId: string) {
  return useQuery(
    {
      queryKey: queryKeys.profile(username, locationId),
      queryFn: async ({ signal }): Promise<RestaurantProfile> => {
        const response = await api(
          `/api/restaurants/${encodeURIComponent(username)}/${encodeURIComponent(locationId)}?version=2`,
          { signal },
        );
        const profile: RestaurantProfile = response.restaurant;
        const reviewsKey = queryKeys.reviews(username, locationId);
        if (profile && !queryClient.getQueryData(reviewsKey)) {
          queryClient.setQueryData<InfiniteData<RestaurantReviewPage, string | null>>(reviewsKey, {
            pages: [
              {
                reviews: profile.reviews,
                nextCursor: profile.reviewsPage.nextCursor,
                hasMore: profile.reviewsPage.hasMore,
                totalReviews: profile.reviewCount,
                avgRating: profile.rating,
              },
            ],
            pageParams: [null],
          });
        }
        return profile;
      },
      enabled: Boolean(username && locationId),
      staleTime: 15_000,
    },
    queryClient,
  );
}
