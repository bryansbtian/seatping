import { Outlet } from "react-router-dom";
import BusinessSidebar from "@/components/BusinessSidebar";
import PortalLayout from "@/components/PortalLayout";
import { useLang } from "@/lib/i18n";
import { persistSidebarCollapsed, readSidebarCollapsed } from "@/lib/businessNav";

const BusinessLayout = () => {
  const { t } = useLang();

  return (
    <PortalLayout
      renderSidebar={(props) => <BusinessSidebar {...props} />}
      readCollapsed={readSidebarCollapsed}
      persistCollapsed={persistSidebarCollapsed}
      menuLabel={t("nav.menu")}
      openMenuLabel={t("nav.openMenu")}
      closeMenuLabel={t("nav.closeMenu")}
    >
      <Outlet />
    </PortalLayout>
  );
};

export default BusinessLayout;
