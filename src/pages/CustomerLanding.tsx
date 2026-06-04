import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin,
  Star,
  Users,
  Utensils,
  Sparkles,
  Loader2,
  Compass,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReservationSearchBar from "@/components/ReservationSearchBar";

// Hero + card imagery (remote placeholders). The slate fallback background keeps
// each frame looking intentional even if an image fails to load.
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2400&q=80";

// Featured restaurants are admin-curated; fetched from /api/featured-restaurants.
type FeaturedRestaurant = {
  id: string;
  locationId: string;
  businessUsername: string | null;
  businessName: string | null;
  name: string;
  shortAddress: string | null;
  address: string;
  area: string | null;
  city: string | null;
  cuisine: string | null;
  priceRange: string | null;
  bannerImageUrl: string | null;
  rating: number | null;
  reviewCount: number;
};

const CustomerLanding = () => {
  const navigate = useNavigate();

  // Featured Restaurants — real data, curated in the admin dashboard.
  const [featured, setFeatured] = useState<FeaturedRestaurant[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [featuredError, setFeaturedError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api("/api/featured-restaurants")
      .then((res) => {
        if (!cancelled)
          setFeatured(Array.isArray(res.featured) ? res.featured : []);
      })
      .catch(() => {
        if (!cancelled) {
          setFeatured([]);
          setFeaturedError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFeatured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reveal-on-scroll, matching the business landing page behaviour.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("animate-in");
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    const elements = document.querySelectorAll(
      ".scroll-animate, .scroll-animate-left, .scroll-animate-right, .scroll-animate-scale",
    );
    elements.forEach((el) => observer.observe(el));
    return () => elements.forEach((el) => observer.unobserve(el));
  }, []);

  const scrollToFeatured = () => {
    document
      .getElementById("featured")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ===================== HERO ===================== */}
      <section className="relative">
        {/* Background image + slate overlay (keeps SeatPing's neutral palette) */}
        <div className="absolute inset-0 bg-slate-900">
          <img
            src={HERO_IMAGE}
            alt="Restaurant interior"
            className="h-full w-full object-cover opacity-90"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/75 via-slate-900/60 to-slate-900/85" />
        </div>

        <div className="relative container mx-auto px-4 pt-36 md:pt-44 pb-32 sm:pb-36 md:pb-44 text-center">
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs sm:text-sm font-medium text-white backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Discover dining near you with SeatPing
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium leading-tight text-white">
              Discover Restaurants and Join the Wait Effortlessly
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-slate-200 leading-relaxed max-w-2xl mx-auto">
              Find great restaurants, check availability, join the queue, and
              reserve your spot in one simple place.
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-fade-in-up animation-delay-200">
            <Button
              size="lg"
              onClick={() => navigate("/search")}
              className="group w-full sm:w-auto rounded-xl bg-white text-slate-900 px-8 shadow-sm hover:bg-slate-100 hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              <Utensils className="h-4 w-4" />
              <span className="font-medium">Book a Table</span>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={scrollToFeatured}
              className="group w-full sm:w-auto rounded-xl border-white/40 bg-white/10 text-white px-8 backdrop-blur-sm hover:bg-white/20 hover:text-white hover:scale-105 transition-all duration-300"
            >
              <Compass className="h-4 w-4" />
              <span className="font-medium">Discover Restaurants</span>
            </Button>
          </div>
        </div>
      </section>

      {/* ===================== FLOATING SEARCH ===================== */}
      <div className="relative z-20 -mt-24 sm:-mt-28 md:-mt-32 px-4">
        <div className="container mx-auto max-w-5xl">
          <ReservationSearchBar />
        </div>
      </div>

      {/* ===================== FEATURED RESTAURANTS ===================== */}
      {/* Section always visible; body switches between loading / error / empty /
          real cards. Never shows mock or random restaurants. */}
      <section id="featured" className="py-16 md:py-24 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* Carousel wraps the whole block so the top-right arrows share the
              header row (arrows shown only when there are cards to scroll). */}
          <Carousel opts={{ align: "start" }} className="w-full">
            <div className="mb-8 flex items-end justify-between gap-4">
              {/* Header — left-aligned, always visible (loading / empty / data). */}
              <div className="text-left">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900">
                  Featured Restaurants
                </h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
                  Discover great places to book, queue, and enjoy with SeatPing.
                </p>
              </div>
              {/* Arrows are desktop-only; on mobile the carousel is swiped /
                  dragged horizontally instead. */}
              {!loadingFeatured && featured.length > 0 && (
                <div className="hidden shrink-0 items-center gap-2 self-end sm:flex">
                  <CarouselPrevious className="static h-9 w-9 translate-x-0 translate-y-0 sm:h-10 sm:w-10" />
                  <CarouselNext className="static h-9 w-9 translate-x-0 translate-y-0 sm:h-10 sm:w-10" />
                </div>
              )}
            </div>

            {loadingFeatured ? (
              <div className="flex items-center gap-2 py-12 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading featured
                restaurants...
              </div>
            ) : featured.length === 0 ? (
              // Empty (or failed) state — kept visible and left-aligned, no mock cards.
              <div className="max-w-2xl rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 md:p-12 text-left">
                {featuredError ? (
                  <>
                    <p className="text-lg font-semibold text-slate-900">
                      Couldn't load featured restaurants.
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Please refresh the page to try again.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-slate-900">
                      No featured restaurants yet.
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      New dining spots are coming soon. Check back later to
                      discover places to book, queue, and enjoy.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <CarouselContent className="-ml-4">
                {featured.map((r) => {
                  // Card + Book Table → Restaurant Details page. Join Queue
                  // links straight to this location's queue page, which
                  // auto-selects the location from the URL.
                  const detailsHref = r.businessUsername
                    ? `/${r.businessUsername}/${r.locationId}`
                    : null;
                  const queueHref =
                    r.businessUsername && r.locationId
                      ? `/queue/${r.businessUsername}/${r.locationId}`
                      : (detailsHref ?? "/");
                  // Prefer a concise city; fall back to area, then full address.
                  const locationText =
                    r.shortAddress || r.city || r.area || r.address || "";
                  return (
                    <CarouselItem
                      key={r.id}
                      className="pl-4 basis-[80%] sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
                    >
                      <Card
                        className={`h-full overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-shadow duration-300 flex flex-col ${
                          detailsHref ? "cursor-pointer" : ""
                        }`}
                        onClick={
                          detailsHref ? () => navigate(detailsHref) : undefined
                        }
                        role={detailsHref ? "link" : undefined}
                        aria-label={detailsHref ? `View ${r.name}` : undefined}
                      >
                        <div className="relative aspect-[4/3] bg-slate-100">
                          {r.bannerImageUrl ? (
                            <img
                              src={r.bannerImageUrl}
                              alt={r.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                              <Utensils className="h-8 w-8" />
                            </div>
                          )}
                        </div>

                        <CardContent className="flex flex-1 flex-col p-4">
                          {/* Restaurant name */}
                          <h3 className="font-semibold text-slate-900 truncate">
                            {r.name}
                          </h3>

                          {/* Meta: reviews · cuisine · price */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
                            {r.rating != null ? (
                              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                                {r.rating.toFixed(1)}
                                <span className="font-normal text-slate-500">
                                  {r.reviewCount > 0
                                    ? `(${r.reviewCount} review${r.reviewCount === 1 ? "" : "s"})`
                                    : "Reviews"}
                                </span>
                              </span>
                            ) : (
                              <span>No Reviews Yet</span>
                            )}
                            {r.cuisine && (
                              <>
                                <span aria-hidden className="text-slate-300">
                                  ·
                                </span>
                                <span>{r.cuisine}</span>
                              </>
                            )}
                            {r.priceRange && (
                              <>
                                <span aria-hidden className="text-slate-300">
                                  ·
                                </span>
                                <span>{r.priceRange}</span>
                              </>
                            )}
                          </div>

                          {/* Location */}
                          {locationText && (
                            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate">{locationText}</span>
                            </p>
                          )}

                          {/* Buttons — stacked on mobile, side-by-side from sm up.
                          mt-auto pins them to the bottom so cards align. */}
                          <div className="mt-auto grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2">
                            <Button
                              className="w-full min-w-0 justify-center whitespace-nowrap px-3 bg-slate-900 text-white hover:bg-slate-800"
                              onClick={(e) => {
                                // Stop the card's onClick from double-firing.
                                e.stopPropagation();
                                if (detailsHref) navigate(detailsHref);
                              }}
                            >
                              <Utensils className="h-4 w-4" />
                              <span>Book Table</span>
                            </Button>
                            <Button
                              variant="outline"
                              aria-label={`Join queue at ${r.name}`}
                              className="w-full min-w-0 justify-center whitespace-nowrap px-3 border-slate-200 text-slate-900 hover:bg-slate-50"
                              asChild
                            >
                              <Link
                                to={queueHref}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Users className="h-4 w-4" />
                                <span>Join Queue</span>
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
            )}
          </Carousel>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default CustomerLanding;
