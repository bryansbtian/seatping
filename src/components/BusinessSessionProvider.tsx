import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  BusinessSessionContext,
  LOCATION_STORAGE_KEY,
  type BusinessLocation,
  type BusinessMe,
  type BusinessSessionValue,
} from "@/lib/businessSession";

const REFRESH_INTERVAL_MS = 10000;

function readStoredLocationId(): string | null {
  try {
    return localStorage.getItem(LOCATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistLocationId(locationId: string) {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, locationId);
  } catch {}
}

export function BusinessSessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<BusinessMe | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(() =>
    readStoredLocationId(),
  );

  const refreshMe = useCallback(async () => {
    try {
      const res = await api("/auth/business/me");
      setMe(res.user);
    } catch {}
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshMe();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshMe]);

  const locations = useMemo<BusinessLocation[]>(() => {
    const list = me?.locations;
    if (Array.isArray(list)) {
      return list;
    }
    return [];
  }, [me]);

  useEffect(() => {
    if (locations.length === 0) {
      return;
    }
    const known = locations.some((location) => location.id === selectedLocationId);
    if (known) {
      return;
    }
    const fallbackId = locations[0].id;
    setSelectedLocationId(fallbackId);
    persistLocationId(fallbackId);
  }, [locations, selectedLocationId]);

  const selectLocation = useCallback((locationId: string) => {
    setSelectedLocationId(locationId);
    persistLocationId(locationId);
  }, []);

  const value = useMemo<BusinessSessionValue>(() => {
    let currentLocationIndex = locations.findIndex(
      (location) => location.id === selectedLocationId,
    );
    if (currentLocationIndex === -1 && locations.length > 0) {
      currentLocationIndex = 0;
    }

    let currentLocation: BusinessLocation | null = null;
    if (currentLocationIndex >= 0) {
      currentLocation = locations[currentLocationIndex] ?? null;
    }

    return {
      me,
      setMe,
      refreshMe,
      locations,
      currentLocation,
      currentLocationIndex,
      selectedLocationId,
      selectLocation,
    };
  }, [me, refreshMe, locations, selectedLocationId, selectLocation]);

  return (
    <BusinessSessionContext.Provider value={value}>{children}</BusinessSessionContext.Provider>
  );
}

export default BusinessSessionProvider;
