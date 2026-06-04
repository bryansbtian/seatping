import { Link } from "react-router-dom";

// Action link style.
// - mobile: full-width (capped), centered, comfortable tap height — stacks one per row
// - sm+: natural width so the buttons sit beside each other / wrap into neat rows
// - md (tablet): slimmer h-8 px-3 text-sm so the footer stays compact on iPad
// `whitespace-nowrap` keeps each label on a single line (never mid-label).
const actionLink =
  "w-full max-w-xs text-center sm:w-auto px-3 py-2 sm:py-1.5 md:h-8 md:px-3 md:py-0 md:inline-flex md:items-center md:text-sm border border-border rounded-md text-primary whitespace-nowrap hover:bg-primary/5 transition";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-background/80 backdrop-blur-md">
      {/* Compact vertical padding on tablet so the footer doesn't look tall on
          iPad Pro / iPad Air; restored a touch on lg+. */}
      <div className="container mx-auto px-4 py-3 md:py-3 lg:py-4 text-xs sm:text-sm text-muted-foreground">
        {/*
          - mobile (< lg): stacked & centered; copyright + legal links wrap on top,
            action buttons stack one per row below
          - desktop (lg+): horizontal row with justify-between
        */}
        <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:text-left">
          {/* Legal group: copyright takes its own line; the two legal links sit
              together on the line below on mobile (joined by a "|" and kept on a
              single row), then inline beside the copyright on desktop (lg+). */}
          <div className="flex flex-col items-center gap-1 lg:flex-row lg:items-center lg:gap-x-4 lg:justify-start">
            <span>© {new Date().getFullYear()} SeatPing. All Rights Reserved.</span>
            <div className="flex items-center justify-center gap-2 whitespace-nowrap max-[360px]:text-[11px]">
              <Link to="/policy" className="whitespace-nowrap text-primary transition">
                Privacy Policy
              </Link>
              <span aria-hidden="true" className="text-muted-foreground/50">
                |
              </span>
              <Link to="/terms" className="whitespace-nowrap text-primary transition">
                Terms of Service
              </Link>
            </div>
          </div>

          {/* Action group: vertical full-width stack on mobile; wraps into rows on
              sm+; right-aligned row on desktop. */}
          <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3 lg:justify-end">
            <Link to="/business" className={actionLink}>
              SeatPing for Business
            </Link>
            <Link to="/feedback" className={actionLink}>
              Feedback
            </Link>
            <Link to="/help" className={actionLink}>
              Help
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
