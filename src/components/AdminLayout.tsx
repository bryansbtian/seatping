import type { ReactNode } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import PortalLayout from "@/components/PortalLayout";

const ADMIN_SIDEBAR_COLLAPSED_KEY = "seatping.admin.sidebarCollapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function persistCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {}
}

type AdminLayoutProps = {
  onLogout: () => void;
  children: ReactNode;
};

const AdminLayout = ({ onLogout, children }: AdminLayoutProps) => (
  <PortalLayout
    renderSidebar={(props) => <AdminSidebar {...props} onLogout={onLogout} />}
    readCollapsed={readCollapsed}
    persistCollapsed={persistCollapsed}
    menuLabel="Admin Navigation"
    openMenuLabel="Open Menu"
    closeMenuLabel="Close Menu"
  >
    {children}
  </PortalLayout>
);

export default AdminLayout;
