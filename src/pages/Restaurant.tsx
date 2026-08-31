import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { EditReviewDialog, type EditableReview } from "@/components/EditReviewDialog";
import { formatTimeLabel } from "@/components/timeOptions";
import ReservationBooking from "@/components/ReservationBooking";
import { formatEnteredPhone } from "@shared/phone";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Call02Icon,
  Clock01Icon,
  DollarCircleIcon,
  FavouriteIcon,
  GlobeIcon,
  Image01Icon,
  InstagramIcon,
  Restaurant02Icon,
  Loading02Icon,
  Location01Icon,
  Edit03Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";

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
  if (!day || day.enabled === false) {
    return "Closed";
  }
  if (day.open === "00:00" && day.close === "00:00") {
    return "Open 24 Hours";
  }
  return `${formatTimeLabel(day.open)} – ${formatTimeLabel(day.close)}`;
}

function todayDayKey() {
  const idx = new Date().getDay();
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

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function getRestaurantStatus(
  openingHours: OpeningHours | null,
): { isOpen: boolean; text: string; color: string } | null {
  if (!openingHours) {
    return null;
  }
  const timezone = openingHours.timezone || "Asia/Jakarta";
  let currentHourMinute: string;
  let currentDayName: string;

  try {
    const dtfTime = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    let timeStr = dtfTime.format(new Date());
    if (timeStr.startsWith("24:")) {
      timeStr = "00" + timeStr.slice(2);
    }
    currentHourMinute = timeStr;

    const dtfDay = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    });
    currentDayName = dtfDay.format(new Date()).toLowerCase();
  } catch {
    const d = new Date();
    currentHourMinute = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    currentDayName = todayDayKey();
  }

  const today = openingHours[currentDayName];
  if (today?.enabled && today.open && today.close) {
    if (today.open === "00:00" && today.close === "00:00") {
      return {
        isOpen: true,
        text: "Open 24 Hours",
        color: "text-green-600 font-medium",
      };
    }
    if (currentHourMinute >= today.open && currentHourMinute < today.close) {
      return {
        isOpen: true,
        text: `Open · Closes at ${formatTimeLabel(today.close)}`,
        color: "text-green-600 font-medium",
      };
    }
  }

  if (today?.enabled && today.open && currentHourMinute < today.open) {
    if (today.open === "00:00" && today.close === "00:00") {
      return {
        isOpen: false,
        text: "Closed",
        color: "text-red-600 font-medium",
      };
    }
    return {
      isOpen: false,
      text: `Closed · Opens at ${formatTimeLabel(today.open)}`,
      color: "text-red-600 font-medium",
    };
  }

  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentIndex = days.indexOf(currentDayName);
  for (let i = 1; i <= 7; i++) {
    const nextDay = days[(currentIndex + i) % 7];
    const hours = openingHours[nextDay];
    if (hours?.enabled && hours.open) {
      let dayLabel: string;
      if (i === 1) {
        dayLabel = "Tomorrow";
      } else {
        dayLabel = formatDayLabel(nextDay);
      }
      if (hours.open === "00:00" && hours.close === "00:00") {
        return {
          isOpen: false,
          text: `Closed · Opens ${dayLabel} at 12:00 AM`,
          color: "text-red-600 font-medium",
        };
      }
      return {
        isOpen: false,
        text: `Closed · Opens ${dayLabel} at ${formatTimeLabel(hours.open)}`,
        color: "text-red-600 font-medium",
      };
    }
  }

  return { isOpen: false, text: "Closed", color: "text-red-600 font-medium" };
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        let starClass: string;
        if (i <= filled) {
          starClass = "h-3.5 w-3.5 fill-yellow-400 text-yellow-400";
        } else {
          starClass = "h-3.5 w-3.5 fill-slate-200 text-slate-200";
        }
        return <HugeiconsIcon icon={StarIcon} key={i} className={starClass} />;
      })}
    </span>
  );
}

