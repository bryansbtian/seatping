import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Linkedin02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

const footerLink =
  "inline-flex min-h-8 items-center rounded-sm text-slate-600 transition-colors duration-150 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

const footerGroups = [
  {
    title: "Explore",
    links: [
      { label: "Find Restaurants", to: "/search" },
      { label: "Featured Restaurants", to: "/#featured" },
    ],
  },
  {
    title: "For Restaurants",
    links: [
      { label: "SeatPing for Business", to: "/business" },
      { label: "Business Login", to: "/business/login" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", to: "/blog" },
      { label: "Help & FAQ", to: "/help" },
      { label: "Feedback", to: "/feedback" },
    ],
  },
];

const Footer = ({ className }: { className?: string }) => {
  return (
    <footer
      className={cn(
        "shrink-0 bg-white pt-10 font-sans text-body text-slate-600 sm:pt-14 lg:pt-20",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1800px] px-6 sm:px-10 lg:px-16">
        <div aria-hidden="true" className="border-t border-slate-200" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-10 sm:grid-cols-4 sm:gap-x-8 sm:py-14 lg:grid-cols-[2.3fr_1.3fr_1.3fr_0.95fr_0.65fr] lg:gap-x-10 lg:py-16">
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <Link
              to="/"
              className="inline-block rounded-sm text-2xl font-semibold tracking-tight text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              SeatPing
            </Link>
            <p className="mt-4 max-w-sm leading-relaxed">
              Smarter queues. Better guest relationships.
            </p>
          </div>

          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="mb-4 text-body font-semibold text-slate-900">{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={footerLink}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Connect">
            <h2 className="mb-4 text-body font-semibold text-slate-900">Connect</h2>
            <a
              href="https://www.linkedin.com/company/seatpinghq"
              aria-label="SeatPing on LinkedIn"
              target="_blank"
              rel="noopener noreferrer"
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-slate-600 transition-colors duration-150 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-current">
                <HugeiconsIcon
                  icon={Linkedin02Icon}
                  className="h-5 w-5 fill-white text-white"
                  strokeWidth={0}
                  aria-hidden="true"
                />
              </span>
            </a>
          </nav>
        </div>

        <div className="flex flex-col items-center border-t border-slate-200 py-6 sm:flex-row sm:justify-between sm:gap-6 sm:py-8">
          <p className="flex min-h-8 items-center sm:block sm:min-h-0">
            © {new Date().getFullYear()} SeatPing.
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center justify-center gap-x-4 sm:justify-end sm:gap-x-6"
          >
            <Link to="/policy" className={footerLink}>
              Privacy Policy
            </Link>
            <span aria-hidden="true">|</span>
            <Link to="/terms" className={footerLink}>
              Terms of Service
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
