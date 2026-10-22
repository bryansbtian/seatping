import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ListSkeleton from "@/components/ListSkeleton";
import type { FeaturedBusiness, FeaturedLocation } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<void> | void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function locationLabel(location: FeaturedLocation): string {
  return (
    location.displayName || location.name || location.area || location.city || "Unnamed Location"
  );
}

export default function AddFeaturedRestaurantDialog({ open, onOpenChange, onAdded }: Props) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FeaturedBusiness[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [business, setBusiness] = useState<FeaturedBusiness | null>(null);
  const [locations, setLocations] = useState<FeaturedLocation[] | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const locationController = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchController.current?.abort();
      locationController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (open) {
      return;
    }
    searchController.current?.abort();
    locationController.current?.abort();
    setUsername("");
    setSearching(false);
    setResults(null);
    setSearchError(null);
    setBusiness(null);
    setLocations(null);
    setLoadingLocations(false);
    setLocationError(null);
    setLocationId("");
    setAddError(null);
  }, [open]);

  const clearSelection = () => {
    locationController.current?.abort();
    setBusiness(null);
    setLocations(null);
    setLoadingLocations(false);
    setLocationError(null);
    setLocationId("");
    setAddError(null);
  };

  const runSearch = async () => {
    const query = username.trim();
    if (!query || submitting.current) {
      return;
    }
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    clearSelection();
    setSearching(true);
    setResults(null);
    setSearchError(null);
    try {
      const response = await api(`/admin/businesses/search?username=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      let nextResults: FeaturedBusiness[] = [];
      if (Array.isArray(response.businesses)) {
        nextResults = response.businesses;
      }
      setResults(nextResults);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      const message = errorMessage(error, "Please try searching again.");
      setSearchError(message);
      toast({ title: "Search Failed", description: message, variant: "destructive" });
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  };

  const selectBusiness = async (selected: FeaturedBusiness) => {
    locationController.current?.abort();
    const controller = new AbortController();
    locationController.current = controller;
    setBusiness(selected);
    setLocations(null);
    setLocationId("");
    setLocationError(null);
    setAddError(null);
    setLoadingLocations(true);
    try {
      const response = await api(`/admin/businesses/${encodeURIComponent(selected.id)}/locations`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      let nextLocations: FeaturedLocation[] = [];
      if (Array.isArray(response.locations)) {
        nextLocations = response.locations;
      }
      setLocations(nextLocations);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      const message = errorMessage(error, "Please try loading locations again.");
      setLocationError(message);
      toast({ title: "Unable To Load Locations", description: message, variant: "destructive" });
    } finally {
      if (!controller.signal.aborted) {
        setLoadingLocations(false);
      }
    }
  };

  const addRestaurant = async () => {
    if (!business || !locationId || submitting.current) {
      return;
    }
    submitting.current = true;
    setAdding(true);
    setAddError(null);
    try {
      await api("/admin/featured-restaurants", {
        method: "POST",
        body: JSON.stringify({ businessId: business.id, locationId, isActive: true }),
      });
    } catch (error: unknown) {
      if (mounted.current) {
        const message = errorMessage(error, "Please try adding the restaurant again.");
        setAddError(message);
        toast({ title: "Unable To Add Restaurant", description: message, variant: "destructive" });
      }
      submitting.current = false;
      if (mounted.current) {
        setAdding(false);
      }
      return;
    }
    submitting.current = false;
    if (!mounted.current) {
      return;
    }
    setAdding(false);
    toast({ title: "Restaurant Added", description: "Saved to the end of the featured list." });
    onOpenChange(false);
    try {
      await onAdded();
    } catch {
      toast({
        title: "Unable To Refresh Restaurants",
        description: "The restaurant was added. Refresh the page to see the updated list.",
        variant: "destructive",
      });
    }
  };

  let searchIcon = <HugeiconsIcon icon={Search01Icon} className="size-4" />;
  if (searching) {
    searchIcon = <HugeiconsIcon icon={Loading02Icon} className="size-4 animate-spin" />;
  }

  let searchContent;
  if (searching) {
    searchContent = <ListSkeleton rows={2} label="Searching Businesses" className="p-0 md:p-0" />;
  } else if (searchError) {
    searchContent = (
      <p role="alert" className="text-body text-red-600">
        {searchError}
      </p>
    );
  } else if (results && results.length === 0) {
    searchContent = (
      <p className="text-body text-ink-subtle">Try another username to find a business.</p>
    );
  } else if (results && !business) {
    searchContent = (
      <div className="space-y-2" role="group" aria-label="Matching Businesses">
        {results.map((result) => (
          <Button
            key={result.id}
            type="button"
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
            onClick={() => void selectBusiness(result)}
          >
            <span className="min-w-0 break-words">
              <span className="block text-body font-medium">{result.name || result.username}</span>
              <span className="block text-label text-ink-subtle">@{result.username}</span>
            </span>
          </Button>
        ))}
      </div>
    );
  }

  let locationContent;
  if (loadingLocations) {
    locationContent = <ListSkeleton rows={2} label="Loading Locations" className="p-0 md:p-0" />;
  } else if (locationError && business) {
    const selected = business;
    locationContent = (
      <div className="space-y-2">
        <p role="alert" className="text-body text-red-600">
          {locationError}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void selectBusiness(selected)}
        >
          Try Again
        </Button>
      </div>
    );
  } else if (locations && locations.length === 0) {
    locationContent = (
      <p className="text-body text-ink-subtle">This business has no locations yet.</p>
    );
  } else if (locations) {
    locationContent = (
      <div className="space-y-2">
        <Label htmlFor="featured-location">Location</Label>
        <Select value={locationId} onValueChange={setLocationId} disabled={adding}>
          <SelectTrigger id="featured-location" className="w-full min-w-0 [&>span]:truncate">
            <SelectValue placeholder="Select a Location" />
          </SelectTrigger>
          <SelectContent
            data-testid="featured-location-options"
            className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
          >
            {locations.map((location) => (
              <SelectItem
                key={location.id}
                value={location.id}
                title={locationLabel(location)}
                className="[&>span:last-child]:min-w-0 [&>span:last-child]:truncate"
              >
                {locationLabel(location)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  let addLabel = "Add Restaurant";
  if (adding) {
    addLabel = "Adding Restaurant";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting.current) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Restaurant</DialogTitle>
          <DialogDescription>
            Choose a business and location to feature on the homepage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="featured-business-username">Business Username</Label>
            <div className="flex min-w-0 gap-2">
              <Input
                id="featured-business-username"
                value={username}
                onChange={(event) => {
                  searchController.current?.abort();
                  setSearching(false);
                  setSearchError(null);
                  setResults(null);
                  clearSelection();
                  setUsername(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder="Search by Username"
                disabled={adding}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void runSearch()}
                disabled={searching || adding || !username.trim()}
              >
                {searchIcon}Search
              </Button>
            </div>
          </div>
          {searchContent}
          {business && (
            <div className="space-y-4 rounded-xl border border-slate-200 p-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0 break-words">
                  <p className="text-body font-medium text-ink">
                    {business.name || business.username}
                  </p>
                  <p className="text-label text-ink-subtle">@{business.username}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={adding}
                  onClick={clearSelection}
                >
                  Change
                </Button>
              </div>
              {locationContent}
            </div>
          )}
          {addError && (
            <p role="alert" className="text-body text-red-600">
              {addError}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            disabled={adding}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={adding || !business || !locationId || loadingLocations}
            onClick={() => void addRestaurant()}
          >
            {adding && <HugeiconsIcon icon={Loading02Icon} className="size-4 animate-spin" />}
            {addLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
