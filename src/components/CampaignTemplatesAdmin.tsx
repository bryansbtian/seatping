import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/ui/collection-controls";
import ListSkeleton from "@/components/ListSkeleton";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectFilter } from "@/components/restaurant-discovery/RestaurantFilters";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplateStatusBadge } from "@/components/CampaignBadges";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Megaphone01Icon, Search01Icon } from "@hugeicons/core-free-icons";

type AdminTemplate = {
  id: string;
  templateType: string;
  businessId: string | null;
  businessUsername: string | null;
  locationId: string | null;
  name: string;
  slug: string | null;
  purpose: string | null;
  body: string;
  offerDetails: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  variables: string[];
  exampleValues: Record<string, string>;
  approvalStatus: string;
  rejectionReason: string | null;
  internalReviewNotes: string | null;
  whatsappMetaStatus: string | null;
  whatsappProviderTemplateName: string | null;
  whatsappProviderTemplateId: string | null;
  whatsappMetaCategory: string | null;
  whatsappLanguage: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
  createdAt: string;
  updatedAt: string;
  business: { id: string; name: string; username: string; email: string } | null;
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PENDING_SEATPING_REVIEW", label: "Pending Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

function fmtDate(value: string | null): string {
  if (!value) {
    return "--";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "--";
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function templateTimestamp(template: AdminTemplate): number {
  if (template.approvalStatus !== "DRAFT" && template.submittedAt) {
    const submitted = new Date(template.submittedAt).getTime();
    if (Number.isFinite(submitted)) {
      return submitted;
    }
  }
  const created = new Date(template.createdAt).getTime();
  if (Number.isFinite(created)) {
    return created;
  }
  return 0;
}

const CampaignTemplatesAdmin = () => {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminTemplate | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "ALL") {
      params.set("status", status);
    }
    if (debounced) {
      params.set("search", debounced);
    }
    api(`/admin/campaign-templates?${params.toString()}`)
      .then((d) => {
        setTemplates(d?.templates ?? []);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [status, debounced]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  let activeFilterCount = 0;
  if (dateFilter !== "all") {
    activeFilterCount += 1;
  }
  const now = Date.now();
  const visibleTemplates = templates
    .filter((template) => {
      if (dateFilter !== "all") {
        const timestamp = templateTimestamp(template);
        const cutoff = now - Number(dateFilter) * 24 * 60 * 60 * 1000;
        if (timestamp < cutoff || timestamp > now) {
          return false;
        }
      }
      return true;
    })
    .sort((first, second) => {
      const difference = templateTimestamp(second) - templateTimestamp(first);
      if (sort === "oldest") {
        return -difference;
      }
      if (sort === "name") {
        const nameDifference = first.name.localeCompare(second.name, undefined, {
          sensitivity: "base",
        });
        if (nameDifference !== 0) {
          return nameDifference;
        }
      }
      return difference;
    });
  const clearFilters = () => {
    setDateFilter("all");
  };
  let emptyDescription = "Try changing your filters or search to find campaign templates.";
  if (activeFilterCount > 0) {
    emptyDescription = "Clear your filters to see more templates.";
  }

  let templatesContent: ReactNode;
  if (loading) {
    templatesContent = (
      <ListSkeleton fill label="Loading Templates" className="min-h-10 p-0 md:p-0" />
    );
  } else if (visibleTemplates.length === 0) {
    templatesContent = (
      <BusinessEmptyState icon={Megaphone01Icon} title="No Templates Found" body={emptyDescription}>
        {activeFilterCount > 0 && (
          <Button variant="outline" onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </BusinessEmptyState>
    );
  } else {
    templatesContent = (
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
        {visibleTemplates.map((t) => {
          let purposeSuffix: string;
          if (t.purpose) {
            purposeSuffix = ` · ${t.purpose}`;
          } else {
            purposeSuffix = "";
          }
          let submittedLabel: string;
          if (t.approvalStatus !== "DRAFT" && t.submittedAt) {
            submittedLabel = `Submitted ${fmtDate(t.submittedAt)}`;
          } else {
            submittedLabel = fmtDate(t.createdAt);
          }
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="flex w-full flex-col items-start justify-between gap-1 p-4 text-left transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3 sm:py-3"
            >
              <div className="min-w-0 w-full flex-1 sm:w-auto">
                <div className="flex min-w-0 items-center gap-2 sm:flex-wrap">
                  <h3
                    className="min-w-0 flex-1 truncate text-body font-medium text-ink sm:flex-initial"
                    title={t.name}
                  >
                    {t.name}
                  </h3>
                  <span className="shrink-0">
                    <TemplateStatusBadge status={t.approvalStatus} />
                  </span>
                </div>
                <div className="mt-0.5 truncate text-caption text-ink-subtle">
                  {t.business?.name || t.businessUsername || "Unknown business"}
                  {purposeSuffix}
                </div>
              </div>
              <span className="shrink-0 text-caption text-slate-400">{submittedLabel}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Card
      data-testid="admin-content-card"
      role="region"
      aria-label="Campaign Template Results"
      className="flex flex-1 flex-col"
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex min-w-0 flex-col items-start gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
            <div
              role="group"
              aria-label="Template Statuses"
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              {STATUS_FILTERS.map((f) => {
                let filterVariant: "default" | "outline";
                if (status === f.key) {
                  filterVariant = "default";
                } else {
                  filterVariant = "outline";
                }
                return (
                  <Button
                    key={f.key}
                    type="button"
                    size="sm"
                    variant={filterVariant}
                    aria-pressed={status === f.key}
                    onClick={() => setStatus(f.key)}
                  >
                    {f.label}
                  </Button>
                );
              })}
            </div>
            <div
              role="group"
              aria-label="Template Controls"
              className="flex max-w-full items-center gap-2 md:ml-auto"
            >
              <SheetTrigger asChild>
                <FilterButton className="shrink-0" aria-label="Filter">
                  Filter
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="neutral"
                      aria-label={`${activeFilterCount} Active Filters`}
                      className="min-w-5 justify-center px-1"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </FilterButton>
              </SheetTrigger>
              <SelectFilter
                label="Sort By"
                kind="sort"
                size="sm"
                current={sort}
                clearable={false}
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "name", label: "Template Name" },
                ]}
                onChange={(value) => {
                  if (value) {
                    setSort(value);
                  }
                }}
              />
            </div>
          </div>
          <SheetContent
            side="bottom"
            hideClose
            className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
              <SheetTitle>Filter</SheetTitle>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="control-lg"
                  aria-label="Close Filters"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                </Button>
              </SheetClose>
            </div>
            <SheetDescription className="sr-only">
              Filter campaign templates by date.
            </SheetDescription>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
              <fieldset className="min-w-0">
                <legend className="mb-3 text-label text-ink">Date</legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "all", label: "Any Time" },
                    { value: "7", label: "Last 7 Days" },
                    { value: "30", label: "Last 30 Days" },
                    { value: "90", label: "Last 90 Days" },
                  ].map(({ value, label }) => {
                    let variant: "default" | "outline" = "outline";
                    if (dateFilter === value) {
                      variant = "default";
                    }
                    return (
                      <Button
                        key={value}
                        variant={variant}
                        aria-pressed={dateFilter === value}
                        onClick={() => setDateFilter(value)}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
                <p className="mt-3 text-caption text-ink-subtle">
                  Uses submission dates, or creation dates for drafts.
                </p>
              </fieldset>
            </div>
            <div className="flex shrink-0 items-center gap-3 border-t border-border bg-background p-4">
              <Button
                variant="outline"
                size="lg"
                className="px-4"
                disabled={activeFilterCount === 0}
                onClick={clearFilters}
              >
                Clear Filters
              </Button>
              <SheetClose asChild>
                <Button size="lg" className="min-w-0 flex-1 px-4">
                  Show Templates
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            aria-label="Search Campaign Templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business, template name, or content"
            className="pl-9"
          />
        </div>

        {templatesContent}
      </CardContent>

      <ReviewDialog
        template={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          fetchTemplates();
        }}
      />
    </Card>
  );
};

export default CampaignTemplatesAdmin;

function ReviewDialog({
  template,
  onClose,
  onChanged,
}: {
  template: AdminTemplate | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [whatsappMetaStatus, setWhatsappMetaStatus] = useState("");
  const [whatsappProviderTemplateName, setWhatsappProviderTemplateName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!template) {
      return;
    }
    setWhatsappMetaStatus(template.whatsappMetaStatus ?? "");
    setWhatsappProviderTemplateName(template.whatsappProviderTemplateName ?? "");
    setRejectionReason("");
    setRejectOpen(false);
  }, [template]);

  if (!template) {
    return null;
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy ${label.toLowerCase()}`, variant: "destructive" });
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await api(`/admin/campaign-templates/${template!.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ whatsappProviderTemplateName, whatsappMetaStatus }),
      });
      toast({ title: "Template approved", description: "Usable for SMS, WhatsApp, and Email." });
      onChanged();
      onClose();
    } catch (e: any) {
      toast({ title: "Could not approve", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectionReason.trim()) {
      toast({ title: "A rejection reason is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/campaign-templates/${template!.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason }),
      });
      toast({ title: "Template rejected" });
      onChanged();
      onClose();
    } catch (e: any) {
      toast({ title: "Could not reject", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  let templateSlugContent: ReactNode;
  if (template.slug) {
    templateSlugContent = (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => copyText(template.slug!, "Username")}
        title="Click to copy username"
        className="h-auto min-w-0 flex-1 justify-start whitespace-normal break-words px-0 py-0 text-left text-body font-medium text-slate-800"
      >
        {template.slug}
      </Button>
    );
  } else {
    templateSlugContent = (
      <span className="text-body font-medium text-slate-800 flex-1 min-w-0 break-words">--</span>
    );
  }

  let businessUsernameSuffix: string;
  if (template.businessUsername) {
    businessUsernameSuffix = ` (${template.businessUsername})`;
  } else {
    businessUsernameSuffix = "";
  }

  let ctaUrlSuffix: string;
  if (template.ctaUrl) {
    ctaUrlSuffix = ` → ${template.ctaUrl}`;
  } else {
    ctaUrlSuffix = "";
  }

  let submissionSuffix = "";
  if (template.approvalStatus !== "DRAFT" && template.submittedAt) {
    const submittedDate = fmtDate(template.submittedAt);
    if (submittedDate !== "--") {
      submissionSuffix = ` · Submitted ${submittedDate}`;
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="min-w-0 text-center sm:text-center [overflow-wrap:anywhere]">
          <div className="flex min-w-0 flex-col items-center justify-center gap-2 px-8 sm:flex-row">
            <DialogTitle className="min-w-0">{template.name}</DialogTitle>
            <div className="flex shrink-0 justify-center">
              <TemplateStatusBadge status={template.approvalStatus} />
            </div>
          </div>
          <DialogDescription>
            {template.business?.name || template.businessUsername}
            {submissionSuffix}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-label text-ink-subtle w-32 shrink-0 max-sm:font-medium">
              Template Name
            </span>
            <span className="text-body font-medium text-slate-800 flex-1 min-w-0 break-words">
              {template.name}
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-label text-ink-subtle w-32 shrink-0 max-sm:font-medium">
              Template Username
            </span>
            {templateSlugContent}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <h4 className="text-title font-medium text-ink">Template Content</h4>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-body">
            <Row
              label="Business"
              value={`${template.business?.name ?? template.businessUsername ?? "--"}${businessUsernameSuffix}`}
            />
            {template.locationId && <Row label="Location ID" value={template.locationId} />}
            {template.purpose && <Row label="Campaign Goal" value={template.purpose} />}
            <div>
              <div className="text-label text-slate-500 max-sm:font-medium">Main Message</div>
              <Button
                type="button"
                variant="outline"
                onClick={() => copyText(template.body, "Message")}
                title="Click to copy message"
                className="mt-1 h-auto w-full justify-start whitespace-pre-wrap break-words p-3 text-left text-body font-normal"
              >
                {template.body}
              </Button>
            </div>
            {template.offerDetails && <Row label="Offer" value={template.offerDetails} />}
            {(template.ctaText || template.ctaUrl) && (
              <Row label="CTA" value={`${template.ctaText ?? ""}${ctaUrlSuffix}`} />
            )}
            {template.variables.length > 0 && (
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:gap-2">
                <span className="text-label text-slate-500 w-24 shrink-0 pt-1 max-sm:font-medium">
                  Variables
                </span>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {template.variables.map((v) => (
                    <code
                      key={v}
                      className="max-w-full whitespace-pre-wrap break-words text-caption font-mono text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(template.exampleValues || {}).length > 0 && (
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:gap-2">
                <span className="text-label text-slate-500 w-24 shrink-0 pt-1 max-sm:font-medium">
                  Example Values
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                  {Object.entries(template.exampleValues).map(([k, v]) => (
                    <div key={k} className="flex min-w-0 flex-wrap items-center gap-1.5 text-label">
                      <code className="max-w-full whitespace-pre-wrap break-words font-mono text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 shrink-0">
                        {`{{${k}}}`}
                      </code>
                      <span className="text-slate-400 shrink-0">→</span>
                      <span className="text-slate-700 break-words min-w-0">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {template.approvalStatus !== "DRAFT" && (
            <div className="pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={approve} disabled={busy} className="sm:flex-1">
                  Approve
                </Button>
                <Button
                  onClick={() => setRejectOpen(true)}
                  disabled={busy}
                  variant="destructiveOutline"
                  className="sm:flex-1"
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <Dialog
        open={rejectOpen && template.approvalStatus !== "DRAFT"}
        onOpenChange={(o) => !busy && setRejectOpen(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Template</DialogTitle>
            <DialogDescription>
              This reason is shown to the business. Let them know what to fix.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-label">Business-Facing Rejection Reason</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="mt-1 min-h-[100px]"
              placeholder="Shown to the business if you reject this template"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={reject} disabled={busy} variant="destructive">
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:gap-2">
      <span className="text-label text-slate-500 w-24 shrink-0 max-sm:font-medium">{label}</span>
      <span className="text-slate-800 break-words min-w-0">{value}</span>
    </div>
  );
}
