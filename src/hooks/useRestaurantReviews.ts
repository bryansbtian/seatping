import { useInfiniteQuery } from "@tanstack/react-query";
import type { RestaurantProfile, RestaurantReviewPage } from "@shared/restaurantProfile";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export function useRestaurantReviews(
  username: string,
  locationId: string,
  profile?: RestaurantProfile,
) {
  let initialData;
  if (profile) {
    initialData = {
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
    };
  }
  return useInfiniteQuery(
    {
      queryKey: queryKeys.reviews(username, locationId),
      queryFn: async ({ signal, pageParam }): Promise<RestaurantReviewPage> => {
        const params = new URLSearchParams();
        if (pageParam) {
          params.set("cursor", pageParam);
        }
        return api(
          `/api/restaurants/${encodeURIComponent(username)}/${encodeURIComponent(locationId)}/reviews?${params}`,
          { signal },
        );
      },
      initialPageParam: null as string | null,
      getNextPageParam: (page) => {
        if (page.hasMore && page.nextCursor) {
          return page.nextCursor;
        }
        return undefined;
      },
      initialData,
      initialDataUpdatedAt: queryClient.getQueryState(queryKeys.profile(username, locationId))
        ?.dataUpdatedAt,
      enabled: Boolean(profile),
      staleTime: 15_000,
    },
    queryClient,
  );
}
