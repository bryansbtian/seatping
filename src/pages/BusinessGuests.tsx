import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { GuestStatusBadge, GuestTagBadge } from "@/components/GuestBadge";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { api } from "@/lib/api";
import { formatPhone } from "@shared/phone";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { useBusinessSession } from "@/lib/businessSession";
import { analytics } from "@/lib/analytics";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Call02Icon,
  Download01Icon,
  InboxIcon,
  Mail01Icon,
  NotebookIcon,
  Refresh01Icon,
  Search01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import Papa from "papaparse";

type GuestRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  tags: string[];
  totalVisits: number;
  waitlistVisitCount: number;
  upcomingReservationCount: number;
  pastReservationCount: number;
  noShowCount: number;
  cancelledCount: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  hasNotes: boolean;
  returning: boolean;
  locationId: string;
};

type TableActivity = {
  assignmentId: string;
  tableName: string;
  tableNames: string[];
  assignmentSource: string;
  status: string;
  seatedAt: string | null;
  completedAt: string | null;
  turnMinutes: number | null;
};

type TimelineEvent = {
  id: string;
  source: "waitlist" | "reservation";
  status: string;
  partySize: number;
  at: string | null;
  atLabel: string | null;
  location: string;
  notes: string | null;
  table?: TableActivity | null;
};

type GuestDetail = {
  guest: GuestRow & {
    notes: string;
    summary: string;
    normalizedEmail: string | null;
    createdAt: string;
    updatedAt: string;
    location: { id: string; label: string; timezone?: string | null };
  };
  timeline: TimelineEvent[];
  upcomingReservations: TimelineEvent[];
  pastReservations: TimelineEvent[];
  waitlistHistory: TimelineEvent[];
};

type LocationOption = { id: string; label: string };

type TypeFilter = "all" | "new" | "returning";

function fmtDate(value: string | null, timeZone?: string): string {
  if (!value) {
    return "--";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "--";
  }
  let timeZoneOption: { timeZone?: string } = {};
  if (timeZone) {
    timeZoneOption = { timeZone };
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...timeZoneOption,
  });
}

