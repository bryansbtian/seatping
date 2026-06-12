import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { TemplateStatusBadge } from "@/components/CampaignBadges";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Search, RefreshCw, Inbox, Copy, Check } from "lucide-react";

// Admin review console for business-submitted CUSTOM campaign templates. This is
// the ONLY surface that can approve/reject a template; it also tracks the
// internal WhatsApp Meta workflow fields (never shown to businesses). Rendered
// inside the existing /admin Tabs, gated by the admin session cookie.

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
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CampaignTemplatesAdmin = () => {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminTemplate | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (debounced) params.set("search", debounced);
    api(`/admin/campaign-templates?${params.toString()}`)
      .then((d) => {
        setTemplates(d?.templates ?? []);
        setCounts(d?.counts ?? {});
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [status, debounced]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Campaign Templates</CardTitle>
            <CardDescription>Review and approve business-submitted custom templates.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                status === f.key
                  ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
              {f.key !== "ALL" && counts[f.key] ? ` (${counts[f.key]})` : ""}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business, template name, or content"
            className="pl-9"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No custom templates found.</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 truncate">{t.name}</span>
                    <TemplateStatusBadge status={t.approvalStatus} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {t.business?.name || t.businessUsername || "Unknown business"}
                    {t.purpose ? ` · ${t.purpose}` : ""}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {t.submittedAt ? `Submitted ${fmtDate(t.submittedAt)}` : fmtDate(t.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}
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

// ---------------------------------------------------------------------------
// Review detail dialog
// ---------------------------------------------------------------------------
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
  const [internalReviewNotes, setInternalReviewNotes] = useState("");
  const [whatsappMetaStatus, setWhatsappMetaStatus] = useState("");
  const [whatsappProviderTemplateName, setWhatsappProviderTemplateName] = useState("");
  const [whatsappProviderTemplateId, setWhatsappProviderTemplateId] = useState("");
  const [whatsappMetaCategory, setWhatsappMetaCategory] = useState("");
  const [whatsappLanguage, setWhatsappLanguage] = useState("en");
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!template) return;
    setInternalReviewNotes(template.internalReviewNotes ?? "");
    setWhatsappMetaStatus(template.whatsappMetaStatus ?? "");
    setWhatsappProviderTemplateName(template.whatsappProviderTemplateName ?? "");
    setWhatsappProviderTemplateId(template.whatsappProviderTemplateId ?? "");
    setWhatsappMetaCategory(template.whatsappMetaCategory ?? "");
    setWhatsappLanguage(template.whatsappLanguage ?? "en");
    setRejectionReason("");
  }, [template]);

  if (!template) return null;

  async function saveReview() {
    setBusy(true);
    try {
      await api(`/admin/campaign-templates/${template!.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          internalReviewNotes,
          whatsappMetaStatus,
          whatsappProviderTemplateName,
          whatsappProviderTemplateId,
          whatsappMetaCategory,
          whatsappLanguage,
        }),
      });
      toast({ title: "Review saved" });
      onChanged();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
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

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template.name}
            <TemplateStatusBadge status={template.approvalStatus} />
          </DialogTitle>
          <DialogDescription>
            {template.business?.name || template.businessUsername} · Submitted {fmtDate(template.submittedAt)}
          </DialogDescription>
        </DialogHeader>

        {/* Template name + internal username (slug) for Meta. */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-indigo-500 w-32 shrink-0">Template Name</span>
            <span className="text-sm font-medium text-slate-800 flex-1 min-w-0 break-words">{template.name}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-indigo-500 w-32 shrink-0">Template Username</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <code className="text-sm font-mono text-indigo-800 bg-white border border-indigo-200 rounded px-2 py-0.5 truncate">
                {template.slug || "--"}
              </code>
              {template.slug && <CopyButton value={template.slug} label="username" />}
            </div>
          </div>
          <p className="text-[11px] text-indigo-600/80">
            Use this as the WhatsApp template name when creating it in Meta.
          </p>
        </div>

        {/* Submitted content */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Submitted Content</h4>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
            <Row label="Business" value={`${template.business?.name ?? template.businessUsername ?? "--"}${template.business?.email ? ` (${template.business.email})` : ""}`} />
            {template.locationId && <Row label="Location ID" value={template.locationId} />}
            {template.purpose && <Row label="Campaign goal" value={template.purpose} />}
            <div>
              <div className="text-xs text-slate-500">Main message</div>
              <div className="text-slate-800 whitespace-pre-wrap mt-0.5">{template.body}</div>
            </div>
            {template.offerDetails && <Row label="Offer" value={template.offerDetails} />}
            {(template.ctaText || template.ctaUrl) && (
              <Row label="CTA" value={`${template.ctaText ?? ""}${template.ctaUrl ? ` → ${template.ctaUrl}` : ""}`} />
            )}
            {template.variables.length > 0 && <Row label="Variables" value={template.variables.join(", ")} />}
            {Object.keys(template.exampleValues || {}).length > 0 && (
              <Row label="Example values" value={Object.entries(template.exampleValues).map(([k, v]) => `${k}=${v}`).join(", ")} />
            )}
          </div>

          {/* Internal review fields (admin-only) */}
          <h4 className="text-sm font-semibold text-slate-800 pt-2">Internal Review (admin only)</h4>
          <div>
            <Label className="text-xs">Internal notes</Label>
            <Textarea
              value={internalReviewNotes}
              onChange={(e) => setInternalReviewNotes(e.target.value)}
              className="mt-1 min-h-[70px]"
              placeholder="Private review notes"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">WhatsApp Meta status</Label>
              <Input value={whatsappMetaStatus} onChange={(e) => setWhatsappMetaStatus(e.target.value)} className="mt-1" placeholder="e.g. submitted / approved" />
            </div>
            <div>
              <Label className="text-xs">Meta category</Label>
              <Input value={whatsappMetaCategory} onChange={(e) => setWhatsappMetaCategory(e.target.value)} className="mt-1" placeholder="MARKETING / UTILITY" />
            </div>
            <div>
              <Label className="text-xs">Provider template name</Label>
              <Input value={whatsappProviderTemplateName} onChange={(e) => setWhatsappProviderTemplateName(e.target.value)} className="mt-1" placeholder="meta_template_name" />
              {template.slug && whatsappProviderTemplateName && whatsappProviderTemplateName !== template.slug && (
                <p className="text-[11px] text-amber-600 mt-1">Differs from username ({template.slug}).</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Provider template ID</Label>
              <Input value={whatsappProviderTemplateId} onChange={(e) => setWhatsappProviderTemplateId(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">WhatsApp language</Label>
              <Input value={whatsappLanguage} onChange={(e) => setWhatsappLanguage(e.target.value)} className="mt-1" placeholder="en" />
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={saveReview} disabled={busy}>
            Save Internal Notes
          </Button>

          {/* Approve / reject */}
          <div className="border-t border-slate-200 pt-3 space-y-3">
            <div>
              <Label className="text-xs">Business-facing rejection reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-1 min-h-[60px]"
                placeholder="Shown to the business if you reject this template"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={approve}
                disabled={busy}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                Approve (all channels)
              </Button>
              <Button onClick={reject} disabled={busy} variant="destructive" className="flex-1">
                Reject
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Approve only once SMS + Email are ready and the WhatsApp Meta template is approved. Approval enables all
              three channels at once.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-slate-800 break-words min-w-0">{value}</span>
    </div>
  );
}

function CopyButton({ value, label = "value" }: { value: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: `Could not copy ${label}`, variant: "destructive" });
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label}`}
      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}
