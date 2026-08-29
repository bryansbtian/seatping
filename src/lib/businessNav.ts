import {
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  LayoutGrid,
  ListOrdered,
  Megaphone,
  Settings,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n";

export type BusinessNavItem = {
  to: string;
  labelKey: TKey;
  icon: LucideIcon;
};

export type BusinessNavGroup = {
  labelKey: TKey;
  items: BusinessNavItem[];
};

export const BUSINESS_NAV_GROUPS: BusinessNavGroup[] = [
  {
    labelKey: "nav.group.operations",
    items: [
      { to: "/business/overview", labelKey: "nav.overview", icon: LayoutDashboard },
      { to: "/business/queue", labelKey: "nav.queue", icon: ListOrdered },
      { to: "/business/reservations", labelKey: "nav.reservations", icon: CalendarCheck },
      { to: "/business/floor", labelKey: "nav.floor", icon: LayoutGrid },
    ],
  },
  {
    labelKey: "nav.group.customers",
    items: [
      { to: "/business/guests", labelKey: "nav.guests", icon: Users },
      { to: "/business/reviews", labelKey: "nav.reviews", icon: Star },
      { to: "/business/campaigns", labelKey: "nav.campaigns", icon: Megaphone },
    ],
  },
  {
    labelKey: "nav.group.insights",
    items: [{ to: "/business/performance", labelKey: "nav.performance", icon: BarChart3 }],
  },
  {
    labelKey: "nav.group.other",
    items: [{ to: "/business/settings", labelKey: "nav.settings", icon: Settings }],
  },
];

export function isActiveNavPath(pathname: string, to: string): boolean {
  if (pathname === to) {
    return true;
  }
  return pathname.startsWith(`${to}/`);
}

export const SIDEBAR_COLLAPSED_KEY = "seatping.business.sidebarCollapsed";

export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function persistSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {}
}
