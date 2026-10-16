import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { queryClient, resetSessionQueries } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export type SessionState = {
  customer: { name?: string | null } | null;
  business: { name?: string | null } | null;
  customerId: string | null;
};

let sessionSubscribers = 0;

function onSessionStorage(event: StorageEvent) {
  if (event.key === "seatping:session-change") {
    void resetSessionQueries(false);
  }
}

export function useSession(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    sessionSubscribers += 1;
    if (sessionSubscribers === 1) {
      window.addEventListener("storage", onSessionStorage);
    }
    return () => {
      sessionSubscribers -= 1;
      if (sessionSubscribers === 0) {
        window.removeEventListener("storage", onSessionStorage);
      }
    };
  }, [enabled]);
  return useQuery(
    {
      queryKey: queryKeys.session,
      queryFn: async ({ signal }): Promise<SessionState> => {
        let next: SessionState;
        try {
          const data = await api("/auth/session", { signal });
          next = {
            customer: data?.customer ?? null,
            business: data?.business ?? null,
            customerId: data?.customerId ?? null,
          };
        } catch (error) {
          if (signal.aborted) {
            throw error;
          }
          next = { customer: null, business: null, customerId: null };
        }
        const previous = queryClient.getQueryData<SessionState>(queryKeys.session);
        if (previous?.customerId !== next.customerId) {
          const privateData = {
            predicate: (query: { queryKey: readonly unknown[] }) =>
              query.queryKey[0] === "private" && query.queryKey[1] !== "session",
          };
          await queryClient.cancelQueries(privateData);
          queryClient.removeQueries(privateData);
        }
        return next;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: "always",
      enabled,
    },
    queryClient,
  ).data;
}

export function useCustomerContact() {
  const session = useSession();
  const customerId = session?.customerId ?? null;
  return useQuery(
    {
      queryKey: queryKeys.contact(customerId),
      queryFn: async ({ signal }): Promise<{ id: string; name: string; email: string } | null> => {
        const response = await api("/auth/me?view=contact", { signal });
        if (response.user?.id !== customerId) {
          return null;
        }
        return response.user;
      },
      enabled: Boolean(customerId),
      staleTime: 30_000,
      gcTime: 60_000,
    },
    queryClient,
  );
}
