
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

function isEnabled(): boolean {
  return Boolean(MEASUREMENT_ID) && typeof window !== "undefined" &&
    typeof window.gtag === "function";
}

export function trackPageView(path: string): void {
  if (!isEnabled()) return;
  try {
    window.gtag("event", "page_view", {
      page_path: path,
    });
  } catch {
  }
}

export function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): void {
  if (!isEnabled()) return;
  try {
    window.gtag("event", eventName, params);
  } catch {
  }
}

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
