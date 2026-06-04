// Lazy loader for the Google Maps JavaScript API (Places library).
//
// Vite only exposes env variables prefixed with VITE_. Use VITE_GOOGLE_MAPS_API_KEY
// for browser-side Google Places autocomplete (plain GOOGLE_MAPS_API_KEY is a
// server-only var and is NOT visible to the frontend). The key should be
// HTTP-referrer–restricted in Google Cloud.

let loadPromise: Promise<any> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

/**
 * Google invokes `window.gm_authFailure` when the key is invalid, restricted, or
 * billing/APIs aren't enabled. We hook it so the UI can show a SeatPing-styled
 * inline warning instead of relying on Google's popup.
 */
function ensureAuthFailureHook() {
  const w = window as any;
  if (w.__seatpingGmAuthHook) return;
  w.__seatpingGmAuthHook = true;
  w.gm_authFailure = () => {
    authFailed = true;
    authFailureListeners.forEach((cb) => cb());
  };
}

/** Subscribe to Google Maps auth failures. Returns an unsubscribe fn. */
export function onMapsAuthFailure(cb: () => void): () => void {
  if (authFailed) cb();
  authFailureListeners.add(cb);
  return () => authFailureListeners.delete(cb);
}

export function getMapsApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
}

/**
 * Load the Google Maps JS API once and resolve with the `google` global.
 * Rejects if no key is configured or the script fails to load — callers should
 * fall back to manual address entry in that case.
 */
export function loadGoogleMaps(): Promise<any> {
  const w = window as any;
  if (w.google?.maps?.places) return Promise.resolve(w.google);
  if (loadPromise) return loadPromise;

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
      key
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

/** Extract the fields we store from a Google Places `PlaceResult`. */
export function parsePlace(place: any): PlaceDetails {
  const comps: any[] = place?.address_components || [];
  const get = (type: string) =>
    comps.find((c) => (c.types || []).includes(type))?.long_name as
      | string
      | undefined;

  const lat = place?.geometry?.location?.lat?.();
  const lng = place?.geometry?.location?.lng?.();
  const placeId = place?.place_id as string | undefined;

  const area =
    get("sublocality_level_1") ||
    get("sublocality") ||
    get("neighborhood") ||
    undefined;
  const city =
    get("locality") ||
    get("administrative_area_level_2") ||
    get("administrative_area_level_1") ||
    undefined;

  const googleMapsUrl =
    place?.url ||
    (placeId
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          place?.formatted_address || ""
        )}&query_place_id=${placeId}`
      : typeof lat === "number" && typeof lng === "number"
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : undefined);

  return {
    address: place?.formatted_address || place?.name || "",
    area,
    city,
    country: get("country"),
    latitude: typeof lat === "number" ? lat : null,
    longitude: typeof lng === "number" ? lng : null,
    googlePlaceId: placeId,
    googleMapsUrl,
  };
}
