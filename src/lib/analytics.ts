const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

function isEnabled(): boolean {
  return (
    Boolean(MEASUREMENT_ID) && typeof window !== "undefined" && typeof window.gtag === "function"
  );
}

export function redactAnalyticsPath(path: string): string {
  return String(path ?? "")
    .replace(/^\/reservations\/manage\/[^/]+/i, "/reservations/manage/[token]")
    .replace(/[0-9a-f]{32,}/gi, "[redacted]");
}

export function trackPageView(path: string): void {
  if (!isEnabled()) {
    return;
  }
  try {
    window.gtag("event", "page_view", {
      page_path: redactAnalyticsPath(path),
    });
  } catch {}
}

export function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): void {
  if (!isEnabled()) {
    return;
  }
  try {
    window.gtag("event", eventName, params);
  } catch {}
}

export const analytics = {
  businessSignupStarted: (source?: string) => {
    let params: Record<string, string> = {};
    if (source) {
      params = { source };
    }
    trackEvent("business_signup_started", params);
  },
  businessSignupCompleted: () => trackEvent("business_signup_completed"),

  joinQueueClicked: (locationId?: string) => {
    let params: Record<string, string> = {};
    if (locationId) {
      params = { location_id: locationId };
    }
    trackEvent("join_queue_clicked", params);
  },
  queueJoined: (locationId?: string) => {
    let params: Record<string, string> = {};
    if (locationId) {
      params = { location_id: locationId };
    }
    trackEvent("queue_joined", params);
  },

  reservationStarted: (locationId?: string) => {
    let params: Record<string, string> = {};
    if (locationId) {
      params = { location_id: locationId };
    }
    trackEvent("reservation_started", params);
  },
  reservationCompleted: (locationId?: string) => {
    let params: Record<string, string> = {};
    if (locationId) {
      params = { location_id: locationId };
    }
    trackEvent("reservation_completed", params);
  },

  qrCodeScanned: (locationId?: string) => {
    let params: Record<string, string> = {};
    if (locationId) {
      params = { location_id: locationId };
    }
    trackEvent("qr_code_scanned", params);
  },

  businessDashboardOpened: () => trackEvent("business_dashboard_opened"),

  campaignCreated: () => trackEvent("campaign_created"),
  campaignSent: (channel?: string) => {
    let params: Record<string, string> = {};
    if (channel) {
      params = { channel };
    }
    trackEvent("campaign_sent", params);
  },

  guestCrmOpened: () => trackEvent("guest_crm_opened"),
};
