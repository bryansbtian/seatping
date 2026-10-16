import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export type ReservationSettings = {
  reservationStartTime: string;
  reservationEndTime: string;
  maxPartySize: number;
  maxReservedGuestsPerHour: number;
  bookingWindowDays: number;
  minNoticeMinutes: number;
  defaultReservationDurationMinutes: number;
  reservationHoldMinutes: number;
  confirmationMode: "auto" | "manual";
  cancellationPolicy: string;
};

export type Slot = {
  time: string;
  label: string;
  available: boolean;
  remaining: number | null;
  reason?: "full" | "too_soon" | "party_too_large" | "closed" | "no_table";
};

export type AvailabilityNotice = {
  status: "available" | "closed" | "outside_operating_hours";
  dayName?: string | null;
  hoursLabel?: string | null;
  message?: string;
  helper?: string;
};

function settingsOptions(username: string, locationId: string) {
  return queryOptions({
    queryKey: queryKeys.settings(username, locationId),
    queryFn: async ({ signal }): Promise<ReservationSettings | null> => {
      const response = await api(
        `/api/reservations/${encodeURIComponent(username)}/${encodeURIComponent(locationId)}/settings`,
        { signal },
      );
      return response.settings ?? null;
    },
    staleTime: 30_000,
  });
}

function availabilityOptions(
  username: string,
  locationId: string,
  date: string,
  partySize: number | "larger",
) {
  return queryOptions({
    queryKey: queryKeys.availability(username, locationId, date, partySize),
    queryFn: async ({
      signal,
    }): Promise<{ slots: Slot[]; availability: AvailabilityNotice | null }> => {
      const response = await api(
        `/api/reservations/${encodeURIComponent(username)}/${encodeURIComponent(locationId)}/availability?date=${encodeURIComponent(date)}&partySize=${partySize}`,
        { signal },
      );
      let slots: Slot[] = [];
      if (Array.isArray(response.slots)) {
        slots = response.slots;
      }
      return { slots, availability: response.availability ?? null };
    },
    staleTime: 5_000,
    gcTime: 60_000,
  });
}

export function useBookingSettings(username: string, locationId: string, enabled: boolean) {
  return useQuery({ ...settingsOptions(username, locationId), enabled }, queryClient);
}

export function useBookingAvailability(
  username: string,
  locationId: string,
  date: string,
  partySize: number | "larger",
  enabled = true,
) {
  return useQuery(
    {
      ...availabilityOptions(username, locationId, date, partySize),
      enabled: enabled && Boolean(date) && partySize !== "larger",
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    },
    queryClient,
  );
}

export function prefetchBooking(
  username: string,
  locationId: string,
  date: string,
  partySize: number | "larger",
) {
  const work = [queryClient.prefetchQuery(settingsOptions(username, locationId))];
  if (date && partySize !== "larger") {
    work.push(
      queryClient.prefetchQuery(availabilityOptions(username, locationId, date, partySize)),
    );
  }
  return Promise.all(work);
}

export function prefetchBookingSettings(username: string, locationId: string) {
  return queryClient.prefetchQuery(settingsOptions(username, locationId));
}

export function invalidateAvailability(username: string, locationId: string) {
  return queryClient.invalidateQueries({
    queryKey: ["public", "availability", username, locationId],
  });
}
