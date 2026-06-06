// src/pages/Restaurant.tsx
//
// Public restaurant details page. Inspired by OpenTable's layout but styled in
// SeatPing's visual system (white cards, slate text, rounded corners).
//
//   /:businessUsername/:locationId
//
// Data comes from GET /api/restaurants/:businessUsername/:locationId
// (public-safe fields only). Reservation and queue actions are rendered by
// ReservationBooking.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "@/lib/api";
import NotFound from "@/pages/NotFound";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  EditReviewDialog,
  type EditableReview,
} from "@/components/EditReviewDialog";
import { formatTimeLabel } from "@/components/TimeSelect";
import ReservationBooking from "@/components/ReservationBooking";
import {
  Clock,
  Globe,
  Heart,
  ImageIcon,
  Instagram,
  Loader2,
  MapPin,
  Phone,
  Utensils,
  Star,
  Pencil,
  CircleDollarSign,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirror the public API in server/routes/restaurants.ts)
// ---------------------------------------------------------------------------

type Photo = { id: string; url: string; altText?: string | null };
type MenuItem = {
  name: string;
  description?: string;
  price?: number | null;
  currency?: string;
  category?: string;
};
type DayHours = { enabled: boolean; open: string; close: string };
type OpeningHours = { timezone?: string } & Record<string, DayHours>;
type Review = {
  id: string;
  customerName?: string | null;
  customerUsername?: string | null;
  rating: number;
  description?: string | null;
  partySize?: number | null;
  serviceType?: string | null;
  createdAt: string;
  businessReply?: string | null;
  businessReplyCreatedAt?: string | null;
  businessReplyUpdatedAt?: string | null;
};

type Restaurant = {
  businessUsername: string;
  businessName: string | null;
  locationId: string;
  name: string;
  shortAddress: string | null;
  tagline: string | null;
  description: string | null;
  cuisineTypes: string[];
  priceRange: string | null;
  currency: string | null;
  address: string;
  area: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  openingHours: OpeningHours | null;
  bannerImageUrl: string | null;
  photos: Photo[];
  menu: MenuItem[];
  menuUrl: string | null;
  rating: number | null;
  reviewCount: number;
  reviews: Review[];
  queueEnabled: boolean;
  reservationsEnabled: boolean;
};

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function formatDayLabel(d: string) {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function formatHoursForDay(day: DayHours | undefined) {
  if (!day || day.enabled === false) return "Closed";
  return `${formatTimeLabel(day.open)} – ${formatTimeLabel(day.close)}`;
}

function todayDayKey() {
  const idx = new Date().getDay(); // 0=Sun
  const map = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  return map[idx];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Ensure a user-entered URL has a scheme so it opens as an absolute link
 *  (e.g. "menu.com/x" → "https://menu.com/x") instead of a relative path. */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Five filled/empty stars for a numeric rating. */
function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= filled
              ? "h-3.5 w-3.5 fill-yellow-400 text-yellow-400"
              : "h-3.5 w-3.5 fill-slate-200 text-slate-200"
          }
        />
      ))}
    </span>
  );
}

const REVIEWS_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * True at the `lg` breakpoint (>= 1024px) and up. Used so the reservation/action
 * card is mounted only ONCE — either inline (mobile/tablet) or in the sticky
 * desktop aside. Rendering it in both spots (CSS-hidden) would mount two
 * ReservationBooking instances, double-fetching availability and opening the
 * booking modal twice. Initialized synchronously to avoid a first-paint flash.
 */
function useIsLgUp() {
  const [isLgUp, setIsLgUp] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isLgUp;
}

