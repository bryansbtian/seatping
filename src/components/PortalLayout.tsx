import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PortalSidebarProps = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  headerAction?: ReactNode;
};

type PortalLayoutProps = {
  children: ReactNode;
  renderSidebar: (props: PortalSidebarProps) => ReactNode;
  readCollapsed: () => boolean;
  persistCollapsed: (collapsed: boolean) => void;
  menuLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
};

const PortalLayout = ({
  children,
  renderSidebar,
  readCollapsed,
  persistCollapsed,
  menuLabel,
  openMenuLabel,
  closeMenuLabel,
}: PortalLayoutProps) => {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      persistCollapsed(next);
      return next;
    });
  };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div data-page-background="business" className="h-screen overflow-hidden">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
          collapsed && "w-12",
          !collapsed && "w-64",
        )}
      >
        {renderSidebar({ collapsed, onToggleCollapse: toggleCollapsed })}
      </aside>

      <div
        className={cn(
          "flex h-screen flex-col overflow-hidden transition-[padding] duration-200",
          collapsed && "lg:pl-12",
          !collapsed && "lg:pl-64",
        )}
      >
        <header className="z-30 shrink-0 border-b border-border bg-background/80 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <span className="text-xl font-semibold text-slate-900">SeatPing</span>
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={openMenuLabel}
                  className="control-lg control-icon"
                >
                  <HugeiconsIcon icon={Menu01Icon} className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0" aria-describedby={undefined} hideClose>
                <SheetTitle className="sr-only">{menuLabel}</SheetTitle>
                {renderSidebar({
                  onNavigate: () => setMobileNavOpen(false),
                  headerAction: (
                    <SheetClose
                      aria-label={closeMenuLabel}
                      className="shrink-0 rounded-control p-1.5 text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="h-5 w-5" />
                    </SheetClose>
                  ),
                })}
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-y-auto overscroll-y-none [scrollbar-gutter:stable]">
          <div className="bp-shell flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default PortalLayout;
