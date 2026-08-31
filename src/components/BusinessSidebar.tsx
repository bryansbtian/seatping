import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  Location01Icon,
  LogoutSquare01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBusinessSession, locationLabel } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import { BUSINESS_NAV_GROUPS, BUSINESS_SETTINGS_ITEM, isActiveNavPath } from "@/lib/businessNav";
import { cn } from "@/lib/utils";

type BusinessSidebarProps = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  headerAction?: ReactNode;
};

const BusinessSidebar = ({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  headerAction,
}: BusinessSidebarProps) => {
  const { t } = useLang();
  const { pathname } = useLocation();
  const { me, locations, currentLocation, currentLocationIndex, selectLocation } =
    useBusinessSession();
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);

  const handleLogout = () => {
    fetch("/auth/business/logout", {
      method: "POST",
      credentials: "include",
    }).then(() => (window.location.href = "/"));
  };

  const handleSelectLocation = (locationId: string) => {
    selectLocation(locationId);
    setLocationMenuOpen(false);
  };

  let currentLocationName: string;
  if (currentLocation) {
    currentLocationName = locationLabel(currentLocation, currentLocationIndex);
  } else {
    currentLocationName = t("nav.noLocations");
  }

  let toggleLabel = t("nav.collapse");
  let ToggleIcon = ArrowLeftDoubleIcon;
  if (collapsed) {
    toggleLabel = t("nav.expand");
    ToggleIcon = ArrowRightDoubleIcon;
  }

  let headerClass = "flex items-center justify-between gap-2 px-3 pb-5 pt-4";
  if (collapsed) {
    headerClass = "flex flex-col-reverse items-center gap-2 px-2 pb-5 pt-4";
  }

  const settingsActive = isActiveNavPath(pathname, BUSINESS_SETTINGS_ITEM.to);
  const settingsLabel = t(BUSINESS_SETTINGS_ITEM.labelKey);
  const SettingsIcon = BUSINESS_SETTINGS_ITEM.icon;

  let settingsAriaCurrent: "page" | undefined = undefined;
  if (settingsActive) {
    settingsAriaCurrent = "page";
  }

  let settingsToneClass =
    "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground";
  if (settingsActive) {
    settingsToneClass = "bg-sidebar-accent text-sidebar-accent-foreground";
  }

  let locationTriggerClass =
    "flex min-w-0 items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-base font-semibold text-sidebar-accent-foreground transition-colors duration-150 hover:bg-sidebar-hover disabled:cursor-not-allowed disabled:opacity-60";
  if (collapsed) {
    locationTriggerClass =
      "flex items-center justify-center rounded-control p-1.5 text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-hover disabled:cursor-not-allowed disabled:opacity-60";
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={headerClass}>
        <Popover open={locationMenuOpen} onOpenChange={setLocationMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("nav.switchLocation")}
              title={currentLocationName}
              disabled={locations.length === 0}
              className={locationTriggerClass}
            >
              {collapsed && (
                <HugeiconsIcon
                  icon={Location01Icon}
                  className="h-5 w-5 shrink-0 text-sidebar-muted"
                />
              )}
              {!collapsed && (
                <>
                  <span className="min-w-0 truncate">{currentLocationName}</span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className="h-4 w-4 shrink-0 text-sidebar-muted"
                  />
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-64 p-1">
            <ul className="max-h-64 overflow-y-auto">
              {locations.map((location, index) => {
                const selected = location.id === currentLocation?.id;
                return (
                  <li key={location.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectLocation(location.id)}
                      className="flex min-h-row-lg w-full items-start gap-2 rounded-control px-2 py-2 text-left text-label text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {locationLabel(location, index)}
                        </span>
                        {location.address && (
                          <span className="block truncate text-caption text-sidebar-muted">
                            {location.address}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-accent-foreground"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
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

      <nav className={cn("flex-1 overflow-y-auto px-3 pb-2", collapsed && "space-y-0.5")}>
        {BUSINESS_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className={cn("mb-2", collapsed && "mb-0")}>
            <p
              className={cn(
                "business-nav-group-label px-2 pb-1 font-medium uppercase tracking-wide text-sidebar-muted",
                collapsed && "sr-only",
              )}
            >
              {t(group.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActiveNavPath(pathname, item.to);
                const Icon = item.icon;
                const label = t(item.labelKey);

                let ariaCurrent: "page" | undefined = undefined;
                if (active) {
                  ariaCurrent = "page";
                }

                let itemTitle: string | undefined = undefined;
                if (collapsed) {
                  itemTitle = label;
                }

                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      aria-current={ariaCurrent}
                      title={itemTitle}
                      className={cn(
                        "flex h-row items-center gap-3 rounded-control px-3 text-label font-medium transition-colors duration-150",
                        collapsed && "justify-center px-2",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        !active &&
                          "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={Icon} className="h-4 w-4 shrink-0" />
                      <span className={cn(collapsed && "sr-only")}>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-label font-medium text-sidebar-accent-foreground">
                {me?.name}
              </p>
              {me?.email && <p className="truncate text-caption text-sidebar-muted">{me.email}</p>}
            </div>
            <Link
              to={BUSINESS_SETTINGS_ITEM.to}
              onClick={onNavigate}
              aria-current={settingsAriaCurrent}
              aria-label={settingsLabel}
              title={settingsLabel}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors duration-150",
                settingsToneClass,
              )}
            >
              <HugeiconsIcon icon={SettingsIcon} className="h-4 w-4" />
            </Link>
          </div>
        )}

        {collapsed && (
          <Link
            to={BUSINESS_SETTINGS_ITEM.to}
            onClick={onNavigate}
            aria-current={settingsAriaCurrent}
            title={settingsLabel}
            className={cn(
              "mt-2 flex h-row w-full items-center justify-center rounded-control transition-colors duration-150",
              settingsToneClass,
            )}
          >
            <HugeiconsIcon icon={SettingsIcon} className="h-4 w-4 shrink-0" />
            <span className="sr-only">{settingsLabel}</span>
          </Link>
        )}

        <button
          type="button"
          onClick={handleLogout}
          title={t("nav.logout")}
          className={cn(
            "flex h-row w-full items-center gap-3 rounded-control px-3 text-label font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
            collapsed && "mt-2 justify-center px-2",
          )}
        >
          <HugeiconsIcon icon={LogoutSquare01Icon} className="h-4 w-4 shrink-0" />
          <span className={cn(collapsed && "sr-only")}>{t("nav.logout")}</span>
        </button>
      </div>
    </div>
  );
};

export default BusinessSidebar;
