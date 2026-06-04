import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Star, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { cn } from "@/lib/utils";
import { HeroDashboardScreen } from "@/components/landing/ProductPreviews";

// Card width inside the carousel: ~1 card on mobile, ~2 on tablet, exactly 3
// on desktop (gap-5 = 1.25rem, so two gaps = 2.5rem across the 3 visible cards).
const TESTIMONIAL_W =
  "min-w-[82%] snap-start sm:min-w-[46%] lg:min-w-[calc((100%-2.5rem)/3)]";

const TESTIMONIALS = [
  {
    initials: "MS",
    name: "Maria Santos",
    role: "Restaurant Owner",
    quote:
      "SeatPing helped us manage walk-ins without crowding the entrance. The team can see who's waiting, who's admitted, and what needs attention without shouting across the floor.",
    date: "Mar 12, 2026",
  },
  {
    initials: "DL",
    name: "Daniel Lee",
    role: "Café Manager",
    quote:
      "Reservations and queue updates are much easier to handle from one dashboard. It feels simple enough for staff to use during a busy shift.",
    date: "Feb 4, 2026",
  },
  {
    initials: "RL",
    name: "Rachel Lim",
    role: "Front Desk Manager",
    quote:
      "The QR queue flow made check-ins smoother and reduced the number of people waiting around the counter.",
    date: "Apr 27, 2026",
  },
  {
    initials: "PN",
    name: "Priya Nair",
    role: "Salon Owner",
    quote:
      "Clients book a slot, get a text when we're ready, and stop crowding the waiting area. Our front desk finally feels calm.",
    date: "Jan 19, 2026",
  },
  {
    initials: "MC",
    name: "Marcus Chen",
    role: "Operations Lead",
    quote:
      "Running a few locations from one place is the part I didn't expect to love. Each spot keeps its own queue and hours without extra setup.",
    date: "May 8, 2026",
  },
  {
    initials: "SA",
    name: "Sofia Almeida",
    role: "Bistro Manager",
    quote:
      "We cut no-shows by reminding guests automatically. Reservations and walk-ins finally live in the same view.",
    date: "Jun 2, 2026",
  },
];

/** A plain quote testimonial card. */
function TestimonialCard({
  initials,
  name,
  role,
  quote,
  date,
}: {
  initials: string;
  name: string;
  role: string;
  quote: string;
  date: string;
}) {
  return (
    <div
      data-card
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm",
        TESTIMONIAL_W,
      )}
    >
      {/* Soft cloudy SeatPing-brand mist: a pale blue-gray haze in the top-left
          and a subtle navy/teal wash in the bottom-right. Large blurs keep it
          atmospheric (not a pattern); the centre stays clean behind the text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-slate-300/45 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-14 -right-12 h-48 w-48 rounded-full bg-teal-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-4 h-28 w-28 rounded-full bg-slate-500/15 blur-2xl"
      />
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{name}</p>
            <p className="text-sm text-slate-500">{role}</p>
          </div>
        </div>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-600">
          “{quote}”
        </p>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <span className="text-xs text-slate-400">{date}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

const LandingPage = () => {
  // Testimonials carousel: advance one card per click, loop back at the end.
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const scrollTestimonials = () => {
    const el = testimonialsRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth; // 20px = gap-5
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    el.scrollTo({
      left: atEnd ? 0 : el.scrollLeft + step,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("animate-in");
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
      <Header variant="business" />

      {/* ============================================================ */}
      {/* 1. HERO copy left, iPad with the real dashboard on the right */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden px-4 pt-24 md:pt-28 pb-10 md:pb-12">
        {/* subtle SeatPing-brand glow behind the device (keeps the bg clean) */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-32 -z-10 h-[26rem] w-[36rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-teal-100/40 blur-3xl"
        />
        <div className="container relative mx-auto max-w-5xl">
          {/* Centered copy + CTA */}
          <div className="mx-auto max-w-2xl text-center animate-fade-in-up">
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              One Dashboard for Queues and Reservations
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
              Manage walk-ins, bookings, and guest updates in one place.
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                size="lg"
                asChild
                className="h-12 rounded-xl bg-slate-900 px-8 text-sm text-white shadow-sm transition-all duration-300 hover:bg-slate-800 hover:shadow-lg"
              >
                <Link to="/sales">
                  <span className="font-medium">Book a Demo</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* iPad below the CTA, centered, showing the SeatPing dashboard */}
          <div className="relative mx-auto mt-8 w-full max-w-[940px] animate-fade-in-up animation-delay-200">
            <div className="relative rounded-[1.75rem] border border-slate-200 bg-slate-900 p-2.5 shadow-2xl shadow-slate-300/50 ring-1 ring-slate-900/10">
              {/* front camera */}
              <span className="absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/25" />
              {/* screen */}
              <div className="overflow-hidden rounded-[1.2rem] bg-slate-50 p-3">
                <HeroDashboardScreen />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* TESTIMONIALS trust before the final CTA                      */}
      {/* ============================================================ */}
      <section className="border-t border-slate-200 bg-slate-50 px-4 py-16 md:py-20">
        <div className="container mx-auto max-w-6xl scroll-animate">
          {/* Heading row: headline on the left, scroll control on the right */}
          <div className="flex items-end justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                Built for Teams That Manage{" "}
                <span className="text-slate-400">Guests Every Day</span>
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Designed for growing restaurants, cafés, salons, and service
                teams.
              </p>
            </div>
            <button
              type="button"
              onClick={scrollTestimonials}
              aria-label="Show more testimonials"
              className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition-all duration-300 hover:bg-slate-800 hover:shadow-lg md:inline-flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Carousel: scrollable row, 1 card on mobile, ~2 on tablet, 3 on desktop */}
          <div
            ref={testimonialsRef}
            className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TESTIMONIALS.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. FINAL CTA light gradient, scribble headline, value cards */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden border-y border-slate-200 bg-slate-50 px-4 py-14 md:py-20">
        {/* soft accent-tinted gradient background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50/60 via-slate-50 to-slate-50"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-emerald-100/40 blur-3xl"
        />

        <div className="container mx-auto max-w-4xl text-center scroll-animate">
          {/* Headline as a tasteful editorial correction: "front-door chaos"
              is struck through (same scribble as the sales page), "smooth
              service" is the penned-in fix on the line below. */}
          <h2
            className="text-4xl font-bold leading-[1.12] tracking-tight text-slate-900 sm:text-5xl md:text-6xl"
            aria-label="Turn Every Arrival Into Smooth Service"
          >
            <span aria-hidden className="block">
              Turn Every Arrival Into
            </span>
            <span aria-hidden className="mt-1.5 block">
              {/* rejected phrase: scribble copied from the sales page */}
              <span className="relative inline-block whitespace-nowrap text-slate-400">
                Front-Door Chaos
                <svg
                  aria-hidden="true"
                  viewBox="0 0 120 16"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-x-0 top-[62%] h-[0.55em] w-full -translate-y-1/2 text-success"
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
            {/* penned-in correction, on the line below */}
            <span className="mt-1.5 block font-hand text-[1.12em] font-bold leading-none text-success">
              Smooth Service
            </span>
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Set up queues, reservations, notifications, and location settings
            with no extra hardware and no complicated onboarding.
          </p>

          {/* CTA button */}
          <div className="mt-7 flex justify-center">
            <Button
              size="lg"
              asChild
              className="rounded-xl bg-slate-900 px-8 text-white shadow-sm transition-all duration-300 hover:bg-slate-800 hover:shadow-lg"
            >
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
