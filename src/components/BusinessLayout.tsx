import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import BusinessSessionProvider from "@/components/BusinessSessionProvider";
import BusinessSidebar from "@/components/BusinessSidebar";
import Footer from "@/components/Footer";
import { useLang } from "@/lib/i18n";
import { persistSidebarCollapsed, readSidebarCollapsed } from "@/lib/businessNav";
import { cn } from "@/lib/utils";

const BusinessLayout = () => {
  const { t } = useLang();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      persistSidebarCollapsed(next);
      return next;
    });
  };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <BusinessSessionProvider>
      <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-indigo-100">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
            collapsed && "w-16",
            !collapsed && "w-64",
          )}
        >
          <BusinessSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </aside>

        <div
          className={cn(
            "flex h-screen flex-col overflow-hidden transition-[padding] duration-200",
            collapsed && "lg:pl-16",
            !collapsed && "lg:pl-64",
          )}
        >
          <header className="z-30 shrink-0 border-b border-border bg-background/80 backdrop-blur-md lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <span className="text-xl font-semibold text-slate-900">SeatPing</span>
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("nav.openMenu")}
                    className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2"
                  >
                    <HugeiconsIcon icon={Menu01Icon} className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0" hideClose>
                  <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                  <BusinessSidebar
                    onNavigate={() => setMobileNavOpen(false)}
                    headerAction={
                      <SheetClose
                        aria-label={t("nav.closeMenu")}
                        className="shrink-0 rounded-control p-1.5 text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="h-5 w-5" />
                      </SheetClose>
                    }
                  />
                </SheetContent>
              </Sheet>
            </div>
          </header>

          <main className="flex flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
            <div className="bp-shell flex-1">
              <Outlet />
            </div>
            <Footer fullWidth />
          </main>
        </div>
      </div>
    </BusinessSessionProvider>
  );
};

export default BusinessLayout;
