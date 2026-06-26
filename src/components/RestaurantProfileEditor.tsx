import { useRef, useState } from "react";
import Papa from "papaparse";
import { api } from "@/lib/api";
import { uploadBanner, uploadPhoto } from "@/lib/imageUpload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ConfirmModal } from "@/components/ui/confirm-modal";
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
import { useLang, type TKey } from "@/lib/i18n";


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

const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

function validateImageFile(file: File): TKey | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "rpe.err.imageType";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "rpe.err.imageSize";
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
  onMediaChange?: (updatedUser: any) => void;
}) {
  const { toast } = useToast();
  const { t } = useLang();
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
          enabled: typeof v.enabled === "boolean" ? v.enabled : true,
          open: v.open || "11:00",
          close: v.close || "22:00",
        };
      }
      return base;
    },
  );

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

  const rating = typeof rp.rating === "number" ? rp.rating : null;
  const reviewCount = typeof rp.reviewCount === "number" ? rp.reviewCount : 0;

  const onBannerSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (bannerInputRef.current) bannerInputRef.current.value = "";
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast({
        title: t("rpe.toast.invalidImage.title"),
        description: t(err),
        variant: "destructive",
      });
      return;
    }
    setBannerUploading(true);
    try {
      const res = await uploadBanner(location.id, file);
      setBanner(res.banner ?? null);
      onMediaChange?.(res.user);
      toast({
        title: t("rpe.toast.bannerUpdated.title"),
        description: t("rpe.toast.bannerUpdated.desc"),
      });
    } catch (e: any) {
      toast({
        title: t("rpe.toast.bannerFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
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
      toast({ title: t("rpe.toast.bannerRemoved.title") });
    } catch (e: any) {
      toast({
        title: t("rpe.toast.bannerRemoveFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setBannerUploading(false);
    }
  };

  const onPhotosSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photosInputRef.current) photosInputRef.current.value = "";
    if (files.length === 0) return;

    if (files.length > remainingSlots) {
      toast({
        title: t("rpe.toast.tooManyPhotos.title"),
        description:
          remainingSlots === 0
            ? t("rpe.toast.tooManyPhotos.full", { max: MAX_PHOTOS })
            : t("rpe.toast.tooManyPhotos.some", {
                n: remainingSlots,
                max: MAX_PHOTOS,
              }),
        variant: "destructive",
      });
      return;
    }
    for (const f of files) {
      const err = validateImageFile(f);
      if (err) {
        toast({
          title: t("rpe.toast.invalidImage.title"),
          description: `${f.name}: ${t(err)}`,
          variant: "destructive",
        });
        return;
      }
    }

    setPhotosUploading(true);
    const added: Photo[] = [];
    let lastUser: any = null;
    try {
      for (const f of files) {
        const res = await uploadPhoto(location.id, f);
        if (res.photo) added.push(res.photo);
        lastUser = res.user;
      }
      toast({
        title: t("rpe.toast.photosUploaded.title"),
        description: t("rpe.toast.photosUploaded.desc", { n: added.length }),
      });
    } catch (e: any) {
      toast({
        title: t("rpe.toast.photoFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      if (added.length) setPhotos((prev) => [...prev, ...added]);
      if (lastUser) onMediaChange?.(lastUser);
      setPhotosUploading(false);
    }
  };

  const removePhoto = async (photoId: string) => {
    const prev = photos;
    setPhotos((p) => p.filter((ph) => ph.id !== photoId));
    try {
      const res = await api(`/api/locations/${location.id}/photos/${photoId}`, {
        method: "DELETE",
      });
      onMediaChange?.(res.user);
    } catch (e: any) {
      setPhotos(prev);
      toast({
        title: t("rpe.toast.photoRemoveFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    }
  };

  const setPhotoAltLocal = (photoId: string, altText: string) =>
    setPhotos((p) =>
      p.map((ph) => (ph.id === photoId ? { ...ph, altText } : ph)),
    );

  const savePhotoAlt = async (photoId: string, altText: string) => {
    try {
      const res = await api(`/api/locations/${location.id}/photos/${photoId}`, {
        method: "PATCH",
        body: JSON.stringify({ altText }),
      });
      onMediaChange?.(res.user);
    } catch (e: any) {
      toast({
        title: t("rpe.toast.altFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    }
  };

  const save = async () => {
    if (!displayName.trim()) {
      toast({
        title: t("rpe.toast.nameRequired.title"),
        description: t("rpe.toast.nameRequired.desc"),
        variant: "destructive",
      });
      return;
    }
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
          reservationSettings: {
            ...reservationSettings,
            confirmationMode: "auto",
          },
        }),
      });
      onSaved(res.user);
      toast({
        title: t("rpe.toast.profileSaved.title"),
        description: t("rpe.toast.profileSaved.desc"),
      });
    } catch (err: any) {
      toast({
        title: t("rpe.toast.saveFailed.title"),
        description: err?.message || t("common.pleaseTryAgain"),
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
      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.overview.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.overview.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {}
          {}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("rpe.field.restaurantName")}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("rpe.field.restaurantName.ph")}
              />
              <p className="text-xs text-muted-foreground">
                {t("rpe.field.restaurantName.help")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortAddress">{t("rpe.field.shortAddress")}</Label>
              <Input
                id="shortAddress"
                value={shortAddress}
                onChange={(e) => setShortAddress(e.target.value)}
                placeholder={t("rpe.field.shortAddress.ph")}
              />
              <p className="text-xs text-muted-foreground">
                {t("rpe.field.shortAddress.help")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">{t("rpe.field.tagline")}</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t("rpe.field.tagline.ph")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("rpe.field.description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={t("rpe.field.description.ph")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("rpe.field.cuisine")}</Label>
              <Select value={cuisine} onValueChange={setCuisine}>
                <SelectTrigger>
                  <SelectValue placeholder={t("rpe.field.cuisine.ph")} />
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
              <Label>{t("rpe.field.priceRange")}</Label>
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("rpe.field.priceRange.ph")} />
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
              <Label>{t("rpe.field.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder={t("rpe.field.currency.ph")} />
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
          {}
        </CardContent>
      </Card>

      {}
      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.hours.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.hours.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 md:p-6 pt-0">
          {}
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-800">
                {t("rpe.hours.timezone")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("rpe.hours.timezoneHelp")}
              </p>
            </div>
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              className="w-full sm:w-72"
            />
          </div>

          {}
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
                    {t(`rpe.day.${d}` as TKey)}
                  </span>
                  <div className="justify-self-end sm:order-3">
                    <Switch
                      checked={day.enabled}
                      onCheckedChange={(v) => setDay({ enabled: v })}
                      aria-label={`${d} open`}
                    />
                  </div>
                  {}
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
                      label={t("rpe.hours.from")}
                      aria-label={`${d} open time`}
                      className="w-full min-w-0 sm:flex-1"
                    />
                    <TimeSelect
                      value={day.close}
                      onChange={(v) => setDay({ close: v })}
                      options={ALL_DAY_TIME_OPTIONS}
                      disabled={!day.enabled}
                      portal={false}
                      label={t("rpe.hours.to")}
                      aria-label={`${d} close time`}
                      className="w-full min-w-0 sm:flex-1"
                    />
                    {!day.enabled && (
                      <span className="shrink-0 text-xs font-medium text-slate-400 sm:ml-1">
                        {t("rpe.hours.closed")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {}
      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.res.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.res.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
            <div>
              <p className="font-medium text-gray-800">{t("rpe.res.enable")}</p>
              <p className="text-xs text-muted-foreground">
                {t("rpe.res.enableHelp")}
              </p>
            </div>
            <Switch
              checked={reservationsEnabled}
              onCheckedChange={setReservationsEnabled}
            />
          </div>

          {reservationsEnabled && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <p className={sectionDesc}>{t("rpe.res.controlHelp")}</p>
              {}
              <div className="space-y-2">
                <Label>{t("rpe.res.hours")}</Label>
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
                    {t("rpe.res.to")}
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
                  {t("rpe.res.hoursHelp")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxPartySize">{t("rpe.res.maxGuests")}</Label>
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
                    {t("rpe.res.maxGuestsHelp")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxPerHour">{t("rpe.res.maxPerHour")}</Label>
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
                    {t("rpe.res.maxPerHourHelp")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookingWindow">
                    {t("rpe.res.bookingWindow")}
                  </Label>
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
                    {t("rpe.res.bookingWindowHelp")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minNotice">{t("rpe.res.minNotice")}</Label>
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
                    {t("rpe.res.minNoticeHelp")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancellationPolicy">
                  {t("rpe.res.cancellation")}
                </Label>
                <Textarea
                  id="cancellationPolicy"
                  value={reservationSettings.cancellationPolicy}
                  onChange={(e) =>
                    setRS({ cancellationPolicy: e.target.value })
                  }
                  rows={3}
                  placeholder={t("rpe.res.cancellation.ph")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("rpe.res.cancellationHelp")}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.banner.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.banner.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {}
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
                    {t("rpe.banner.uploading")}
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
                  <Upload size={16} className="mr-2" /> {t("rpe.banner.replace")}
                </Button>
                <Button
                  type="button"
                  variant="destructiveOutline"
                  className="w-full sm:w-auto"
                  disabled={bannerUploading}
                  onClick={removeBanner}
                >
                  <Trash2 size={16} className="mr-2" /> {t("rpe.banner.remove")}
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
                  <span className="text-sm font-medium">
                    {t("rpe.banner.uploading")}
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-sm font-medium">
                    {t("rpe.banner.upload")}
                  </span>
                  <span className="text-xs text-slate-400">
                    {t("rpe.banner.recommend")}
                  </span>
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>

      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.photos.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.photos.desc", { n: photos.length, max: MAX_PHOTOS })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {}
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
                ? t("rpe.photos.canAdd", { n: remainingSlots })
                : t("rpe.photos.maxReached", { max: MAX_PHOTOS })}
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
                  {t("rpe.photos.uploading")}
                </>
              ) : (
                <>
                  <Upload size={16} className="mr-2" /> {t("rpe.photos.upload")}
                </>
              )}
            </Button>
          </div>

          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("rpe.photos.none")}
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
                    placeholder={t("rpe.photos.altPlaceholder")}
                    className="h-8 rounded-none border-0 border-t text-xs focus-visible:ring-0"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {}
      <MenuSection
        menu={menu}
        setMenu={setMenu}
        menuUrl={menuUrl}
        setMenuUrl={setMenuUrl}
        currency={currency}
        cardCls={cardCls}
        sectionDesc={sectionDesc}
      />

      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.details.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.details.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          <div className="space-y-2">
            <Label htmlFor="address">{t("rpe.details.address")}</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("rpe.details.address.ph")}
            />
            {}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="area">{t("rpe.details.area")}</Label>
              <Input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={t("rpe.details.area.ph")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">{t("rpe.details.city")}</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t("rpe.details.country")}</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rp-phone">{t("rpe.details.phone")}</Label>
              <Input
                id="rp-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+62 21 1234 5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">{t("rpe.details.website")}</Label>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram">{t("rpe.details.instagram")}</Label>
              <Input
                id="instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maps">{t("rpe.details.maps")}</Label>
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

      {}
      <Card className={cardCls}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("rpe.preview.title")}
          </CardTitle>
          <CardDescription className={sectionDesc}>
            {t("rpe.preview.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="overflow-hidden rounded-xl border">
            {}
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
                <ImageIcon className="mr-2 h-6 w-6" /> {t("rpe.preview.noBanner")}
              </div>
            )}
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-gray-900">
                  {displayName || t("rpe.preview.yourRestaurant")}
                </h3>
                {isPublished ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {t("rpe.preview.published")}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {t("rpe.preview.draft")}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {[cuisine, priceRange, [area, city].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · ") || t("rpe.preview.placeholder")}
              </p>
              {address && <p className="text-sm text-gray-600">{address}</p>}
              {description && (
                <p className="text-sm text-gray-700">{description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {}
      <Card className={cardCls}>
        <CardContent className="flex flex-col gap-4 p-4 md:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            <div>
              <p className="font-medium text-gray-800">
                {t("rpe.publish.title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("rpe.publish.help")}
              </p>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? t("rpe.saving") : t("rpe.save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


const UNCATEGORIZED = "Other";

function formatMenuPrice(price: number | undefined, currency: string): string {
  if (price === undefined || price === null || Number.isNaN(price)) return "";
  return `${currency} ${price.toLocaleString("en-US")}`;
}

function parseCsvPrice(raw: string): number | undefined {
  if (!raw) return undefined;
  let s = raw.replace(/[^0-9.,]/g, "");
  if (!s) return undefined;
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

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
  const { t } = useLang();
  const [form, setForm] = useState<{
    index: number | null;
    draft: MenuItem;
  } | null>(null);

  const [csvError, setCsvError] = useState<{
    title: string;
    detail: string;
  } | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const REQUIRED_COLUMNS = ["name", "category", "description", "price"];

  const handleCsvFile = (file: File) => {
    setCsvError(null);
    setCsvSuccess(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvError({
        title: t("rpe.csv.invalidFormat.title"),
        detail: t("rpe.csv.invalidFormat.ext"),
      });
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
        if (missing.length > 0) {
          setCsvError({
            title: t("rpe.csv.invalidFormat.title"),
            detail: t("rpe.csv.missingCols", { cols: missing.join(", ") }),
          });
          return;
        }
        const imported: MenuItem[] = [];
        let skipped = 0;
        let pricelessRows = 0;
        for (const row of results.data) {
          const name = (row.name ?? "").trim();
          const category = (row.category ?? "").trim();
          const description = (row.description ?? "").trim();
          const priceRaw = (row.price ?? "").trim();
          if (!name && !category && !description && !priceRaw) continue;
          if (!name) {
            skipped++;
            continue;
          }
          const price = parseCsvPrice(priceRaw);
          if (priceRaw && price === undefined) pricelessRows++;
          imported.push({ name, category, description, price, currency });
        }
        if (imported.length === 0) {
          setCsvError({
            title: t("rpe.csv.noItems.title"),
            detail:
              skipped > 0
                ? t("rpe.csv.noItems.skipped", { n: skipped })
                : t("rpe.csv.noItems.empty"),
          });
          return;
        }
        setMenu((m) => [...m, ...imported]);
        const notes: string[] = [];
        if (skipped > 0) notes.push(t("rpe.csv.skippedNote", { n: skipped }));
        if (pricelessRows > 0)
          notes.push(t("rpe.csv.pricelessNote", { n: pricelessRows }));
        const count = t(
          imported.length === 1 ? "rpe.csv.importedOne" : "rpe.csv.importedMany",
          { n: imported.length },
        );
        setCsvSuccess(notes.length ? `${count} · ${notes.join(" · ")}` : count);
      },
      error: (err) => {
        setCsvError({ title: t("rpe.csv.couldNotRead"), detail: err.message });
      },
    });
  };

  const onCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvFile(file);
    e.target.value = "";
  };

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
    if (!draft.name.trim()) return;
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
    setForm((f) => (f && f.index === i ? null : f));
  };

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
        <CardTitle className="text-lg md:text-xl text-gray-800">
          {t("rpe.menu.title")}
        </CardTitle>
        <CardDescription className={sectionDesc}>
          {t("rpe.menu.desc")}
        </CardDescription>
        <p className="text-xs text-muted-foreground md:text-sm">
          {t("rpe.menu.subdesc")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6 pt-0">
        {}
        <div className="space-y-1.5">
          <Label htmlFor="menu-url">{t("rpe.menu.link")}</Label>
          <Input
            id="menu-url"
            type="url"
            inputMode="url"
            placeholder="https://your-restaurant.com/menu"
            value={menuUrl}
            onChange={(e) => setMenuUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("rpe.menu.linkHelp")}
          </p>
        </div>

        {}
        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t("rpe.menu.orHighlight")}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {}
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <Upload size={15} /> {t("rpe.menu.uploadCsv")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("rpe.menu.csvInclude")}
              </p>
            </div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onCsvChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => csvInputRef.current?.click()}
              className="w-full gap-1.5 sm:w-auto"
            >
              <Upload size={14} /> {t("rpe.menu.chooseCsv")}
            </Button>
          </div>
          {csvError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-600">
                {csvError.title}
              </p>
              <p className="mt-0.5 text-xs text-red-600">{csvError.detail}</p>
            </div>
          )}
          {csvSuccess && (
            <p className="mt-3 text-sm font-medium text-emerald-600">
              {csvSuccess}
            </p>
          )}
        </div>

        {}
        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t("rpe.menu.orOneAtATime")}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {}
        {form && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-800">
              {form.index === null
                ? t("rpe.menu.addItem")
                : t("rpe.menu.editItem")}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="menu-name">{t("rpe.menu.itemName")}</Label>
                <Input
                  id="menu-name"
                  placeholder={t("rpe.menu.itemName.ph")}
                  value={form.draft.name}
                  onChange={(e) => setDraft({ name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="menu-category">{t("rpe.menu.category")}</Label>
                <Input
                  id="menu-category"
                  placeholder={t("rpe.menu.category.ph")}
                  value={form.draft.category || ""}
                  onChange={(e) => setDraft({ category: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="menu-price">
                  {t("rpe.menu.price", { currency })}
                </Label>
                <Input
                  id="menu-price"
                  type="number"
                  inputMode="decimal"
                  placeholder={t("rpe.menu.price.ph")}
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
              <Label htmlFor="menu-description">
                {t("rpe.menu.description")}
              </Label>
              <Textarea
                id="menu-description"
                placeholder={t("rpe.menu.description.ph")}
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
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={saveItem}
                disabled={!form.draft.name.trim()}
                className="w-full sm:w-auto"
              >
                {t("rpe.menu.saveItem")}
              </Button>
            </div>
          </div>
        )}

        {}
        {menu.length === 0 && !form && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t("rpe.menu.empty")}
            </p>
          </div>
        )}

        {}
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
                    {}
                    <div className="flex gap-2 sm:shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(index)}
                        className="flex-1 gap-1.5 sm:flex-none"
                      >
                        <Pencil size={14} /> {t("rpe.menu.edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructiveOutline"
                        size="sm"
                        onClick={() => remove(index)}
                        className="flex-1 gap-1.5 sm:flex-none"
                      >
                        <Trash2 size={14} /> {t("rpe.menu.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!form && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={openAdd}
              className="w-full sm:w-auto"
            >
              <Plus size={16} className="mr-2" /> {t("rpe.menu.addItem")}
            </Button>
            {menu.length > 0 && (
              <ConfirmModal
                title={t("rpe.menu.clearTitle")}
                description={t("rpe.menu.clearDesc", { n: menu.length })}
                helperText={t("rpe.menu.clearHelper")}
                cancelText={t("common.cancel")}
                confirmText={t("rpe.menu.clear")}
                loadingText={t("rpe.menu.clearing")}
                successMessage={t("rpe.menu.clearSuccess")}
                errorMessage={t("rpe.menu.clearError")}
                onConfirm={async () => {
                  await new Promise((resolve) => setTimeout(resolve, 600));
                  setMenu([]);
                }}
                trigger={
                  <Button type="button" variant="destructiveOutline" className="w-full sm:w-auto">
                    <Trash2 size={16} className="mr-2" /> {t("rpe.menu.clear")}
                  </Button>
                }
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
