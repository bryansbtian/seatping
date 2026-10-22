import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowUpRight01Icon, Delete02Icon, StarIcon } from "@hugeicons/core-free-icons";
import { api } from "@/lib/api";
import { invalidateRestaurantConfiguration } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import ListSkeleton from "@/components/ListSkeleton";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import AddFeaturedRestaurantDialog from "@/components/featured-restaurants/AddFeaturedRestaurantDialog";
import FeaturedSortableList from "@/components/featured-restaurants/FeaturedSortableList";
import {
  featuredRestaurantName,
  type FeaturedRestaurant,
} from "@/components/featured-restaurants/types";

export default function FeaturedRestaurantsManager() {
  const { toast } = useToast();
  const [featured, setFeatured] = useState<FeaturedRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<FeaturedRestaurant | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await api("/admin/featured-restaurants", { signal: controller.signal });
        if (!controller.signal.aborted) {
          setFeatured(result.featured || []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [revision]);

  const refreshHomepage = () => {
    void invalidateRestaurantConfiguration().catch(() => {});
  };

  const reorder = async (next: FeaturedRestaurant[]) => {
    if (saving.current) {
      return;
    }
    const previous = featured;
    saving.current = true;
    setBusy(true);
    setFeedback("Saving Order");
    setFeatured(next);
    try {
      const response = await api("/admin/featured-restaurants/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ids: next.map((restaurant) => restaurant.id) }),
      });
      setFeatured(response.featured);
      setFeedback("Order Saved");
      refreshHomepage();
    } catch (failure: unknown) {
      setFeatured(previous);
      setFeedback("");
      let description = "The previous order has been restored. Please try again.";
      if (failure instanceof Error) {
        description = failure.message;
      }
      toast({ title: "Unable To Save Order", description, variant: "destructive" });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removeTarget || saving.current) {
      return;
    }
    saving.current = true;
    setBusy(true);
    setFeedback("");
    try {
      await api(`/admin/featured-restaurants/${removeTarget.id}`, { method: "DELETE" });
      setFeatured((current) => current.filter((restaurant) => restaurant.id !== removeTarget.id));
      refreshHomepage();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  let content;
  if (loading) {
    content = <ListSkeleton fill label="Loading Featured Restaurants" />;
  } else if (error) {
    content = (
      <BusinessEmptyState
        icon={StarIcon}
        title="Unable To Load Featured Restaurants"
        body="Please try again to load featured restaurants."
      >
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
          Try Again
        </Button>
      </BusinessEmptyState>
    );
  } else if (featured.length === 0) {
    content = (
      <BusinessEmptyState
        icon={StarIcon}
        title="No Featured Restaurants Yet"
        body="Add a restaurant to choose which locations appear on the homepage."
      />
    );
  } else {
    content = (
      <FeaturedSortableList
        items={featured}
        disabled={busy}
        onReorder={(next) => void reorder(next)}
        renderItem={(restaurant, handle) => {
          const name = featuredRestaurantName(restaurant);
          const location = restaurant.location;
          const locationDetails = [location?.displayName || location?.name, location?.address]
            .filter(Boolean)
            .join(" · ");
          const shortLocation =
            location?.displayName ||
            location?.name ||
            location?.area ||
            location?.city ||
            location?.address.split(",")[0];
          return (
            <div className="flex min-w-0 items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
              {handle}
              <div className="min-w-0 flex-1">
                <p className="min-w-0 break-words text-body font-medium text-ink">{name}</p>
                {locationDetails && (
                  <p className="mt-1 break-words text-caption text-ink-subtle">
                    <span className="sm:hidden">{shortLocation}</span>
                    <span className="hidden sm:inline">{locationDetails}</span>
                  </p>
                )}
              </div>
              <Button
                variant="destructiveOutline"
                size="sm"
                className="shrink-0 max-sm:control-icon"
                disabled={busy}
                aria-label={`Delete ${name}`}
                onClick={() => setRemoveTarget(restaurant)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </div>
          );
        }}
      />
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink md:text-2xl">Featured Restaurants</h1>
          <p className="mt-1 text-body text-ink-subtle">
            Manage which restaurants appear on the homepage.
          </p>
        </div>
        <Button
          className="ml-auto shrink-0 max-sm:control-icon"
          aria-label="Add Restaurant"
          disabled={busy}
          onClick={() => setAddOpen(true)}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          <span className="hidden sm:inline">Add Restaurant</span>
        </Button>
      </div>
      <Card
        data-testid="admin-content-card"
        aria-label="Featured Restaurant List"
        aria-busy={busy}
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="ml-auto flex items-center gap-3">
            <span role="status" aria-live="polite" className="text-caption text-ink-subtle">
              {feedback}
            </span>
            <Button asChild variant="ghost" size="sm">
              <a href="/" target="_blank" rel="noopener noreferrer">
                View Homepage
                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" />
              </a>
            </Button>
          </div>
        </div>
        <CardContent className="flex min-w-0 flex-1 flex-col p-0">{content}</CardContent>
      </Card>
      <AddFeaturedRestaurantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          setRevision((value) => value + 1);
          refreshHomepage();
        }}
      />
      <ConfirmModal
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        title="Remove Featured Restaurant"
        description={`Remove ${removeTarget && featuredRestaurantName(removeTarget)} from the homepage featured list? The restaurant and its location will remain available.`}
        confirmText="Delete"
        loadingText="Removing..."
        onConfirm={remove}
        successMessage="Restaurant Removed"
        errorMessage="Unable To Remove Restaurant"
      />
    </>
  );
}
