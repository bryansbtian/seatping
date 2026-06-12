// LocationManagement.tsx
// Add/remove business locations. Lives on the business Profile page because the
// location (display name, address, coordinates) is part of the customer-facing
// profile and powers queue/reservation location selection.
import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  Plus,
  Trash2,
  Pencil,
  Star,
  QrCode,
  Copy,
  Download,
} from "lucide-react";
import QRCode from "qrcode";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import RestaurantProfileEditor from "@/components/RestaurantProfileEditor";
import LocationReviewsModal from "@/components/LocationReviewsModal";
import type { PlaceDetails } from "@/lib/googleMaps";

interface Location {
  id: string;
  name?: string | null;
  displayName?: string | null;
  address: string;
  shortAddress?: string | null;
  googleMapsUrl?: string | null;
  queue?: unknown[];
  credits?: number;
  queueEnabled?: boolean;
  reservationsEnabled?: boolean;
  restaurantProfile?: Record<string, unknown>;
  bannerImageUrl?: string | null;
  bannerImagePublicId?: string | null;
  photos?: Array<{
    id: string;
    url: string;
    publicId: string;
    altText?: string | null;
  }>;
}
interface MeLike {
  username?: string;
  locations?: Location[];
  maxLocations?: number;
}

/**
 * Derive a short address from a long Google formatted address by keeping the
 * first 1–2 meaningful comma-separated parts (e.g. unit + building) and dropping
 * the long street/city/province tail. Used when no `shortAddress` is stored.
 */
function deriveShortAddress(full?: string | null): string {
  if (!full) return "";
  const parts = full
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join(", ");
}

