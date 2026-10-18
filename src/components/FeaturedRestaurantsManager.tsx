import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { invalidateRestaurantConfiguration } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ListSkeleton from "@/components/ListSkeleton";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Loading02Icon,
  Search01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";

type Business = {
  id: string;
  username: string;
  name?: string | null;
  email?: string | null;
};
type Location = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  address: string;
  area?: string | null;
  city?: string | null;
};
type Featured = {
  id: string;
  businessId: string;
  locationId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  business: Business | null;
  location: Location | null;
};

function locationLabel(loc: Location) {
  const name = loc.displayName || loc.name || "Unnamed location";
  if (loc.address) {
    return `${name}, ${loc.address}`;
  }
  return name;
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

export default function FeaturedRestaurantsManager() {
  const { toast } = useToast();

  const [usernameQuery, setUsernameQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Business[] | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [adding, setAdding] = useState(false);

  const [featured, setFeatured] = useState<Featured[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [orderEdits, setOrderEdits] = useState<Record<string, string>>({});

  const loadFeatured = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await api("/admin/featured-restaurants");
      let nextFeatured: Featured[];
      if (Array.isArray(res.featured)) {
        nextFeatured = res.featured;
      } else {
        nextFeatured = [];
      }
      setFeatured(nextFeatured);
    } catch (e: any) {
      setListError(e?.message || "Failed to load featured restaurants.");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadFeatured();
  }, []);

  const runSearch = async () => {
    const q = usernameQuery.trim();
    if (!q) {
      return;
    }
    setSearching(true);
    setSearchResults(null);
    setSelectedBusiness(null);
    setLocations(null);
    setSelectedLocationId("");
    try {
      const res = await api(`/admin/businesses/search?username=${encodeURIComponent(q)}`);
      let nextResults: Business[];
      if (Array.isArray(res.businesses)) {
        nextResults = res.businesses;
      } else {
        nextResults = [];
      }
      setSearchResults(nextResults);
    } catch (e: any) {
      toast({
        title: "Search failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const selectBusiness = async (b: Business) => {
    setSelectedBusiness(b);
    setSearchResults(null);
    setLocations(null);
    setSelectedLocationId("");
    setLoadingLocations(true);
    try {
      const res = await api(`/admin/businesses/${b.id}/locations`);
      let nextLocations: Location[];
      if (Array.isArray(res.locations)) {
        nextLocations = res.locations;
      } else {
        nextLocations = [];
      }
      setLocations(nextLocations);
    } catch (e: any) {
      toast({
        title: "Failed to load locations",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
      setLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  };

  const resetForm = () => {
    setUsernameQuery("");
    setSearchResults(null);
    setSelectedBusiness(null);
    setLocations(null);
    setSelectedLocationId("");
    setSortOrder("0");
    setIsActive(true);
  };

  const addFeatured = async () => {
    if (!selectedBusiness || !selectedLocationId) {
      return;
    }
    setAdding(true);
    try {
      await api("/admin/featured-restaurants", {
        method: "POST",
        body: JSON.stringify({
          businessId: selectedBusiness.id,
          locationId: selectedLocationId,
          sortOrder: Number(sortOrder) || 0,
          isActive,
        }),
      });
      toast({
        title: "Featured restaurant added",
        description: "It will now appear on the homepage if active.",
      });
      resetForm();
      await loadFeatured();
      await invalidateRestaurantConfiguration();
    } catch (e: any) {
      toast({
        title: "Failed to add",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (f: Featured, next: boolean) => {
    setFeatured((list) =>
      list.map((x) => {
        if (x.id === f.id) {
          return { ...x, isActive: next };
        }
        return x;
      }),
    );
    try {
      await api(`/admin/featured-restaurants/${f.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next }),
      });
    } catch (e: any) {
      setFeatured((list) =>
        list.map((x) => {
          if (x.id === f.id) {
            return { ...x, isActive: !next };
          }
          return x;
        }),
      );
      toast({
        title: "Failed to update",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveSortOrder = async (f: Featured) => {
    const raw = orderEdits[f.id];
    if (raw === undefined) {
      return;
    }
    if (raw.trim() === "") {
      setOrderEdits((e) => {
        const next = { ...e };
        delete next[f.id];
        return next;
      });
      toast({
        title: "Invalid sort order",
        description: "Enter a number.",
        variant: "destructive",
      });
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      toast({
        title: "Invalid sort order",
        description: "Enter a number.",
        variant: "destructive",
      });
      return;
    }
    if (Math.floor(value) === f.sortOrder) {
      return;
    }
    try {
      await api(`/admin/featured-restaurants/${f.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sortOrder: Math.floor(value) }),
      });
      setOrderEdits((e) => {
        const next = { ...e };
        delete next[f.id];
        return next;
      });
      await loadFeatured();
      await invalidateRestaurantConfiguration();
    } catch (e: any) {
      toast({
        title: "Failed to update sort order",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const removeFeatured = async (f: Featured) => {
    try {
      await api(`/admin/featured-restaurants/${f.id}`, { method: "DELETE" });
      setFeatured((list) => list.filter((x) => x.id !== f.id));
      toast({ title: "Removed from featured" });
    } catch (e: any) {
      toast({
        title: "Failed to remove",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  let searchButtonIcon;
  if (searching) {
    searchButtonIcon = <HugeiconsIcon icon={Loading02Icon} size={16} className="animate-spin" />;
  } else {
    searchButtonIcon = <HugeiconsIcon icon={Search01Icon} size={16} />;
  }

  let searchResultsContent;
  if (searchResults !== null) {
    if (searchResults.length === 0) {
      searchResultsContent = (
        <p className="text-sm text-red-600">No businesses found for "{usernameQuery.trim()}".</p>
      );
    } else {
      searchResultsContent = (
        <div className="space-y-1.5">
          {searchResults.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => selectBusiness(b)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="font-medium text-slate-900">@{b.username}</span>
                {b.name && <span className="ml-2 text-slate-500">{b.name}</span>}
              </span>
              <span className="shrink-0 text-xs text-indigo-600">Select</span>
            </button>
          ))}
        </div>
      );
    }
  }

  let locationsSection;
  if (loadingLocations) {
    locationsSection = <ListSkeleton rows={2} label="Loading Locations" className="px-0 md:px-0" />;
  } else if (locations && locations.length === 0) {
    locationsSection = (
      <p className="text-sm text-amber-600">This business has no locations yet.</p>
    );
  } else {
    locationsSection = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Location</Label>
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
              {(locations || []).map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {locationLabel(loc)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fr-sort">Sort Order (Optional)</Label>
          <Input
            id="fr-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 w-full">
            <div>
              <p className="text-sm font-medium text-slate-800">Active</p>
              <p className="text-xs text-muted-foreground">Show on homepage</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </div>
    );
  }

  let addButtonIcon;
  if (adding) {
    addButtonIcon = <HugeiconsIcon icon={Loading02Icon} size={16} className="animate-spin" />;
  } else {
    addButtonIcon = <HugeiconsIcon icon={Add01Icon} size={16} />;
  }

  let featuredListContent;
  if (loadingList) {
    featuredListContent = (
      <ListSkeleton fill label="Loading Featured Restaurants" className="p-0 md:p-0" />
    );
  } else if (listError) {
    featuredListContent = (
      <BusinessEmptyState
        icon={StarIcon}
        title="Unable To Load Featured Restaurants"
        body="We couldn't load featured restaurants right now. Please try again."
      >
        <Button type="button" variant="outline" onClick={loadFeatured}>
          Try Again
        </Button>
      </BusinessEmptyState>
    );
  } else if (featured.length === 0) {
    featuredListContent = (
      <BusinessEmptyState
        icon={StarIcon}
        title="No Featured Restaurants Yet"
        body="Search for a business above to feature one of its locations on the homepage."
      />
    );
  } else {
    featuredListContent = featured.map((f) => {
      let statusVariant: "success" | "neutral";
      let statusLabel: string;
      if (f.isActive) {
        statusVariant = "success";
        statusLabel = "Active";
      } else {
        statusVariant = "neutral";
        statusLabel = "Inactive";
      }

      let businessEmailSuffix: string;
      if (f.business?.email) {
        businessEmailSuffix = ` · ${f.business.email}`;
      } else {
        businessEmailSuffix = "";
      }

      return (
        <div
          key={f.id}
          className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900 break-words">
                {f.location?.displayName || f.location?.name || "Unnamed location"}
              </p>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <p className="text-sm text-slate-500 break-words">
              @{f.business?.username ?? "unknown"}
              {businessEmailSuffix}
            </p>
            {f.location?.address && (
              <p className="text-sm text-slate-500 break-words">{f.location.address}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Added {formatDate(f.createdAt)}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:shrink-0">
            <div className="flex items-center gap-2">
              <Label htmlFor={`order-${f.id}`} className="text-xs">
                Order
              </Label>
              <Input
                id={`order-${f.id}`}
                type="number"
                className="w-20"
                value={orderEdits[f.id] ?? String(f.sortOrder)}
                onChange={(e) => setOrderEdits((o) => ({ ...o, [f.id]: e.target.value }))}
                onBlur={() => saveSortOrder(f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground sm:hidden">Active</span>
              <Switch
                checked={f.isActive}
                onCheckedChange={(v) => toggleActive(f, v)}
                aria-label="Toggle active"
              />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructiveOutline"
                  size="sm"
                  aria-label="Remove Featured Restaurant"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={16} />
                  <span className="sm:hidden">Remove</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove featured restaurant?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes "{f.location?.displayName || f.location?.name || "this location"}"
                    from the homepage Featured Restaurants. The location itself is not deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeFeatured(f)} variant="destructive">
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      );
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Add Featured Restaurant</CardTitle>
          <CardDescription>
            Search a business by username, pick one of its locations, and feature it on the
            homepage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fr-username">Business Username</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="fr-username"
                value={usernameQuery}
                onChange={(e) => setUsernameQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="e.g. senopati-house"
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={runSearch}
                disabled={searching || !usernameQuery.trim()}
                className="w-full sm:w-auto"
              >
                {searchButtonIcon}
                Search
              </Button>
            </div>
          </div>

          {searchResults !== null && <div className="space-y-2">{searchResultsContent}</div>}

          {selectedBusiness && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">@{selectedBusiness.username}</p>
                  {selectedBusiness.email && (
                    <p className="text-xs text-slate-500">{selectedBusiness.email}</p>
                  )}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  Change
                </Button>
              </div>

              {locationsSection}

              <Button
                type="button"
                onClick={addFeatured}
                disabled={adding || !selectedLocationId}
                className="w-full sm:w-auto"
              >
                {addButtonIcon}
                Add Featured Restaurant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="admin-content-card" className="flex flex-1 flex-col">
        <CardHeader className="border-b border-slate-200 p-4 md:p-6">
          <CardTitle>Current Featured Restaurants</CardTitle>
          <CardDescription>
            Sorted by sort order, then newest. Inactive entries are hidden from the homepage.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 p-4 md:p-6">
          {featuredListContent}
        </CardContent>
      </Card>
    </div>
  );
}