export default function RestaurantPage() {
  const { businessUsername = "", locationId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Prefill values carried from the homepage search bar (or a shared/manual URL).
  // Validated to the formats the booking card expects; invalid values are ignored.
  const qpDate = searchParams.get("date") || "";
  const qpTime = searchParams.get("time") || "";
  const qpParty = Number(searchParams.get("partySize"));
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(qpDate) ? qpDate : undefined;
  const initialTime = /^\d{2}:\d{2}$/.test(qpTime) ? qpTime : undefined;
  const initialPartySize =
    Number.isFinite(qpParty) && qpParty > 0 ? qpParty : undefined;

  const isLgUp = useIsLgUp();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Customer/business session — drives whether the "Write a review" form shows.
  // Only customer sessions can post reviews (business sessions are blocked
  // server-side by requireCustomer).
  const [accountType, setAccountType] = useState<
    "customer" | "business" | null | undefined
  >(undefined);
  // Bump to re-fetch the restaurant (after submitting a review, etc.).
  const [refreshKey, setRefreshKey] = useState(0);
  // The logged-in customer's existing review id for THIS location (if any). When
  // set, we hide the write-a-review form and show an Edit control on their card.
  const [myReviewId, setMyReviewId] = useState<string | null>(null);
  // Review currently open in the edit modal (null = closed).
  const [editingReview, setEditingReview] = useState<EditableReview | null>(
    null,
  );
  const { toast } = useToast();
  // Saved (bookmark) state for this exact location.
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const SAVE_INTENT_KEY = "seatping:pendingSaveLocationId";
  // Currently-in-view section, used to highlight the matching anchor pill.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Photos modal open state (triggered by "View photos" button or "+N More" overlay).
  const [photosOpen, setPhotosOpen] = useState(false);
  // Client-side review pagination: render the first N, reveal more on demand.
  const [visibleReviewCount, setVisibleReviewCount] =
    useState(REVIEWS_PAGE_SIZE);
  // True once the user scrolls past the hero/title: the section nav slides up
  // to top:0 and the SeatPing header is hidden, OpenTable-style.
  const [navTakeover, setNavTakeover] = useState(false);
  const navSentinelRef = useRef<HTMLDivElement>(null);

  // Toggle takeover when the sentinel (placed right before the section nav)
  // crosses the top of the viewport.
  useEffect(() => {
    const el = navSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNavTakeover(
          !entry.isIntersecting && entry.boundingClientRect.top < 0,
        );
      },
      { rootMargin: "0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [restaurant]);

  useEffect(() => {
    let cancelled = false;
    fetch("/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { customer: null }))
      .then((d) => {
        // This page only distinguishes "is a customer" (for saving locations);
        // a business session does not count here.
        if (!cancelled) setAccountType(d?.customer ? "customer" : null);
      })
      .catch(() => {
        if (!cancelled) setAccountType(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Look up whether the logged-in customer already has a review for this
  // location (one active review per user+location). Re-runs after a post/edit
  // so the write form ↔ edit-card states stay in sync. Non-customers have none.
  useEffect(() => {
    if (accountType !== "customer" || !locationId) {
      setMyReviewId(null);
      return;
    }
    let cancelled = false;
    api("/auth/me/reviews")
      .then((d) => {
        if (cancelled) return;
        const mine = (d.reviews || []).find(
          (rv: any) => rv.locationId === locationId,
        );
        setMyReviewId(mine?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setMyReviewId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountType, locationId, refreshKey]);

  // Saved status for this location. Customers only; resolve a pending save left
  // by the logged-out → login → back flow so the click "carries through".
  useEffect(() => {
    if (accountType === undefined || !locationId) return;
    if (accountType !== "customer") {
      setSaved(false);
      return;
    }
    let cancelled = false;
    const pending = localStorage.getItem(SAVE_INTENT_KEY) === locationId;
    if (pending) localStorage.removeItem(SAVE_INTENT_KEY);
    (async () => {
      try {
        if (pending) {
          await api("/auth/me/saved-locations", {
            method: "POST",
            body: JSON.stringify({ locationId }),
          });
          if (!cancelled) {
            setSaved(true);
            toast({ title: "Restaurant saved" });
          }
          return;
        }
        const d = await api(`/auth/me/saved-locations/${locationId}`);
        if (!cancelled) setSaved(Boolean(d?.saved));
      } catch {
        if (!cancelled) setSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountType, locationId, toast]);

  const toggleSave = async () => {
    // Logged out (or business): stash intent and send to login, then come back.
    if (accountType !== "customer") {
      localStorage.setItem(SAVE_INTENT_KEY, locationId);
      const next = encodeURIComponent(
        window.location.pathname + window.location.search,
      );
      navigate(`/login?next=${next}`);
      return;
    }
    setSaveBusy(true);
    const wasSaved = saved;
    try {
      if (wasSaved) {
        await api(`/auth/me/saved-locations/${locationId}`, {
          method: "DELETE",
        });
        setSaved(false);
        toast({ title: "Restaurant removed from saved" });
      } else {
        await api("/auth/me/saved-locations", {
          method: "POST",
          body: JSON.stringify({ locationId }),
        });
        setSaved(true);
        toast({ title: "Restaurant saved" });
      }
    } catch (e: any) {
      toast({
        title: "Something went wrong",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaveBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRestaurant(null);
    api(
      `/api/restaurants/${encodeURIComponent(businessUsername)}/${encodeURIComponent(
        locationId,
      )}`,
    )
      .then((res) => {
        if (cancelled) return;
        setRestaurant(res.restaurant ?? null);
        setVisibleReviewCount(REVIEWS_PAGE_SIZE);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Restaurant Not Found.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessUsername, locationId, refreshKey]);

  // Reset scroll on route change.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [businessUsername, locationId]);

  // Which sections to render (only when their underlying data exists). The
  // page is scroll-based now — each entry becomes both an anchor-nav item and
  // a real <section id="..."> below.
  const visibleSections = useMemo(() => {
    if (!restaurant) return [] as Array<{ id: string; label: string }>;
    const list: Array<{ id: string; label: string }> = [
      { id: "overview", label: "Overview" },
    ];
    if (restaurant.photos.length > 0)
      list.push({ id: "photos", label: "Photos" });
    if (restaurant.menu.length > 0 || Boolean(restaurant.menuUrl))
      list.push({ id: "menu", label: "Menu" });
    // Reviews is always present — logged-in customers can write one even when
    // there are none yet.
    list.push({ id: "reviews", label: "Reviews" });
    const hasDetails =
      Boolean(restaurant.address) ||
      Boolean(restaurant.phone) ||
      Boolean(restaurant.website) ||
      restaurant.cuisineTypes.length > 0 ||
      Boolean(restaurant.priceRange) ||
      Boolean(restaurant.openingHours);
    if (hasDetails) list.push({ id: "details", label: "Details" });
    return list;
  }, [restaurant]);

  const scrollToSection = (id: string) => {
    // Set active immediately so the pill reflects the click before the smooth
    // scroll settles (otherwise the user briefly sees the previous active).
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Scroll-spy: highlight the pill whose section is currently in view. The
  // rootMargin pushes the "active band" below the sticky header + anchor nav
  // (~128px) and ignores anything past the top ~45% of the viewport.
  useEffect(() => {
    if (visibleSections.length === 0) return;
    setActiveSection(visibleSections[0].id);
    const ids = visibleSections.map((s) => s.id);
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        }
        // Pick the first section (in document order) that's currently in band.
        const next = ids.find((id) => seen.has(id));
        if (next) setActiveSection(next);
      },
      { rootMargin: "-128px 0px -55% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [visibleSections]);

  // ---- Loading / error states ----
  if (loading) {
    return (
      <PageShell>
        <div className="container mx-auto flex items-center justify-center gap-2 px-4 py-24 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading restaurant...
        </div>
      </PageShell>
    );
  }
  // An unknown/unavailable restaurant should look like any other dead link:
  // show the standard 404 page instead of a bespoke "Restaurant Not Found".
  if (error || !restaurant) {
    return <NotFound />;
  }

  // ---- Derived bits ----
  const r = restaurant;
  const locationText = r.shortAddress || r.city || r.area || r.address || "";
  const heroImage = r.bannerImageUrl || r.photos[0]?.url || null;
  const todayHours = r.openingHours?.[todayDayKey()] as DayHours | undefined;
  const queueHref = `/queue/${r.businessUsername}/${r.locationId}`;

  // ---- Action card (waitlist always on; reservations optional) ----
  const actionCard = (
    <ReservationBooking
      businessUsername={r.businessUsername}
      locationId={r.locationId}
      name={r.name}
      reservationsEnabled={r.reservationsEnabled !== false}
      queueEnabled={r.queueEnabled !== false}
      queueHref={queueHref}
      heroImage={heroImage}
      locationText={locationText}
      initialDate={initialDate}
      initialTime={initialTime}
      initialPartySize={initialPartySize}
      autoOpen={searchParams.get("book") === "1"}
    />
  );

  return (
    <PageShell hideHeader={navTakeover}>
      <SEO
        title={`${r.name} | SeatPing`}
        description={`Book a table or join the queue at ${r.name}${
          locationText ? ` in ${locationText}` : ""
        } with SeatPing.`}
        canonical={`/${r.businessUsername}/${r.locationId}`}
      />
      {/* Hero banner — full-bleed, edge to edge */}
      <div className="relative h-56 w-full overflow-hidden bg-slate-100 sm:h-72 md:h-96">
        {heroImage ? (
          <img
            src={heroImage}
            alt={r.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
            <Utensils className="h-10 w-10" />
          </div>
        )}
        {r.photos.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="absolute bottom-4 right-4 shadow-sm"
            onClick={() => setPhotosOpen(true)}
          >
            <ImageIcon className="h-4 w-4" />
            <span>View Photos</span>
          </Button>
        )}
      </div>

      {/* Title + main content */}
      <div className="container mx-auto max-w-7xl px-4 py-8 md:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left / main column */}
          <div className="lg:col-span-2">
            {/* Name on the left, Save aligned right of the content column
                (NOT inside the reservation card). Hidden on mobile — a pill
                appears below the meta row there instead. */}
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl sm:text-4xl font-semibold text-slate-900">
                {r.name}
              </h1>
              {/* Heart on the right — icon-only on mobile, full pill on sm+. */}
              <SaveButton
                saved={saved}
                busy={saveBusy}
                onClick={toggleSave}
                className="shrink-0"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              {r.rating != null ? (
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {r.rating.toFixed(1)}
                  <span className="font-normal text-slate-500">
                    ({r.reviewCount}{" "}
                    {r.reviewCount === 1 ? "Review" : "Reviews"})
                  </span>
                </span>
              ) : (
                <span>No Reviews Yet</span>
              )}
              {r.cuisineTypes[0] && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{r.cuisineTypes[0]}</span>
                </>
              )}
              {r.priceRange && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{r.priceRange}</span>
                </>
              )}
              {locationText && (
                // Mobile: drop the location onto its own row (basis-full forces
                // a wrap) and hide the leading dot. Tablet/desktop: keep inline.
                <span className="inline-flex basis-full items-center gap-1 sm:basis-auto">
                  <span className="hidden text-slate-300 sm:inline">·</span>
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {locationText}
                </span>
              )}
            </div>
            {r.tagline && (
              <p className="mt-3 text-sm sm:text-base text-slate-600">
                {r.tagline}
              </p>
            )}

            {/* On mobile + tablet, the action card sits right under the header,
                BEFORE the long content sections. Rendered only when NOT lg+ so a
                single ReservationBooking instance exists (see useIsLgUp). */}
            {!isLgUp && <div className="mt-6">{actionCard}</div>}

            {/* Sentinel sits one pixel above the nav. When it scrolls past the
                top of the viewport, the section nav takes over as the page
                header (and the SeatPing header is hidden — see PageShell). */}
            <div ref={navSentinelRef} aria-hidden className="h-px" />

            {/* Anchor nav — sticky just under the SeatPing header until the
                takeover, then sticks to the very top of the viewport. */}
            {visibleSections.length > 1 && (
              <nav
                className={cn(
                  "sticky -mx-4 mt-8 border-b border-slate-200 bg-white/95 px-4 backdrop-blur",
                  navTakeover ? "top-0 z-50" : "top-16 z-30",
                )}
              >
                <div className="flex gap-2 overflow-x-auto py-3">
                  {visibleSections.map((s) => {
                    const isActive = activeSection === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => scrollToSection(s.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                          isActive
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-900",
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </nav>
            )}

            {/* Sections render sequentially; only those with data appear. The
                scroll-mt-32 leaves room for the sticky header + anchor nav. */}
            <div className="mt-8 space-y-12">
              {/* Overview */}
              <section id="overview" className="scroll-mt-32 space-y-6">
                {(r.description || r.tagline) && (
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                      About {r.name}
                    </h2>
                    {r.description ? (
                      <p className="mt-3 whitespace-pre-line text-slate-700">
                        {r.description}
                      </p>
                    ) : (
                      <p className="mt-3 text-slate-600">{r.tagline}</p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {r.cuisineTypes.length > 0 && (
                    <OverviewRow
                      icon={Utensils}
                      label="Cuisine"
                      value={r.cuisineTypes.join(", ")}
                    />
                  )}
                  {r.priceRange && (
                    <OverviewRow
                      icon={CircleDollarSign}
                      label="Price range"
                      value={r.priceRange}
                    />
                  )}
                  {locationText && (
                    <OverviewRow
                      icon={MapPin}
                      label="Location"
                      value={locationText}
                    />
                  )}
                  {todayHours && (
                    <OverviewRow
                      icon={Clock}
                      label="Today's hours"
                      value={formatHoursForDay(todayHours)}
                    />
                  )}
                </div>
              </section>

              {/* Photos */}
              {r.photos.length > 0 && (
                <section id="photos" className="scroll-mt-32">
                  <h2 className="mb-4 text-lg sm:text-xl font-semibold text-slate-900">
                    {r.photos.length}{" "}
                    {r.photos.length === 1 ? "Photo" : "Photos"}
                  </h2>
                  <PhotosGrid
                    photos={r.photos}
                    onShowAll={() => setPhotosOpen(true)}
                  />
                </section>
              )}

              {/* Menu — only shown when there's something to show: a menu link
                  and/or highlight items. Hidden entirely otherwise. */}
              {(r.menu.length > 0 || r.menuUrl) && (
                <section id="menu" className="scroll-mt-32 space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                      Menu
                    </h2>
                    <p className="text-sm text-slate-600">
                      Menu from {r.name}.
                    </p>
                  </div>
                  {/* External full-menu link — top of the section, clean outlined
                      button. Only when the business added a menu URL. */}
                  {r.menuUrl && (
                    <a
                      href={normalizeUrl(r.menuUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      View Full Menu
                    </a>
                  )}
                  {r.menu.length > 0 && (
                    <MenuList items={r.menu} fallbackCurrency={r.currency} />
                  )}
                </section>
              )}

              {/* Reviews — always rendered, even with zero reviews, so logged-in
                  customers can write one. */}
              <section id="reviews" className="scroll-mt-32 space-y-4">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                  {r.reviewCount > 0
                    ? `What ${r.reviewCount.toLocaleString()} ${
                        r.reviewCount === 1 ? "Person Is" : "People Are"
                      } Saying`
                    : "Reviews"}
                </h2>

                {r.reviewCount > 0 ? (
                  <ReviewsSummary
                    rating={r.rating ?? 0}
                    count={r.reviewCount}
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    No reviews yet. Be the first to share your experience.
                  </p>
                )}

                {/* Write-a-review form (customer sessions only). Hidden once the
                    customer already has a review here — they edit it on their
                    card instead (one active review per user+location). */}
                {!myReviewId && (
                  <WriteReviewBlock
                    accountType={accountType}
                    businessUsername={r.businessUsername}
                    locationId={r.locationId}
                    onSubmitted={() => setRefreshKey((n) => n + 1)}
                  />
                )}

                {r.reviews.length > 0 && (
                  <>
                    <div className="space-y-3">
                      {(myReviewId
                        ? [
                            ...r.reviews.filter((rv) => rv.id === myReviewId),
                            ...r.reviews.filter((rv) => rv.id !== myReviewId),
                          ]
                        : r.reviews
                      )
                        .slice(0, visibleReviewCount)
                        .map((rv) => (
                          <ReviewCard
                            key={rv.id}
                            review={rv}
                            restaurantName={r.name}
                            isOwn={rv.id === myReviewId}
                            onEdit={() =>
                              setEditingReview({
                                id: rv.id,
                                rating: rv.rating,
                                description: rv.description,
                                restaurantName: r.name,
                              })
                            }
                          />
                        ))}
                    </div>
                    {visibleReviewCount < r.reviews.length && (
                      <div className="flex flex-col items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            setVisibleReviewCount((n) =>
                              Math.min(n + REVIEWS_PAGE_SIZE, r.reviews.length),
                            )
                          }
                        >
                          Load More Reviews
                        </Button>
                        <p className="text-xs text-slate-500">
                          Showing {visibleReviewCount} of {r.reviews.length}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Details */}
              <section id="details" className="scroll-mt-32 space-y-6">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                  Details
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {r.address && (
                    <DetailRow
                      icon={MapPin}
                      label="Location"
                      value={
                        r.googleMapsUrl ? (
                          <a
                            href={r.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-900 underline-offset-4 hover:underline"
                          >
                            {r.address}
                          </a>
                        ) : (
                          r.address
                        )
                      }
                    />
                  )}
                  {r.phone && (
                    <DetailRow
                      icon={Phone}
                      label="Phone number"
                      value={
                        <a
                          href={`tel:${r.phone}`}
                          className="text-slate-900 underline-offset-4 hover:underline"
                        >
                          {r.phone}
                        </a>
                      }
                    />
                  )}
                  {r.cuisineTypes.length > 0 && (
                    <DetailRow
                      icon={Utensils}
                      label="Cuisines"
                      value={r.cuisineTypes.join(", ")}
                    />
                  )}
                  {r.priceRange && (
                    <DetailRow
                      icon={CircleDollarSign}
                      label="Price"
                      value={r.priceRange}
                    />
                  )}
                  {r.website && (
                    <DetailRow
                      icon={Globe}
                      label="Website"
                      value={
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-900 underline-offset-4 hover:underline break-all"
                        >
                          {r.website}
                        </a>
                      }
                    />
                  )}
                  {r.instagram && (
                    <DetailRow
                      icon={Instagram}
                      label="Instagram"
                      value={r.instagram}
                    />
                  )}
                </div>

                {r.openingHours && (
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Hours of Operation
                    </h3>
                    <div className="mt-3 divide-y divide-slate-100">
                      {DAYS.map((d) => {
                        const day = r.openingHours?.[d] as DayHours | undefined;
                        return (
                          <div
                            key={d}
                            className="flex items-center justify-between py-2 text-sm"
                          >
                            <span className="font-medium text-slate-700">
                              {formatDayLabel(d)}
                            </span>
                            <span className="text-slate-500">
                              {formatHoursForDay(day)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {r.openingHours.timezone && (
                      <p className="mt-2 text-xs text-slate-400">
                        Timezone: {r.openingHours.timezone}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Right column — sticky reservation/action card on desktop only.
              Rendered only at lg+ so a single ReservationBooking instance
              exists (see useIsLgUp). */}
          {isLgUp && (
            <aside>
              <div className="sticky top-24">{actionCard}</div>
            </aside>
          )}
        </div>
      </div>

      {/* All-photos modal (opened from the hero "View photos" button or the
          "+N More" overlay on the photo grid). */}
      <PhotosModal
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        restaurantName={r.name}
        photos={r.photos}
      />

      {/* Edit-review modal (own review only). Reuses the shared dialog from the
          profile's review management. On save, re-fetch so the public list and
          rating summary reflect the change immediately. */}
      <EditReviewDialog
        review={editingReview}
        onOpenChange={(open) => !open && setEditingReview(null)}
        onSaved={() => {
          setEditingReview(null);
          setRefreshKey((n) => n + 1);
        }}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Small helpers / components
// ---------------------------------------------------------------------------

function PageShell({
  children,
  hideHeader = false,
}: {
  children: React.ReactNode;
  hideHeader?: boolean;
}) {
  // pt-14/pt-16 clears the fixed Header (~56px mobile, ~64px desktop). When
  // the section nav takes over (hideHeader), the SeatPing header is removed
  // from the DOM so only the sticky nav sits at the top of the viewport.
  return (
    <div className="min-h-screen bg-background pt-14 sm:pt-16">
      {!hideHeader && <Header showSearch />}
      {children}
      <Footer />
    </div>
  );
}

/** Subtle rounded pill toggle for bookmarking a location. */
function SaveButton({
  saved,
  busy,
  onClick,
  className,
}: {
  saved: boolean;
  busy: boolean;
  onClick: () => void;
  className?: string;
}) {
  const label = saved ? "Saved" : "Save";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      className={cn(
        // Icon-only round button on mobile; full pill with label on sm+.
        "inline-flex items-center gap-2 rounded-full border p-2 text-sm font-medium transition-colors disabled:opacity-60 sm:px-4 sm:py-2",
        saved
          ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        className,
      )}
    >
      <Heart
        className={cn("h-4 w-4", saved && "fill-rose-500 text-rose-500")}
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function OverviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-800 break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <div className="mt-0.5 text-sm text-slate-600 break-words">{value}</div>
      </div>
    </div>
  );
}

/**
 * OpenTable-style photo grid:
 *   - 1 photo  → one big image
 *   - 2-4      → equal 2-col grid
 *   - 5+       → 1 big left + 4 small right (2×2). When more than 5 photos
 *                exist, the LAST small tile gets a dark "+N More" overlay
 *                that opens the all-photos modal.
 *
 * On md+, the right 2×2 column matches the big image's height automatically
 * (grid-row stretch). The whole big image is also clickable → opens the modal.
 */
function PhotosGrid({
  photos,
  onShowAll,
}: {
  photos: Photo[];
  onShowAll: () => void;
}) {
  if (photos.length === 0) return null;

  // Common classes for any clickable photo tile.
  const tileBase =
    "group relative overflow-hidden rounded-xl border border-slate-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30";

  if (photos.length === 1) {
    return (
      <button
        type="button"
        onClick={onShowAll}
        className={cn(tileBase, "block w-full")}
      >
        <img
          src={photos[0].url}
          alt={photos[0].altText || "Restaurant photo"}
          className="h-72 w-full object-cover transition group-hover:brightness-95 sm:h-96"
        />
      </button>
    );
  }

  if (photos.length <= 4) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={onShowAll}
            className={cn(tileBase, "aspect-[4/3]")}
          >
            <img
              src={p.url}
              alt={p.altText || "Restaurant photo"}
              className="h-full w-full object-cover transition group-hover:brightness-95"
            />
          </button>
        ))}
      </div>
    );
  }

  // 5+
  const [first, ...rest] = photos;
  const small = rest.slice(0, 4);
  const hidden = photos.length - 5;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {/* Left hero — full height of the row on md+, fixed aspect on mobile. */}
      <button
        type="button"
        onClick={onShowAll}
        className={cn(tileBase, "aspect-[4/3] md:aspect-auto md:h-full")}
      >
        <img
          src={first.url}
          alt={first.altText || "Restaurant photo"}
          className="h-full w-full object-cover transition group-hover:brightness-95"
        />
      </button>

      {/* Right 2×2 — stretches to match the left tile's height on md+. */}
      <div className="grid grid-cols-2 grid-rows-2 gap-2">
        {small.map((p, i) => {
          const isLast = i === small.length - 1;
          const showOverlay = isLast && hidden > 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={onShowAll}
              aria-label={
                showOverlay ? `See all ${hidden + 5} photos` : "View photos"
              }
              className={cn(tileBase, "aspect-[4/3] md:aspect-auto md:h-full")}
            >
              <img
                src={p.url}
                alt={p.altText || "Restaurant photo"}
                className="h-full w-full object-cover transition group-hover:brightness-95"
              />
              {showOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white transition group-hover:bg-black/65">
                  <span className="text-lg font-semibold sm:text-xl">
                    +{hidden} More
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** All-photos popup. Opens from the hero "View photos" or the "+N More" overlay. */
function PhotosModal({
  open,
  onOpenChange,
  restaurantName,
  photos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantName: string;
  photos: Photo[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Centered modal: capped width/height per breakpoint with breathing room
          on every side. Only the photo grid scrolls — the header + close button
          stay pinned. Rounded on all sizes (override the base sm:rounded-lg). */}
      <DialogContent className="flex max-h-[85vh] w-full max-w-[94vw] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[88vw] lg:max-w-[960px]">
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4 sm:px-6 sm:pr-12 sm:pt-6">
          <DialogTitle>Photos</DialogTitle>
          <DialogDescription className="break-words">
            {restaurantName}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {photos.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200"
                >
                  <img
                    src={p.url}
                    alt={p.altText || "Restaurant photo"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// How many items to show before the "View full menu" expander appears.
const MENU_PREVIEW_ITEMS = 4;

function MenuList({
  items,
  fallbackCurrency,
}: {
  items: MenuItem[];
  fallbackCurrency: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // Group by category (empty category falls into "Menu"), preserving order.
  const groups = new Map<string, MenuItem[]>();
  for (const it of items) {
    const key = it.category?.trim() || "Menu";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  const collapsible = items.length > MENU_PREVIEW_ITEMS;
  const limit = !collapsible || expanded ? Infinity : MENU_PREVIEW_ITEMS;

  // Walk categories in order, taking items until we hit the preview limit so the
  // collapsed view shows the first few items/categories (OpenTable-style).
  const visibleGroups: [string, MenuItem[]][] = [];
  let shown = 0;
  for (const [cat, list] of groups) {
    if (shown >= limit) break;
    const take = list.slice(0, Math.max(0, limit - shown));
    if (take.length) visibleGroups.push([cat, take]);
    shown += take.length;
  }

  const priceLabel = (it: MenuItem) =>
    typeof it.price === "number" && Number.isFinite(it.price)
      ? `${it.currency || fallbackCurrency || ""} ${it.price.toLocaleString()}`.trim()
      : "";

  return (
    <div className="space-y-6">
      {/* Each category is bracketed by divider lines (border-t above the heading;
          the container's border-b closes the last one). No per-item cards. */}
      <div className="border-b border-slate-200">
        {visibleGroups.map(([cat, list]) => (
          <section key={cat} className="border-t border-slate-200 py-6">
            <h3 className="text-lg font-semibold text-slate-900">{cat}</h3>
            {/* Two columns on desktop, single column on mobile. */}
            <div className="mt-4 grid grid-cols-1 gap-x-12 gap-y-5 sm:grid-cols-2">
              {list.map((it, i) => (
                <div
                  key={`${it.name}-${i}`}
                  className="flex items-baseline justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{it.name}</p>
                    {it.description && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {it.description}
                      </p>
                    )}
                  </div>
                  {priceLabel(it) && (
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {priceLabel(it)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {collapsible && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full px-6"
          >
            {expanded ? "Show Less" : "View Full Menu"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewsSummary({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-2xl font-semibold text-slate-900">
          {rating.toFixed(1)}
        </span>
        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
      </div>
      <span className="text-sm text-slate-500">
        {count} Review{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/**
 * Write-a-review form. Shows a different state based on session:
 *   - undefined        → still loading; render nothing
 *   - null / business  → CTA to log in as a customer
 *   - "customer"       → 5-star rating + comment + submit
 */
function WriteReviewBlock({
  accountType,
  businessUsername,
  locationId,
  onSubmitted,
}: {
  accountType: "customer" | "business" | null | undefined;
  businessUsername: string;
  locationId: string;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (accountType === undefined) return null;

  if (accountType !== "customer") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p>
          <Link
            to="/login"
            className="font-medium text-slate-900 underline-offset-4 hover:underline"
          >
            Log In
          </Link>{" "}
          as a customer to write a review.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      toast({
        title: "Pick a rating",
        description: "Tap 1–5 stars to rate this restaurant.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await api(
        `/api/restaurants/${encodeURIComponent(
          businessUsername,
        )}/${encodeURIComponent(locationId)}/reviews`,
        {
          method: "POST",
          body: JSON.stringify({ rating, description }),
        },
      );
      toast({ title: "Review posted", description: "Thanks for sharing!" });
      setRating(0);
      setHoverRating(0);
      setDescription("");
      onSubmitted();
    } catch (e: any) {
      toast({
        title: "Failed to post review",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hoverRating || rating;

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <p className="text-sm font-semibold text-slate-900">Write a Review</p>
      <div
        className="flex items-center gap-1"
        onMouseLeave={() => setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
          >
            <Star
              className={
                n <= shown
                  ? "h-6 w-6 fill-yellow-400 text-yellow-400"
                  : "h-6 w-6 fill-slate-200 text-slate-200"
              }
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-500">
          {shown ? `${shown}/5` : "Tap to Rate"}
        </span>
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Share what you liked, the vibe, the dishes you tried..."
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Posting..." : "Post Review"}
        </Button>
      </div>
    </form>
  );
}

function ReviewCard({
  review,
  restaurantName,
  isOwn = false,
  onEdit,
}: {
  review: Review;
  restaurantName: string;
  isOwn?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isOwn ? "border-slate-300 bg-slate-50/60" : "border-slate-200",
      )}
    >
      {/* Header — name/username on the left. For the user's own review, a
          "Your Review" badge sits top-right (its own element, so a long name
          truncates instead of colliding with it); the rating + Edit then drop
          to a dedicated row below. Other reviews keep the rating inline. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 line-clamp-1">
            {review.customerName || review.customerUsername || "Anonymous"}
          </p>
          {review.customerName && review.customerUsername && (
            <p className="truncate text-xs text-slate-500">
              @{review.customerUsername}
            </p>
          )}
        </div>
        {isOwn ? (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
            Your Review
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <Stars rating={review.rating} />
            <span className="text-sm font-medium text-slate-700">
              {review.rating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Own review: rating row + Edit on a line of its own. */}
      {isOwn && (
        <div className="mt-2 flex items-center gap-1.5">
          <Stars rating={review.rating} />
          <span className="text-sm font-medium text-slate-700">
            {review.rating.toFixed(1)}
          </span>
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="ml-auto h-7 gap-1 px-2 text-xs text-slate-600 hover:text-slate-900"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      )}
      {review.description && (
        <p className="mt-2 text-sm text-slate-700 break-words">
          {review.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span>{formatDate(review.createdAt)}</span>
        {typeof review.partySize === "number" && (
          <span>· Party of {review.partySize}</span>
        )}
        {review.serviceType && (
          <span>
            ·{" "}
            {review.serviceType === "queue"
              ? "Walk-in"
              : review.serviceType === "reservation"
                ? "Reservation"
                : review.serviceType}
          </span>
        )}
      </div>

      {/* Public business response — read-only on the customer-facing page. */}
      {review.businessReply && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Response from {restaurantName}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-800 break-words">
            {review.businessReply}
          </p>
          {review.businessReplyCreatedAt && (
            <p className="mt-1 text-xs text-slate-500">
              Replied {formatDate(review.businessReplyCreatedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
