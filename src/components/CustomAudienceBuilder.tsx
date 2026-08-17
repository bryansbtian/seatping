import { useState, useEffect, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { GuestTagBadge, GuestStatusBadge } from "./GuestBadge";
import { formatPhone } from "@/lib/phone";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomFilters {
  tags?: string[];
  totalVisitsMin?: number;
  totalVisitsMax?: number;
  lastVisitMinDaysAgo?: number;
  lastVisitMaxDaysAgo?: number;
  hasUpcomingReservation?: boolean;
  hasNoShowHistory?: boolean;
  hasNotes?: boolean;
  guestIds?: string[];
}

export interface SavedAudience {
  id: string;
  name: string;
  description: string | null;
  filters: CustomFilters;
}

interface PreviewGuest {
  id: string;
  fullName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  tags: string[];
  lastVisitAt: string | null;
  totalVisits: number;
  returning: boolean;
}

const PREVIEW_VISIBLE = 5;

function previewInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "G";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function previewLastVisit(value: string | null): string {
  if (!value) {
    return "";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CustomAudienceBuilder({
  open,
  onClose,
  locationId,
  existing,
  onSaved,
  suggestedTags,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
  existing?: SavedAudience | null;
  onSaved: () => void;
  suggestedTags?: string[];
}) {
  const { toast } = useToast();

  const [name, setName] = useState(existing?.name || "");
  const [description, setDescription] = useState(existing?.description || "");

  const [selectedGuests, setSelectedGuests] = useState<any[]>([]);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestSearchResults, setGuestSearchResults] = useState<any[]>([]);
  const [isSearchingGuests, setIsSearchingGuests] = useState(false);
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);

  useEffect(() => {
    if (existing?.filters?.guestIds?.length && locationId) {
      const ids = existing.filters.guestIds.join(",");
      api(`/api/guests?locationId=${locationId}&ids=${ids}`)
        .then((data) => {
          if (data.guests) {
            setSelectedGuests(data.guests);
          }
        })
        .catch((e) => console.error("Failed to fetch selected guests", e));
    }
  }, [existing, locationId]);

  useEffect(() => {
    if (!guestSearch.trim()) {
      setGuestSearchResults([]);
      setShowGuestDropdown(false);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearchingGuests(true);
      try {
        const data = await api(`/api/guests?locationId=${locationId}&search=${encodeURIComponent(guestSearch)}`);
        setGuestSearchResults(data.guests || []);
        setShowGuestDropdown(true);
      } catch (e) {
        console.error("Guest search failed", e);
      } finally {
        setIsSearchingGuests(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [guestSearch, locationId]);

  const addGuest = (guest: any) => {
    if (!selectedGuests.find((g) => g.id === guest.id)) {
      setSelectedGuests([...selectedGuests, guest]);
    }
    setGuestSearch("");
    setShowGuestDropdown(false);
  };

  const removeGuest = (guestId: string) => {
    setSelectedGuests(selectedGuests.filter((g) => g.id !== guestId));
  };

  let initialTags: string[] = [];
  if (existing?.filters?.tags) {
    initialTags = existing.filters.tags;
  }
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [visitsMin, setVisitsMin] = useState<string>(
    existing?.filters?.totalVisitsMin?.toString() || ""
  );
  const [visitsMax, setVisitsMax] = useState<string>(
    existing?.filters?.totalVisitsMax?.toString() || ""
  );
  const [lastVisitMin, setLastVisitMin] = useState<string>(
    existing?.filters?.lastVisitMinDaysAgo?.toString() || ""
  );
  const [lastVisitMax, setLastVisitMax] = useState<string>(
    existing?.filters?.lastVisitMaxDaysAgo?.toString() || ""
  );
  const [hasUpcomingReservation, setHasUpcomingReservation] = useState(
    existing?.filters?.hasUpcomingReservation || false
  );
  const [hasNoShowHistory, setHasNoShowHistory] = useState(
    existing?.filters?.hasNoShowHistory || false
  );
  const [hasNotes, setHasNotes] = useState(
    existing?.filters?.hasNotes || false
  );

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewGuests, setPreviewGuests] = useState<PreviewGuest[]>([]);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const buildFilters = (): CustomFilters => {
    const filters: CustomFilters = {};
    if (tags.length > 0) {
      filters.tags = tags;
    }
    if (visitsMin.trim()) {
      filters.totalVisitsMin = Number(visitsMin);
    }
    if (visitsMax.trim()) {
      filters.totalVisitsMax = Number(visitsMax);
    }
    if (lastVisitMin.trim()) {
      filters.lastVisitMinDaysAgo = Number(lastVisitMin);
    }
    if (lastVisitMax.trim()) {
      filters.lastVisitMaxDaysAgo = Number(lastVisitMax);
    }
    if (hasUpcomingReservation) {
      filters.hasUpcomingReservation = true;
    }
    if (hasNoShowHistory) {
      filters.hasNoShowHistory = true;
    }
    if (hasNotes) {
      filters.hasNotes = true;
    }
    
    if (selectedGuests.length > 0) {
      filters.guestIds = selectedGuests.map(g => g.id);
    } else {
      delete filters.guestIds;
    }

    return filters;
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const filters = buildFilters();
      const res = await api(`/api/audiences/preview`, {
        method: "POST",
        body: JSON.stringify({
          locationId,
          filters,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setPreviewCount(res.count);
      let nextPreviewGuests: PreviewGuest[] = [];
      if (Array.isArray(res.guests)) {
        nextPreviewGuests = res.guests;
      }
      setPreviewGuests(nextPreviewGuests);
      setPreviewExpanded(false);
    } catch (e: any) {
      toast({
        title: "Preview Failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const filters = buildFilters();
      const payload = {
        locationId,
        name,
        description,
        filters,
      };

      let url: string;
      let method: string;
      if (existing) {
        url = `/api/audiences/${existing.id}`;
        method = "PATCH";
      } else {
        url = `/api/audiences`;
        method = "POST";
      }

      await api(url, {
        method,
        body: JSON.stringify(payload),
      });

      toast({
        title: "Custom Group Saved",
        description: `Group "${name}" has been saved successfully.`,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({
        title: "Save Failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  let dialogTitle: string;
  if (existing) {
    dialogTitle = "Edit Custom Group";
  } else {
    dialogTitle = "Create Custom Group";
  }

  let tagsTriggerContent: ReactNode;
  if (tags.length > 0) {
    tagsTriggerContent = tags.map((tag) => (
      <GuestTagBadge
        key={tag}
        tag={tag}
        onRemove={() =>
          setTags(tags.filter((t) => t !== tag))
        }
      />
    ));
  } else {
    tagsTriggerContent = (
      <span className="text-muted-foreground">Select Tags</span>
    );
  }

  let previewButtonLabel: string;
  if (isPreviewing) {
    previewButtonLabel = "Calculating...";
  } else {
    previewButtonLabel = "Preview";
  }

  let previewCountSuffix: string;
  if (previewCount === 1) {
    previewCountSuffix = "";
  } else {
    previewCountSuffix = "s";
  }

  let visiblePreviewGuests: PreviewGuest[];
  if (previewExpanded) {
    visiblePreviewGuests = previewGuests;
  } else {
    visiblePreviewGuests = previewGuests.slice(0, PREVIEW_VISIBLE);
  }

  let previewToggleLabel: string;
  if (previewExpanded) {
    previewToggleLabel = "Show Less";
  } else {
    previewToggleLabel = `View More (${previewGuests.length - PREVIEW_VISIBLE})`;
  }

  let saveButtonLabel: string;
  if (isSaving) {
    saveButtonLabel = "Saving...";
  } else {
    saveButtonLabel = "Save Custom Group";
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <Label>Group Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIP Regulars"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Description (Optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Guests who visit often and spend well."
              rows={2}
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-lg mb-4">Filters</h3>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Tags</Label>
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={tagPopoverOpen}
                      className="w-full justify-between h-auto min-h-10 text-left px-3 py-2 font-normal"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tagsTriggerContent}
                      </div>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search tags..." />
                      <CommandList>
                        <CommandEmpty>No Tags Yet</CommandEmpty>
                        <CommandGroup>
                          {suggestedTags?.map((tagOption) => {
                            const isSelected = tags.some((t) => t.toLowerCase() === tagOption.toLowerCase());
                            let checkOpacityClass: string;
                            if (isSelected) {
                              checkOpacityClass = "opacity-100";
                            } else {
                              checkOpacityClass = "opacity-0";
                            }
                            return (
                              <CommandItem
                                key={tagOption}
                                value={tagOption}
                                onSelect={(currentValue) => {
                                  if (isSelected) {
                                    setTags(tags.filter((t) => t.toLowerCase() !== tagOption.toLowerCase()));
                                  } else {
                                    setTags([...tags, tagOption]);
                                  }
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    checkOpacityClass
                                  )}
                                />
                                {tagOption}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Min Total Visits</Label>
                  <Input
                    type="number"
                    value={visitsMin}
                    onChange={(e) => setVisitsMin(e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Max Total Visits</Label>
                  <Input
                    type="number"
                    value={visitsMax}
                    onChange={(e) => setVisitsMax(e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Last Visit (Min Days Ago)</Label>
                  <Input
                    type="number"
                    value={lastVisitMin}
                    onChange={(e) => setLastVisitMin(e.target.value)}
                    placeholder="e.g. 30"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Last Visit (Max Days Ago)</Label>
                  <Input
                    type="number"
                    value={lastVisitMax}
                    onChange={(e) => setLastVisitMax(e.target.value)}
                    placeholder="e.g. 90"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasUpcoming"
                    checked={hasUpcomingReservation}
                    onCheckedChange={(c) =>
                      setHasUpcomingReservation(c === true)
                    }
                  />
                  <Label htmlFor="hasUpcoming" className="cursor-pointer">
                    Has Upcoming Reservation
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasNoShow"
                    checked={hasNoShowHistory}
                    onCheckedChange={(c) => setHasNoShowHistory(c === true)}
                  />
                  <Label htmlFor="hasNoShow" className="cursor-pointer">
                    Has No-Show History
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasNotes"
                    checked={hasNotes}
                    onCheckedChange={(c) => setHasNotes(c === true)}
                  />
                  <Label htmlFor="hasNotes" className="cursor-pointer">
                    Has Guest Notes
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-lg mb-1">Manually Selected Guests</h3>
            <p className="text-sm text-slate-500 mb-4">
              Search and add specific guests to this group.
            </p>

            <div className="flex flex-col gap-3">
              <div className="relative">
                <Input
                  placeholder="Search guests by name, phone, email, or tag..."
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  onFocus={() => {
                    if (guestSearchResults.length > 0) {
                      setShowGuestDropdown(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowGuestDropdown(false), 200);
                  }}
                />
                {isSearchingGuests && (
                  <div className="absolute right-3 top-2.5 text-xs text-slate-400">
                    Searching...
                  </div>
                )}
                {showGuestDropdown && guestSearchResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {guestSearchResults.map((guest) => (
                      <div
                        key={guest.id}
                        className="px-3 py-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center border-b last:border-0"
                        onClick={() => addGuest(guest)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{guest.fullName || "Unnamed Guest"}</span>
                          {(guest.phone || guest.email) && (
                            <span className="text-xs text-slate-500">
                              {[guest.phone, guest.email].filter(Boolean).join(" • ")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showGuestDropdown && guestSearch.trim() && guestSearchResults.length === 0 && !isSearchingGuests && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg px-3 py-2 text-sm text-slate-500 text-center">
                    No matching guests found.
                  </div>
                )}
              </div>

              {selectedGuests.length > 0 && (
                <div className="bg-slate-50 border rounded p-3 flex flex-col gap-2">
                  <div className="text-sm font-medium text-slate-600">
                    Selected Guests ({selectedGuests.length})
                  </div>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                    {selectedGuests.map((guest) => (
                      <div key={guest.id} className="flex items-center justify-between bg-white border rounded px-3 py-2 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{guest.fullName || "Unnamed Guest"}</span>
                          {(guest.phone || guest.email) && (
                            <span className="text-xs text-slate-500">
                              {[guest.phone, guest.email].filter(Boolean).join(" • ")}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeGuest(guest.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-slate-50 border rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Audience Preview</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={isPreviewing}
              >
                {previewButtonLabel}
              </Button>
            </div>

            {previewCount !== null && (
              <p className="text-sm text-slate-600">
                This group currently matches{" "}
                <strong>{previewCount}</strong> guest
                {previewCountSuffix}. The exact recipient count will
                be calculated at send-time.
              </p>
            )}

            {previewCount === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-600">
                  No Guests Match This Group Yet.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Try adjusting the filters or adding guests manually.
                </p>
              </div>
            )}

            {previewGuests.length > 0 && (
              <>
                <div className="rounded-lg border bg-white divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {visiblePreviewGuests.map((guest) => {
                    const name = guest.fullName || "Unnamed Guest";
                    const phoneDisplay = formatPhone(
                      guest.normalizedPhone,
                      guest.phone,
                    );
                    const lastVisit = previewLastVisit(guest.lastVisitAt);
                    return (
                      <div
                        key={guest.id}
                        className="flex items-start gap-3 px-3 py-2.5"
                      >
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0">
                          {previewInitials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-slate-800 truncate">
                              {name}
                            </span>
                            <GuestStatusBadge
                              returning={guest.returning}
                              className="shrink-0"
                            />
                          </div>
                          {(phoneDisplay || guest.email) && (
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {[phoneDisplay, guest.email]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          )}
                          {guest.tags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {guest.tags.slice(0, 4).map((tag) => (
                                <GuestTagBadge key={tag} tag={tag} />
                              ))}
                              {guest.tags.length > 4 && (
                                <span className="text-[11px] text-slate-400">
                                  +{guest.tags.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                          {lastVisit && (
                            <div className="text-[11px] text-slate-400 mt-1">
                              Last visit: {lastVisit}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {previewGuests.length > PREVIEW_VISIBLE && (
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded((v) => !v)}
                    className="self-start text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {previewToggleLabel}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {saveButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
