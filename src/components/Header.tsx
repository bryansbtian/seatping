import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type HeaderVariant = "customer" | "business";

// Customer and business sessions live in separate cookies and can both be
// active at once. The header only cares about the customer session.
type Session = {
  customer: { name?: string | null } | null;
  business: { name?: string | null } | null;
};

/**
 * Shared top navigation.
 *
 * - variant="customer" (default): used on the customer-facing homepage `/`, the
 *   join-queue flow, and customer login/signup. The header is context-aware:
 *     • a logged-in CUSTOMER sees just "SeatPing" + their profile (no auth CTAs)
 *     • everyone else (logged out OR logged in as a business) sees Login / Sign Up
 *   A business session is deliberately ignored here, so being logged in as a
 *   business never makes the customer homepage look logged in.
 *
 * - variant="business": used on `/business` and business login/signup. Shows the
 *   business marketing nav with Login (-> /business/login) and Get Started
 *   (-> /business/signup).
 *
 * `showSearch` adds a compact restaurant search input between the logo and
 * the right-side nav (used on the Restaurant Details page). Hidden on mobile
 * to keep the bar tidy; mobile users can search from the homepage.
 */
const Header = ({
  variant = "customer",
  showSearch = false,
}: {
  variant?: HeaderVariant;
  showSearch?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Separate input for the mobile hamburger search (Restaurant Details only).
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => {
      if (window.innerWidth >= 640) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Only the customer variant cares about session state (to show the profile).
  useEffect(() => {
    if (variant !== "customer") return;
    let active = true;
    fetch("/auth/session", { credentials: "include" })
      .then((r) =>
        r.ok ? r.json() : { customer: null, business: null },
      )
      .then((data: Session) => {
        if (active) setSession(data);
      })
      .catch(
        () => active && setSession({ customer: null, business: null }),
      );
    return () => {
      active = false;
    };
  }, [variant]);

  // The SeatPing wordmark returns to the relevant home: the business marketing
  // page on the business header, the customer homepage everywhere else.
  const logoTo = variant === "business" ? "/business" : "/";
  // A business session does NOT count as a logged-in customer on `/`.
  const isCustomerLoggedIn = variant === "customer" && !!session?.customer;

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    fetch("/auth/logout", { method: "POST", credentials: "include" }).then(
      () => (window.location.href = "/"),
    );
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    navigate(q ? `/search?query=${encodeURIComponent(q)}` : "/search");
  };

  // Mobile hamburger search (Restaurant Details only). Path-style /search/:query
  // per the spec; closes the dropdown after navigating.
  const handleMobileSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = mobileSearchQuery.trim();
    if (!q) return; // Do nothing on empty input.
    navigate(`/search/${encodeURIComponent(q)}`);
    setMobileSearchQuery("");
    setOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative">
        <Link to={logoTo} className="text-2xl font-semibold text-slate-900">
          SeatPing
        </Link>

        {/* Inline search (Restaurant Details pages). Hidden on mobile to keep
            the bar compact; the customer homepage owns the rich mobile search. */}
        {showSearch && (
          <form
            onSubmit={submitSearch}
            role="search"
            className="mx-4 hidden flex-1 max-w-xl sm:flex"
          >
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Restaurants, cuisines, or areas"
                aria-label="Search restaurants"
                className="h-10 rounded-full border-slate-200 pl-9 pr-24"
              />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1 top-1 h-8 rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
              >
                Search
              </Button>
            </div>
          </form>
        )}

        {/* ===================== CUSTOMER, LOGGED IN ===================== */}
        {isCustomerLoggedIn ? (
          <CustomerProfile
            name={session?.customer?.name}
            onLogout={handleLogout}
          />
        ) : variant === "business" ? (
          /* ===================== BUSINESS MARKETING ===================== */
          <>
            <div className="hidden sm:flex items-center gap-8">
              <Link
                to="/business/login"
                className="text-slate-900 hover:text-slate-600 transition-colors font-medium"
              >
                Log In
              </Link>
              <Link
                to="/business/signup"
                className="text-slate-900 hover:text-slate-600 transition-colors font-medium"
              >
                Get Started
              </Link>
            </div>
            <MobileMenu open={open} setOpen={setOpen}>
              <MobileLink to="/business/login" onClick={() => setOpen(false)}>
                Log In
              </MobileLink>
              <MobileLink to="/business/signup" onClick={() => setOpen(false)}>
                Get Started
              </MobileLink>
            </MobileMenu>
          </>
        ) : (
          /* ===================== CUSTOMER, LOGGED OUT ===================== */
          <>
            <div className="hidden sm:flex items-center gap-8">
              <Link
                to="/login"
                className="text-slate-900 hover:text-slate-600 transition-colors font-medium"
              >
                Log In
              </Link>
              <Link
                to="/signup"
                className="text-slate-900 hover:text-slate-600 transition-colors font-medium"
              >
                Sign Up
              </Link>
            </div>
            <MobileMenu open={open} setOpen={setOpen}>
              {/* Restaurant Details pages: search at the top of the dropdown. */}
              {showSearch && (
                <form
                  onSubmit={handleMobileSearch}
                  role="search"
                  className="px-1 pb-2"
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={mobileSearchQuery}
                      onChange={(e) => setMobileSearchQuery(e.target.value)}
                      placeholder="Restaurants, cuisines, or areas"
                      aria-label="Search restaurants"
                      className="h-10 w-full min-w-0 rounded-xl border-slate-200 pl-9"
                    />
                  </div>
                </form>
              )}
              <MobileLink to="/login" onClick={() => setOpen(false)}>
                Log In
              </MobileLink>
              <MobileLink to="/signup" onClick={() => setOpen(false)}>
                Sign Up
              </MobileLink>
            </MobileMenu>
          </>
        )}
      </div>
    </header>
  );
};

/**
 * Logged-in customer profile control. For now this is a placeholder menu that
 * shows the customer's name and offers logout.
 *
 * TODO(customer-profile): Link this profile menu to the customer profile page
 * when customer accounts are expanded.
 */
function CustomerProfile({
  name,
  onLogout,
}: {
  name?: string | null;
  onLogout: (e: React.MouseEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = name?.trim() || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    const onDoc = () => setMenuOpen(false);
    if (menuOpen) {
      window.addEventListener("click", onDoc);
      return () => window.removeEventListener("click", onDoc);
    }
  }, [menuOpen]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Open profile menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="flex items-center gap-2 rounded-full bg-background transition-colors hover:bg-slate-50 sm:border sm:border-border sm:px-2 sm:py-1.5 sm:pr-3"
      >
        {/* Mobile (< sm): compact avatar-only button (~36px tap target), no name.
            sm+: full pill with avatar + truncated name. */}
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white sm:h-8 sm:w-8">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-900 sm:inline-block">
          {displayName}
        </span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background shadow-xl p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block px-3 py-2 text-xs text-muted-foreground">
            Signed in as {displayName}
          </span>
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="block w-full px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
          >
            View Profile
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="block w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

function MobileMenu({
  open,
  setOpen,
  children,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="sm:hidden inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-sm"
      >
        <span className="sr-only">Open menu</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="sm:hidden absolute top-full left-4 right-4 mt-3 rounded-2xl border border-border bg-background shadow-xl p-3 space-y-2"
        >
          {children}
        </div>
      )}
    </>
  );
}

function MobileLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="block px-4 py-2 text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium"
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

export default Header;
