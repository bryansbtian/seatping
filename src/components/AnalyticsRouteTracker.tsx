import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/analytics";

/**
 * Sends a GA4 page view on every React Router navigation. Mounted once inside
 * <BrowserRouter>. Tracks ONLY location.pathname so query strings (which may
 * carry tokens or search terms) are never sent to GA4. Renders nothing.
 */
export default function AnalyticsRouteTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