export default function LocationManagement({
  me,
  onChanged,
}: {
  me: MeLike | null;
  onChanged: (updatedUser: any) => void;
}) {
  const { toast } = useToast();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [newLocationDisplayName, setNewLocationDisplayName] = useState("");
  const [newLocationPlace, setNewLocationPlace] = useState<PlaceDetails | null>(
    null,
  );
  // The location whose public restaurant profile is being edited (modal).
  const [editing, setEditing] = useState<Location | null>(null);
  // The location whose customer reviews are being viewed (modal).
  const [selectedLocationForReviews, setSelectedLocationForReviews] =
    useState<Location | null>(null);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  // The location whose queue QR code is being shown (modal), plus the generated
  // QR image (data URL) for that location's queue link.
  const [qrLocation, setQrLocation] = useState<Location | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  // Which location cards have their full address expanded.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const locations: Location[] = me?.locations || [];
  const maxLocations = me?.maxLocations ?? 1;
  const atMax = locations.length >= maxLocations;
  const businessUsername = me?.username || "";

  /** Location-specific queue URL a customer reaches by scanning the QR code. */
  const queueUrlFor = (location: Location) =>
    `${window.location.origin}/queue/${businessUsername}/${location.id}`;

  /** Open the QR modal for a location and generate its QR image. */
  const openQrModal = async (location: Location) => {
    setQrLocation(location);
    setQrDataUrl("");
    try {
      const dataUrl = await QRCode.toDataURL(queueUrlFor(location), {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      toast({
        title: t("loc.toast.qrError.title"),
        description: t("loc.toast.qrError.desc"),
        variant: "destructive",
      });
    }
  };

  const copyQueueLink = async () => {
    if (!qrLocation) return;
    try {
      await navigator.clipboard.writeText(queueUrlFor(qrLocation));
      toast({
        title: t("loc.toast.linkCopied.title"),
        description: t("loc.toast.linkCopied.desc"),
      });
    } catch {
      toast({
        title: t("loc.toast.copyFailed.title"),
        description: t("loc.toast.copyFailed.desc"),
        variant: "destructive",
      });
    }
  };

  const downloadQrCode = () => {
    if (!qrDataUrl || !qrLocation) return;
    const label =
      qrLocation.displayName || qrLocation.name || qrLocation.id || "location";
    const safe = label
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const link = document.createElement("a");
    link.download = `${safe}-queue-qr.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const addLocation = async () => {
    if (!newLocationDisplayName.trim()) {
      toast({
        title: t("loc.toast.displayNameRequired.title"),
        description: t("loc.toast.displayNameRequired.desc"),
        variant: "destructive",
      });
      return;
    }
    if (!newLocationAddress.trim()) {
      toast({
        title: t("loc.toast.addressRequired.title"),
        description: t("loc.toast.addressRequired.desc"),
        variant: "destructive",
      });
      return;
    }
    if (atMax) {
      toast({
        title: t("loc.toast.limitReached.title"),
        description: t("loc.toast.limitReached.desc", { max: maxLocations }),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const place = newLocationPlace;
      // Manual / non-geocoded entry is allowed, but warn that map data is missing.
      if (!place?.googlePlaceId || place?.latitude == null) {
        toast({
          title: t("loc.toast.savedNoMap.title"),
          description: t("loc.toast.savedNoMap.desc"),
        });
      }
      const updated = await api("/auth/business/locations", {
        method: "POST",
        body: JSON.stringify({
          displayName: newLocationDisplayName.trim(),
          address: newLocationAddress.trim(),
          area: place?.area,
          city: place?.city,
          country: place?.country,
          latitude: place?.latitude ?? null,
          longitude: place?.longitude ?? null,
          googlePlaceId: place?.googlePlaceId,
          googleMapsUrl: place?.googleMapsUrl,
        }),
      });
      onChanged(updated.user);
      setNewLocationAddress("");
      setNewLocationDisplayName("");
      setNewLocationPlace(null);
      toast({
        title: t("loc.toast.added.title"),
        description: t("loc.toast.added.desc"),
      });
    } catch (e: any) {
      toast({
        title: t("loc.toast.addFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const removeLocation = async (locationIndex: number) => {
    setLoading(true);
    try {
      const updatedLocations = locations.filter(
        (_, index) => index !== locationIndex,
      );
      const updated = await api("/auth/business/me", {
        method: "PUT",
        body: JSON.stringify({ locations: updatedLocations }),
      });
      onChanged(updated.user);
      toast({
        title: t("loc.toast.removed.title"),
        description: t("loc.toast.removed.desc"),
      });
    } catch (e: any) {
      toast({
        title: t("loc.toast.removeFailed.title"),
        description: e?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">
            {t("loc.title")}
          </CardTitle>
          <CardDescription className="text-gray-600 text-sm md:text-base">
            {t("loc.desc", {
              count: locations.length,
              max: maxLocations,
              locWord: t(maxLocations === 1 ? "loc.location" : "loc.locations"),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6 pt-0">
          {/* Add New Location */}
          <div className="border border-dashed border-gray-300 rounded-lg p-4 md:p-6">
            {/* Header row: title + Add Location button (top-right on sm+) */}
            <div className="flex items-center justify-between gap-3 mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                {t("loc.addNew")}
              </h3>
              <Button
                onClick={addLocation}
                disabled={loading || atMax}
                className="hidden text-sm md:text-base lg:inline-flex"
              >
                <Plus size={16} className="mr-2" /> {t("loc.addBtn")}
              </Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                {/* Location Display Name (customer-facing label) */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="newLocationDisplayName"
                    className="text-sm md:text-base"
                  >
                    {t("loc.displayName")}
                  </Label>
                  <Input
                    id="newLocationDisplayName"
                    placeholder={t("loc.displayName.placeholder")}
                    value={newLocationDisplayName}
                    onChange={(e) => setNewLocationDisplayName(e.target.value)}
                    disabled={atMax}
                    className={`text-sm md:text-base ${
                      atMax ? "bg-gray-100 cursor-not-allowed" : ""
                    }`}
                  />
                  <p className="text-xs text-gray-500">
                    {t("loc.displayName.help")}
                  </p>
                </div>

                {/* Address search (Google Places autocomplete) */}
                <div className="space-y-1.5">
                  <Label htmlFor="newLocation" className="text-sm md:text-base">
                    {t("loc.searchAddress")}
                  </Label>
                  <AddressAutocomplete
                    id="newLocation"
                    value={newLocationAddress}
                    onChange={(t) => {
                      setNewLocationAddress(t);
                      // Manual edits invalidate a previously picked place.
                      setNewLocationPlace((p) =>
                        p && p.address === t ? p : null,
                      );
                    }}
                    onPlaceSelected={(d) => {
                      setNewLocationPlace(d);
                      setNewLocationAddress(d.address);
                    }}
                    placeholder={t("loc.searchAddress.placeholder")}
                    disabled={atMax}
                    className={`text-sm md:text-base ${
                      atMax ? "bg-gray-100 cursor-not-allowed" : ""
                    }`}
                  />
                </div>
              </div>
              {/* Mobile + tablet: button stays attached below the fields,
                  full width. The top-right button only shows on desktop (lg+). */}
              <Button
                onClick={addLocation}
                disabled={loading || atMax}
                className="w-full text-sm md:text-base lg:hidden"
              >
                <Plus size={16} className="mr-2" /> {t("loc.addBtn")}
              </Button>
            </div>
            {atMax && (
              <p className="text-xs md:text-sm text-red-600 mt-2">
                {t("loc.atMax")}
              </p>
            )}
          </div>

          {/* Existing Locations */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-3 md:mb-4">
              {t("loc.current")}
            </h3>
            {locations.length === 0 ? (
              <div className="text-center py-6 md:py-8">
                <MapPin className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-3 md:mb-4" />
                <p className="text-gray-500 text-sm md:text-base">
                  {t("loc.none")}
                </p>
                <p className="text-xs md:text-sm text-gray-400 mt-1">
                  {t("loc.none.help")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {locations.map((location: Location, index: number) => {
                  const short =
                    location.shortAddress ||
                    deriveShortAddress(location.address);
                  const isExpanded = expandedIds.has(location.id);
                  const hasFullMore = Boolean(
                    location.address &&
                    location.address.trim() !== short.trim(),
                  );
                  return (
                    <div
                      key={location.id || index}
                      className="flex flex-col gap-4 p-3 md:p-4 bg-gray-50 rounded-lg lg:flex-row lg:items-start lg:justify-between lg:gap-4"
                    >
                      <div className="flex items-start space-x-3 min-w-0 flex-1">
                        <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          {/* Name + credits pill on one row. The pill wraps below
                              the name when there isn't room, but stays grouped
                              with it (above the address). */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {/* Customer-facing display name with safe fallbacks. */}
                            <p className="font-medium text-gray-800 text-sm md:text-base break-words">
                              {location.displayName ||
                                location.name ||
                                location.address ||
                                t("loc.unnamed")}
                            </p>
                            <span className="inline-flex w-fit shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                              {t("loc.credits", { n: location?.credits || 0 })}
                            </span>
                          </div>
                          {!location.displayName && (
                            <p className="text-xs text-amber-600">
                              {t("loc.addDisplayNameHint")}
                            </p>
                          )}

                          {/* Short address by default; full address behind a toggle. */}
                          {location.address && (
                            <>
                              <p
                                className="mt-1 text-xs md:text-sm text-gray-500 truncate"
                                title={location.address}
                              >
                                {short}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                {hasFullMore && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(location.id)}
                                    className="text-xs font-medium text-indigo-600 hover:underline"
                                  >
                                    {isExpanded
                                      ? t("loc.hideFullAddress")
                                      : t("loc.viewFullAddress")}
                                  </button>
                                )}
                                {location.googleMapsUrl && (
                                  <a
                                    href={location.googleMapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-indigo-600 hover:underline"
                                  >
                                    {t("loc.viewOnMaps")}
                                  </a>
                                )}
                              </div>
                              {isExpanded && (
                                <p className="mt-1 text-xs text-gray-500 break-words">
                                  {location.address}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action row: 1 button per row on mobile, 2 per row on
                          tablet (grid), and a single horizontal row on desktop
                          (lg+). Keeps buttons full-height and aligned — including
                          Delete — instead of cramming a compressed desktop row. */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end lg:gap-3 lg:shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 w-full justify-center lg:w-auto"
                          onClick={() => setEditing(location)}
                        >
                          <Pencil size={16} className="mr-2" />{" "}
                          {t("loc.editProfile")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 w-full justify-center lg:w-auto"
                          onClick={() => {
                            setSelectedLocationForReviews(location);
                            setIsReviewsModalOpen(true);
                          }}
                        >
                          <Star size={16} className="mr-2" />{" "}
                          {t("loc.viewReviews")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 w-full justify-center lg:w-auto"
                          onClick={() => openQrModal(location)}
                        >
                          <QrCode size={16} className="mr-2" /> {t("loc.qrCode")}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructiveOutline"
                              className="h-10 w-full justify-center lg:w-10 lg:px-0"
                              disabled={loading}
                            >
                              <Trash2 size={16} className="mr-2 lg:mr-0" />
                              <span className="lg:hidden">
                                {t("loc.removeLocation")}
                              </span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-sm md:max-w-lg">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("loc.removeLocation")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("loc.remove.confirmBody", {
                                  name:
                                    location.displayName || location.address,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
                              <AlertDialogCancel className="w-full md:w-auto">
                                {t("common.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeLocation(index)}
                                variant="destructive"
                                className="w-full md:w-auto"
                              >
                                {t("loc.removeLocation")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Restaurant Profile — opens the public profile editor for the
          chosen location in a modal. */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {/* Mobile sizing + typography come from the shared modal styles in
            ui/dialog.tsx; only the desktop width/height differ here. */}
        <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-left">
            <DialogTitle>{t("loc.editProfile")}</DialogTitle>
            <DialogDescription>
              {editing?.displayName || editing?.address}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <RestaurantProfileEditor
              key={editing.id}
              location={editing}
              onSaved={(u) => {
                onChanged(u);
                setEditing(null);
              }}
              onMediaChange={(u: any) => {
                // Banner/photo uploads persist immediately — refresh the
                // dashboard + the open editor snapshot without closing the modal.
                onChanged(u);
                setEditing((prev) =>
                  prev
                    ? ((u?.locations || []).find(
                        (l: Location) => l.id === prev.id,
                      ) ?? prev)
                    : prev,
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View Reviews — owner-only customer reviews for the chosen location. */}
      <LocationReviewsModal
        location={selectedLocationForReviews}
        open={isReviewsModalOpen}
        onOpenChange={(open) => {
          setIsReviewsModalOpen(open);
          if (!open) setSelectedLocationForReviews(null);
        }}
      />

      {/* Location QR Code — customers scan this to join THIS location's queue. */}
      <Dialog
        open={!!qrLocation}
        onOpenChange={(open) => {
          if (!open) {
            setQrLocation(null);
            setQrDataUrl("");
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md overflow-x-hidden rounded-xl">
          <DialogHeader>
            <DialogTitle>{t("loc.qrModal.title")}</DialogTitle>
            <DialogDescription>
              {qrLocation?.displayName ||
                qrLocation?.name ||
                qrLocation?.address}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* QR image */}
            <div className="flex justify-center">
              <div className="inline-block rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={t("loc.qrModal.title")}
                    className="mx-auto h-56 w-56"
                  />
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center text-sm text-gray-400">
                    {t("loc.qrModal.generating")}
                  </div>
                )}
              </div>
            </div>

            {/* Queue URL */}
            <div className="space-y-1.5">
              <Label className="text-sm">{t("loc.qrModal.queueLink")}</Label>
              <code className="block break-all rounded-md bg-gray-100 px-3 py-2 font-mono text-xs text-indigo-600">
                {qrLocation ? queueUrlFor(qrLocation) : ""}
              </code>
            </div>

            <p className="text-center text-xs text-gray-500">
              {t("loc.qrModal.help")}
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="w-full sm:flex-1"
                onClick={copyQueueLink}
              >
                <Copy size={16} className="mr-2" /> {t("loc.qrModal.copyLink")}
              </Button>
              <Button
                className="w-full sm:flex-1"
                onClick={downloadQrCode}
                disabled={!qrDataUrl}
              >
                <Download size={16} className="mr-2" />{" "}
                {t("loc.qrModal.downloadQr")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
