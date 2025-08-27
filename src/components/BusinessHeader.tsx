import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const BusinessHeader = () => {
  const [open, setOpen] = useState(false);

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
          className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent"
        >
          SeatPing
        </Link>

        {/* Desktop / Tablet actions (sm and up) */}
        <div className="hidden sm:flex items-center gap-3">
          <Button variant="default" asChild>
            <Link to="/business/dashboard">Dashboard</Link>
          </Button>
          <Button variant="success" asChild>
            <Link to="/business/settings">Settings</Link>
          </Button>
          <Button
            variant="outline"
            asChild
            onClick={(e) => {
              e.preventDefault();
              fetch("/auth/logout", {
                method: "POST",
                credentials: "include",
              }).then(() => (window.location.href = "/"));
            }}
          >
            <Link to="/auth/logout">Logout</Link>
          </Button>
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
            <Button
              variant="default"
              className="w-full justify-start"
              asChild
              onClick={() => setOpen(false)}
            >
              <Link to="/business/dashboard">Dashboard</Link>
            </Button>
            <Button
              variant="success"
              className="w-full justify-start"
              asChild
              onClick={() => setOpen(false)}
            >
              <Link to="/business/settings">Settings</Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              asChild
              onClick={(e) => {
                e.preventDefault();
                fetch("/auth/logout", {
                  method: "POST",
                  credentials: "include",
                }).then(() => (window.location.href = "/"));
              }}
            >
              <Link to="/auth/logout">Logout</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};

export default BusinessHeader;
