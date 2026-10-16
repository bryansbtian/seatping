import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Restaurant02Icon, StarIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import RestaurantCardContent from "@/components/RestaurantCardContent";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchResult } from "@/lib/restaurantDiscovery";
import { getRestaurantImageProps } from "@/lib/restaurantImages";

function RestaurantImage({ restaurant }: { restaurant: SearchResult }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const url = restaurant.bannerImageUrl;
  let content = (
    <div
      className="absolute inset-0 flex items-center justify-center text-ink-subtle"
      role="img"
      aria-label={`Photo unavailable for ${restaurant.name}`}
    >
      <HugeiconsIcon icon={Restaurant02Icon} className="size-8" />
    </div>
  );
  if (url && failedUrl !== url) {
    content = (
      <>
        {loadedUrl !== url && <Skeleton className="absolute inset-0 rounded-none" />}
        <img
          {...getRestaurantImageProps(
            url,
            [320, 480, 640, 960],
            "(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw",
          )}
          alt={restaurant.name}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
          className="absolute inset-0 size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        />
      </>
    );
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
      {content}
      {restaurant.featured && (
        <span className="absolute left-3 top-3 inline-flex h-badge items-center gap-1 rounded-badge bg-background px-2 text-caption font-medium text-foreground shadow-sm">
          <HugeiconsIcon icon={StarIcon} className="size-3" />
          Featured
        </span>
      )}
    </div>
  );
}

export default function RestaurantCard({
  restaurant,
  date,
  time,
  people,
}: {
  restaurant: SearchResult;
  date: string;
  time: string;
  people: string;
}) {
  const queueDescriptionId = useId();
  let detailsPath: string | null = null;
  let queuePath: string | null = null;
  if (restaurant.businessUsername && restaurant.locationId) {
    const username = encodeURIComponent(restaurant.businessUsername);
    const locationId = encodeURIComponent(restaurant.locationId);
    detailsPath = `/${username}/${locationId}`;
    queuePath = `/queue/${username}/${locationId}`;
  }
  const params = new URLSearchParams({ date, time, book: "1" });
  if (people !== "large") {
    params.set("partySize", people);
  }
  const address =
    restaurant.shortAddress || restaurant.city || restaurant.area || restaurant.address;
  const canBook = Boolean(detailsPath && restaurant.reservationsEnabled);
  const canQueue = Boolean(queuePath && restaurant.queueEnabled);
  let title: ReactNode = restaurant.name;
  let image = <RestaurantImage restaurant={restaurant} />;
  if (detailsPath) {
    title = (
      <Link
        to={detailsPath}
        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={restaurant.name}
      >
        {restaurant.name}
      </Link>
    );
    image = (
      <Link
        to={detailsPath}
        aria-label={`View ${restaurant.name}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <RestaurantImage restaurant={restaurant} />
      </Link>
    );
  }
  const actionClass = "w-full min-w-0 justify-center whitespace-nowrap px-3 max-[320px]:px-2";
  const disabledClass = `${actionClass} border-border bg-muted/40 text-ink-subtle disabled:opacity-100 dark:border-border dark:bg-muted dark:text-ink-subtle`;
  let bookAction = (
    <Button
      disabled
      variant="outline"
      className={`${disabledClass} text-ink dark:text-ink`}
      aria-label={`Reservations Unavailable at ${restaurant.name}`}
      title="Reservations Unavailable"
    >
      <span className="whitespace-normal leading-none">Reservations Unavailable</span>
    </Button>
  );
  if (canBook && detailsPath) {
    bookAction = (
      <Button
        asChild
        className={`${actionClass} dark:border-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90`}
      >
        <Link
          to={`${detailsPath}?${params.toString()}`}
          aria-label={`Book Table at ${restaurant.name}`}
        >
          Book Table
        </Link>
      </Button>
    );
  }
  let queueAction = (
    <Button
      disabled
      variant="outline"
      className={disabledClass}
      aria-label={`Join Queue at ${restaurant.name}`}
      title="Virtual queue unavailable"
      aria-describedby={queueDescriptionId}
    >
      Join Queue
    </Button>
  );
  if (canQueue && queuePath) {
    queueAction = (
      <Button
        asChild
        variant="outline"
        className={`${actionClass} dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted`}
      >
        <Link to={queuePath} aria-label={`Join Queue at ${restaurant.name}`}>
          Join Queue
        </Link>
      </Button>
    );
  }
  return (
    <article aria-label={restaurant.name} className="flex min-w-0 flex-col">
      <Card className="flex h-full flex-1 flex-col overflow-hidden border-border shadow-sm transition-shadow duration-300 hover:shadow-xl">
        {image}
        <RestaurantCardContent
          name={restaurant.name}
          title={title}
          rating={restaurant.rating}
          reviewCount={restaurant.reviewCount}
          cuisine={restaurant.cuisine}
          priceRange={restaurant.priceRange}
          locationText={address}
        >
          {bookAction}
          {queueAction}
        </RestaurantCardContent>
        {!canQueue && (
          <span id={queueDescriptionId} className="sr-only">
            Virtual Queue Unavailable
          </span>
        )}
      </Card>
    </article>
  );
}
