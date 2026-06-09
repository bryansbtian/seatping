import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const BusinessHeader = () => {
  const [open, setOpen] = useState(false);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    // Business-only logout: clears the business cookie and leaves any customer
    // (or admin) session in the same browser untouched.
    fetch("/auth/business/logout", {
      method: "POST",
      credentials: "include",
    }).then(() => (window.location.href = "/"));
  };

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between relative">
        <Link
          to="/business/dashboard"
          className="text-2xl font-semibold text-slate-900"
        >
          SeatPing
        </Link>

        {/* Desktop / Tablet actions (sm and up) */}
        <div className="hidden sm:flex items-center gap-8">
          <Link to="/business/dashboard" className="text-slate-900 hover:text-slate-600 transition-colors font-medium">
            Dashboard
          </Link>
          <Link to="/business/guests" className="text-slate-900 hover:text-slate-600 transition-colors font-medium">
            Guests
          </Link>
          <Link to="/business/settings" className="text-slate-900 hover:text-slate-600 transition-colors font-medium">
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="text-slate-900 hover:text-slate-600 transition-colors font-medium cursor-pointer"
          >
            Log Out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
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
            <Link
              to="/business/dashboard"
              className="block px-4 py-2 text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium"
              onClick={() => setOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              to="/business/guests"
              className="block px-4 py-2 text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium"
              onClick={() => setOpen(false)}
            >
              Guests
            </Link>
            <Link
              to="/business/settings"
              className="block px-4 py-2 text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium cursor-pointer"
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default BusinessHeader;
