import { useCallback, useEffect, useMemo, useState } from "react";
import BusinessHeader from "@/components/BusinessHeader";
import Footer from "@/components/Footer";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CampaignStatusBadge,
  TemplateStatusBadge,
  ChannelBadge,
  SeatPingPill,
} from "@/components/CampaignBadges";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FieldTrigger,
  TimeSelect,
  ALL_DAY_TIME_OPTIONS,
} from "@/components/TimeSelect";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { formatPhone } from "@/lib/phone";
import {
  Megaphone,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  ChevronDown,
  Calendar as CalendarIcon,
  Send,
  Save,
  Users,
  Inbox,
  Search,
  X,
  CheckCircle2,
  XCircle,
  Trash2,
  Settings,
} from "lucide-react";
import {
  CustomAudienceBuilder,
  SavedAudience,
} from "@/components/CustomAudienceBuilder";

// ---------------------------------------------------------------------------
// Types (mirror the /api/campaigns payloads)
// ---------------------------------------------------------------------------
type LocationOption = {
  id: string;
  label: string;
  timezone?: string;
  restaurantName?: string;
};
type AudienceGroup = {
  key: string;
  label: string;
  description: string;
  needsTag?: boolean;
};
type Channel = "EMAIL" | "WHATSAPP" | "SMS";

type Template = {
  id: string;
  templateType: "SEATPING" | "CUSTOM";
  name: string;
  slug: string | null;
  purpose: string | null;
  body: string;
  offerDetails: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  variables: string[];
  editableVariables: string[];
  exampleValues: Record<string, string>;
  approvalStatus: "DRAFT" | "PENDING_SEATPING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  usable: boolean;
  locationId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Campaign = {
  id: string;
  name: string;
  channel: Channel;
  templateId: string;
  templateName: string | null;
  templateType: string | null;
  audienceType: string;
  audienceLabel: string;
  audienceConfig: {
    tag?: string;
    guestIds?: string[];
    savedAudienceId?: string;
  };
  templateValues: Record<string, string>;
  status: string;
  recipientCount: number;
  excludedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  locationId: string;
  locationLabel: string | null;
  sentAt: string | null;
  // Timing
  sendMode: "NOW" | "SCHEDULED" | "RECURRING";
  timezone: string | null;
  scheduledAt: string | null;
  scheduledAtLabel: string | null;
  recurrenceFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  recurrenceStartAt: string | null;
  recurrenceEndAt: string | null;
  maxSendsPerGuestWindowDays: number | null;
  nextRunAt: string | null;
  nextRunAtLabel: string | null;
  lastRunAt: string | null;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
};

type Meta = {
  locations: LocationOption[];
  channels: Channel[];
  audiences: AudienceGroup[];
  suggestedTags: string[];
};

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Mail }> = {
  EMAIL: { label: "Email", icon: Mail },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  SMS: { label: "SMS", icon: Phone },
};

function errMsg(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error ? e.message : fallback;
}

