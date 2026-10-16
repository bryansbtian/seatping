import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 300_000, refetchOnWindowFocus: true },
  },
});

export async function resetSessionQueries(broadcast = true) {
  await queryClient.cancelQueries({ queryKey: ["private"] });
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] === "private" && query.queryKey[1] !== "session",
  });
  if (broadcast && typeof window !== "undefined") {
    try {
      window.localStorage.setItem("seatping:session-change", `${Date.now()}:${Math.random()}`);
    } catch {}
  }
  await queryClient.resetQueries({ queryKey: ["private", "session"] });
}

export async function invalidateRestaurantData(username?: string, locationId?: string) {
  const work = [
    queryClient.invalidateQueries({ queryKey: ["public", "search"] }),
    queryClient.invalidateQueries({ queryKey: ["public", "featured"] }),
    queryClient.invalidateQueries({ queryKey: ["private", "review"] }),
  ];
  if (username && locationId) {
    work.push(
      queryClient.invalidateQueries({ queryKey: ["public", "profile", username, locationId] }),
      queryClient.invalidateQueries({ queryKey: ["public", "reviews", username, locationId] }),
    );
  } else {
    work.push(
      queryClient.invalidateQueries({ queryKey: ["public", "profile"] }),
      queryClient.invalidateQueries({ queryKey: ["public", "reviews"] }),
    );
  }
  await Promise.all(work);
}

export function invalidateRestaurantConfiguration() {
  return queryClient.invalidateQueries({ queryKey: ["public"] });
}
