import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const actionLink =
  "footer-action w-full max-w-xs text-center sm:w-auto px-3 py-2 sm:py-1.5 md:inline-flex md:h-8 md:items-center md:px-2.5 md:py-0 md:text-xs xl:px-3 xl:text-sm border border-border rounded-md text-primary whitespace-nowrap hover:bg-primary/5 transition";

const Footer = ({ fullWidth = false }: { fullWidth?: boolean }) => {
  return (
    <footer className="border-t border-border bg-background/80 backdrop-blur-md">
      <div
        className={cn(
          "footer-shell w-full px-4 py-3 text-xs text-muted-foreground md:py-3 lg:py-4 xl:text-sm",
          !fullWidth && "container mx-auto",
        )}
      >
        <div className="footer-row">
          <div className="footer-meta">
            <span className="whitespace-nowrap">
              © {new Date().getFullYear()} SeatPing. All Rights Reserved.
            </span>
            <div className="flex items-center justify-center gap-2 whitespace-nowrap max-[360px]:text-caption">
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

          <div className="footer-actions">
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
