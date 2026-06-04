import { useRef, useState } from "react";
import { api, apiUpload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ImageIcon,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeSelect, ALL_DAY_TIME_OPTIONS } from "@/components/TimeSelect";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// ---------------------------------------------------------------------------
// Public restaurant profile editor. Reads/writes location.restaurantProfile
// (stored as JSON on the locations collection) plus the address + queue/
// reservation toggles, via PUT /auth/business/locations/:locationId.
//
// Public restaurant page lives at /:businessUsername/:locationId
// (see src/pages/Restaurant.tsx). No per-location slug is configured — each
// location's URL is derived from its id so multi-location businesses just work.
// ---------------------------------------------------------------------------

const CUISINE_OPTIONS = [
  "Indonesian",
  "Japanese",
  "Italian",
  "Chinese",
  "Korean",
  "Thai",
  "Western",
  "Seafood",
  "Café",
  "Fine Dining",
  "Casual Dining",
  "Dessert",
  "Other",
];
const CURRENCY_OPTIONS = ["IDR", "USD", "SGD"];
const PRICE_RANGE_OPTIONS = ["$", "$$", "$$$", "$$$$"];
const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

// Gallery photo backed by the Photo model (uploaded to Cloudinary).
type Photo = {
  id: string;
  url: string;
  publicId: string;
  altText?: string | null;
};
type Banner = { url: string; publicId: string } | null;
type MenuItem = {
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  category?: string;
};
type DayHours = { enabled: boolean; open: string; close: string };

type LocationLike = {
  id: string;
  address?: string;
  displayName?: string | null;
  queueEnabled?: boolean;
  reservationsEnabled?: boolean;
  reservationSettings?: any;
  restaurantProfile?: any;
  bannerImageUrl?: string | null;
  bannerImagePublicId?: string | null;
  photos?: Photo[];
};

// Per-location reservation settings (mirrors server/lib/reservations.ts).
type ReservationSettings = {
  reservationStartTime: string;
  reservationEndTime: string;
  maxPartySize: number;
  maxReservedGuestsPerHour: number;
  bookingWindowDays: number;
  minNoticeMinutes: number;
  confirmationMode: "auto" | "manual";
  cancellationPolicy: string;
};

const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = {
  reservationStartTime: "11:00",
  reservationEndTime: "22:00",
  maxPartySize: 8,
  maxReservedGuestsPerHour: 40,
  bookingWindowDays: 30,
  minNoticeMinutes: 60,
  confirmationMode: "auto",
  cancellationPolicy: "",
};

// Upload limits — kept in sync with the backend (server/routes/locations.ts).
const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

/** Client-side guard mirroring the server validation; returns an error or null. */
function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Only JPG, PNG, and WEBP images are allowed.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "Each image must be 5MB or smaller.";
  }
  return null;
}