function fmtDate(value: string | null): string {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Parse "YYYY-MM-DD" to a local Date (midnight), or undefined. */
function parseLocalDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
/** Format a Date to "YYYY-MM-DD" in local time. */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Date picker matching the customer landing page (FieldTrigger + shadcn
 * Calendar in a Popover). Value is "YYYY-MM-DD".
 */
function DateField({
  value,
  onChange,
  minDate,
  placeholder = "mm/dd/yyyy",
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: Date;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FieldTrigger icon={CalendarIcon} className="bg-slate-50">
          {selected ? (
            format(selected, "MMM d, yyyy")
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </FieldTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) onChange(toLocalDateStr(d));
            setOpen(false);
          }}
          disabled={minDate ? { before: minDate } : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** The current wall-clock "YYYY-MM-DDTHH:MM" in a given IANA timezone. */
function nowWallClockInTz(tz?: string): string {
  if (!tz) tz = "Asia/Jakarta";
  const d = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const m: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
    const hour = m.hour === "24" ? "00" : m.hour;
    return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
  } catch {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
}

type TabKey = "campaigns" | "templates" | "audiences" | "history";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const BusinessCampaigns = () => {
  const { t } = useLang();
  const { toast } = useToast();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [locationId, setLocationId] = useState("");
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [tab, setTab] = useState<TabKey>("campaigns");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [savedAudiences, setSavedAudiences] = useState<SavedAudience[]>([]);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [preselectTemplateId, setPreselectTemplateId] = useState<string | null>(
    null,
  );
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const [customAudienceOpen, setCustomAudienceOpen] = useState(false);
  const [editingAudience, setEditingAudience] = useState<SavedAudience | null>(
    null,
  );

  // Load meta once.
  useEffect(() => {
    let cancelled = false;
    api("/api/campaigns/meta")
      .then((d: Meta) => {
        if (cancelled) return;
        setMeta(d);
        if (d.locations.length) setLocationId((p) => p || d.locations[0].id);
        setMetaLoaded(true);
      })
      .catch(() => setMetaLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchCampaigns = useCallback(() => {
    if (!locationId) return;
    setCampaignsLoading(true);
    api(`/api/campaigns?locationId=${locationId}`)
      .then((d) => setCampaigns(d?.campaigns ?? []))
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false));
  }, [locationId]);

  const fetchTemplates = useCallback(() => {
    setTemplatesLoading(true);
    api("/api/campaigns/templates")
      .then((d) => setTemplates(d?.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const fetchSavedAudiences = useCallback(() => {
    if (!locationId) return;
    api(`/api/audiences?locationId=${locationId}`)
      .then((d) => setSavedAudiences(d?.audiences ?? []))
      .catch(() => setSavedAudiences([]));
  }, [locationId]);

  useEffect(() => {
    fetchCampaigns();
    fetchSavedAudiences();
  }, [fetchCampaigns, fetchSavedAudiences]);
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const locationLabel =
    meta?.locations.find((l) => l.id === locationId)?.label || "";

  const openNewCampaign = () => {
    setEditingCampaign(null);
    setBuilderOpen(true);
  };
  const openEditCampaign = (c: Campaign) => {
    setEditingCampaign(c);
    setBuilderOpen(true);
  };

  const handleCampaignAction = async (
    c: Campaign,
    action: "cancel" | "pause" | "resume" | "delete",
  ) => {
    try {
      if (action === "delete") {
        await api(`/api/campaigns/${c.id}`, { method: "DELETE" });
      } else {
        await api(`/api/campaigns/${c.id}/${action}`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }
      toast({
        title:
          action === "cancel"
            ? "Campaign cancelled"
            : action === "pause"
              ? "Campaign paused"
              : action === "delete"
                ? "Campaign deleted"
                : "Campaign resumed",
      });
      fetchCampaigns();
    } catch (e) {
      toast({
        title:
          action === "delete"
            ? "Could not delete campaign"
            : "Could not update campaign",
        description: errMsg(e),
        variant: "destructive",
      });
    }
  };

  const sentCampaigns = useMemo(
    () =>
      campaigns.filter((c) => ["SENDING", "SENT", "FAILED"].includes(c.status)),
    [campaigns],
  );

  const activeCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) => !["SENDING", "SENT", "FAILED"].includes(c.status),
      ),
    [campaigns],
  );

  return (
    <>
      <SEO
        title="Campaigns | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-slate-50 to-indigo-100 flex flex-col">
        <div className="container mx-auto px-4 py-8 flex-1 w-full">
          {/* Page header — mirrors the Guests and Settings pages exactly. */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-semibold text-gray-800">
              {t("camp.title")}
            </h1>
            <p className="text-gray-600 text-sm md:text-base">
              {t("camp.subtitle")}
            </p>
          </div>

          {/* Tabs + location selector */}
          <div className="flex flex-col md:flex-row md:items-stretch gap-3 mb-6">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 flex-1 overflow-x-auto">
              {(
                [
                  ["campaigns", t("camp.tab.campaigns")],
                  ["templates", t("camp.tab.templates")],
                  ["audiences", t("camp.tab.audiences")],
                  ["history", t("camp.tab.history")],
                ] as [TabKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 min-w-[110px] px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === key
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Location selector */}
            <div className="relative md:w-56 shrink-0">
              <select
                className="w-full h-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={!meta?.locations.length}
              >
                {meta?.locations.length ? (
                  meta.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))
                ) : (
                  <option value="">{t("camp.noLocations")}</option>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {tab === "campaigns" && (
            <CampaignsTab
              loading={campaignsLoading || !metaLoaded}
              campaigns={activeCampaigns}
              hasLocation={!!locationId}
              onNew={openNewCampaign}
              onRefresh={fetchCampaigns}
              onOpen={openEditCampaign}
              onAction={handleCampaignAction}
            />
          )}
          {tab === "templates" && (
            <TemplatesTab
              loading={templatesLoading}
              templates={templates}
              onNew={() => {
                setEditingTemplate(null);
                setTemplateDialogOpen(true);
              }}
              onEdit={(tpl) => {
                setEditingTemplate(tpl);
                setTemplateDialogOpen(true);
              }}
              onUse={(tpl) => {
                setEditingCampaign(null);
                setBuilderOpen(true);
                // The builder reads templates fresh; pre-selection handled there.
                setPreselectTemplateId(tpl.id);
              }}
              onRefresh={fetchTemplates}
            />
          )}
          {tab === "audiences" && (
            <AudiencesTab
              audiences={meta?.audiences ?? []}
              savedAudiences={savedAudiences}
              onCreateCustom={() => {
                setEditingAudience(null);
                setCustomAudienceOpen(true);
              }}
              onEditCustom={(a) => {
                setEditingAudience(a);
                setCustomAudienceOpen(true);
              }}
              onDeleteCustom={async (a) => {
                if (!confirm(`Are you sure you want to delete "${a.name}"?`))
                  return;
                try {
                  await api(`/api/audiences/${a.id}`, { method: "DELETE" });
                  toast({ title: "Custom Group deleted" });
                  fetchSavedAudiences();
                } catch (err: any) {
                  toast({
                    title: "Failed to delete group",
                    description: err.message,
                    variant: "destructive",
                  });
                }
              }}
            />
          )}
          {tab === "history" && (
            <HistoryTab loading={campaignsLoading} campaigns={sentCampaigns} />
          )}
        </div>
        <Footer />
      </div>

      {builderOpen && (
        <CampaignBuilderDialog
          open={builderOpen}
          onClose={() => {
            setBuilderOpen(false);
            setPreselectTemplateId(null);
          }}
          locationId={locationId}
          locationLabel={locationLabel}
          meta={meta}
          templates={templates}
          existing={editingCampaign}
          existingNames={campaigns.map((c) => c.name)}
          savedAudiences={savedAudiences}
          preselectTemplateId={preselectTemplateId}
          onSaved={() => {
            fetchCampaigns();
          }}
          onSent={(sendMode) => {
            fetchCampaigns();
            if (sendMode === "NOW") {
              setTab("history");
            }
          }}
        />
      )}

      {templateDialogOpen && (
        <TemplateBuilderDialog
          open={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          existing={editingTemplate}
          onSaved={() => fetchTemplates()}
        />
      )}
      {customAudienceOpen && (
        <CustomAudienceBuilder
          open={customAudienceOpen}
          onClose={() => setCustomAudienceOpen(false)}
          locationId={locationId}
          existing={editingAudience}
          onSaved={fetchSavedAudiences}
          suggestedTags={meta?.suggestedTags ?? []}
        />
      )}
    </>
  );
};

export default BusinessCampaigns;

// ---------------------------------------------------------------------------
// Shared small pieces
// ---------------------------------------------------------------------------
function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Inbox;
  title: string;
  body: string;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{body}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Normalize a variable name to Meta-safe snake_case (firstName -> first_name). */
function normalizeVar(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Meta forbids a variable at the very start or end of the message body. Returns
 * an error string (or null). Mirrors the server's validateBodyParamPositions.
 */
function bodyParamPositionError(body: string): string | null {
  if (!body) return null;
  const firstOpen = body.indexOf("{{");
  if (firstOpen === -1) return null;
  const lastClose = body.lastIndexOf("}}");
  const hasWord = (s: string) => /[a-z0-9]/i.test(s);
  if (!hasWord(body.slice(0, firstOpen))) {
    return "The message can't start with a variable. Add some text before the first {{variable}}.";
  }
  if (lastClose >= 0 && !hasWord(body.slice(lastClose + 2))) {
    return "The message can't end with a variable. Add some text after the last {{variable}}.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Campaigns tab
// ---------------------------------------------------------------------------
function CampaignsTab({
  loading,
  campaigns,
  hasLocation,
  onNew,
  onRefresh,
  onOpen,
  onAction,
}: {
  loading: boolean;
  campaigns: Campaign[];
  hasLocation: boolean;
  onNew: () => void;
  onRefresh: () => void;
  onOpen: (c: Campaign) => void;
  onAction: (
    c: Campaign,
    action: "cancel" | "pause" | "resume" | "delete",
  ) => void;
}) {
  const { t } = useLang();
  return (
    <Card className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <CardHeader className="border-b border-slate-200 p-4 md:p-6 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg md:text-xl text-slate-800">
            {t("camp.tab.campaigns")}
          </CardTitle>
          <CardDescription className="text-sm">
            {loading
              ? "Loading..."
              : `${campaigns.length} ${campaigns.length === 1 ? "Campaign" : "Campaigns"}`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={onNew}
            disabled={!hasLocation}
            className="shrink-0 w-9 p-0 justify-center sm:w-auto sm:px-3"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline sm:ml-1.5">
              {t("camp.newCampaign")}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <ListSkeleton />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={t("camp.empty.campaigns.title")}
            body={t("camp.empty.campaigns.body")}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="px-6 py-3 font-medium">
                      {t("camp.col.name")}
                    </th>
                    <th className="px-6 py-3 font-medium text-center">
                      {t("camp.col.channel")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      {t("camp.col.audience")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <div className="flex justify-center">
                        {t("camp.col.status")}
                      </div>
                    </th>
                    <th className="px-6 py-3 font-medium text-center">
                      {t("camp.col.recipients")}
                    </th>
                    <th className="px-6 py-3 font-medium">Activity</th>
                    <th className="px-6 py-3 font-medium text-center">
                      {t("camp.col.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaigns.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-800">
                          {c.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {c.templateName}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <ChannelBadge channel={c.channel} />
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {c.audienceLabel}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-center">
                          <CampaignStatusBadge status={c.status} />
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center tabular-nums text-slate-700">
                        {c.recipientCount}
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap text-xs">
                        {timingSummary(c)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <CampaignActions
                          c={c}
                          onOpen={onOpen}
                          onAction={onAction}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-slate-100">
              {campaigns.map((c) => {
                const canEdit = c.status === "DRAFT" || c.status === "READY";
                return (
                  <div
                    key={c.id}
                    onClick={() => (canEdit ? onOpen(c) : undefined)}
                    className={`w-full text-left p-4 transition-colors ${canEdit ? "hover:bg-slate-50 cursor-pointer" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">
                        {c.name}
                      </span>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <ChannelBadge channel={c.channel} />
                      <span className="text-xs text-slate-500">
                        {c.recipientCount}{" "}
                        {c.recipientCount === 1 ? "Recipient" : "Recipients"}
                      </span>
                      <span className="text-xs text-slate-400">
                        · {timingSummary(c)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One-line timing summary for a campaign row. */
function timingSummary(c: Campaign): string {
  if (c.status === "SCHEDULED")
    return `Scheduled · ${c.scheduledAtLabel || "--"}`;
  if (c.status === "RECURRING")
    return `${(c.recurrenceFrequency || "").toLowerCase()} · next ${c.nextRunAtLabel || "--"}`;
  if (c.status === "PAUSED")
    return `Paused · ${(c.recurrenceFrequency || "").toLowerCase()}`;
  if (c.sentAt) return `Sent on ${fmtDate(c.sentAt)}`;
  return `Created on ${fmtDate(c.createdAt)}`;
}

function CampaignActions({
  c,
  onOpen,
  onAction,
}: {
  c: Campaign;
  onOpen: (c: Campaign) => void;
  onAction: (
    c: Campaign,
    action: "cancel" | "pause" | "resume" | "delete",
  ) => void;
}) {
  const btn = "h-7 text-xs px-2.5";
  return (
    <div className="flex items-center justify-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className={btn}
        onClick={() => onOpen(c)}
      >
        Edit
      </Button>
      {c.status === "RECURRING" && (
        <Button
          variant="outline"
          size="sm"
          className={btn}
          onClick={() => onAction(c, "pause")}
        >
          Pause
        </Button>
      )}
      {c.status === "PAUSED" && (
        <Button
          variant="outline"
          size="sm"
          className={btn}
          onClick={() => onAction(c, "resume")}
        >
          Resume
        </Button>
      )}
      {["SCHEDULED", "RECURRING", "PAUSED"].includes(c.status) && (
        <Button
          variant="outline"
          size="sm"
          className={`${btn} text-red-600 border-red-200 hover:bg-red-50`}
          onClick={() => onAction(c, "cancel")}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates tab
// ---------------------------------------------------------------------------
function TemplatesTab({
  loading,
  templates,
  onNew,
  onEdit,
  onUse,
  onRefresh,
}: {
  loading: boolean;
  templates: Template[];
  onNew: () => void;
  onEdit: (t: Template) => void;
  onUse: (t: Template) => void;
  onRefresh: () => void;
}) {
  const { t } = useLang();
  const seatping = templates.filter((x) => x.templateType === "SEATPING");
  const custom = templates.filter((x) => x.templateType === "CUSTOM");

  return (
    <div className="space-y-6">
      <Card className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <CardHeader className="border-b border-slate-200 p-4 md:p-6 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg md:text-xl text-slate-800">
              SeatPing Templates
            </CardTitle>
            <CardDescription className="text-sm">
              Ready to use immediately for SMS, WhatsApp, and Email.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {loading ? (
            <ListSkeleton />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {seatping.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onUse={() => onUse(tpl)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <CardHeader className="border-b border-slate-200 p-4 md:p-6 flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg md:text-xl text-slate-800">
              Custom Templates
            </CardTitle>
            <CardDescription className="text-sm">
              Request one template, and SeatPing will prepare it for SMS,
              WhatsApp, and Email.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={onNew}
            className="shrink-0 w-9 p-0 justify-center sm:w-auto sm:px-3"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline sm:ml-1.5">
              {t("camp.newTemplate")}
            </span>
          </Button>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {custom.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No custom templates yet. Create one to request a tailored message.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {custom.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onEdit={() => onEdit(tpl)}
                  onUse={() => onUse(tpl)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onUse,
}: {
  template: Template;
  onEdit?: () => void;
  onUse?: () => void;
}) {
  const isCustom = template.templateType === "CUSTOM";
  return (
    <div className="border border-slate-200 rounded-xl p-4 flex flex-col h-full bg-slate-50/50">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-slate-800 text-sm">
          {template.name}
        </h4>
        {isCustom ? (
          <TemplateStatusBadge status={template.approvalStatus} />
        ) : (
          <SeatPingPill />
        )}
      </div>
      {template.purpose && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
          {template.purpose}
        </p>
      )}
      <p className="text-xs text-slate-600 mt-2 line-clamp-3 min-h-[4.75rem] bg-white border border-slate-200 rounded-lg p-2">
        {template.body}
      </p>
      {template.approvalStatus === "REJECTED" && template.rejectionReason && (
        <p className="text-xs text-red-600 mt-2">
          <span className="font-medium">Rejection Reason:</span>{" "}
          {template.rejectionReason}
        </p>
      )}
      <div className="mt-auto pt-3 flex items-center justify-between gap-2 min-h-[2.75rem]">
        <span className="text-[11px] text-slate-400">
          Updated {fmtDate(template.updatedAt)}
        </span>
        <div className="flex items-center gap-1.5">
          {isCustom &&
            (template.approvalStatus === "DRAFT" ||
              template.approvalStatus === "REJECTED" ||
              template.approvalStatus === "PENDING_SEATPING_REVIEW" ||
              template.approvalStatus === "APPROVED") &&
            onEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onEdit}
              >
                Edit
              </Button>
            )}
          {template.usable && onUse && (
            <Button size="sm" className="h-7 text-xs" onClick={onUse}>
              Use
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audiences tab
// ---------------------------------------------------------------------------
function AudiencesTab({
  audiences,
  savedAudiences,
  onCreateCustom,
  onEditCustom,
  onDeleteCustom,
}: {
  audiences: AudienceGroup[];
  savedAudiences: SavedAudience[];
  onCreateCustom: () => void;
  onEditCustom: (a: SavedAudience) => void;
  onDeleteCustom: (a: SavedAudience) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <CardHeader className="border-b border-slate-200 p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl text-slate-800">
            Smart Audiences
          </CardTitle>
          <CardDescription className="text-sm">
            Built-in audiences that automatically segment your guests.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {audiences.map((a) => (
              <div
                key={a.key}
                className="border border-slate-200 rounded-xl p-4 bg-slate-50/50"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  <h4 className="font-semibold text-slate-800 text-sm">
                    {a.label}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{a.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <CardHeader className="border-b border-slate-200 p-4 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg md:text-xl text-slate-800">
                Custom Groups
              </CardTitle>
              <CardDescription className="text-sm">
                Build and save your own guest group using filters and tags.
              </CardDescription>
            </div>
            <Button
              onClick={onCreateCustom}
              size="sm"
              className="shrink-0 w-9 p-0 justify-center sm:w-auto sm:gap-2 sm:px-3"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Group</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {savedAudiences.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p>No custom groups yet.</p>
              <p className="text-sm">
                Create one to target specific segments of your guests.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedAudiences.map((a) => (
                <div
                  key={a.id}
                  className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-500" />
                        <h4 className="font-semibold text-slate-800 text-sm">
                          {a.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-slate-600"
                          onClick={() => onEditCustom(a)}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-red-500"
                          onClick={() => onDeleteCustom(a)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {a.description && (
                      <p className="text-xs text-slate-500 mt-1.5">
                        {a.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------
function HistoryTab({
  loading,
  campaigns,
}: {
  loading: boolean;
  campaigns: Campaign[];
}) {
  const { t } = useLang();
  return (
    <Card className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <CardHeader className="border-b border-slate-200 p-4 md:p-6">
        <CardTitle className="text-lg md:text-xl text-slate-800">
          {t("camp.tab.history")}
        </CardTitle>
        <CardDescription className="text-sm">
          Delivery results for campaigns you have sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <ListSkeleton />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t("camp.empty.history.title")}
            body={t("camp.empty.history.body")}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((c) => (
              <div key={c.id} className="w-full text-left p-4 md:px-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 truncate">
                        {c.name}
                      </span>
                      <ChannelBadge channel={c.channel} />
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {c.templateName} ·{" "}
                      {c.sentAt
                        ? `Sent on ${fmtDate(c.sentAt)}`
                        : `Created on ${fmtDate(c.createdAt)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {c.sentCount}{" "}
                      Sent
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="w-3.5 h-3.5" /> {c.failedCount} Failed
                    </span>
                    <span className="text-slate-500">
                      {c.skippedCount} Skipped
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Campaign builder dialog
// ---------------------------------------------------------------------------
function splitWallClock(utcStr: string | null | undefined, tz: string) {
  if (!utcStr) return null;
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const m: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
    const yyyy = m.year;
    const mm = m.month;
    const dd = m.day;
    const hh = m.hour === "24" ? "00" : (m.hour ?? "00");
    const min = m.minute ?? "00";
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
  } catch {
    return null;
  }
}

type ManualGuest = { id: string; name: string; contact: string };

/** Return the next available "Untitled Campaign" name (appending " 2", " 3", …). */
function nextUntitledName(existingNames: string[]): string {
  const base = "Untitled Campaign";
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

function CampaignBuilderDialog({
  open,
  onClose,
  locationId,
  locationLabel,
  meta,
  templates,
  existing,
  existingNames,
  savedAudiences,
  preselectTemplateId,
  onSaved,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
  locationLabel: string;
  meta: Meta | null;
  templates: Template[];
  existing: Campaign | null;
  existingNames: string[];
  savedAudiences: SavedAudience[];
  preselectTemplateId: string | null;
  onSaved: () => void;
  onSent: (sendMode: string) => void;
}) {
  const { toast } = useToast();

  const [campaignId, setCampaignId] = useState<string | null>(
    existing?.id ?? null,
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [channel, setChannel] = useState<Channel>(existing?.channel ?? "EMAIL");
  const [audienceType, setAudienceType] = useState(
    existing?.audienceType === "custom_group"
      ? `custom_group:${existing.audienceConfig?.savedAudienceId}`
      : (existing?.audienceType ?? "all_guests"),
  );
  const [tag, setTag] = useState(existing?.audienceConfig?.tag ?? "");
  const [manualGuests, setManualGuests] = useState<ManualGuest[]>([]);
  const [templateId, setTemplateId] = useState<string>(
    existing?.templateId ?? preselectTemplateId ?? "",
  );
  const [templateValues, setTemplateValues] = useState<Record<string, string>>(
    existing?.templateValues ?? {},
  );

  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sending, setSending] = useState(false);

  const timezone =
    meta?.locations.find((l) => l.id === locationId)?.timezone ||
    "Asia/Jakarta";

  // Timing
  const tz = existing?.timezone || timezone;
  const schedParts = splitWallClock(existing?.scheduledAt, tz);
  const recurStartParts = splitWallClock(existing?.recurrenceStartAt, tz);
  const recurEndParts = splitWallClock(existing?.recurrenceEndAt, tz);

  const [sendMode, setSendMode] = useState<"NOW" | "SCHEDULED" | "RECURRING">(
    (existing?.sendMode as any) ?? "NOW",
  );
  const [schedDate, setSchedDate] = useState(schedParts?.date ?? "");
  const [schedTime, setSchedTime] = useState(schedParts?.time ?? "09:00");
  const [recurFreq, setRecurFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY">(
    (existing?.recurrenceFrequency as any) ?? "WEEKLY",
  );
  const [recurStartDate, setRecurStartDate] = useState(
    recurStartParts?.date ?? "",
  );
  const [recurStartTime, setRecurStartTime] = useState(
    recurStartParts?.time ?? "09:00",
  );
  const [recurEndDate, setRecurEndDate] = useState(recurEndParts?.date ?? "");
  const [recurWindow, setRecurWindow] = useState(
    existing?.maxSendsPerGuestWindowDays?.toString() ?? "30",
  );

  const selectedTemplate = templates.find((x) => x.id === templateId) || null;
  const usableTemplates = templates.filter((x) => x.usable);

  // Audience options + manual.
  const manualGuestIds = manualGuests.map((g) => g.id);

  // Manual guests hydration from draft
  useEffect(() => {
    if (
      existing?.audienceType === "manual" &&
      existing.audienceConfig?.guestIds?.length
    ) {
      const ids = existing.audienceConfig.guestIds.join(",");
      api(`/api/guests?locationId=${locationId}&ids=${ids}`)
        .then((d) => {
          const rows = (d?.guests ?? []).map((g: any) => ({
            id: g.id,
            name:
              g.fullName ||
              formatPhone(g.normalizedPhone, g.phone) ||
              g.email ||
              "Guest",
            contact:
              [g.email, formatPhone(g.normalizedPhone, g.phone)]
                .filter(Boolean)
                .join(" · ") || "",
          }));
          setManualGuests(rows);
        })
        .catch(() => {});
    }
  }, [existing, locationId]);

  // Live message preview (debounced).
  useEffect(() => {
    if (!templateId || !locationId) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      setPreviewLoading(true);
      api("/api/campaigns/preview-message", {
        method: "POST",
        body: JSON.stringify({
          channel,
          templateId,
          locationId,
          templateValues,
        }),
      })
        .then((d) => setPreview(d))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [channel, templateId, locationId, JSON.stringify(templateValues)]);

  // Live audience preview (debounced).
  useEffect(() => {
    if (!locationId) return;
    if (audienceType === "with_tag" && !tag) {
      setAudiencePreview(null);
      return;
    }
    if (audienceType === "manual" && manualGuestIds.length === 0) {
      setAudiencePreview(null);
      return;
    }
    const handle = setTimeout(() => {
      let at = audienceType;
      let tagParam = tag;
      if (audienceType.startsWith("custom_group:")) {
        at = "custom_group";
      }
      const params = new URLSearchParams({
        locationId,
        channel,
        audienceType: at,
      });
      if (at === "with_tag") params.set("tag", tagParam);
      if (at === "custom_group") {
        const sid = audienceType.split(":")[1];
        if (sid) params.set("savedAudienceId", sid);
      }
      if (at === "manual") params.set("guestIds", manualGuestIds.join(","));
      api(`/api/campaigns/audiences/preview?${params.toString()}`)
        .then((d) => setAudiencePreview(d))
        .catch(() => setAudiencePreview(null));
    }, 350);
    return () => clearTimeout(handle);
  }, [locationId, channel, audienceType, tag, JSON.stringify(manualGuestIds)]);

  function buildBody() {
    let at = audienceType;
    if (audienceType.startsWith("custom_group:")) {
      at = "custom_group";
    }
    const audienceConfig: any = {};
    if (at === "with_tag") audienceConfig.tag = tag;
    if (at === "manual") audienceConfig.guestIds = manualGuestIds;
    if (at === "custom_group") {
      audienceConfig.savedAudienceId = audienceType.split(":")[1];
    }
    return {
      name: name || nextUntitledName(existingNames),
      locationId,
      channel,
      templateId,
      audienceType: at,
      audienceConfig,
      templateValues,
    };
  }

  function validate(): string | null {
    if (!templateId) return "Choose a template.";
    let at = audienceType.startsWith("custom_group:")
      ? "custom_group"
      : audienceType;
    if (at === "with_tag" && !tag) return "Please enter a tag.";
    if (at === "manual" && manualGuestIds.length === 0)
      return "Select at least one guest.";
    return null;
  }

  async function ensureSaved(): Promise<string | null> {
    const err = validate();
    if (err) {
      toast({ title: err, variant: "destructive" });
      return null;
    }
    try {
      if (campaignId) {
        await api(`/api/campaigns/${campaignId}`, {
          method: "PATCH",
          body: JSON.stringify(buildBody()),
        });
        return campaignId;
      }
      const d = await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(buildBody()),
      });
      analytics.campaignCreated();
      setCampaignId(d.campaign.id);
      return d.campaign.id;
    } catch (e) {
      toast({
        title: "Could not save campaign",
        description: errMsg(e),
        variant: "destructive",
      });
      return null;
    }
  }

  async function saveDraft() {
    setSaving(true);
    const id = await ensureSaved();
    setSaving(false);
    if (id) {
      toast({ title: "Draft saved" });
      onSaved();
      onClose();
    }
  }

  // Build the timing portion of the /send body, or return a validation error.
  function timingBody(): { body?: any; error?: string } {
    if (sendMode === "SCHEDULED") {
      if (timingError) return { error: timingError };
      return {
        body: {
          sendMode: "SCHEDULED",
          scheduledLocal: `${schedDate}T${schedTime}`,
        },
      };
    }
    if (sendMode === "RECURRING") {
      if (timingError) return { error: timingError };
      return {
        body: {
          sendMode: "RECURRING",
          recurrence: {
            frequency: recurFreq,
            startLocal: `${recurStartDate}T${recurStartTime}`,
            endLocal: recurEndDate ? `${recurEndDate}T23:59` : undefined,
          },
          maxSendsPerGuestWindowDays: Number(recurWindow) || 30,
        },
      };
    }
    return { body: { sendMode: "NOW" } };
  }

  async function launch() {
    const tb = timingBody();
    if (tb.error) {
      toast({ title: tb.error, variant: "destructive" });
      setConfirmSend(false);
      return;
    }
    setSending(true);
    const id = await ensureSaved();
    if (!id) {
      setSending(false);
      setConfirmSend(false);
      return;
    }
    try {
      const d = await api(`/api/campaigns/${id}/send`, {
        method: "POST",
        body: JSON.stringify(tb.body),
      });
      toast({
        title:
          sendMode === "SCHEDULED"
            ? "Campaign scheduled"
            : sendMode === "RECURRING"
              ? "Recurring campaign started"
              : "Campaign sending",
        description:
          sendMode === "NOW" && d?.recipientCount != null
            ? `${d.recipientCount} ${d.recipientCount === 1 ? "recipient" : "recipients"}.`
            : undefined,
      });
      analytics.campaignSent(channel);
      onSent(sendMode);
      onClose();
    } catch (e) {
      toast({
        title: "Could not launch",
        description: errMsg(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  }

  async function handleDelete() {
    if (!campaignId) return;
    try {
      await api(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      toast({ title: "Campaign deleted" });
      onSaved();
      onClose();
    } catch (e) {
      toast({
        title: "Could not delete campaign",
        description: errMsg(e),
        variant: "destructive",
      });
    }
  }

  const editableVars = selectedTemplate?.editableVariables ?? [];
  const ChannelIcon = CHANNEL_META[channel].icon;

  // Timing validation (timezone-aware "not in the past" check using the
  // location's current wall-clock).
  const nowLocal = nowWallClockInTz(timezone);
  let timingError: string | null = null;
  if (sendMode === "SCHEDULED") {
    if (!schedDate || !schedTime)
      timingError = "Pick a date and time to schedule.";
    else if (`${schedDate}T${schedTime}` <= nowLocal)
      timingError = "The scheduled time must be in the future.";
  } else if (sendMode === "RECURRING") {
    if (!recurStartDate || !recurStartTime)
      timingError = "Pick a start date and time.";
    else if (recurEndDate && recurEndDate < recurStartDate)
      timingError = "The end date must be after the start date.";
  }

  const sendLabel =
    sendMode === "SCHEDULED"
      ? "Schedule Campaign"
      : sendMode === "RECURRING"
        ? "Start Recurring"
        : "Send Now";
  const canLaunch =
    !!templateId &&
    !timingError &&
    (sendMode !== "NOW" ||
      (!!audiencePreview && audiencePreview.recipientCount > 0));

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {existing ? "Edit Campaign" : "New Campaign"}
            </DialogTitle>
            <DialogDescription>
              Sending as SeatPing on behalf of your restaurant to your guests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* 1. Channel */}
            <Section step={1} title="Channel">
              <div className="flex gap-1.5 sm:gap-2">
                {(["SMS", "WHATSAPP", "EMAIL"] as Channel[]).map((ch) => {
                  const Icon = CHANNEL_META[ch].icon;
                  return (
                    <button
                      key={ch}
                      onClick={() => setChannel(ch)}
                      className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors ${
                        channel === ch
                          ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{CHANNEL_META[ch].label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {channel === "EMAIL"
                  ? "Requires guests with an email address."
                  : channel === "SMS"
                    ? "SMS is only available for US and Canada (+1) phone numbers right now."
                    : "Requires guests with a phone number."}
              </p>
            </Section>

            {/* 2. Audience */}
            <Section step={2} title="Audience">
              <div className="relative">
                <select
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={audienceType}
                  onChange={(e) => setAudienceType(e.target.value)}
                >
                  <optgroup label="Smart Audiences">
                    {(meta?.audiences ?? []).map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </optgroup>
                  {savedAudiences.length > 0 && (
                    <optgroup label="Custom Groups">
                      {savedAudiences.map((sa) => (
                        <option key={sa.id} value={`custom_group:${sa.id}`}>
                          {sa.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Manual">
                    <option value="manual">Manually Selected Guests</option>
                  </optgroup>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>

              {audienceType === "with_tag" && (
                <div className="mt-2">
                  <Input
                    list="camp-tag-suggestions"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="Enter a tag (e.g. VIP)"
                    className="bg-slate-50 border-slate-200"
                  />
                  <datalist id="camp-tag-suggestions">
                    {(meta?.suggestedTags ?? []).map((tg) => (
                      <option key={tg} value={tg} />
                    ))}
                  </datalist>
                </div>
              )}

              {audienceType === "manual" && (
                <ManualGuestPicker
                  locationId={locationId}
                  selected={manualGuests}
                  onChange={setManualGuests}
                />
              )}

              {/* Audience preview */}
              {audiencePreview && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      {audiencePreview.audienceName}
                    </span>
                    <span className="text-indigo-700 font-semibold">
                      {audiencePreview.recipientCount}{" "}
                      {audiencePreview.recipientCount === 1
                        ? "Recipient"
                        : "Recipients"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {audiencePreview.total} Matched ·{" "}
                    {audiencePreview.excludedCount} Excluded
                    {audiencePreview.excludedCount > 0 && (
                      <span>
                        {" "}
                        ({audiencePreview.exclusions.noEmail} No Email,{" "}
                        {audiencePreview.exclusions.noPhone} No Phone,{" "}
                        {audiencePreview.exclusions.optedOut} Opted Out,{" "}
                        {audiencePreview.exclusions.invalid} Invalid)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* 3. Template */}
            <Section step={3} title="Template">
              {usableTemplates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No usable templates yet. SeatPing templates load
                  automatically.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {usableTemplates.map((tpl) => {
                    const selected = tpl.id === templateId;
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          setTemplateId(tpl.id);
                          // Seed example values for editable vars when switching.
                          setTemplateValues((prev) => ({
                            ...tpl.exampleValues,
                            ...prev,
                          }));
                        }}
                        className={`text-left rounded-xl border p-3 flex flex-col h-full transition-colors ${
                          selected
                            ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-slate-800 text-sm line-clamp-2">
                            {tpl.name}
                          </span>
                          {tpl.templateType === "CUSTOM" ? (
                            <TemplateStatusBadge status={tpl.approvalStatus} />
                          ) : (
                            <SeatPingPill />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[2rem]">
                          {tpl.purpose || ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* 4. Variables */}
            {selectedTemplate && editableVars.length > 0 && (
              <Section step={4} title="Fill Template Variables">
                <div className="space-y-2">
                  {editableVars.map((v) => (
                    <div key={v}>
                      <label className="text-xs font-medium text-slate-600 capitalize">
                        {v.replace(/_/g, " ")}
                      </label>
                      <Input
                        value={templateValues[v] ?? ""}
                        onChange={(e) =>
                          setTemplateValues((prev) => ({
                            ...prev,
                            [v]: e.target.value,
                          }))
                        }
                        placeholder={
                          selectedTemplate.exampleValues[v] || `Enter ${v}`
                        }
                        className="bg-slate-50 border-slate-200 mt-1"
                      />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 5. Preview */}
            <Section
              step={selectedTemplate && editableVars.length > 0 ? 5 : 4}
              title="Message Preview"
            >
              {previewLoading ? (
                <Skeleton className="h-24 w-full rounded-xl" />
              ) : preview ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  {channel === "EMAIL" && preview.subject && (
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs">
                      <span className="text-slate-500">Subject:</span>{" "}
                      <span className="font-medium text-slate-800">
                        {preview.subject}
                      </span>
                    </div>
                  )}
                  <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap bg-white">
                    {preview.text}
                  </div>
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <ChannelIcon className="w-3.5 h-3.5" /> SeatPing on behalf
                      of your restaurant
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Choose a template to see a preview.
                </p>
              )}
            </Section>

            {/* Name */}
            <div>
              <label className="text-xs font-medium text-slate-600">
                Campaign Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. June win-back"
                className="bg-slate-50 border-slate-200 mt-1"
              />
            </div>

            {/* Timing */}
            <Section step={6} title="Timing">
              <div className="flex gap-2">
                {(
                  [
                    ["NOW", "Send Now"],
                    ["SCHEDULED", "Schedule"],
                    ["RECURRING", "Recurring"],
                  ] as [typeof sendMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setSendMode(mode)}
                    className={`flex-1 min-w-0 truncate px-2 sm:px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors ${
                      sendMode === mode
                        ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sendMode !== "NOW" && (
                <p className="text-xs text-slate-500 mt-2">
                  Time Zone: <span className="font-medium">{timezone}</span>
                </p>
              )}

              {sendMode === "SCHEDULED" && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-xs text-slate-500">Date</label>
                    <div className="mt-1">
                      <DateField
                        value={schedDate}
                        onChange={setSchedDate}
                        minDate={parseLocalDate(nowLocal.slice(0, 10))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Time</label>
                    <div className="mt-1">
                      <TimeSelect
                        value={schedTime || "09:00"}
                        onChange={setSchedTime}
                        options={ALL_DAY_TIME_OPTIONS}
                        portal={false}
                        className="bg-slate-50"
                      />
                    </div>
                  </div>
                </div>
              )}

              {sendMode === "RECURRING" && (
                <div className="space-y-2 mt-2">
                  <div className="flex gap-2">
                    {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setRecurFreq(f)}
                        className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors ${
                          recurFreq === f
                            ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {f.toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500">
                        Start Date
                      </label>
                      <div className="mt-1">
                        <DateField
                          value={recurStartDate}
                          onChange={setRecurStartDate}
                          minDate={parseLocalDate(nowLocal.slice(0, 10))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">
                        Send Time
                      </label>
                      <div className="mt-1">
                        <TimeSelect
                          value={recurStartTime || "09:00"}
                          onChange={setRecurStartTime}
                          options={ALL_DAY_TIME_OPTIONS}
                          portal={false}
                          className="bg-slate-50"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">
                        End Date (Optional)
                      </label>
                      <div className="mt-1">
                        <DateField
                          value={recurEndDate}
                          onChange={setRecurEndDate}
                          minDate={parseLocalDate(
                            recurStartDate || nowLocal.slice(0, 10),
                          )}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">
                        Guest Send Cooldown (Days)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={recurWindow}
                        onChange={(e) => setRecurWindow(e.target.value)}
                        className="h-12 rounded-xl bg-slate-50 border-slate-200 px-4 text-sm font-medium mt-1"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    The audience is recalculated on every run, opt-outs are
                    always respected, and a guest won't be re-sent within the
                    window above.
                  </p>
                </div>
              )}

              {timingError && (
                <p className="text-xs text-red-600 mt-2">{timingError}</p>
              )}
            </Section>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1 items-center">
            <div className="flex flex-1 gap-2 w-full">
              <Button
                variant="outline"
                onClick={saveDraft}
                disabled={saving}
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                onClick={() =>
                  sendMode === "NOW" ? setConfirmSend(true) : launch()
                }
                disabled={!canLaunch || sending}
                className="flex-1"
              >
                <Send className="w-4 h-4 mr-1.5" />
                {sending && sendMode !== "NOW" ? "Working..." : sendLabel}
              </Button>
            </div>
            {existing && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || sending}
                className="px-3 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                title="Delete Campaign"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </DialogContent>

        <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send This Campaign Now?</AlertDialogTitle>
              <AlertDialogDescription>
                {(() => {
                  const rc = audiencePreview?.recipientCount ?? 0;
                  const exc = audiencePreview?.excludedCount ?? 0;
                  const isPlural = rc !== 1;
                  let msgType = `${CHANNEL_META[channel].label} Messages`;
                  if (channel === "SMS")
                    msgType = isPlural ? "SMS Messages" : "an SMS Message";
                  else if (channel === "WHATSAPP")
                    msgType = isPlural
                      ? "WhatsApp Messages"
                      : "a WhatsApp Message";
                  else if (channel === "EMAIL")
                    msgType = isPlural ? "Email Messages" : "an Email Message";

                  const guestWord = rc === 1 ? "guest" : "guests";
                  const skipText =
                    exc === 0
                      ? "no guests will be skipped."
                      : `${exc} ${exc === 1 ? "guest" : "guests"} will be skipped.`;
                  const restName =
                    meta?.locations.find((l) => l.id === locationId)
                      ?.restaurantName || locationLabel;

                  return (
                    <>
                      This will send {msgType} to{" "}
                      <span className="font-semibold">{rc}</span> {guestWord}{" "}
                      for {restName}, {skipText} This cannot be undone.
                    </>
                  );
                })()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={launch} disabled={sending}>
                {sending ? "Sending..." : "Send Now"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This campaign will be permanently removed. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold flex items-center justify-center">
          {step}
        </span>
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Manual guest picker (reuses the Guest CRM list API)
// ---------------------------------------------------------------------------
function ManualGuestPicker({
  locationId,
  selected,
  onChange,
}: {
  locationId: string;
  selected: ManualGuest[];
  onChange: (g: ManualGuest[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ManualGuest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    const handle = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ locationId });
      if (search.trim()) params.set("search", search.trim());
      api(`/api/guests?${params.toString()}`)
        .then((d) => {
          const rows = (d?.guests ?? []).map((g: any) => ({
            id: g.id,
            name:
              g.fullName ||
              formatPhone(g.normalizedPhone, g.phone) ||
              g.email ||
              "Guest",
            contact:
              [g.email, formatPhone(g.normalizedPhone, g.phone)]
                .filter(Boolean)
                .join(" · ") || "",
          }));
          setResults(rows);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [search, locationId]);

  const selectedIds = new Set(selected.map((g) => g.id));
  const toggle = (g: ManualGuest) => {
    if (selectedIds.has(g.id)) onChange(selected.filter((x) => x.id !== g.id));
    else onChange([...selected, g]);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guests by name, phone, email, or tag"
          className="pl-9 bg-slate-50 border-slate-200"
        />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1"
            >
              {g.name}
              <button
                onClick={() => toggle(g)}
                className="hover:text-indigo-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
        {loading ? (
          <div className="p-3 text-sm text-slate-400">Searching...</div>
        ) : results.length === 0 ? (
          <div className="p-3 text-sm text-slate-400">No guests found.</div>
        ) : (
          results.map((g) => (
            <button
              key={g.id}
              onClick={() => toggle(g)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 ${
                selectedIds.has(g.id) ? "bg-indigo-50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">
                  {g.name}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {g.contact}
                </div>
              </div>
              {selectedIds.has(g.id) && (
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
      <p className="text-xs text-slate-500">
        {selected.length} {selected.length === 1 ? "guest" : "guests"} selected.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom template builder dialog
// ---------------------------------------------------------------------------
function TemplateBuilderDialog({
  open,
  onClose,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing: Template | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [variablesText, setVariablesText] = useState(
    (existing?.variables ?? []).join(", "),
  );
  const [exampleValues, setExampleValues] = useState<Record<string, string>>(
    existing?.exampleValues ?? {},
  );
  const [templateId, setTemplateId] = useState<string | null>(
    existing?.id ?? null,
  );
  const [busy, setBusy] = useState(false);

  const variables = variablesText
    .split(",")
    .map((s) => normalizeVar(s.trim()))
    .filter(Boolean);
  // Every status is editable. Editing an APPROVED template sends it back to
  // review, so its footer shows a single "save & resubmit" action.
  const isApprovedEdit = existing?.approvalStatus === "APPROVED";

  const bodyError = bodyParamPositionError(body);
  // Every declared variable needs an example value before submitting for review
  // (WhatsApp/Meta requires a sample for each placeholder).
  const exampleError =
    variables.length > 0 &&
    variables.some((v) => !(exampleValues[v] ?? "").trim())
      ? "Add an example value for every variable."
      : null;

  function buildBody() {
    return {
      name,
      purpose,
      body,
      variables,
      exampleValues,
    };
  }

  async function persist(): Promise<string | null> {
    if (!name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return null;
    }
    if (!body.trim()) {
      toast({ title: "Main message is required", variant: "destructive" });
      return null;
    }
    if (bodyError) {
      toast({ title: bodyError, variant: "destructive" });
      return null;
    }
    try {
      if (templateId) {
        await api(`/api/campaigns/templates/${templateId}`, {
          method: "PATCH",
          body: JSON.stringify(buildBody()),
        });
        return templateId;
      }
      const d = await api("/api/campaigns/templates", {
        method: "POST",
        body: JSON.stringify(buildBody()),
      });
      setTemplateId(d.template.id);
      return d.template.id;
    } catch (e) {
      toast({
        title: "Could not save template",
        description: errMsg(e),
        variant: "destructive",
      });
      return null;
    }
  }

  async function saveDraft() {
    setBusy(true);
    const id = await persist();
    setBusy(false);
    if (id) {
      toast({ title: "Template saved" });
      onSaved();
      onClose();
    }
  }

  // Saving an edit to an approved template re-runs review: the PATCH itself
  // moves it back to PENDING_SEATPING_REVIEW on the server.
  async function saveApprovedEdit() {
    if (exampleError) {
      toast({ title: exampleError, variant: "destructive" });
      return;
    }
    setBusy(true);
    const id = await persist();
    setBusy(false);
    if (id) {
      toast({
        title: "Changes saved",
        description: "Your edits were sent back to SeatPing for review.",
      });
      onSaved();
      onClose();
    }
  }

  async function submitForReview() {
    if (exampleError) {
      toast({ title: exampleError, variant: "destructive" });
      return;
    }
    setBusy(true);
    const id = await persist();
    if (!id) {
      setBusy(false);
      return;
    }
    try {
      await api(`/api/campaigns/templates/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({
        title: "Submitted for review",
        description: "SeatPing will prepare this for SMS, WhatsApp, and Email.",
      });
      onSaved();
      onClose();
    } catch (e) {
      toast({
        title: "Could not submit",
        description: errMsg(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Custom Template" : "New Custom Template"}
          </DialogTitle>
          <DialogDescription>
            Submit one general template request. SeatPing prepares it for SMS,
            WhatsApp, and Email.
          </DialogDescription>
        </DialogHeader>

        {existing?.approvalStatus === "REJECTED" &&
          existing.rejectionReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span className="font-medium">Rejection Reason:</span>{" "}
              {existing.rejectionReason}
            </div>
          )}
        {existing?.approvalStatus === "APPROVED" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            This template is approved. Editing it sends it back to SeatPing for
            review before it can be used again.
          </div>
        )}
        {existing?.approvalStatus === "PENDING_SEATPING_REVIEW" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            This template is pending SeatPing review. You can edit it and
            resubmit to update your request.
          </div>
        )}

        <div className="space-y-3">
          <Field label="Template Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Birthday Treat"
              className="bg-slate-50 border-slate-200"
            />
            {existing?.slug && (
              <p className="text-[11px] text-slate-400 mt-1">
                Template ID:{" "}
                <span className="font-mono text-slate-500">
                  {existing.slug}
                </span>
              </p>
            )}
          </Field>
          <Field label="Campaign Goal">
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="What is this campaign for?"
              className="bg-slate-50 border-slate-200"
            />
          </Field>
          <Field label="Main Message" required>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{First Name}}, ... Use {{Variable Name}} for personalization."
              className={`bg-slate-50 min-h-[100px] ${bodyError ? "border-red-300 focus-visible:ring-red-400" : "border-slate-200"}`}
            />
            {bodyError && (
              <p className="text-xs text-red-600 mt-1">{bodyError}</p>
            )}
          </Field>
          <Field label="Variables (Optional, Comma-Separated)">
            <Input
              value={variablesText}
              onChange={(e) => setVariablesText(e.target.value)}
              placeholder="offer, highlight"
              className="bg-slate-50 border-slate-200"
            />
            <p className="text-xs text-slate-400 mt-1">
              Use lowercase names with underscores (e.g. order_id). first_name
              and your restaurant name are filled automatically.
            </p>
          </Field>
          {variables.length > 0 && (
            <Field label="Example Values (Optional)">
              <div className="space-y-2">
                {variables.map((v) => {
                  const empty = !(exampleValues[v] ?? "").trim();
                  return (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-28 shrink-0 capitalize">
                        {v.replace(/_/g, " ")}
                      </span>
                      <Input
                        value={exampleValues[v] ?? ""}
                        onChange={(e) =>
                          setExampleValues((prev) => ({
                            ...prev,
                            [v]: e.target.value,
                          }))
                        }
                        className={`h-9 bg-slate-50 ${empty ? "border-red-300" : "border-slate-200"}`}
                      />
                    </div>
                  );
                })}
              </div>
              {exampleError && (
                <p className="text-xs text-red-600 mt-1.5">{exampleError}</p>
              )}
            </Field>
          )}
        </div>

        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-700">
          SeatPing will review this template and prepare it for SMS, WhatsApp,
          and Email.
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {isApprovedEdit ? (
            <Button
              onClick={saveApprovedEdit}
              disabled={busy || !!bodyError || !!exampleError}
              className="flex-1"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {busy ? "Saving..." : "Save & Resubmit For Review"}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={saveDraft}
                disabled={busy || !!bodyError}
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {busy ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                onClick={submitForReview}
                disabled={busy || !!bodyError || !!exampleError}
                className="flex-1"
              >
                <Send className="w-4 h-4 mr-1.5" />
                Submit For Review
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
