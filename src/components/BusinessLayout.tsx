import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import BusinessSessionProvider from "@/components/BusinessSessionProvider";
import BusinessSidebar from "@/components/BusinessSidebar";
import Footer from "@/components/Footer";
import { useLang } from "@/lib/i18n";

const BusinessLayout = () => {
  const { t } = useLang();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <BusinessSessionProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-100">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
          <BusinessSidebar />
        </aside>

        <div className="flex min-h-screen flex-col lg:pl-64">
          <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md lg:hidden">
            <div className="flex items-center gap-3 px-4 py-4">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("nav.openMenu")}
                    className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                  <BusinessSidebar onNavigate={() => setMobileNavOpen(false)} />
                </SheetContent>
              </Sheet>
              <span className="text-xl font-semibold text-slate-900">SeatPing</span>
            </div>
          </header>

          <main className="flex-1">
            <Outlet />
          </main>

          <Footer />
        </div>
      </div>
    </BusinessSessionProvider>
  );
};

export default BusinessLayout;
