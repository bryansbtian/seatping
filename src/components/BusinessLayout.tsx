import { Outlet, useLocation } from "react-router-dom";
import BusinessSidebar from "@/components/BusinessSidebar";
import PortalLayout from "@/components/PortalLayout";
import BusinessNoLocations from "@/components/BusinessNoLocations";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang, type TKey } from "@/lib/i18n";
import {
  BUSINESS_NAV_GROUPS,
  isActiveNavPath,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/businessNav";

const PAGE_SUBTITLES: Record<string, TKey> = {
  "/business/overview": "dash.dailyStat",
  "/business/queue": "queue.page.subtitle",
  "/business/reservations": "res.page.subtitle",
  "/business/floor": "floor.subtitle",
  "/business/guests": "guests.subtitle",
  "/business/reviews": "rev.page.subtitle",
  "/business/campaigns": "camp.subtitle",
  "/business/performance": "perf.subtitle",
};

const BusinessLayout = () => {
  const { t } = useLang();
  const { pathname } = useLocation();
  const { me, locations } = useBusinessSession();
  const activePage = BUSINESS_NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    isActiveNavPath(pathname, item.to),
  );
  let content = <Outlet />;
  if (me && locations.length === 0 && activePage) {
    content = (
      <BusinessNoLocations
        titleKey={activePage.labelKey}
        subtitleKey={PAGE_SUBTITLES[activePage.to]}
      />
    );
  }

  return (
    <PortalLayout
      renderSidebar={(props) => <BusinessSidebar {...props} />}
      readCollapsed={readSidebarCollapsed}
      persistCollapsed={persistSidebarCollapsed}
      menuLabel={t("nav.menu")}
      openMenuLabel={t("nav.openMenu")}
      closeMenuLabel={t("nav.closeMenu")}
    >
      {content}
    </PortalLayout>
  );
};

export default BusinessLayout;
