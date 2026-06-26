import { Link } from "react-router-dom";

const actionLink =
  "w-full max-w-xs text-center sm:w-auto px-3 py-2 sm:py-1.5 md:h-8 md:px-3 md:py-0 md:inline-flex md:items-center md:text-sm border border-border rounded-md text-primary whitespace-nowrap hover:bg-primary/5 transition";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-background/80 backdrop-blur-md">
      {}
      <div className="container mx-auto px-4 py-3 md:py-3 lg:py-4 text-xs sm:text-sm text-muted-foreground">
        {}
        <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:text-left">
          {}
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

          {}
          <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3 lg:justify-end">
            <Link to="/business" className={actionLink}>
              SeatPing for Business
            </Link>
            <Link to="/feedback" className={actionLink}>
              Feedback
            </Link>
            <Link to="/help" className={actionLink}>
              Help &amp; FAQ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
