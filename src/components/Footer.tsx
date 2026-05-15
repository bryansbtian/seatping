import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 py-4 text-sm text-muted-foreground">
        {/* Top: Copyright + Links */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} SeatPing. All rights reserved.</span>
            <Link to="/policy" className="text-primary transition">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-primary transition">
              Terms of Service
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <Link
              to="/feedback"
              className="px-3 py-1 border border-border rounded-md hover:bg-primary/5 text-primary transition"
            >
              Feedback
            </Link>
            <Link
              to="/help"
              className="px-3 py-1 border border-border rounded-md hover:bg-primary/5 text-primary transition"
            >
              Help
            </Link>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex flex-col items-center gap-3 sm:hidden text-center">
          <span>© {new Date().getFullYear()} SeatPing. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/policy" className="text-primary transition">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-primary transition">
              Terms of Service
            </Link>
          </div>
          <Link
            to="/feedback"
            className="w-1/2 text-center px-3 py-2 border border-border rounded-md hover:bg-primary/5 text-primary transition"
          >
            Feedback
          </Link>
          <Link
            to="/help"
            className="w-1/2 text-center px-3 py-2 border border-border rounded-md hover:bg-primary/5 text-primary transition"
          >
            Help
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
