import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useSession } from "@/hooks/useSession";

export function useMyReview<T = { id: string; locationId: string }>(locationId: string) {
  const session = useSession();
  const customerId = session?.customerId ?? null;
  return useQuery(
    {
      queryKey: queryKeys.myReview(customerId, locationId),
      queryFn: async ({ signal }): Promise<T | null> => {
        const response = await api(
          `/auth/me/reviews?locationId=${encodeURIComponent(locationId)}`,
          {
            signal,
          },
        );
        return response.reviews?.[0] ?? null;
      },
      enabled: Boolean(customerId && locationId),
      staleTime: 15_000,
      gcTime: 60_000,
    },
    queryClient,
  );
}