function fmtDateTime(value: string | null): string {
  if (!value) {
    return "--";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "--";
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function guestName(
  g: {
    fullName: string | null;
    phone: string | null;
    normalizedPhone: string | null;
    email: string | null;
  },
  fallback = "Guest",
) {
  return g.fullName || formatPhone(g.normalizedPhone, g.phone) || g.email || fallback;
}

function errMsg(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof Error) {
    return e.message;
  }
  return fallback;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "G";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold text-slate-800 mb-2.5">{children}</h4>;
}

const BusinessGuests = () => {
  const { t } = useLang();

  useEffect(() => {
    analytics.guestCrmOpened();
  }, []);

  const { currentLocation } = useBusinessSession();
  const locationId = currentLocation?.id ?? "";

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [hasUpcoming, setHasUpcoming] = useState(false);
  const [hasNotes, setHasNotes] = useState(false);
  const [hasNoShow, setHasNoShow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [locationTimezone, setLocationTimezone] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    api("/api/guests/meta")
      .then((d) => {
        if (cancelled) {
          return;
        }
        const locs: LocationOption[] = d?.locations ?? [];
        setLocations(locs);
        setSuggestedTags(d?.suggestedTags ?? []);
        setMetaLoaded(true);
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        setError(e?.message || "Failed to load guests.");
        setMetaLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchGuests = useCallback(() => {
    if (!locationId) {
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ locationId });
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }
    if (typeFilter !== "all") {
      params.set("type", typeFilter);
    }
    if (tagFilters.length) {
      params.set("tags", tagFilters.join(","));
    }
    if (hasUpcoming) {
      params.set("hasUpcoming", "true");
    }
    if (hasNotes) {
      params.set("hasNotes", "true");
    }
    if (hasNoShow) {
      params.set("hasNoShow", "true");
    }

    api(`/api/guests?${params.toString()}`)
      .then((d) => {
        setGuests(d?.guests ?? []);
        setLocationTimezone(d?.location?.timezone ?? undefined);
      })
      .catch((e) => setError(e?.message || "Failed to load guests."))
      .finally(() => setLoading(false));
  }, [locationId, debouncedSearch, typeFilter, tagFilters, hasUpcoming, hasNotes, hasNoShow]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  let typeFilterActive = 0;
  if (typeFilter !== "all") {
    typeFilterActive = 1;
  }
  let hasUpcomingActive = 0;
  if (hasUpcoming) {
    hasUpcomingActive = 1;
  }
  let hasNotesActive = 0;
  if (hasNotes) {
    hasNotesActive = 1;
  }
  let hasNoShowActive = 0;
  if (hasNoShow) {
    hasNoShowActive = 1;
  }
  const activeFilterCount =
    typeFilterActive + tagFilters.length + hasUpcomingActive + hasNotesActive + hasNoShowActive;

  const toggleTagFilter = (tag: string) => {
    setTagFilters((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const clearFilters = () => {
    setTypeFilter("all");
    setTagFilters([]);
    setHasUpcoming(false);
    setHasNotes(false);
    setHasNoShow(false);
  };

  const filterableTags = useMemo(() => {
    const set = new Set<string>(suggestedTags);
    for (const g of guests) {
      for (const t of g.tags) {
        set.add(t);
      }
    }
    return Array.from(set);
  }, [suggestedTags, guests]);

  const patchRow = useCallback((updated: GuestRow) => {
    setGuests((prev) =>
      prev.map((g) => {
        if (g.id === updated.id) {
          return { ...g, ...updated };
        }
        return g;
      }),
    );
  }, []);

  const currentLocationLabel = locations.find((l) => l.id === locationId)?.label || "";

  useEffect(() => {
    setSelectedId(null);
  }, [locationId]);

  const exportCsv = useCallback(() => {
    if (!guests.length) {
      return;
    }
    const rows = guests.map((g) => {
      let statusLabel: string;
      if (g.returning) {
        statusLabel = "Returning";
      } else {
        statusLabel = "New";
      }
      let firstVisitLabel = "";
      if (g.firstVisitAt) {
        firstVisitLabel = fmtDate(g.firstVisitAt, locationTimezone);
      }
      let lastVisitLabel = "";
      if (g.lastVisitAt) {
        lastVisitLabel = fmtDate(g.lastVisitAt, locationTimezone);
      }
      let hasNotesLabel: string;
      if (g.hasNotes) {
        hasNotesLabel = "Yes";
      } else {
        hasNotesLabel = "No";
      }
      return {
        Name: g.fullName || "",
        Phone: formatPhone(g.normalizedPhone, g.phone) || "",
        Email: g.email || "",
        Status: statusLabel,
        Tags: g.tags.join("; "),
        "Total Visits": g.totalVisits,
        Waitlist: g.waitlistVisitCount,
        Upcoming: g.upcomingReservationCount,
        "Past Reservations": g.pastReservationCount,
        "No-Shows": g.noShowCount,
        Cancelled: g.cancelledCount,
        "First Visit": firstVisitLabel,
        "Last Visit": lastVisitLabel,
        "Has Notes": hasNotesLabel,
      };
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const safeLabel = (currentLocationLabel || "guests")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guests-${safeLabel || "export"}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [guests, locationTimezone, currentLocationLabel]);

  let filtersVisibilityClass: string;
  if (filtersOpen) {
    filtersVisibilityClass = "block";
  } else {
    filtersVisibilityClass = "hidden";
  }

  let guestsHeading: string;
  if (currentLocationLabel) {
    guestsHeading = t("guests.atLocation", { label: currentLocationLabel });
  } else {
    guestsHeading = t("guests.heading");
  }

  let guestsCountText: string;
  if (loading) {
    guestsCountText = t("guests.loading");
  } else if (guests.length === 1) {
    guestsCountText = t("guests.countOne", { n: guests.length });
  } else {
    guestsCountText = t("guests.countMany", { n: guests.length });
  }

  let refreshSpinClass: string;
  if (loading) {
    refreshSpinClass = "animate-spin";
  } else {
    refreshSpinClass = "";
  }

  let guestsPanel: React.ReactNode;
  if (error) {
    guestsPanel = <ErrorState message={error} onRetry={fetchGuests} />;
  } else if (loading) {
    guestsPanel = <LoadingState />;
  } else if (!metaLoaded) {
    guestsPanel = <LoadingState />;
  } else if (!locations.length) {
    guestsPanel = (
      <BusinessEmptyState
        icon={InboxIcon}
        title={t("guests.empty.noLocations.title")}
        body={t("guests.empty.noLocations.body")}
      />
    );
  } else if (guests.length === 0) {
    let emptyTitle: string;
    let emptyBody: string;
    if (activeFilterCount > 0 || debouncedSearch) {
      emptyTitle = t("guests.empty.noMatch.title");
      emptyBody = t("guests.empty.noMatch.body");
    } else {
      emptyTitle = t("guests.empty.none.title");
      emptyBody = t("guests.empty.none.body");
    }
    guestsPanel = <BusinessEmptyState icon={InboxIcon} title={emptyTitle} body={emptyBody} />;
  } else {
    guestsPanel = (
      <GuestsTable
        guests={guests}
        timeZone={locationTimezone}
        onSelect={(id) => setSelectedId(id)}
      />
    );
  }

  return (
    <>
      <SEO title="Guests | SeatPing" description={BUSINESS_DESCRIPTION} image={BUSINESS_IMAGE} />
      <div className="flex min-h-full flex-col">
        <div className="container mx-auto flex w-full flex-1 flex-col px-4 py-8">
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-semibold text-gray-800">{t("guests.title")}</h1>
            <p className="text-gray-600 text-sm md:text-base">{t("guests.subtitle")}</p>
          </div>

          <Card className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
            <CardContent className="p-4 md:p-5 space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("guests.search.placeholder")}
                    className="pl-9 bg-slate-50 border-slate-200 rounded-xl"
                  />
                </div>

                <Button
                  variant="outline"
                  className="md:hidden justify-between"
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <span className="flex items-center gap-2">
                    <HugeiconsIcon icon={SlidersHorizontalIcon} className="w-4 h-4" />
                    {t("guests.filters")}
                  </span>
                  {activeFilterCount > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold w-5 h-5">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </div>

              <div className={`${filtersVisibilityClass} md:block space-y-3`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 mr-1">
                    {t("guests.status")}
                  </span>
                  {(["all", "new", "returning"] as TypeFilter[]).map((tf) => {
                    let typeChipClass: string;
                    if (typeFilter === tf) {
                      typeChipClass = "border-indigo-300 bg-indigo-100 text-indigo-700";
                    } else {
                      typeChipClass = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
                    }
                    let typeChipLabel: string;
                    if (tf === "all") {
                      typeChipLabel = t("guests.filter.all");
                    } else if (tf === "new") {
                      typeChipLabel = t("guests.filter.new");
                    } else {
                      typeChipLabel = t("guests.filter.returning");
                    }
                    return (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setTypeFilter(tf)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${typeChipClass}`}
                      >
                        {typeChipLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 mr-1">
                    {t("guests.showOnly")}
                  </span>
                  <FilterToggle
                    active={hasUpcoming}
                    onClick={() => setHasUpcoming((v) => !v)}
                    label={t("guests.filter.hasUpcoming")}
                  />
                  <FilterToggle
                    active={hasNotes}
                    onClick={() => setHasNotes((v) => !v)}
                    label={t("guests.filter.hasNotes")}
                  />
                  <FilterToggle
                    active={hasNoShow}
                    onClick={() => setHasNoShow((v) => !v)}
                    label={t("guests.filter.noShowHistory")}
                  />
                </div>

                {filterableTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 mr-1 mt-0.5">
                      {t("guests.tags")}
                    </span>
                    {filterableTags.map((tag) => {
                      let tagBadgeClass: string;
                      if (tagFilters.includes(tag)) {
                        tagBadgeClass = "ring-2 ring-indigo-400 ring-offset-1";
                      } else {
                        tagBadgeClass = "opacity-70 hover:opacity-100";
                      }
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTagFilter(tag)}
                          className="focus:outline-none"
                        >
                          <GuestTagBadge tag={tag} className={tagBadgeClass} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {t("guests.clearFilters")}
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 p-4 md:p-6 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg md:text-xl text-slate-800">{guestsHeading}</CardTitle>
                <CardDescription className="text-sm">{guestsCountText}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={loading || guests.length === 0}
                >
                  <HugeiconsIcon icon={Download01Icon} className="w-4 h-4" />
                  <span className="hidden sm:inline ml-2">{t("guests.export")}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchGuests}
                  disabled={loading || !locationId}
                >
                  <HugeiconsIcon icon={Refresh01Icon} className={`w-4 h-4 ${refreshSpinClass}`} />
                  <span className="hidden sm:inline ml-2">{t("common.refresh")}</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-0">{guestsPanel}</CardContent>
          </Card>
        </div>
      </div>

      <GuestDetailDrawer
        guestId={selectedId}
        onClose={() => setSelectedId(null)}
        suggestedTags={suggestedTags}
        onRowChange={patchRow}
      />
    </>
  );
};

function FilterToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  let toggleStateClass: string;
  if (active) {
    toggleStateClass = "border-indigo-300 bg-indigo-100 text-indigo-700";
  } else {
    toggleStateClass = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${toggleStateClass}`}
    >
      {icon}
      {label}
    </button>
  );
}

function GuestsTable({
  guests,
  timeZone,
  onSelect,
}: {
  guests: GuestRow[];
  timeZone?: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useLang();
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-6 py-3 font-medium">{t("guests.col.guest")}</th>
              <th className="px-6 py-3 font-medium">{t("guests.col.contact")}</th>
              <th className="px-6 py-3 font-medium">{t("guests.col.tags")}</th>
              <th className="px-6 py-3 font-medium text-center">{t("guests.col.totalVisits")}</th>
              <th className="px-6 py-3 font-medium">{t("guests.col.lastVisit")}</th>
              <th className="px-6 py-3 font-medium text-center">{t("guests.col.upcoming")}</th>
              <th className="px-6 py-3 font-medium text-center">{t("guests.col.notes")}</th>
              <th className="px-6 py-3 font-medium text-center">{t("guests.col.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {guests.map((g) => {
              const name = guestName(g, t("guests.defaultName"));
              const phoneDisplay = formatPhone(g.normalizedPhone, g.phone);
              let noShowLabel = "";
              if (g.noShowCount === 1) {
                noShowLabel = t("guests.noShowCountOne", { n: g.noShowCount });
              } else if (g.noShowCount > 1) {
                noShowLabel = t("guests.noShowCountMany", { n: g.noShowCount });
              }
              let tagsCell: React.ReactNode;
              if (g.tags.length) {
                tagsCell = (
                  <div className="flex flex-nowrap items-center gap-1.5">
                    {g.tags.slice(0, 3).map((t) => (
                      <GuestTagBadge key={t} tag={t} />
                    ))}
                    {g.tags.length > 3 && (
                      <span className="shrink-0 whitespace-nowrap text-caption text-slate-400">
                        +{g.tags.length - 3}
                      </span>
                    )}
                  </div>
                );
              } else {
                tagsCell = <span className="text-slate-400">--</span>;
              }
              let upcomingCell: React.ReactNode;
              if (g.upcomingReservationCount > 0) {
                upcomingCell = (
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {g.upcomingReservationCount}
                  </span>
                );
              } else {
                upcomingCell = <span className="text-slate-400">--</span>;
              }
              let notesCell: React.ReactNode;
              if (g.hasNotes) {
                notesCell = (
                  <HugeiconsIcon icon={NotebookIcon} className="w-4 h-4 text-amber-500 inline" />
                );
              } else {
                notesCell = <span className="text-slate-300">--</span>;
              }
              return (
                <tr
                  key={g.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => onSelect(g.id)}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {initials(name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate flex items-center gap-2">
                          {name}
                          <GuestStatusBadge returning={g.returning} />
                        </div>
                        {g.noShowCount > 0 && (
                          <span className="text-xs text-red-600">{noShowLabel}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    <div className="space-y-0.5">
                      {phoneDisplay && (
                        <div className="flex items-center gap-1.5 truncate">
                          <HugeiconsIcon icon={Call02Icon} className="w-3 h-3 text-slate-400" />
                          <span className="tabular-nums whitespace-nowrap">{phoneDisplay}</span>
                        </div>
                      )}
                      {g.email && (
                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                          <HugeiconsIcon
                            icon={Mail01Icon}
                            className="w-3 h-3 text-slate-400 shrink-0"
                          />
                          <span className="truncate">{g.email}</span>
                        </div>
                      )}
                      {!phoneDisplay && !g.email && <span className="text-slate-400">--</span>}
                    </div>
                  </td>
                  <td className="px-6 py-3">{tagsCell}</td>
                  <td className="px-6 py-3 text-center font-medium text-slate-700 tabular-nums">
                    {g.totalVisits}
                  </td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                    {fmtDate(g.lastVisitAt, timeZone)}
                  </td>
                  <td className="px-6 py-3 text-center tabular-nums">{upcomingCell}</td>
                  <td className="px-6 py-3 text-center">{notesCell}</td>
                  <td className="px-6 py-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(g.id);
                      }}
                    >
                      {t("common.view")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-slate-100">
        {guests.map((g) => {
          const name = guestName(g, t("guests.defaultName"));
          const phoneDisplay = formatPhone(g.normalizedPhone, g.phone);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{name}</span>
                    <GuestStatusBadge returning={g.returning} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                    {phoneDisplay && <div className="truncate tabular-nums">{phoneDisplay}</div>}
                    {g.email && <div className="truncate">{g.email}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-2">
                    <span>
                      <strong className="text-slate-800">{g.totalVisits}</strong>{" "}
                      {t("guests.visitsWord")}
                    </span>
                    <span>
                      {t("guests.lastLabel")}: {fmtDate(g.lastVisitAt, timeZone)}
                    </span>
                    {g.upcomingReservationCount > 0 && (
                      <span className="text-blue-700">
                        {t("guests.upcomingCount", {
                          n: g.upcomingReservationCount,
                        })}
                      </span>
                    )}
                  </div>
                  {g.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {g.tags.slice(0, 4).map((t) => (
                        <GuestTagBadge key={t} tag={t} />
                      ))}
                      {g.tags.length > 4 && (
                        <span className="shrink-0 whitespace-nowrap text-caption text-slate-400">
                          +{g.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function LoadingState() {
  return (
    <div className="p-4 md:p-6 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div className="px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-slate-800">{t("common.somethingWrong")}</h3>
      <p className="text-sm text-slate-500 mt-1">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}

function GuestDetailDrawer({
  guestId,
  onClose,
  suggestedTags,
  onRowChange,
}: {
  guestId: string | null;
  onClose: () => void;
  suggestedTags: string[];
  onRowChange: (row: GuestRow) => void;
}) {
  const { toast } = useToast();
  const { t } = useLang();
  const [detail, setDetail] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const notesDirtyRef = useRef(false);

  useEffect(() => {
    if (!guestId) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    notesDirtyRef.current = false;
    api(`/api/guests/${guestId}`)
      .then((d: GuestDetail) => {
        setDetail(d);
        setNotes(d.guest.notes || "");
      })
      .catch((e) => setError(e?.message || "Failed to load guest."))
      .finally(() => setLoading(false));
  }, [guestId]);

  const applyGuest = (g: GuestRow) => {
    setDetail((prev) => {
      if (prev) {
        return { ...prev, guest: { ...prev.guest, ...g } };
      }
      return prev;
    });
    onRowChange(g);
  };

  const saveNotes = async () => {
    if (!guestId) {
      return;
    }
    setSavingNotes(true);
    try {
      const d = await api(`/api/guests/${guestId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
      applyGuest(d.guest);
      notesDirtyRef.current = false;
      toast({ title: t("guests.toast.notesSaved") });
    } catch (e) {
      toast({
        title: t("guests.toast.notesError"),
        description: errMsg(e, t("common.somethingWentWrong")),
        variant: "destructive",
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const addTag = async (tag: string) => {
    const clean = tag.trim();
    if (!guestId || !clean) {
      return;
    }
    setTagBusy(true);
    try {
      const d = await api(`/api/guests/${guestId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag: clean }),
      });
      applyGuest(d.guest);
      setNewTag("");
    } catch (e) {
      toast({
        title: t("guests.toast.tagAddError"),
        description: errMsg(e, t("common.somethingWentWrong")),
        variant: "destructive",
      });
    } finally {
      setTagBusy(false);
    }
  };

  const removeTag = async (tag: string) => {
    if (!guestId) {
      return;
    }
    setTagBusy(true);
    try {
      const d = await api(`/api/guests/${guestId}/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
      });
      applyGuest(d.guest);
    } catch (e) {
      toast({
        title: t("guests.toast.tagRemoveError"),
        description: errMsg(e, t("common.somethingWentWrong")),
        variant: "destructive",
      });
    } finally {
      setTagBusy(false);
    }
  };

  const g = detail?.guest;
  let noShowTone: "red" | undefined = undefined;
  if (g && g.noShowCount > 0) {
    noShowTone = "red";
  }
  let cancelledTone: "red" | undefined = undefined;
  if (g && g.cancelledCount > 0) {
    cancelledTone = "red";
  }
  const buildTagRemover = (tag: string) => {
    if (tagBusy) {
      return undefined;
    }
    return () => removeTag(tag);
  };
  let saveNotesLabel: string;
  if (savingNotes) {
    saveNotesLabel = t("guests.saving");
  } else {
    saveNotesLabel = t("guests.saveNotes");
  }
  let name: string;
  if (g) {
    name = guestName(g, t("guests.defaultName"));
  } else {
    name = t("guests.defaultName");
  }
  const availableSuggestions = suggestedTags.filter(
    (t) => !(g?.tags || []).some((x) => x.toLowerCase() === t.toLowerCase()),
  );

  let tagListContent: React.ReactNode;
  if (g && g.tags.length) {
    tagListContent = g.tags.map((tag) => (
      <GuestTagBadge key={tag} tag={tag} onRemove={buildTagRemover(tag)} />
    ));
  } else {
    tagListContent = <span className="text-sm text-slate-400">{t("guests.noTags")}</span>;
  }

  let sheetBody: React.ReactNode;
  if (loading) {
    sheetBody = (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  } else if (error) {
    sheetBody = (
      <div className="p-6">
        <ErrorState message={error} onRetry={() => guestId && setDetail(null)} />
      </div>
    );
  } else if (g) {
    sheetBody = (
      <>
        <SheetHeader className="sr-only">
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>{g.location.label}</SheetDescription>
        </SheetHeader>

        <div className="p-4 sm:p-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm p-4 sm:p-5">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-semibold shrink-0">
                {initials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-800 truncate">
                    {name}
                  </h3>
                  <GuestStatusBadge returning={g.returning} />
                </div>
                <p className="text-sm text-slate-500 mt-0.5 truncate">{g.location.label}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-slate-800 min-w-0">
                  <HugeiconsIcon icon={Call02Icon} className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {formatPhone(g.normalizedPhone, g.phone) ?? (
                      <span className="text-slate-400">{t("guests.noPhone")}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 min-w-0">
                  <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {g.email || <span className="text-slate-400">{t("guests.noEmail")}</span>}
                  </span>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{t("guests.firstVisit")}</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {fmtDate(g.firstVisitAt, g.location.timezone ?? undefined)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{t("guests.lastVisit")}</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {fmtDate(g.lastVisitAt, g.location.timezone ?? undefined)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-3 sm:grid-cols-6 gap-y-3">
              <ProfileStat label={t("guests.stat.totalVisits")} value={g.totalVisits} />
              <ProfileStat label={t("guests.stat.waitlist")} value={g.waitlistVisitCount} />
              <ProfileStat label={t("guests.stat.upcoming")} value={g.upcomingReservationCount} />
              <ProfileStat label={t("guests.stat.pastRes")} value={g.pastReservationCount} />
              <ProfileStat
                label={t("guests.stat.noShows")}
                value={g.noShowCount}
                tone={noShowTone}
              />
              <ProfileStat
                label={t("guests.stat.cancelled")}
                value={g.cancelledCount}
                tone={cancelledTone}
              />
            </div>
          </div>

          <section>
            <SectionHeading>{t("guests.summary")}</SectionHeading>
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {g.summary || t("guests.summary.empty")}
            </p>
          </section>

          <section>
            <SectionHeading>{t("guests.tags")}</SectionHeading>
            <div className="flex flex-wrap gap-1.5 mb-2">{tagListContent}</div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTag(newTag);
              }}
            >
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder={t("guests.addTag.placeholder")}
                className="h-9 bg-slate-50 border-slate-200 text-xs sm:text-sm"
                disabled={tagBusy}
              />
              <Button type="submit" size="sm" disabled={tagBusy || !newTag.trim()}>
                <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
              </Button>
            </form>
            {availableSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {availableSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={tagBusy}
                    onClick={() => addTag(tag)}
                    className="text-xs px-2.5 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeading>{t("guests.internalNotes")}</SectionHeading>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                notesDirtyRef.current = true;
              }}
              placeholder={t("guests.notes.placeholder")}
              className="bg-slate-50 border-slate-200 min-h-[90px] text-xs sm:text-sm"
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={saveNotes}
                disabled={savingNotes || notes === (g.notes || "")}
                className="text-xs sm:text-sm"
              >
                {saveNotesLabel}
              </Button>
            </div>
          </section>

          {detail.upcomingReservations.length > 0 && (
            <HistorySection
              title={t("guests.upcomingReservations")}
              events={detail.upcomingReservations}
            />
          )}

          <HistorySection
            title={t("guests.visitHistory")}
            events={detail.timeline}
            emptyText={t("guests.noVisitHistory")}
          />
        </div>
      </>
    );
  } else {
    sheetBody = null;
  }

  return (
    <Sheet open={!!guestId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl overflow-y-auto p-0">
        {sheetBody}
      </SheetContent>
    </Sheet>
  );
}

function ProfileStat({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  let toneClass = "text-slate-800";
  if (tone === "red") {
    toneClass = "text-red-600";
  }
  return (
    <div className="px-1 text-center">
      <div className={`text-lg font-semibold tabular-nums leading-tight ${toneClass}`}>{value}</div>
      <div className="text-caption text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function HistorySection({
  title,
  events,
  emptyText,
}: {
  title: string;
  events: TimelineEvent[];
  emptyText?: string;
}) {
  const { t, tStatus } = useLang();
  let historyBody: React.ReactNode;
  if (events.length === 0) {
    historyBody = <p className="text-sm text-slate-400">{emptyText || t("guests.nothingHere")}</p>;
  } else {
    historyBody = (
      <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
        {events.map((e) => {
          let sourceLabel: string;
          if (e.source === "reservation") {
            sourceLabel = t("guests.source.reservation");
          } else {
            sourceLabel = t("guests.source.waitlist");
          }
          let guestCountKey: "guests.guestOne" | "guests.guestMany";
          if (e.partySize === 1) {
            guestCountKey = "guests.guestOne";
          } else {
            guestCountKey = "guests.guestMany";
          }
          return (
            <li key={`${e.source}-${e.id}`} className="ml-4">
              <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {e.atLabel ?? fmtDateTime(e.at)}
                </span>
                <StatusBadge status={e.status} label={tStatus(e.status)} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                <span>{sourceLabel}</span>
                <span>·</span>
                <span>{t(guestCountKey, { n: e.partySize })}</span>
                {e.table?.tableName && (
                  <>
                    <span>·</span>
                    <span data-testid={`timeline-table-${e.id}`}>{e.table.tableName}</span>
                  </>
                )}
                {typeof e.table?.turnMinutes === "number" && (
                  <>
                    <span>·</span>
                    <span data-testid={`timeline-turn-${e.id}`}>
                      {t("guests.turnMinutes", { n: e.table.turnMinutes })}
                    </span>
                  </>
                )}
                {e.table?.assignmentSource === "SMART" && (
                  <>
                    <span>·</span>
                    <span data-testid={`timeline-source-${e.id}`}>{t("guests.smartAssigned")}</span>
                  </>
                )}
              </div>
              {e.notes && <p className="text-xs text-slate-500 mt-1 italic">"{e.notes}"</p>}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      {historyBody}
    </section>
  );
}

export default BusinessGuests;
