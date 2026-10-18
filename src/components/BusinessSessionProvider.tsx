import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { api, ApiError } from "@/lib/api";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";
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
  const [me, setMeState] = useState<BusinessMe | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [meError, setMeError] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(() =>
    readStoredLocationId(),
  );

  const inFlight = useRef<Promise<void> | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const mutationVersion = useRef(0);
  const setMe = useCallback((update: SetStateAction<BusinessMe | null>) => {
    mutationVersion.current++;
    setMeState(update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => {
      controller.abort();
      inFlight.current = null;
    };
  }, []);

  const refreshMe = useCallback((): Promise<void> => {
    if (inFlight.current) {
      return inFlight.current;
    }
    const controller = lifecycle.current;
    const version = mutationVersion.current;
    setLoadingMe(true);
    setMeError(false);
    const request = (async () => {
      try {
        const res = await api("/auth/business/me", { signal: controller?.signal });
        if (!res?.user || typeof res.user !== "object" || Array.isArray(res.user)) {
          throw new Error("Business account unavailable");
        }
        if (!controller?.signal.aborted && version === mutationVersion.current) {
          setMeState(res.user);
        }
      } catch (error) {
        if (!controller?.signal.aborted) {
          setMeError(true);
        }
        if (
          !controller?.signal.aborted &&
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          mutationVersion.current++;
          setMeState(null);
          setSelectedLocationId(null);
          try {
            localStorage.removeItem(LOCATION_STORAGE_KEY);
          } catch {}
        }
      } finally {
        if (!controller?.signal.aborted) {
          setLoadingMe(false);
        }
        if (inFlight.current === request) {
          inFlight.current = null;
        }
      }
    })();
    inFlight.current = request;
    return request;
  }, []);

  useVisiblePolling(refreshMe, REFRESH_INTERVAL_MS);

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
      loadingMe,
      meError,
      setMe,
      refreshMe,
      locations,
      currentLocation,
      currentLocationIndex,
      selectedLocationId,
      selectLocation,
    };
  }, [me, loadingMe, meError, setMe, refreshMe, locations, selectedLocationId, selectLocation]);

  return (
    <BusinessSessionContext.Provider value={value}>{children}</BusinessSessionContext.Provider>
  );
}

export default BusinessSessionProvider;
