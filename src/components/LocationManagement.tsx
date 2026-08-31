import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Location01Icon,
  Edit03Icon,
  QrCodeIcon,
} from "@hugeicons/core-free-icons";
import QRCode from "qrcode";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import RestaurantProfileEditor from "@/components/RestaurantProfileEditor";
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

function deriveShortAddress(full?: string | null): string {
  if (!full) {
    return "";
  }
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
  const [newLocationPlace, setNewLocationPlace] = useState<PlaceDetails | null>(null);
  const [editing, setEditing] = useState<Location | null>(null);
  const [qrLocation, setQrLocation] = useState<Location | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const locations: Location[] = me?.locations || [];
  const maxLocations = me?.maxLocations ?? 1;
  const atMax = locations.length >= maxLocations;
  const businessUsername = me?.username || "";

  const queueUrlFor = (location: Location) =>
    `${window.location.origin}/queue/${businessUsername}/${location.id}`;

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
    if (!qrLocation) {
      return;
    }
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
    if (!qrDataUrl || !qrLocation) {
      return;
    }
    const label = qrLocation.displayName || qrLocation.name || qrLocation.id || "location";
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
      const updatedLocations = locations.filter((_, index) => index !== locationIndex);
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

  let locWord: string;
  if (maxLocations === 1) {
    locWord = t("loc.location");
  } else {
    locWord = t("loc.locations");
  }

  let atMaxFieldClass: string;
  if (atMax) {
    atMaxFieldClass = "bg-gray-100 cursor-not-allowed";
  } else {
    atMaxFieldClass = "";
  }

  let locationsContent: ReactNode;
  if (locations.length === 0) {
    locationsContent = (
      <BusinessEmptyState
        icon={Location01Icon}
        title={t("loc.none")}
        body={t("loc.none.help")}
        className="px-4 py-8"
      />
    );
  } else {
    locationsContent = (
      <div className="space-y-3">
        {locations.map((location: Location, index: number) => {
          const short = location.shortAddress || deriveShortAddress(location.address);
          const isExpanded = expandedIds.has(location.id);
          const hasFullMore = Boolean(location.address && location.address.trim() !== short.trim());
          let fullAddressToggleLabel: string;
          if (isExpanded) {
            fullAddressToggleLabel = t("loc.hideFullAddress");
          } else {
            fullAddressToggleLabel = t("loc.viewFullAddress");
          }
          return (
            <div
              key={location.id || index}
              className="flex flex-col gap-4 rounded-lg bg-gray-50 p-3 md:flex-row md:items-start md:justify-between md:gap-4 md:p-4"
            >
              <div className="flex items-start space-x-3 min-w-0 flex-1">
                <HugeiconsIcon
                  icon={Location01Icon}
                  className="w-4 h-4 md:w-5 md:h-5 text-gray-400 flex-shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p
                      className="break-words text-sm font-medium text-gray-800 md:text-base"
                      data-testid={`loc-name-${location.id}`}
                    >
                      {location.displayName ||
                        location.name ||
                        location.address ||
                        t("loc.unnamed")}
                    </p>
                    <span className="inline-flex w-fit shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-caption font-medium text-indigo-700">
                      {t("loc.credits", { n: location?.credits || 0 })}
                    </span>
                  </div>
                  {!location.displayName && (
                    <p className="text-xs text-amber-600">{t("loc.addDisplayNameHint")}</p>
                  )}

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
                            {fullAddressToggleLabel}
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
                        <p className="mt-1 text-xs text-gray-500 break-words">{location.address}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div
                className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 md:shrink-0 md:flex-nowrap"
                data-testid={`loc-actions-${location.id}`}
              >
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("loc.editProfile")}
                  title={t("loc.editProfile")}
                  className="h-10 w-full justify-center sm:w-auto md:w-10 md:px-0 xl:w-auto xl:px-4"
                  onClick={() => setEditing(location)}
                >
                  <HugeiconsIcon icon={Edit03Icon} size={16} className="mr-2 md:mr-0 xl:mr-2" />
                  <span className="md:hidden xl:inline" data-testid="loc-edit-label">
                    {t("loc.editProfile")}
                  </span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("loc.qrCode")}
                  title={t("loc.qrCode")}
                  className="h-10 w-full justify-center sm:w-auto md:w-10 md:px-0 xl:w-auto xl:px-4"
                  onClick={() => openQrModal(location)}
                >
                  <HugeiconsIcon icon={QrCodeIcon} size={16} className="mr-2 md:mr-0 xl:mr-2" />
                  <span className="md:hidden xl:inline" data-testid="loc-qr-label">
                    {t("loc.qrCode")}
                  </span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructiveOutline"
                      className="h-10 w-full justify-center sm:w-10 sm:px-0"
                      aria-label={t("loc.removeLocation")}
                      title={t("loc.removeLocation")}
                      disabled={loading}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={16} className="mr-2 sm:mr-0" />
                      <span className="sm:hidden">{t("loc.removeLocation")}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-w-sm md:max-w-lg">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("loc.removeLocation")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("loc.remove.confirmBody", {
                          name: location.displayName || location.address,
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
    );
  }

  let qrPreviewContent: ReactNode;
  if (qrDataUrl) {
    qrPreviewContent = (
      <img src={qrDataUrl} alt={t("loc.qrModal.title")} className="mx-auto h-56 w-56" />
    );
  } else {
    qrPreviewContent = (
      <div className="flex h-56 w-56 items-center justify-center text-sm text-gray-400">
        {t("loc.qrModal.generating")}
      </div>
    );
  }

  let queueLinkText: string;
  if (qrLocation) {
    queueLinkText = queueUrlFor(qrLocation);
  } else {
    queueLinkText = "";
  }

  return (
    <>
      <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-gray-800">{t("loc.title")}</CardTitle>
          <CardDescription className="text-gray-600 text-sm md:text-base">
            {t("loc.desc", {
              count: locations.length,
              max: maxLocations,
              locWord: locWord,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6 pt-0">
          <div className="border border-dashed border-gray-300 rounded-lg p-4 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold text-gray-800">
                {t("loc.addNew")}
              </h3>
              <Button
                onClick={addLocation}
                disabled={loading || atMax}
                className="hidden text-sm md:text-base lg:inline-flex"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} className="mr-2" /> {t("loc.addBtn")}
              </Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <div className="space-y-1.5">
                  <Label htmlFor="newLocationDisplayName" className="text-sm md:text-base">
                    {t("loc.displayName")}
                  </Label>
                  <Input
                    id="newLocationDisplayName"
                    placeholder={t("loc.displayName.placeholder")}
                    value={newLocationDisplayName}
                    onChange={(e) => setNewLocationDisplayName(e.target.value)}
                    disabled={atMax}
                    className={`text-sm md:text-base ${atMaxFieldClass}`}
                  />
                  <p className="text-xs text-gray-500">{t("loc.displayName.help")}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newLocation" className="text-sm md:text-base">
                    {t("loc.searchAddress")}
                  </Label>
                  <AddressAutocomplete
                    id="newLocation"
                    value={newLocationAddress}
                    onChange={(t) => {
                      setNewLocationAddress(t);
                      setNewLocationPlace((p) => {
                        if (p && p.address === t) {
                          return p;
                        }
                        return null;
                      });
                    }}
                    onPlaceSelected={(d) => {
                      setNewLocationPlace(d);
                      setNewLocationAddress(d.address);
                    }}
                    placeholder={t("loc.searchAddress.placeholder")}
                    disabled={atMax}
                    className={`text-sm md:text-base ${atMaxFieldClass}`}
                  />
                </div>
              </div>
              <Button
                onClick={addLocation}
                disabled={loading || atMax}
                className="w-full text-sm md:text-base lg:hidden"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} className="mr-2" /> {t("loc.addBtn")}
              </Button>
            </div>
            {atMax && <p className="text-xs md:text-sm text-red-600 mt-2">{t("loc.atMax")}</p>}
          </div>

          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-3 md:mb-4">
              {t("loc.current")}
            </h3>
            {locationsContent}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:max-w-2xl">
          <DialogHeader className="text-left">
            <DialogTitle>{t("loc.editProfile")}</DialogTitle>
            <DialogDescription>{editing?.displayName || editing?.address}</DialogDescription>
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
                onChanged(u);
                setEditing((prev) => {
                  if (!prev) {
                    return prev;
                  }
                  const match = (u?.locations || []).find((l: Location) => l.id === prev.id);
                  return match ?? prev;
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
              {qrLocation?.displayName || qrLocation?.name || qrLocation?.address}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="inline-block rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm">
                {qrPreviewContent}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">{t("loc.qrModal.queueLink")}</Label>
              <code className="block break-all rounded-md bg-gray-100 px-3 py-2 font-mono text-xs text-indigo-600">
                {queueLinkText}
              </code>
            </div>

            <p className="text-center text-xs text-gray-500">{t("loc.qrModal.help")}</p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="w-full sm:flex-1" onClick={copyQueueLink}>
                <HugeiconsIcon icon={Copy01Icon} size={16} className="mr-2" />{" "}
                {t("loc.qrModal.copyLink")}
              </Button>
              <Button className="w-full sm:flex-1" onClick={downloadQrCode} disabled={!qrDataUrl}>
                <HugeiconsIcon icon={Download01Icon} size={16} className="mr-2" />{" "}
                {t("loc.qrModal.downloadQr")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
