import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import DottedSeatingIllustration from "@/components/DottedSeatingIllustration";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main
      data-page-background="not-found"
      className="flex h-dvh w-full flex-col justify-center overflow-hidden sm:justify-between"
    >
      <div className="flex w-full items-center justify-center px-5 pb-10 pt-10 sm:min-h-0 sm:flex-1 sm:px-10 sm:pb-10 sm:pt-16 lg:items-end lg:px-24 lg:pt-20 xl:px-32">
        <DottedSeatingIllustration variant="compact" className="max-h-[26dvh] w-11/12 sm:hidden" />
        <DottedSeatingIllustration className="mx-auto hidden max-h-full w-11/12 sm:block lg:w-4/5" />
      </div>

      <div className="w-full shrink-0 px-5 pb-10 sm:px-10 sm:pb-14 lg:px-24 lg:pb-16 xl:px-32 xl:pb-20">
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold leading-[1.15] tracking-tight text-slate-900 sm:text-3xl lg:text-4xl xl:text-[2.5rem]">
            We couldn’t find <span className="sm:block">the page you’re looking for.</span>
          </h1>
          <p className="mt-3 text-body leading-relaxed text-slate-600 sm:mt-4 sm:text-base lg:text-lg xl:text-xl">
            Looks like this seat isn’t on the list.{" "}
            <span className="sm:block">Try heading back or exploring something new.</span>
          </p>
          <Link
            to="/"
            className="group mt-6 inline-flex items-center gap-2 border-b border-slate-900/20 pb-1 text-label font-medium text-slate-900 transition-colors hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-4 focus-visible:ring-offset-[#FBF8EF] sm:mt-7 sm:text-body"
          >
            <HugeiconsIcon
              icon={ArrowLeft02Icon}
              className="h-3.5 w-3.5 transition-transform motion-safe:group-hover:-translate-x-0.5"
            />
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
