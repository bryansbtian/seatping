import type { IconSvgElement } from "@hugeicons/react";
import {
  ChartAnalysisIcon,
  CalendarCheck01Icon,
  DashboardSquare01Icon,
  LayoutGridIcon,
  LeftToRightListNumberIcon,
  Megaphone01Icon,
  Settings01Icon,
  StarIcon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";
import type { TKey } from "@/lib/i18n";

export type BusinessNavItem = {
  to: string;
  labelKey: TKey;
  icon: IconSvgElement;
};

export type BusinessNavGroup = {
  labelKey: TKey;
  items: BusinessNavItem[];
};

export const BUSINESS_NAV_GROUPS: BusinessNavGroup[] = [
  {
    labelKey: "nav.group.operations",
    items: [
      { to: "/business/overview", labelKey: "nav.overview", icon: DashboardSquare01Icon },
      { to: "/business/queue", labelKey: "nav.queue", icon: LeftToRightListNumberIcon },
      { to: "/business/reservations", labelKey: "nav.reservations", icon: CalendarCheck01Icon },
      { to: "/business/floor", labelKey: "nav.floor", icon: LayoutGridIcon },
    ],
  },
  {
    labelKey: "nav.group.customers",
    items: [
      { to: "/business/guests", labelKey: "nav.guests", icon: UsersRoundIcon },
      { to: "/business/reviews", labelKey: "nav.reviews", icon: StarIcon },
      { to: "/business/campaigns", labelKey: "nav.campaigns", icon: Megaphone01Icon },
    ],
  },
  {
    labelKey: "nav.group.insights",
    items: [{ to: "/business/performance", labelKey: "nav.performance", icon: ChartAnalysisIcon }],
  },
];

export const BUSINESS_SETTINGS_ITEM: BusinessNavItem = {
  to: "/business/settings",
  labelKey: "nav.settings",
  icon: Settings01Icon,
};

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