const REVIEWS_PAGE_SIZE = 10;

function useIsLgUp() {
  const [isLgUp, setIsLgUp] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
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

  const qpDate = searchParams.get("date") || "";
  const qpTime = searchParams.get("time") || "";
  const qpParty = Number(searchParams.get("partySize"));
  let initialDate: string | undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(qpDate)) {
    initialDate = qpDate;
  } else {
    initialDate = undefined;
  }
  let initialTime: string | undefined;
  if (/^\d{2}:\d{2}$/.test(qpTime)) {
    initialTime = qpTime;
  } else {
    initialTime = undefined;
  }
  let initialPartySize: number | undefined;
  if (Number.isFinite(qpParty) && qpParty > 0) {
    initialPartySize = qpParty;
  } else {
    initialPartySize = undefined;
  }

  const isLgUp = useIsLgUp();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<"customer" | "business" | null | undefined>(
    undefined,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [myReviewId, setMyReviewId] = useState<string | null>(null);
  const [editingReview, setEditingReview] = useState<EditableReview | null>(null);
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const SAVE_INTENT_KEY = "seatping:pendingSaveLocationId";
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [visibleReviewCount, setVisibleReviewCount] = useState(REVIEWS_PAGE_SIZE);
  const [navTakeover, setNavTakeover] = useState(false);
  const navSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = navSentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNavTakeover(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: "0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [restaurant]);

  useEffect(() => {
    let cancelled = false;
    fetch("/auth/session", { credentials: "include" })
      .then((r) => {
        if (r.ok) {
          return r.json();
        }
        return { customer: null };
      })
      .then((d) => {
        if (!cancelled) {
          let nextAccountType: "customer" | null;
          if (d?.customer) {
            nextAccountType = "customer";
          } else {
            nextAccountType = null;
          }
          setAccountType(nextAccountType);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccountType(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (accountType !== "customer" || !locationId) {
      setMyReviewId(null);
      return;
    }
    let cancelled = false;
    api("/auth/me/reviews")
      .then((d) => {
        if (cancelled) {
          return;
        }
        const mine = (d.reviews || []).find((rv: any) => rv.locationId === locationId);
        setMyReviewId(mine?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setMyReviewId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountType, locationId, refreshKey]);

  useEffect(() => {
    if (accountType === undefined || !locationId) {
      return;
    }
    if (accountType !== "customer") {
      setSaved(false);
      return;
    }
    let cancelled = false;
    const pending = localStorage.getItem(SAVE_INTENT_KEY) === locationId;
    if (pending) {
      localStorage.removeItem(SAVE_INTENT_KEY);
    }
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
        if (!cancelled) {
          setSaved(Boolean(d?.saved));
        }
      } catch {
        if (!cancelled) {
          setSaved(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountType, locationId, toast]);

  const toggleSave = async () => {
    if (accountType !== "customer") {
      localStorage.setItem(SAVE_INTENT_KEY, locationId);
      const next = encodeURIComponent(window.location.pathname + window.location.search);
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
      `/api/restaurants/${encodeURIComponent(businessUsername)}/${encodeURIComponent(locationId)}`,
    )
      .then((res) => {
        if (cancelled) {
          return;
        }
        setRestaurant(res.restaurant ?? null);
        setVisibleReviewCount(REVIEWS_PAGE_SIZE);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message || "Restaurant Not Found.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessUsername, locationId, refreshKey]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [businessUsername, locationId]);

  const visibleSections = useMemo(() => {
    if (!restaurant) {
      return [] as Array<{ id: string; label: string }>;
    }
    const list: Array<{ id: string; label: string }> = [{ id: "overview", label: "Overview" }];
    if (restaurant.photos.length > 0) {
      list.push({ id: "photos", label: "Photos" });
    }
    if (restaurant.menu.length > 0 || Boolean(restaurant.menuUrl)) {
      list.push({ id: "menu", label: "Menu" });
    }
    list.push({ id: "reviews", label: "Reviews" });
    const hasDetails =
      Boolean(restaurant.address) ||
      Boolean(restaurant.phone) ||
      Boolean(restaurant.website) ||
      restaurant.cuisineTypes.length > 0 ||
      Boolean(restaurant.priceRange) ||
      Boolean(restaurant.openingHours);
    if (hasDetails) {
      list.push({ id: "details", label: "Details" });
    }
    return list;
  }, [restaurant]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    if (visibleSections.length === 0) {
      return;
    }
    setActiveSection(visibleSections[0].id);
    const ids = visibleSections.map((s) => s.id);
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            seen.add(e.target.id);
          } else {
            seen.delete(e.target.id);
          }
        }
        const next = ids.find((id) => seen.has(id));
        if (next) {
          setActiveSection(next);
        }
      },
      { rootMargin: "-128px 0px -55% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [visibleSections]);

  if (loading) {
    return (
      <PageShell>
        <div className="container mx-auto flex items-center justify-center gap-2 px-4 py-24 text-slate-500">
          <HugeiconsIcon icon={Loading02Icon} className="h-5 w-5 animate-spin" /> Loading
          restaurant...
        </div>
      </PageShell>
    );
  }
  if (error || !restaurant) {
    return <NotFound />;
  }

  const r = restaurant;
  const locationText = r.shortAddress || r.city || r.area || r.address || "";
  const heroImage = r.bannerImageUrl || r.photos[0]?.url || null;
  const todayHours = r.openingHours?.[todayDayKey()] as DayHours | undefined;
  const queueHref = `/queue/${r.businessUsername}/${r.locationId}`;

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

  let locationSuffix: string;
  if (locationText) {
    locationSuffix = ` in ${locationText}`;
  } else {
    locationSuffix = "";
  }

  let heroContent: React.ReactNode;
  if (heroImage) {
    heroContent = <img src={heroImage} alt={r.name} className="h-full w-full object-cover" />;
  } else {
    heroContent = (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
        <HugeiconsIcon icon={Restaurant02Icon} className="h-10 w-10" />
      </div>
    );
  }

  let ratingSummary: React.ReactNode;
  if (r.rating != null) {
    let reviewWordLabel: string;
    if (r.reviewCount === 1) {
      reviewWordLabel = "Review";
    } else {
      reviewWordLabel = "Reviews";
    }
    ratingSummary = (
      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
        <HugeiconsIcon icon={StarIcon} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        {r.rating.toFixed(1)}
        <span className="font-normal text-slate-500">
          ({r.reviewCount} {reviewWordLabel})
        </span>
      </span>
    );
  } else {
    ratingSummary = <span>No Reviews Yet</span>;
  }

  let navStickyClass: string;
  if (navTakeover) {
    navStickyClass = "top-0 z-50";
  } else {
    navStickyClass = "top-16 z-30";
  }

  let aboutParagraph: React.ReactNode;
  if (r.description) {
    aboutParagraph = <p className="mt-3 whitespace-pre-line text-slate-700">{r.description}</p>;
  } else {
    aboutParagraph = <p className="mt-3 text-slate-600">{r.tagline}</p>;
  }

  let photoWordLabel: string;
  if (r.photos.length === 1) {
    photoWordLabel = "Photo";
  } else {
    photoWordLabel = "Photos";
  }

  let reviewsHeading = "Reviews";
  if (r.reviewCount > 0) {
    reviewsHeading = "What Diners Are Saying";
  }

  let reviewsSummaryBlock: React.ReactNode;
  if (r.reviewCount > 0) {
    reviewsSummaryBlock = <ReviewsSummary rating={r.rating ?? 0} count={r.reviewCount} />;
  } else {
    reviewsSummaryBlock = (
      <p className="text-sm text-slate-500">
        No reviews yet. Be the first to share your experience.
      </p>
    );
  }

  let orderedReviews: Review[];
  if (myReviewId) {
    orderedReviews = [
      ...r.reviews.filter((rv) => rv.id === myReviewId),
      ...r.reviews.filter((rv) => rv.id !== myReviewId),
    ];
  } else {
    orderedReviews = r.reviews;
  }

  let addressValue: React.ReactNode;
  if (r.googleMapsUrl) {
    addressValue = (
      <a
        href={r.googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-slate-900 underline-offset-4 hover:underline"
      >
        {r.address}
      </a>
    );
  } else {
    addressValue = r.address;
  }

  return (
    <PageShell hideHeader={navTakeover}>
      <SEO
        title={`${r.name} | SeatPing`}
        description={`Book a table or join the queue at ${r.name}${locationSuffix} with SeatPing.`}
        canonical={`/${r.businessUsername}/${r.locationId}`}
      />
      <div className="relative h-56 w-full overflow-hidden bg-slate-100 sm:h-72 md:h-96">
        {heroContent}
        {r.photos.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="absolute bottom-4 right-4 shadow-sm"
            onClick={() => setPhotosOpen(true)}
          >
            <HugeiconsIcon icon={Image01Icon} className="h-4 w-4" />
            <span>View Photos</span>
          </Button>
        )}
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8 md:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl sm:text-4xl font-semibold text-slate-900">{r.name}</h1>
              <SaveButton saved={saved} busy={saveBusy} onClick={toggleSave} className="shrink-0" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              {ratingSummary}
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
                <span className="inline-flex basis-full items-center gap-1 sm:basis-auto">
                  <span className="hidden text-slate-300 sm:inline">·</span>
                  <HugeiconsIcon icon={Location01Icon} className="h-3.5 w-3.5 text-slate-400" />
                  {locationText}
                </span>
              )}
            </div>
            {(() => {
              const status = getRestaurantStatus(r.openingHours);
              if (!status) {
                return null;
              }
              return (
                <div className="mt-1.5 text-sm">
                  <span className={status.color}>{status.text}</span>
                </div>
              );
            })()}
            {r.tagline && <p className="mt-3 text-sm sm:text-base text-slate-600">{r.tagline}</p>}

            {!isLgUp && <div className="mt-6">{actionCard}</div>}

            <div ref={navSentinelRef} aria-hidden className="h-px" />

            {visibleSections.length > 1 && (
              <nav
                className={cn(
                  "sticky -mx-4 mt-8 border-b border-slate-200 bg-white/95 px-4 backdrop-blur",
                  navStickyClass,
                )}
              >
                <div className="flex gap-2 overflow-x-auto py-3">
                  {visibleSections.map((s) => {
                    const isActive = activeSection === s.id;
                    let sectionAriaCurrent: "true" | undefined;
                    let sectionClass: string;
                    if (isActive) {
                      sectionAriaCurrent = "true";
                      sectionClass = "border-slate-900 bg-slate-900 text-white";
                    } else {
                      sectionAriaCurrent = undefined;
                      sectionClass =
                        "border-slate-200 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-900";
                    }
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => scrollToSection(s.id)}
                        aria-current={sectionAriaCurrent}
                        className={cn(
                          "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                          sectionClass,
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </nav>
            )}

            <div className="mt-8 space-y-12">
              <section id="overview" className="scroll-mt-32 space-y-6">
                {(r.description || r.tagline) && (
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                      About {r.name}
                    </h2>
                    {aboutParagraph}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {r.cuisineTypes.length > 0 && (
                    <OverviewRow
                      icon={Restaurant02Icon}
                      label="Cuisine"
                      value={r.cuisineTypes.join(", ")}
                    />
                  )}
                  {r.priceRange && (
                    <OverviewRow icon={DollarCircleIcon} label="Price range" value={r.priceRange} />
                  )}
                  {locationText && (
                    <OverviewRow icon={Location01Icon} label="Location" value={locationText} />
                  )}
                  {todayHours && (
                    <OverviewRow
                      icon={Clock01Icon}
                      label="Today's hours"
                      value={formatHoursForDay(todayHours)}
                    />
                  )}
                </div>
              </section>

              {r.photos.length > 0 && (
                <section id="photos" className="scroll-mt-32">
                  <h2 className="mb-4 text-lg sm:text-xl font-semibold text-slate-900">
                    {r.photos.length} {photoWordLabel}
                  </h2>
                  <PhotosGrid photos={r.photos} onShowAll={() => setPhotosOpen(true)} />
                </section>
              )}

              {(r.menu.length > 0 || r.menuUrl) && (
                <section id="menu" className="scroll-mt-32 space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Menu</h2>
                    <p className="text-sm text-slate-600">Menu from {r.name}.</p>
                  </div>
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
                  {r.menu.length > 0 && <MenuList items={r.menu} fallbackCurrency={r.currency} />}
                </section>
              )}

              <section id="reviews" className="scroll-mt-32 space-y-4">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                  {reviewsHeading}
                </h2>

                {reviewsSummaryBlock}

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
                      {orderedReviews.slice(0, visibleReviewCount).map((rv) => (
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

              <section id="details" className="scroll-mt-32 space-y-6">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Details</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {r.address && (
                    <DetailRow icon={Location01Icon} label="Location" value={addressValue} />
                  )}
                  {r.phone && (
                    <DetailRow
                      icon={Call02Icon}
                      label="Phone number"
                      value={
                        <a
                          href={`tel:${r.phone}`}
                          className="text-slate-900 underline-offset-4 hover:underline"
                        >
                          {formatEnteredPhone(r.phone)}
                        </a>
                      }
                    />
                  )}
                  {r.cuisineTypes.length > 0 && (
                    <DetailRow
                      icon={Restaurant02Icon}
                      label="Cuisines"
                      value={r.cuisineTypes.join(", ")}
                    />
                  )}
                  {r.priceRange && (
                    <DetailRow icon={DollarCircleIcon} label="Price" value={r.priceRange} />
                  )}
                  {r.website && (
                    <DetailRow
                      icon={GlobeIcon}
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
                    <DetailRow icon={InstagramIcon} label="Instagram" value={r.instagram} />
                  )}
                </div>

                {r.openingHours && (
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Hours of Operation</h3>
                    <div className="mt-3 divide-y divide-slate-100">
                      {DAYS.map((d) => {
                        const day = r.openingHours?.[d] as DayHours | undefined;
                        return (
                          <div key={d} className="flex items-center justify-between py-2 text-sm">
                            <span className="font-medium text-slate-700">{formatDayLabel(d)}</span>
                            <span className="text-slate-500">{formatHoursForDay(day)}</span>
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

          {isLgUp && (
            <aside>
              <div className="premium-scroll sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden pr-1 pb-4">
                {actionCard}
              </div>
            </aside>
          )}
        </div>
      </div>

      <PhotosModal
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        restaurantName={r.name}
        photos={r.photos}
      />

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

function PageShell({
  children,
  hideHeader = false,
}: {
  children: React.ReactNode;
  hideHeader?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background pt-14 sm:pt-16">
      {!hideHeader && <Header showSearch />}
      {children}
      <Footer />
    </div>
  );
}

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
  let label: string;
  let savedClass: string;
  if (saved) {
    label = "Saved";
    savedClass = "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100";
  } else {
    label = "Save";
    savedClass =
      "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border p-2 text-sm font-medium transition-colors disabled:opacity-60 sm:px-4 sm:py-2",
        savedClass,
        className,
      )}
    >
      <HugeiconsIcon
        icon={FavouriteIcon}
        className={cn("h-4 w-4", saved && "fill-rose-500 text-rose-500")}
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function OverviewRow({
  icon,
  label,
  value,
}: {
  icon: IconSvgElement;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <HugeiconsIcon icon={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-800 break-words">{value}</p>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: IconSvgElement;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <HugeiconsIcon icon={icon} className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <div className="mt-0.5 text-sm text-slate-600 break-words">{value}</div>
      </div>
    </div>
  );
}

function PhotosGrid({ photos, onShowAll }: { photos: Photo[]; onShowAll: () => void }) {
  if (photos.length === 0) {
    return null;
  }

  const tileBase =
    "group relative overflow-hidden rounded-xl border border-slate-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30";

  if (photos.length === 1) {
    return (
      <button type="button" onClick={onShowAll} className={cn(tileBase, "block w-full")}>
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

  const [first, ...rest] = photos;
  const small = rest.slice(0, 4);
  const hidden = photos.length - 5;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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

      <div className="grid grid-cols-2 grid-rows-2 gap-2">
        {small.map((p, i) => {
          const isLast = i === small.length - 1;
          const showOverlay = isLast && hidden > 0;
          let tileAriaLabel: string;
          if (showOverlay) {
            tileAriaLabel = `See all ${hidden + 5} photos`;
          } else {
            tileAriaLabel = "View photos";
          }
          return (
            <button
              key={p.id}
              type="button"
              onClick={onShowAll}
              aria-label={tileAriaLabel}
              className={cn(tileBase, "aspect-[4/3] md:aspect-auto md:h-full")}
            >
              <img
                src={p.url}
                alt={p.altText || "Restaurant photo"}
                className="h-full w-full object-cover transition group-hover:brightness-95"
              />
              {showOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white transition group-hover:bg-black/65">
                  <span className="text-lg font-semibold sm:text-xl">+{hidden} More</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  let photosContent: React.ReactNode;
  if (photos.length === 0) {
    photosContent = <p className="py-6 text-sm text-slate-500">No photos yet.</p>;
  } else {
    photosContent = (
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
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-[94vw] flex-col gap-0 overflow-hidden rounded-xl p-0 max-sm:overflow-hidden max-sm:p-0 sm:max-w-[88vw] lg:max-w-[960px]">
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4 sm:px-6 sm:pr-12 sm:pt-6">
          <DialogTitle>Photos</DialogTitle>
          <DialogDescription className="break-words">{restaurantName}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {photosContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MENU_PREVIEW_ITEMS = 4;

function MenuList({
  items,
  fallbackCurrency,
}: {
  items: MenuItem[];
  fallbackCurrency: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const groups = new Map<string, MenuItem[]>();
  for (const it of items) {
    const key = it.category?.trim() || "Menu";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(it);
  }

  const collapsible = items.length > MENU_PREVIEW_ITEMS;
  let limit: number;
  if (!collapsible || expanded) {
    limit = Infinity;
  } else {
    limit = MENU_PREVIEW_ITEMS;
  }

  const visibleGroups: [string, MenuItem[]][] = [];
  let shown = 0;
  for (const [cat, list] of groups) {
    if (shown >= limit) {
      break;
    }
    const take = list.slice(0, Math.max(0, limit - shown));
    if (take.length) {
      visibleGroups.push([cat, take]);
    }
    shown += take.length;
  }

  const priceLabel = (it: MenuItem) => {
    if (typeof it.price === "number" && Number.isFinite(it.price)) {
      return `${it.currency || fallbackCurrency || ""} ${it.price.toLocaleString("en-US")}`.trim();
    }
    return "";
  };

  let expandToggleLabel: string;
  if (expanded) {
    expandToggleLabel = "Show Less";
  } else {
    expandToggleLabel = "View Full Menu";
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200">
        {visibleGroups.map(([cat, list]) => (
          <section key={cat} className="border-t border-slate-200 py-6">
            <h3 className="text-lg font-semibold text-slate-900">{cat}</h3>
            <div className="mt-4 grid grid-cols-1 gap-x-12 gap-y-5 sm:grid-cols-2">
              {list.map((it, i) => (
                <div key={`${it.name}-${i}`} className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{it.name}</p>
                    {it.description && (
                      <p className="mt-0.5 text-sm text-slate-500">{it.description}</p>
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
            {expandToggleLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewsSummary({ rating, count }: { rating: number; count: number }) {
  let reviewPlural: string;
  if (count === 1) {
    reviewPlural = "";
  } else {
    reviewPlural = "s";
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-2xl font-semibold text-slate-900">{rating.toFixed(1)}</span>
        <HugeiconsIcon icon={StarIcon} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
      </div>
      <span className="text-sm text-slate-500">
        {count} Review{reviewPlural}
      </span>
    </div>
  );
}

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

  if (accountType === undefined) {
    return null;
  }

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

  let ratingHint: string;
  if (shown) {
    ratingHint = `${shown}/5`;
  } else {
    ratingHint = "Tap to Rate";
  }

  let submitLabel: string;
  if (submitting) {
    submitLabel = "Posting...";
  } else {
    submitLabel = "Post Review";
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Write a Review</p>
      <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          let starPlural: string;
          if (n === 1) {
            starPlural = "";
          } else {
            starPlural = "s";
          }
          let starClass: string;
          if (n <= shown) {
            starClass = "h-6 w-6 fill-yellow-400 text-yellow-400";
          } else {
            starClass = "h-6 w-6 fill-slate-200 text-slate-200";
          }
          return (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${starPlural}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
            >
              <HugeiconsIcon icon={StarIcon} className={starClass} />
            </button>
          );
        })}
        <span className="ml-2 text-sm text-slate-500">{ratingHint}</span>
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Share what you liked, the vibe, the dishes you tried..."
        rows={3}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitLabel}
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
  let ownCardClass: string;
  if (isOwn) {
    ownCardClass = "border-slate-300 bg-slate-50/60";
  } else {
    ownCardClass = "border-slate-200";
  }

  let headerTrailing: React.ReactNode;
  if (isOwn) {
    headerTrailing = (
      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
        Your Review
      </span>
    );
  } else {
    headerTrailing = (
      <div className="flex shrink-0 items-center gap-1.5">
        <Stars rating={review.rating} />
        <span className="text-sm font-medium text-slate-700">{review.rating.toFixed(1)}</span>
      </div>
    );
  }

  let serviceTypeLabel: string | null | undefined;
  if (review.serviceType === "queue") {
    serviceTypeLabel = "Walk-in";
  } else if (review.serviceType === "reservation") {
    serviceTypeLabel = "Reservation";
  } else {
    serviceTypeLabel = review.serviceType;
  }

  return (
    <div className={cn("rounded-lg border p-3", ownCardClass)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 line-clamp-1">
            {review.customerName || review.customerUsername || "Anonymous"}
          </p>
          {review.customerName && review.customerUsername && (
            <p className="truncate text-xs text-slate-500">@{review.customerUsername}</p>
          )}
        </div>
        {headerTrailing}
      </div>

      {isOwn && (
        <div className="mt-2 flex items-center gap-1.5">
          <Stars rating={review.rating} />
          <span className="text-sm font-medium text-slate-700">{review.rating.toFixed(1)}</span>
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="ml-auto h-7 gap-1 px-2 text-xs text-slate-600 hover:text-slate-900"
            >
              <HugeiconsIcon icon={Edit03Icon} className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      )}
      {review.description && (
        <p className="mt-2 text-sm text-slate-700 break-words">{review.description}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span>{formatDate(review.createdAt)}</span>
        {typeof review.partySize === "number" && <span>· Party of {review.partySize}</span>}
        {review.serviceType && <span>· {serviceTypeLabel}</span>}
      </div>

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
