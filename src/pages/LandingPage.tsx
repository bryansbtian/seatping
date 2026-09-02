import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { HeroDashboardPreview } from "@/components/landing/HeroDashboardPreview";
import AnimatedBentoFeatureGrid from "@/components/landing/AnimatedBentoFeatureGrid";
import { WhySeatPingSection } from "@/components/landing/WhyChooseSeatPing";
import { ProductWorkflowSection } from "@/components/landing/ProductWorkflow";
import { SECTION_PADDING, DISPLAY_HEADING, SECTION_SUBTITLE } from "@/components/landing/section";

const LandingPage = () => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-in");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    const els = document.querySelectorAll(
      ".scroll-animate, .scroll-animate-left, .scroll-animate-right, .scroll-animate-scale",
    );
    els.forEach((el) => observer.observe(el));
    return () => els.forEach((el) => observer.unobserve(el));
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SEO
        title="SeatPing for Business | Floor Management, Queues, and Reservations"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
        canonical="/business"
      />
      <Header variant="business" />

      <section className="relative overflow-hidden px-4 pt-24 pb-10 md:pt-32 md:pb-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-1/3 hidden h-[42rem] w-[42rem] -translate-y-1/2 rounded-full border border-slate-200/60 md:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/3 hidden h-[26rem] w-[26rem] -translate-y-1/2 rounded-full border border-slate-200/50 md:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-40 h-[22rem] w-[34rem] max-w-[90%] -translate-x-1/2 rounded-full bg-indigo-100/35 blur-3xl"
        />

        <div className="relative mx-auto w-full max-w-7xl px-8 lg:px-4">
          <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
            <h1 className={DISPLAY_HEADING}>
              Run Your Front of House <span className="sm:whitespace-nowrap">From One Place</span>
            </h1>
            <p className={cn("mx-auto mt-4 max-w-xl", SECTION_SUBTITLE)}>
              Match walk-ins and bookings to the right tables, and keep your dining room moving from
              one live view.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                asChild
                className="h-11 w-full rounded-xl px-8 text-sm shadow-sm sm:h-12 sm:w-auto"
              >
                <Link to="/sales">
                  <span className="font-medium">Book a Demo</span>
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-11 w-full rounded-xl px-8 text-sm shadow-sm sm:h-12 sm:w-auto"
              >
                <Link to="/business/signup">
                  <span className="font-medium">Get Started</span>
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto mt-8 max-w-5xl animate-fade-in-up animation-delay-200 sm:mt-10 md:mt-12">
            <div className="max-h-[300px] overflow-hidden sm:max-h-[420px] md:max-h-[500px]">
              <HeroDashboardPreview />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white via-white/85 to-transparent sm:h-28"
            />
          </div>
        </div>
      </section>

      <AnimatedBentoFeatureGrid />

      <ProductWorkflowSection />

      <WhySeatPingSection />

      <section
        className={cn(
          "relative overflow-hidden border-y border-slate-200 bg-slate-50",
          SECTION_PADDING,
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50/60 via-slate-50 to-slate-50"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-indigo-100/35 blur-3xl"
        />

        <div className="container mx-auto max-w-4xl text-center scroll-animate">
          <h2 className={DISPLAY_HEADING} aria-label="Turn Every Arrival Into Smooth Service">
            <span aria-hidden className="block">
              Turn Every Arrival Into
            </span>
            <span aria-hidden className="mt-1.5 block">
              <span className="relative inline-block whitespace-nowrap text-slate-400">
                Front-Door Chaos
                <svg
                  aria-hidden="true"
                  viewBox="0 0 120 16"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-x-0 top-[62%] h-[0.55em] w-full -translate-y-1/2 text-indigo-500"
                >
                  <path
                    d="M3 9 C 28 3, 46 14, 66 7 S 100 3, 117 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </span>
            <span className="mt-1.5 block font-hand text-hand-accent font-bold leading-none text-indigo-600">
              Smooth Service
            </span>
          </h2>

          <p className={cn("mx-auto mt-4 max-w-2xl", SECTION_SUBTITLE)}>
            Set up your floor plan, queues, reservations, notifications, and location settings with
            no extra hardware and no complicated onboarding.
          </p>

          <div className="mt-6 flex justify-center sm:mt-7">
            <Button size="lg" asChild className="rounded-xl px-8 shadow-sm">
              <Link to="/sales">
                <span className="font-medium">Book a Demo</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default LandingPage;
