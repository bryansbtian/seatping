import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Restaurant02Icon } from "@hugeicons/core-free-icons";
import RestaurantCardSkeleton from "@/components/restaurant-discovery/RestaurantCardSkeleton";
import { useFeaturedRestaurants } from "@/hooks/useFeaturedRestaurants";
import { getRestaurantImageProps } from "@/lib/restaurantImages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import RestaurantCardContent from "@/components/RestaurantCardContent";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import ReservationSearchBar from "@/components/ReservationSearchBar";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2400&q=80";

const CustomerLanding = () => {
  const navigate = useNavigate();
  const { hash, key } = useLocation();

  useEffect(() => {
    if (hash !== "#featured") {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById("featured");
      if (section) {
        const offset = Number.parseFloat(getComputedStyle(section).scrollMarginTop);
        window.scrollTo({
          top: window.scrollY + section.getBoundingClientRect().top - offset,
          behavior: "instant",
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, key]);

  const featuredQuery = useFeaturedRestaurants();
  const featured = featuredQuery.data ?? [];
  const loadingFeatured = featuredQuery.isPending;
  const featuredError = featuredQuery.isError;

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

    const elements = document.querySelectorAll(
      ".scroll-animate, .scroll-animate-left, .scroll-animate-right, .scroll-animate-scale",
    );
    elements.forEach((el) => observer.observe(el));
    return () => elements.forEach((el) => observer.unobserve(el));
  }, []);

  let featuredContent;
  if (loadingFeatured) {
    featuredContent = (
      <div role="status" aria-label="Loading Featured Restaurants">
        <div aria-hidden="true" className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <RestaurantCardSkeleton />
          <div className="hidden lg:block">
            <RestaurantCardSkeleton />
          </div>
          <div className="hidden xl:block">
            <RestaurantCardSkeleton />
          </div>
        </div>
      </div>
    );
  } else if (featuredError && featured.length === 0) {
    featuredContent = (
      <div role="alert" className="w-full rounded-xl border border-border bg-card p-8 text-center">
        <h3 className="text-title text-foreground">Unable To Load Featured Restaurants</h3>
        <p className="mt-2 text-body text-ink-subtle">
          We couldn't load featured restaurants right now. Please try again.
        </p>
        <Button variant="outline" onClick={() => void featuredQuery.refetch()} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  } else if (featured.length === 0) {
    featuredContent = (
      <div className="max-w-2xl rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 md:p-12 text-left">
        <p className="text-lg font-semibold text-slate-900">No featured restaurants yet.</p>
        <p className="mt-2 text-sm text-slate-500">
          New dining spots are coming soon. Check back later to discover places to book, queue, and
          enjoy.
        </p>
      </div>
    );
  } else {
    featuredContent = (
      <CarouselContent className="-ml-4">
        {featured.map((r) => {
          let resolvedDetailsHref: string | null;
          if (r.businessUsername) {
            resolvedDetailsHref = `/${r.businessUsername}/${r.locationId}`;
          } else {
            resolvedDetailsHref = null;
          }
          const detailsHref = resolvedDetailsHref;

          let queueHref: string;
          if (r.businessUsername && r.locationId) {
            queueHref = `/queue/${r.businessUsername}/${r.locationId}`;
          } else {
            queueHref = detailsHref ?? "/";
          }
          const locationText = r.shortAddress || r.city || r.area || r.address || "";

          let cardCursorClass: string;
          let cardClickHandler: (() => void) | undefined;
          let cardRole: string | undefined;
          let cardAriaLabel: string | undefined;
          if (detailsHref) {
            cardCursorClass = "cursor-pointer";
            cardClickHandler = () => navigate(detailsHref);
            cardRole = "link";
            cardAriaLabel = `View ${r.name}`;
          } else {
            cardCursorClass = "";
            cardClickHandler = undefined;
            cardRole = undefined;
            cardAriaLabel = undefined;
          }

          let bannerContent;
          if (r.bannerImageUrl) {
            bannerContent = (
              <img
                {...getRestaurantImageProps(
                  r.bannerImageUrl,
                  [320, 480, 640, 960],
                  "(max-width: 767px) 85vw, (max-width: 1023px) 45vw, 380px",
                )}
                alt={r.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            );
          } else {
            bannerContent = (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                <HugeiconsIcon icon={Restaurant02Icon} className="h-8 w-8" />
              </div>
            );
          }

          let reservationAction;
          if (r.reservationsEnabled === false) {
            reservationAction = (
              <Button
                disabled
                variant="outline"
                title="Reservations Unavailable"
                className="w-full min-w-0 border-border bg-muted/40 px-3 text-ink disabled:opacity-100"
              >
                <span className="whitespace-normal leading-none">Reservations Unavailable</span>
              </Button>
            );
          } else {
            reservationAction = (
              <Button
                className="w-full min-w-0 justify-center whitespace-nowrap px-3"
                onClick={(e) => {
                  e.stopPropagation();
                  if (detailsHref) {
                    navigate(detailsHref);
                  }
                }}
              >
                <span>Book Table</span>
              </Button>
            );
          }

          return (
            <CarouselItem
              key={r.id}
              className="pl-4 basis-[88%] sm:basis-[70%] lg:basis-1/2 xl:basis-1/3"
            >
              <Card
                className={`h-full overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-shadow duration-300 flex flex-col ${cardCursorClass}`}
                onClick={cardClickHandler}
                role={cardRole}
                aria-label={cardAriaLabel}
              >
                <div className="relative aspect-[4/3] bg-slate-100">{bannerContent}</div>

                <RestaurantCardContent
                  name={r.name}
                  rating={r.rating}
                  reviewCount={r.reviewCount}
                  cuisine={r.cuisine}
                  priceRange={r.priceRange}
                  locationText={locationText}
                  stackActionsOnMobile
                >
                  {reservationAction}
                  <Button
                    variant="outline"
                    aria-label={`Join queue at ${r.name}`}
                    className="w-full min-w-0 justify-center whitespace-nowrap px-3"
                    asChild
                  >
                    <Link to={queueHref} onClick={(e) => e.stopPropagation()}>
                      <span>Join Queue</span>
                    </Link>
                  </Button>
                </RestaurantCardContent>
              </Card>
            </CarouselItem>
          );
        })}
      </CarouselContent>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="SeatPing | Find Restaurants, Book Tables, and Join Queues"
        description={CUSTOMER_DESCRIPTION}
        canonical="/"
      />
      <Header />

      <section className="relative">
        <div className="absolute inset-0 bg-slate-900">
          <img
            {...getRestaurantImageProps(HERO_IMAGE, [640, 960, 1280, 1920, 2400], "100vw")}
            fetchPriority="high"
            alt="Restaurant interior"
            className="h-full w-full object-cover opacity-90"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/75 via-slate-900/60 to-slate-900/85" />
        </div>

        <div className="relative container mx-auto px-4 pt-36 md:pt-44 pb-32 sm:pb-36 md:pb-44 text-center">
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium leading-tight text-white">
              Discover Restaurants and Join the Wait Effortlessly
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-slate-200 leading-relaxed max-w-2xl mx-auto">
              Find great restaurants, check availability, join the queue, and reserve your spot in
              one simple place.
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-20 -mt-24 sm:-mt-28 md:-mt-32 px-4">
        <div className="container mx-auto max-w-5xl">
          <ReservationSearchBar />
        </div>
      </div>

      <section id="featured" className="scroll-mt-24 pt-16 md:pt-24 px-4">
        <div className="container mx-auto max-w-7xl">
          <Carousel opts={{ align: "start" }} className="w-full">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div className="text-left">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900">
                  Featured Restaurants
                </h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
                  Discover great places to book, queue, and enjoy with SeatPing.
                </p>
              </div>
              {!loadingFeatured && featured.length > 0 && (
                <div className="hidden shrink-0 items-center gap-2 self-end sm:flex">
                  <CarouselPrevious className="static translate-x-0 translate-y-0" />
                  <CarouselNext className="static translate-x-0 translate-y-0" />
                </div>
              )}
            </div>

            {featuredContent}
          </Carousel>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default CustomerLanding;