export default function RestaurantProfileEditor({
  location,
  onSaved,
  onMediaChange,
}: {
  location: LocationLike;
  onSaved: (updatedUser: any) => void;
  // Called after a banner/photo upload or delete so the parent can refresh the
  // dashboard state WITHOUT closing the editor (uploads persist immediately).
  onMediaChange?: (updatedUser: any) => void;
}) {
  const { toast } = useToast();
  const rp = location.restaurantProfile || {};
  const details = rp.details || {};

  const [displayName, setDisplayName] = useState<string>(rp.displayName || "");
  const [shortAddress, setShortAddress] = useState<string>(
    rp.shortAddress || location.displayName || "",
  );
  const [tagline, setTagline] = useState<string>(rp.tagline || "");
  const [description, setDescription] = useState<string>(rp.description || "");
  const [cuisine, setCuisine] = useState<string>(
    Array.isArray(rp.cuisineTypes) && rp.cuisineTypes.length
      ? rp.cuisineTypes[0]
      : "",
  );
  const [priceRange, setPriceRange] = useState<string>(rp.priceRange || "$$");
  const [currency, setCurrency] = useState<string>(rp.currency || "IDR");

  const [address, setAddress] = useState<string>(
    details.address || location.address || "",
  );
  const [area, setArea] = useState<string>(details.area || "");
  const [city, setCity] = useState<string>(details.city || "Jakarta");
  const [country, setCountry] = useState<string>(
    details.country || "Indonesia",
  );
  const [phone, setPhone] = useState<string>(details.phone || "");
  const [website, setWebsite] = useState<string>(details.website || "");
  const [instagram, setInstagram] = useState<string>(details.instagram || "");
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string>(
    details.googleMapsUrl || "",
  );

  // Banner + gallery photos are stored on the Location/Photo models and uploaded
  // to Cloudinary immediately (independent of the "Save Changes" button below).
  const [banner, setBanner] = useState<Banner>(
    location.bannerImageUrl
      ? {
          url: location.bannerImageUrl,
          publicId: location.bannerImagePublicId || "",
        }
      : null,
  );
  const [photos, setPhotos] = useState<Photo[]>(
    Array.isArray(location.photos) ? location.photos : [],
  );
  const [bannerUploading, setBannerUploading] = useState(false);
  const [photosUploading, setPhotosUploading] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = Math.max(0, MAX_PHOTOS - photos.length);

  const [menu, setMenu] = useState<MenuItem[]>(
    Array.isArray(rp.menu) ? rp.menu : [],
  );
  // Optional link to an external/full menu (PDF or website). When set, the
  // public page shows it instead of (or alongside) the highlight items.
  const [menuUrl, setMenuUrl] = useState<string>(rp.menuUrl || "");

  const initialHours: any = rp.openingHours || {};
  const [timezone, setTimezone] = useState<string>(
    typeof initialHours.timezone === "string" && initialHours.timezone
      ? initialHours.timezone
      : DEFAULT_TIMEZONE,
  );
  const [openingHours, setOpeningHours] = useState<Record<string, DayHours>>(
    () => {
      const base: Record<string, DayHours> = {};
      for (const d of DAYS) {
        const v = initialHours[d] || {};
        base[d] = {
          // Missing `enabled` (legacy data) is treated as open.
          enabled: typeof v.enabled === "boolean" ? v.enabled : true,
          open: v.open || "11:00",
          close: v.close || "22:00",
        };
      }
      return base;
    },
  );

  // Waitlist is always on (mandatory). Reservations are optional per location.
  const [reservationsEnabled, setReservationsEnabled] = useState<boolean>(
    location.reservationsEnabled ?? true,
  );
  const [reservationSettings, setReservationSettings] =
    useState<ReservationSettings>(() => ({
      ...DEFAULT_RESERVATION_SETTINGS,
      ...(location.reservationSettings &&
      typeof location.reservationSettings === "object"
        ? location.reservationSettings
        : {}),
    }));
  const setRS = (patch: Partial<ReservationSettings>) =>
    setReservationSettings((s) => ({ ...s, ...patch }));
  const [isPublished, setIsPublished] = useState<boolean>(
    Boolean(rp.isPublished),
  );

  const [saving, setSaving] = useState(false);

  // Reviews are read-only for now.
  const rating = typeof rp.rating === "number" ? rp.rating : null;
  const reviewCount = typeof rp.reviewCount === "number" ? rp.reviewCount : 0;

  // --- Banner upload / replace / remove ------------------------------------
  const onBannerSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (bannerInputRef.current) bannerInputRef.current.value = ""; // allow re-pick
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast({
        title: "Invalid image",
        description: err,
        variant: "destructive",
      });
      return;
    }
    setBannerUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload(
        `/api/locations/${location.id}/banner/upload`,
        fd,
      );
      setBanner(res.banner ?? null);
      onMediaChange?.(res.user);
      toast({
        title: "Banner updated",
        description: "Your banner image was uploaded.",
      });
    } catch (e: any) {
      toast({
        title: "Banner upload failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBannerUploading(false);
    }
  };

  const removeBanner = async () => {
    setBannerUploading(true);
    try {
      const res = await api(`/api/locations/${location.id}/banner`, {
        method: "DELETE",
      });
      setBanner(null);
      onMediaChange?.(res.user);
      toast({ title: "Banner removed" });
    } catch (e: any) {
      toast({
        title: "Failed to remove banner",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBannerUploading(false);
    }
  };

  // --- Photo gallery upload / alt-text / remove ----------------------------
  const onPhotosSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photosInputRef.current) photosInputRef.current.value = "";
    if (files.length === 0) return;

    if (files.length > remainingSlots) {
      toast({
        title: "Too many photos",
        description:
          remainingSlots === 0
            ? `This location already has the maximum of ${MAX_PHOTOS} photos.`
            : `You can add ${remainingSlots} more photo(s) (max ${MAX_PHOTOS} per location).`,
        variant: "destructive",
      });
      return;
    }
    for (const f of files) {
      const err = validateImageFile(f);
      if (err) {
        toast({
          title: "Invalid image",
          description: `${f.name}: ${err}`,
          variant: "destructive",
        });
        return;
      }
    }

    setPhotosUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await apiUpload(
        `/api/locations/${location.id}/photos/upload`,
        fd,
      );
      const added: Photo[] = Array.isArray(res.photos) ? res.photos : [];
      setPhotos((prev) => [...prev, ...added]);
      onMediaChange?.(res.user);
      toast({
        title: "Photos uploaded",
        description: `${added.length} photo${added.length === 1 ? "" : "s"} added.`,
      });
    } catch (e: any) {
      toast({
        title: "Photo upload failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPhotosUploading(false);
    }
  };

  const removePhoto = async (photoId: string) => {
    // Optimistic removal so the grid updates instantly.
    const prev = photos;
    setPhotos((p) => p.filter((ph) => ph.id !== photoId));
    try {
      const res = await api(`/api/locations/${location.id}/photos/${photoId}`, {
        method: "DELETE",
      });
      onMediaChange?.(res.user);
    } catch (e: any) {
      setPhotos(prev); // roll back on failure
      toast({
        title: "Failed to remove photo",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const setPhotoAltLocal = (photoId: string, altText: string) =>
    setPhotos((p) =>
      p.map((ph) => (ph.id === photoId ? { ...ph, altText } : ph)),
    );

  // Persist alt text on blur (only when it actually changed).
  const savePhotoAlt = async (photoId: string, altText: string) => {
    try {
      const res = await api(`/api/locations/${location.id}/photos/${photoId}`, {
        method: "PATCH",
        body: JSON.stringify({ altText }),
      });
      onMediaChange?.(res.user);
    } catch (e: any) {
      toast({
        title: "Failed to save alt text",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const save = async () => {
    if (!displayName.trim()) {
      toast({
        title: "Restaurant name required",
        description: "Give your restaurant a public name.",
        variant: "destructive",
      });
      return;
    }
    // Preserve any unknown keys already on the profile; overwrite what we manage.
    // `photos` is intentionally dropped — gallery images now live in the Photo
    // model and are managed via their own upload endpoints, not this JSON blob.
    // `slug` is dropped — public restaurant URLs use the locationId now.
    const { photos: _legacyPhotos, slug: _legacySlug, ...rpRest } = rp;
    const restaurantProfile = {
      ...rpRest,
      displayName: displayName.trim(),
      shortAddress: shortAddress.trim(),
      tagline: tagline.trim(),
      description: description.trim(),
      cuisineTypes: cuisine ? [cuisine] : [],
      priceRange,
      currency,
      menu: menu
        .filter((it) => it.name.trim())
        .map((it) => ({
          name: it.name.trim(),
          description: it.description?.trim() || "",
          price:
            it.price === undefined || Number.isNaN(it.price)
              ? null
              : Number(it.price),
          currency: it.currency || currency,
          category: it.category?.trim() || "",
        })),
      menuUrl: menuUrl.trim(),
      rating: rating,
      reviewCount,
      details: {
        address: address.trim(),
        area: area.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        website: website.trim(),
        instagram: instagram.trim(),
        googleMapsUrl: googleMapsUrl.trim(),
      },
      openingHours: { timezone, ...openingHours },
      isPublished,
    };

    try {
      setSaving(true);
      const res = await api(`/auth/business/locations/${location.id}`, {
        method: "PUT",
        body: JSON.stringify({
          restaurantProfile,
          address: address.trim() || location.address || "Main Location",
          reservationsEnabled,
          // Confirmation mode is no longer exposed — always auto-confirm.
          reservationSettings: {
            ...reservationSettings,
            confirmationMode: "auto",
          },
        }),
      });
      onSaved(res.user);
      toast({
        title: "Profile saved",
        description: "Your restaurant profile was updated.",
      });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const cardCls = "bg-white rounded-xl border border-slate-200 shadow-sm";
  const sectionDesc = "text-gray-600 text-sm md:text-base";

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ===================== OVERVIEW ===================== */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Public Restaurant Profile
          </CardTitle>
          <CardDescription className={sectionDesc}>
            This information powers your customer-facing restaurant page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {/* Restaurant page links are derived per-location (so a business with
              multiple locations gets distinct URLs); no manual slug needed. */}
          {/* Customers see these as two lines on cards: Restaurant Name over
              Short Address (e.g. "Imperial Group" / "Plaza Indonesia"). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Restaurant Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Chinese Restaurant"
              />
              <p className="text-xs text-muted-foreground">
                The main name shown on cards and your public page.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortAddress">Short Address</Label>
              <Input
                id="shortAddress"
                value={shortAddress}
                onChange={(e) => setShortAddress(e.target.value)}
                placeholder="Plaza Indonesia"
              />
              <p className="text-xs text-muted-foreground">
                The mall, area, or branch shown under the name (e.g. "Plaza
                Indonesia").
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Short Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Modern Japanese dining in Jakarta"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">About / Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="A warm dining experience for reservations, queues, and group meals."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Cuisine Type</Label>
              <Select value={cuisine} onValueChange={setCuisine}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Cuisine" />
                </SelectTrigger>
                <SelectContent>
                  {CUISINE_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price Range</Label>
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Price range" />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_RANGE_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* TODO(pricing): Map currency and price range into localized display ranges later. */}
        </CardContent>
      </Card>

      {/* ===================== OPENING HOURS ===================== */}
      {/* Standalone card so operating hours read as distinct from reservations. */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Opening Hours
          </CardTitle>
          <CardDescription className={sectionDesc}>
            Set your timezone and the days/times your restaurant is open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 md:p-6 pt-0">
          {/* Timezone — sits before Monday, separated by a divider line. */}
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-800">Timezone</p>
              <p className="text-xs text-muted-foreground">Set your timezone</p>
            </div>
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              className="w-full sm:w-72"
            />
          </div>

          {/* One row per day: name · open → close · open/closed toggle. */}
          <div className="space-y-2">
            {DAYS.map((d) => {
              const day = openingHours[d];
              const setDay = (patch: Partial<DayHours>) =>
                setOpeningHours((h) => ({
                  ...h,
                  [d]: { ...h[d], ...patch },
                }));
              return (
                <div
                  key={d}
                  className="grid grid-cols-2 items-center gap-x-3 gap-y-3 py-2 sm:grid-cols-[7rem_1fr_auto]"
                >
                  <span className="font-medium capitalize text-slate-800">
                    {d}
                  </span>
                  <div className="justify-self-end sm:order-3">
                    <Switch
                      checked={day.enabled}
                      onCheckedChange={(v) => setDay({ enabled: v })}
                      aria-label={`${d} open`}
                    />
                  </div>
                  {/* Times: stack vertically on mobile (full width, no clipping),
                      inline on sm+ so the desktop row stays unchanged. */}
                  <div
                    className={cn(
                      "col-span-2 flex flex-col gap-2 sm:col-span-1 sm:flex-row sm:items-center sm:order-2",
                      !day.enabled && "opacity-50",
                    )}
                  >
                    <TimeSelect
                      value={day.open}
                      onChange={(v) => setDay({ open: v })}
                      options={ALL_DAY_TIME_OPTIONS}
                      disabled={!day.enabled}
                      portal={false}
                      label="From"
                      aria-label={`${d} open time`}
                      className="w-full min-w-0 sm:flex-1"
                    />
                    <TimeSelect
                      value={day.close}
                      onChange={(v) => setDay({ close: v })}
                      options={ALL_DAY_TIME_OPTIONS}
                      disabled={!day.enabled}
                      portal={false}
                      label="To"
                      aria-label={`${d} close time`}
                      className="w-full min-w-0 sm:flex-1"
                    />
                    {!day.enabled && (
                      <span className="shrink-0 text-xs font-medium text-slate-400 sm:ml-1">
                        Closed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ===================== RESERVATIONS ===================== */}
      {/* Waitlist is always on; reservations are the optional add-on. The
          enable toggle and all reservation settings live in one card; the
          settings only render once reservations are enabled. */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Reservations
          </CardTitle>
          <CardDescription className={sectionDesc}>
            Allow customers to book a table in advance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
            <div>
              <p className="font-medium text-gray-800">Enable Reservations</p>
              <p className="text-xs text-muted-foreground">
                Customers can always join the waitlist; reservations are
                optional.
              </p>
            </div>
            <Switch
              checked={reservationsEnabled}
              onCheckedChange={setReservationsEnabled}
            />
          </div>

          {reservationsEnabled && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <p className={sectionDesc}>
                Control when and how many guests you accept. Availability is
                calculated from max number of guests and max reserved guests per
                hour.
              </p>
              {/* Reservation hours */}
              <div className="space-y-2">
                <Label>Reservation Hours</Label>
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center">
                  <TimeSelect
                    value={reservationSettings.reservationStartTime}
                    onChange={(v) => setRS({ reservationStartTime: v })}
                    options={ALL_DAY_TIME_OPTIONS}
                    portal={false}
                    aria-label="Reservation start time"
                    className="w-full min-w-0 sm:flex-1"
                  />
                  <span className="shrink-0 text-center text-sm text-slate-400">
                    to
                  </span>
                  <TimeSelect
                    value={reservationSettings.reservationEndTime}
                    onChange={(v) => setRS({ reservationEndTime: v })}
                    options={ALL_DAY_TIME_OPTIONS}
                    portal={false}
                    aria-label="Reservation end time"
                    className="w-full min-w-0 sm:flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Defaults to your operating hours. Customers can only book
                  within this window.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxPartySize">Max Number of Guests</Label>
                  <Input
                    id="maxPartySize"
                    type="number"
                    min={1}
                    value={reservationSettings.maxPartySize}
                    onChange={(e) =>
                      setRS({ maxPartySize: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Largest group accepted per reservation (e.g. 8).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxPerHour">
                    Max Reserved Guests Per Hour
                  </Label>
                  <Input
                    id="maxPerHour"
                    type="number"
                    min={1}
                    value={reservationSettings.maxReservedGuestsPerHour}
                    onChange={(e) =>
                      setRS({
                        maxReservedGuestsPerHour: Number(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Total reserved guests allowed in any hour (e.g. 40).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookingWindow">Booking Window (Days)</Label>
                  <Input
                    id="bookingWindow"
                    type="number"
                    min={0}
                    value={reservationSettings.bookingWindowDays}
                    onChange={(e) =>
                      setRS({ bookingWindowDays: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How far in advance customers can book (e.g. 30).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minNotice">Minimum Notice (Minutes)</Label>
                  <Input
                    id="minNotice"
                    type="number"
                    min={0}
                    value={reservationSettings.minNoticeMinutes}
                    onChange={(e) =>
                      setRS({ minNoticeMinutes: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Customers can't book closer than this to the reservation
                    time.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancellationPolicy">
                  Cancellation Policy / Notes (Optional)
                </Label>
                <Textarea
                  id="cancellationPolicy"
                  value={reservationSettings.cancellationPolicy}
                  onChange={(e) =>
                    setRS({ cancellationPolicy: e.target.value })
                  }
                  rows={3}
                  placeholder="e.g. Please cancel at least 2 hours in advance. Tables are held for 15 minutes."
                />
                <p className="text-xs text-muted-foreground">
                  Shown to customers before they confirm a booking.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== BANNER IMAGE ===================== */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Banner Image
          </CardTitle>
          <CardDescription className={sectionDesc}>
            The main hero image at the top of your public page. Use a wide image
            (around 16:9). JPG, PNG, or WEBP, up to 5MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {/* Hidden file input shared by the upload area + replace button. */}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onBannerSelected}
          />

          {banner ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border bg-gray-50">
                <div className="aspect-video w-full">
                  <img
                    src={banner.url}
                    alt="Location banner"
                    className="h-full w-full object-cover"
                  />
                </div>
                {bannerUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />{" "}
                    Uploading...
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={bannerUploading}
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <Upload size={16} className="mr-2" /> Replace Banner
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                  disabled={bannerUploading}
                  onClick={removeBanner}
                >
                  <Trash2 size={16} className="mr-2" /> Remove Banner
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={bannerUploading}
              onClick={() => bannerInputRef.current?.click()}
              className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bannerUploading ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin" />
                  <span className="text-sm font-medium">Uploading...</span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-sm font-medium">
                    Upload a banner image
                  </span>
                  <span className="text-xs text-slate-400">
                    Wide image recommended (16:9)
                  </span>
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>

      {/* ===================== PHOTOS ===================== */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Photos
          </CardTitle>
          <CardDescription className={sectionDesc}>
            Gallery images for your public page ({photos.length}/{MAX_PHOTOS}
            ). JPG, PNG, or WEBP, up to 5MB each.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {/* Hidden multi-file input + upload trigger. */}
          <input
            ref={photosInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPhotosSelected}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {remainingSlots > 0
                ? `You can add ${remainingSlots} more photo${remainingSlots === 1 ? "" : "s"}.`
                : `Maximum of ${MAX_PHOTOS} photos reached.`}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={photosUploading || remainingSlots === 0}
              onClick={() => photosInputRef.current?.click()}
            >
              {photosUploading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />{" "}
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={16} className="mr-2" /> Upload Photos
                </>
              )}
            </Button>
          </div>

          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No photos added yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="group relative flex flex-col overflow-hidden rounded-lg border bg-gray-50"
                >
                  <div className="relative">
                    <img
                      src={p.url}
                      alt={p.altText || "Restaurant photo"}
                      className="h-28 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 shadow hover:bg-white"
                      aria-label="Remove photo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Input
                    value={p.altText || ""}
                    onChange={(e) => setPhotoAltLocal(p.id, e.target.value)}
                    onBlur={(e) => savePhotoAlt(p.id, e.target.value)}
                    placeholder="Alt text (optional)"
                    className="h-8 rounded-none border-0 border-t text-xs focus-visible:ring-0"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== MENU ===================== */}
      <MenuSection
        menu={menu}
        setMenu={setMenu}
        menuUrl={menuUrl}
        setMenuUrl={setMenuUrl}
        currency={currency}
        cardCls={cardCls}
        sectionDesc={sectionDesc}
      />

      {/* ===================== DETAILS ===================== */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Details
          </CardTitle>
          <CardDescription className={sectionDesc}>
            Address and contact information shown on your public page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="12 Senopati St, Jakarta"
            />
            {/* TODO(location): Add Google Places or maps autocomplete for address search later. */}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="area">Area / Neighborhood</Label>
              <Input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Senopati, SCBD, PIK, Kemang"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rp-phone">Phone</Label>
              <Input
                id="rp-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+62 21 1234 5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maps">Google Maps URL</Label>
              <Input
                id="maps"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===================== PREVIEW ===================== */}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            Restaurant Page Preview
          </CardTitle>
          <CardDescription className={sectionDesc}>
            A rough preview of how your public page header may look.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="overflow-hidden rounded-xl border">
            {/* Hero uses the banner first, then falls back to the first gallery photo. */}
            {banner?.url || photos[0]?.url ? (
              <img
                src={banner?.url || photos[0]?.url}
                alt={banner ? "Banner" : photos[0]?.altText || "Cover"}
                className="h-44 w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-100 text-slate-400">
                <ImageIcon className="mr-2 h-6 w-6" /> No banner yet
              </div>
            )}
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-gray-900">
                  {displayName || "Your Restaurant"}
                </h3>
                {isPublished ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Published
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Draft
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {[cuisine, priceRange, [area, city].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · ") || "Cuisine · Price · Location"}
              </p>
              {address && <p className="text-sm text-gray-600">{address}</p>}
              {description && (
                <p className="text-sm text-gray-700">{description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===================== PUBLISH + SAVE ===================== */}
      <Card className={cardCls}>
        <CardContent className="flex flex-col gap-4 p-4 md:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            <div>
              <p className="font-medium text-gray-800">Publish Profile</p>
              <p className="text-xs text-muted-foreground">
                When on, your profile is ready for the public page.
              </p>
            </div>
          </div>
          <Button
            onClick={save}
            disabled={saving}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Menu builder
// ===========================================================================

const UNCATEGORIZED = "Other";

/** Display a price with its currency code, e.g. "IDR 50,000". */
function formatMenuPrice(price: number | undefined, currency: string): string {
  if (price === undefined || price === null || Number.isNaN(price)) return "";
  return `${currency} ${price.toLocaleString()}`;
}

/**
 * Owner-facing menu editor. Replaces the old table-like input rows with a
 * card-based builder: an "Add Menu Item" button opens an inline form (name /
 * category / price / description), and saved items render as clean cards grouped
 * by category, each with Edit + Delete. The committed list still lives in the
 * parent's `menu` state, so the existing Save Changes flow is unchanged.
 */
function MenuSection({
  menu,
  setMenu,
  menuUrl,
  setMenuUrl,
  currency,
  cardCls,
  sectionDesc,
}: {
  menu: MenuItem[];
  setMenu: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  menuUrl: string;
  setMenuUrl: React.Dispatch<React.SetStateAction<string>>;
  currency: string;
  cardCls: string;
  sectionDesc: string;
}) {
  // The form is open when `form` is non-null. index === null → adding a new
  // item; index === number → editing the item at that position.
  const [form, setForm] = useState<{
    index: number | null;
    draft: MenuItem;
  } | null>(null);

  const emptyDraft = (): MenuItem => ({
    name: "",
    description: "",
    price: undefined,
    currency,
    category: "",
  });

  const openAdd = () => setForm({ index: null, draft: emptyDraft() });
  const openEdit = (i: number) => setForm({ index: i, draft: { ...menu[i] } });
  const cancel = () => setForm(null);

  const setDraft = (patch: Partial<MenuItem>) =>
    setForm((f) => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));

  const saveItem = () => {
    if (!form) return;
    const draft = form.draft;
    if (!draft.name.trim()) return; // name is required; button is disabled anyway
    const cleaned: MenuItem = {
      ...draft,
      name: draft.name.trim(),
      category: draft.category?.trim() || "",
      description: draft.description?.trim() || "",
      currency: draft.currency || currency,
    };
    setMenu((m) => {
      if (form.index === null) return [...m, cleaned];
      return m.map((it, idx) => (idx === form.index ? cleaned : it));
    });
    setForm(null);
  };

  const remove = (i: number) => {
    setMenu((m) => m.filter((_, idx) => idx !== i));
    // If we were editing the item being removed, close the form.
    setForm((f) => (f && f.index === i ? null : f));
  };

  // Group items by category (preserving first-seen order), pairing each with its
  // original index so Edit/Delete map back to the source array.
  const groups: {
    category: string;
    items: { item: MenuItem; index: number }[];
  }[] = [];
  menu.forEach((item, index) => {
    const category = item.category?.trim() || UNCATEGORIZED;
    let group = groups.find((g) => g.category === category);
    if (!group) {
      group = { category, items: [] };
      groups.push(group);
    }
    group.items.push({ item, index });
  });

  return (
    <Card className={cardCls}>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="text-lg md:text-xl text-gray-800">Menu</CardTitle>
        <CardDescription className={sectionDesc}>
          Add a few highlight items customers should know about.
        </CardDescription>
        <p className="text-xs text-muted-foreground md:text-sm">
          These items will appear on your public restaurant page.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6 pt-0">
        {/* Option 1: link to an external/full menu. */}
        <div className="space-y-1.5">
          <Label htmlFor="menu-url">Menu link</Label>
          <Input
            id="menu-url"
            type="url"
            inputMode="url"
            placeholder="https://your-restaurant.com/menu"
            value={menuUrl}
            onChange={(e) => setMenuUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Add a full menu link so customers can view it from your page.
          </p>
        </div>

        {/* Divider between the two options. */}
        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            or add highlight items
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Add / Edit form (inline expanded card). */}
        {form && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-800">
              {form.index === null ? "Add Menu Item" : "Edit Menu Item"}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="menu-name">Item name</Label>
                <Input
                  id="menu-name"
                  placeholder="e.g. Pad Thai"
                  value={form.draft.name}
                  onChange={(e) => setDraft({ name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="menu-category">Category</Label>
                <Input
                  id="menu-category"
                  placeholder="e.g. Mains, Drinks, Desserts"
                  value={form.draft.category || ""}
                  onChange={(e) => setDraft({ category: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="menu-price">Price ({currency})</Label>
                <Input
                  id="menu-price"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 50000"
                  value={form.draft.price ?? ""}
                  onChange={(e) =>
                    setDraft({
                      price:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-description">Description</Label>
              <Textarea
                id="menu-description"
                placeholder="A short description (optional)"
                rows={2}
                value={form.draft.description || ""}
                onChange={(e) => setDraft({ description: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={cancel}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveItem}
                disabled={!form.draft.name.trim()}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"
              >
                Save Item
              </Button>
            </div>
          </div>
        )}

        {/* Empty state. */}
        {menu.length === 0 && !form && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No menu items yet. Add your first highlight item.
            </p>
          </div>
        )}

        {/* Saved items, grouped by category. */}
        {groups.map((group) => (
          <div key={group.category} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.category}
            </p>
            <div className="space-y-2">
              {group.items.map(({ item, index }) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p className="font-semibold text-gray-800 break-words">
                          {item.name}
                        </p>
                        {formatMenuPrice(
                          item.price,
                          item.currency || currency,
                        ) && (
                          <span className="text-sm font-medium text-slate-600">
                            {formatMenuPrice(
                              item.price,
                              item.currency || currency,
                            )}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-slate-500 break-words">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {/* Desktop: compact icon-ish buttons on the right. Mobile:
                        full-width tappable row below the content. */}
                    <div className="flex gap-2 sm:shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(index)}
                        className="flex-1 gap-1.5 sm:flex-none"
                      >
                        <Pencil size={14} /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => remove(index)}
                        className="flex-1 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 sm:flex-none"
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Primary add button — hidden while the form is open to avoid two
            "add" affordances at once. */}
        {!form && (
          <Button
            type="button"
            variant="outline"
            onClick={openAdd}
            className="w-full sm:w-auto"
          >
            <Plus size={16} className="mr-2" /> Add Menu Item
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
