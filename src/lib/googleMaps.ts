let loadPromise: Promise<any> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

function ensureAuthFailureHook() {
  const w = window as any;
  if (w.__seatpingGmAuthHook) {
    return;
  }
  w.__seatpingGmAuthHook = true;
  w.gm_authFailure = () => {
    authFailed = true;
    authFailureListeners.forEach((cb) => cb());
  };
}

export function onMapsAuthFailure(cb: () => void): () => void {
  if (authFailed) {
    cb();
  }
  authFailureListeners.add(cb);
  return () => authFailureListeners.delete(cb);
}

export function getMapsApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
}

export function loadGoogleMaps(): Promise<any> {
  const w = window as any;
  if (w.google?.maps?.places) {
    return Promise.resolve(w.google);
  }
  if (loadPromise) {
    return loadPromise;
  }

  const key = getMapsApiKey();
  if (!key) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
  }

  ensureAuthFailureHook();
  loadPromise = new Promise((resolve, reject) => {
    const callbackName = "__seatping_gmaps_cb";
    w[callbackName] = () => resolve(w.google);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key,
    )}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export interface PlaceDetails {
  address: string;
  area?: string;
  city?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string;
  googleMapsUrl?: string;
}

export function parsePlace(place: any): PlaceDetails {
  const comps: any[] = place?.address_components || [];
  const get = (type: string) =>
    comps.find((c) => (c.types || []).includes(type))?.long_name as string | undefined;

  const lat = place?.geometry?.location?.lat?.();
  const lng = place?.geometry?.location?.lng?.();
  const placeId = place?.place_id as string | undefined;

  const area = get("sublocality_level_1") || get("sublocality") || get("neighborhood") || undefined;
  const city =
    get("locality") ||
    get("administrative_area_level_2") ||
    get("administrative_area_level_1") ||
    undefined;

  let derivedMapsUrl: string | undefined;
  if (placeId) {
    derivedMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      place?.formatted_address || "",
    )}&query_place_id=${placeId}`;
  } else if (typeof lat === "number" && typeof lng === "number") {
    derivedMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  } else {
    derivedMapsUrl = undefined;
  }
  const googleMapsUrl = place?.url || derivedMapsUrl;

  let latitude: number | null = null;
  if (typeof lat === "number") {
    latitude = lat;
  }
  let longitude: number | null = null;
  if (typeof lng === "number") {
    longitude = lng;
  }

  return {
    address: place?.formatted_address || place?.name || "",
    area,
    city,
    country: get("country"),
    latitude,
    longitude,
    googlePlaceId: placeId,
    googleMapsUrl,
  };
}
