/**
 * GA4 analytics helpers.
 *
 * Everything here is a safe no-op when VITE_GA_MEASUREMENT_ID is unset or
 * window.gtag is unavailable (script blocked, local dev, SSR-style guards), so
 * callers never need to guard their own call sites.
 *
 * PRIVACY: never pass customer names, phone numbers, emails, reservation /
 * manage tokens, message content, or full URLs with query parameters into any
 * of these helpers. Only non-sensitive metadata (source, page type, channel,
 * and opaque IDs like location_id) is allowed. The named event helpers below
 * accept a narrow, typed set of params to make accidental leaks hard.
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

/** True only when GA is configured and the gtag runtime is loaded. */
function isEnabled(): boolean {
  return Boolean(MEASUREMENT_ID) && typeof window !== "undefined" &&
    typeof window.gtag === "function";
}

/**
 * Send a single SPA page view. Pass only `location.pathname` (no query string,
 * no hash) so query params (tokens, search terms) never reach GA4.
 */
export function trackPageView(path: string): void {
  if (!isEnabled()) return;
  try {
    window.gtag("event", "page_view", {
      page_path: path,
      // page_location is intentionally omitted to avoid sending query strings.
    });
  } catch {
    // Fail silently. Analytics must never break the app.
  }
}

/**
 * Send a custom GA4 event. `params` must contain only non-sensitive metadata
 * (see the privacy note above).
 */
export function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): void {
  if (!isEnabled()) return;
  try {
    window.gtag("event", eventName, params);
  } catch {
    // Fail silently.
  }
}

/**
 * Named SeatPing events. These wrap trackEvent with a fixed name and a narrow,
 * non-sensitive param shape so call sites can't accidentally leak PII.
 */
export const analytics = {
  businessSignupStarted: (source?: string) =>
    trackEvent("business_signup_started", source ? { source } : {}),
  businessSignupCompleted: () => trackEvent("business_signup_completed"),

  joinQueueClicked: (locationId?: string) =>
    trackEvent("join_queue_clicked", locationId ? { location_id: locationId } : {}),
  queueJoined: (locationId?: string) =>
    trackEvent("queue_joined", locationId ? { location_id: locationId } : {}),

  reservationStarted: (locationId?: string) =>
    trackEvent("reservation_started", locationId ? { location_id: locationId } : {}),
  reservationCompleted: (locationId?: string) =>
    trackEvent("reservation_completed", locationId ? { location_id: locationId } : {}),

  qrCodeScanned: (locationId?: string) =>
    trackEvent("qr_code_scanned", locationId ? { location_id: locationId } : {}),

  businessDashboardOpened: () => trackEvent("business_dashboard_opened"),

  campaignCreated: () => trackEvent("campaign_created"),
  campaignSent: (channel?: string) =>
    trackEvent("campaign_sent", channel ? { channel } : {}),

  guestCrmOpened: () => trackEvent("guest_crm_opened"),
};
