import { Link, useLocation } from "react-router-dom";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  CustomerService01Icon,
  LogoutSquare01Icon,
  Megaphone01Icon,
  StarIcon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";
import type { PortalSidebarProps } from "@/components/PortalLayout";
import { isActiveNavPath } from "@/lib/businessNav";
import { cn } from "@/lib/utils";

type AdminSidebarProps = PortalSidebarProps & {
  onLogout: () => void;
};

const NAV_ITEMS: { to: string; label: string; icon: IconSvgElement }[] = [
  { to: "/admin/dashboard", label: "Ticket Management", icon: CustomerService01Icon },
  { to: "/admin/customers", label: "Customer Management", icon: UsersRoundIcon },
  { to: "/admin/featured", label: "Featured Restaurants", icon: StarIcon },
  { to: "/admin/templates", label: "Campaign Templates", icon: Megaphone01Icon },
];

const AdminSidebar = ({
  onLogout,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  headerAction,
}: AdminSidebarProps) => {
  const { pathname } = useLocation();
  const currentPath = pathname.toLowerCase().replace(/\/$/, "");

  let toggleLabel = "Collapse Sidebar";
  let ToggleIcon = ArrowLeftDoubleIcon;
  if (collapsed) {
    toggleLabel = "Expand Sidebar";
    ToggleIcon = ArrowRightDoubleIcon;
  }

  let headerClass = "flex items-center justify-between gap-2 px-3 pb-5 pt-4";
  if (collapsed) {
    headerClass = "flex items-center justify-center px-1.5 py-3";
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={headerClass}>
        {!collapsed && (
          <Link
            to="/admin/dashboard"
            onClick={onNavigate}
            aria-label="SeatPing Admin Portal"
            className="min-w-0 rounded-control px-2 py-1.5"
          >
            <span className="block text-xl font-semibold text-sidebar-accent-foreground">
              SeatPing
            </span>
            <span className="block text-caption text-sidebar-muted">Admin Portal</span>
          </Link>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={onToggleCollapse}
            className="hidden rounded-control p-1.5 text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-accent-foreground lg:inline-flex"
          >
            <HugeiconsIcon icon={ToggleIcon} className="h-5 w-5" />
          </button>
        )}
        {headerAction}
      </div>

      <nav
        aria-label="Admin Navigation"
        className={cn("flex-1 overflow-y-auto px-3 pb-2", collapsed && "px-1.5")}
      >
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            let active = isActiveNavPath(currentPath, item.to);
            if (currentPath === "/admin" && item.to === "/admin/dashboard") {
              active = true;
            }

            let ariaCurrent: "page" | undefined = undefined;
            if (active) {
              ariaCurrent = "page";
            }

            let itemTitle: string | undefined = undefined;
            if (collapsed) {
              itemTitle = item.label;
            }

            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={ariaCurrent}
                  title={itemTitle}
                  className={cn(
                    "flex h-row items-center gap-3 rounded-control px-3 text-label font-normal transition-colors duration-150",
                    collapsed && "control-md justify-center px-0",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    !active &&
                      "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
                  )}
                >
                  <HugeiconsIcon icon={item.icon} className="h-4 w-4 shrink-0" />
                  <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("border-t border-sidebar-border px-3 py-3", collapsed && "px-1.5")}>
        <button
          type="button"
          onClick={onLogout}
          title="Log Out"
          className={cn(
            "flex h-row w-full items-center gap-3 rounded-control px-3 text-label font-normal text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
            collapsed && "control-md justify-center px-0",
          )}
        >
          <HugeiconsIcon icon={LogoutSquare01Icon} className="h-4 w-4 shrink-0" />
          <span className={cn(collapsed && "sr-only")}>Log Out</span>
        </button>
      </div>
    </div>
  );
};

export default AdminSidebar;
