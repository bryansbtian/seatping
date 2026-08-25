import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, ChevronsUpDown, LogOut, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBusinessSession, locationLabel } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import { BUSINESS_NAV_GROUPS, isActiveNavPath } from "@/lib/businessNav";
import { cn } from "@/lib/utils";

const BusinessSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
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

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="px-4 pb-6 pt-4">
        <Link
          to="/business/overview"
          onClick={onNavigate}
          className="text-xl font-semibold text-slate-900"
        >
          SeatPing
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {BUSINESS_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="mb-2">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t(group.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActiveNavPath(pathname, item.to);
                const Icon = item.icon;
                let ariaCurrent: "page" | undefined = undefined;
                if (active) {
                  ariaCurrent = "page";
                }
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      aria-current={ariaCurrent}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active && "bg-indigo-600 text-white shadow-sm",
                        !active && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <Popover open={locationMenuOpen} onOpenChange={setLocationMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("nav.switchLocation")}
              disabled={locations.length === 0}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {currentLocationName}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-64 p-1">
            <ul className="max-h-64 overflow-y-auto">
              {locations.map((location, index) => {
                const selected = location.id === currentLocation?.id;
                return (
                  <li key={location.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectLocation(location.id)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {locationLabel(location, index)}
                        </span>
                        {location.address && (
                          <span className="block truncate text-xs text-slate-500">
                            {location.address}
                          </span>
                        )}
                      </span>
                      {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>

        <div className="mt-2 px-3 py-1.5">
          <p className="truncate text-sm font-medium text-slate-900">{me?.name}</p>
          {me?.email && <p className="truncate text-xs text-slate-500">{me.email}</p>}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{t("nav.logout")}</span>
        </button>
      </div>
    </div>
  );
};

export default BusinessSidebar;
