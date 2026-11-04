import { usePublicLanguage } from "@/lib/publicLanguage";
import { Link } from "@/lib/publicNavigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Linkedin02Icon } from "@hugeicons/core-free-icons";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { localizedPublicPath, type PublicLanguage } from "@shared/publicLanguage";
import { rememberPublicLanguage } from "@/lib/publicLanguagePreference";

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

const Footer = () => {
  const { t: tp, lang } = usePublicLanguage();
  const { pathname, search, hash } = useLocation();
  const languages: { value: PublicLanguage; label: string }[] = [
    { value: "en", label: "English" },
    { value: "id", label: "Bahasa Indonesia" },
  ];

  return (
    <footer className="shrink-0 bg-white pt-12 font-sans text-body text-slate-600 sm:pt-14 md:pt-16 lg:pt-[4.5rem]">
      <div className="mx-auto w-full max-w-[1800px] px-6 sm:px-10 lg:px-16">
        <div aria-hidden="true" className="border-t border-slate-200" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-10 sm:grid-cols-4 sm:gap-x-8 sm:py-14 lg:grid-cols-[2.3fr_1.3fr_1.3fr_0.95fr_0.65fr] lg:gap-x-10 lg:py-16">
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <Link
              to="/"
              state={{ scrollToTop: true }}
              className="inline-block rounded-sm text-2xl font-semibold tracking-tight text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              SeatPing
            </Link>
            <p lang="en" className="mt-4 max-w-sm leading-relaxed">
              Smarter queues. Better guest relationships.
            </p>
          </div>

          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={tp(group.title)}>
              <h2 className="mb-4 text-body font-semibold text-slate-900">{tp(group.title)}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} state={{ scrollToTop: true }} className={footerLink}>
                      {tp(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label={tp("Connect")}>
            <h2 className="mb-4 text-body font-semibold text-slate-900">{tp("Connect")}</h2>
            <a
              href="https://www.linkedin.com/company/seatpinghq"
              aria-label={tp("SeatPing on LinkedIn")}
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

        <div className="grid grid-cols-1 items-center gap-3 border-t border-slate-200 py-6 text-center sm:py-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-6 lg:text-left">
          <p className="flex min-h-8 items-center justify-center lg:justify-start">
            © {new Date().getFullYear()} SeatPing.
          </p>
          <nav
            aria-label={tp("Legal")}
            className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6"
          >
            <Link to="/policy" state={{ scrollToTop: true }} className={footerLink}>
              {tp("Privacy Policy")}
            </Link>
            <span aria-hidden="true">|</span>
            <Link to="/terms" state={{ scrollToTop: true }} className={footerLink}>
              {tp("Terms of Service")}
            </Link>
          </nav>
          <nav
            aria-label={tp("Language")}
            className="flex flex-wrap items-center justify-center gap-x-1 lg:justify-end"
          >
            {languages.map((language, index) => {
              let destination = localizedPublicPath(
                `${pathname}${search}${hash}`,
                language.value,
                true,
              );
              if (
                language.value === "id" &&
                (pathname === "/blog" || pathname.startsWith("/blog/"))
              ) {
                destination = "/id";
              }
              return (
                <span key={language.value} className="inline-flex items-center gap-x-1">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "px-2 font-normal text-slate-600 hover:bg-transparent hover:text-slate-900",
                      lang === language.value && "font-medium text-slate-900",
                    )}
                  >
                    <RouterLink
                      to={destination}
                      lang={language.value}
                      hrefLang={language.value}
                      aria-current={lang === language.value}
                      onClick={() => rememberPublicLanguage(language.value)}
                    >
                      {language.label}
                    </RouterLink>
                  </Button>
                </span>
              );
            })}
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
