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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplateStatusBadge } from "@/components/CampaignBadges";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Search, RefreshCw, Inbox } from "lucide-react";

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
          {/* space-y-1.5 matches CardHeader's title/description spacing, which
              is lost here because the flex wrapper makes this a nested div. */}
          <div className="space-y-1.5">
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
  const [whatsappMetaStatus, setWhatsappMetaStatus] = useState("");
  const [whatsappProviderTemplateName, setWhatsappProviderTemplateName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!template) return;
    setWhatsappMetaStatus(template.whatsappMetaStatus ?? "");
    setWhatsappProviderTemplateName(template.whatsappProviderTemplateName ?? "");
    setRejectionReason("");
    setRejectOpen(false);
  }, [template]);

  if (!template) return null;

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
            {template.slug ? (
              <button
                type="button"
                onClick={() => copyText(template.slug!, "Username")}
                title="Click to copy username"
                className="text-sm font-medium text-slate-800 flex-1 min-w-0 break-words text-left hover:text-indigo-700 cursor-pointer"
              >
                {template.slug}
              </button>
            ) : (
              <span className="text-sm font-medium text-slate-800 flex-1 min-w-0 break-words">--</span>
            )}
          </div>
        </div>

        {/* Submitted content */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Submitted Content</h4>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
            <Row label="Business" value={`${template.business?.name ?? template.businessUsername ?? "--"}${template.businessUsername ? ` (${template.businessUsername})` : ""}`} />
            {template.locationId && <Row label="Location ID" value={template.locationId} />}
            {template.purpose && <Row label="Campaign Goal" value={template.purpose} />}
            <div>
              <div className="text-xs text-slate-500">Main Message</div>
              <button
                type="button"
                onClick={() => copyText(template.body, "Message")}
                title="Click to copy message"
                className="mt-1 w-full text-left rounded-lg border border-slate-200 bg-white p-3 text-slate-800 whitespace-pre-wrap hover:border-indigo-200 hover:bg-indigo-50/40 cursor-pointer transition-colors"
              >
                {template.body}
              </button>
            </div>
            {template.offerDetails && <Row label="Offer" value={template.offerDetails} />}
            {(template.ctaText || template.ctaUrl) && (
              <Row label="CTA" value={`${template.ctaText ?? ""}${template.ctaUrl ? ` → ${template.ctaUrl}` : ""}`} />
            )}
            {template.variables.length > 0 && (
              <div className="flex gap-2">
                <span className="text-xs text-slate-500 w-24 shrink-0 pt-1">Variables</span>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {template.variables.map((v) => (
                    <code
                      key={v}
                      className="text-xs font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(template.exampleValues || {}).length > 0 && (
              <div className="flex gap-2">
                <span className="text-xs text-slate-500 w-24 shrink-0 pt-1">Example Values</span>
                <div className="flex flex-col gap-1 min-w-0">
                  {Object.entries(template.exampleValues).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5 text-xs min-w-0">
                      <code className="font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 shrink-0">
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

          {/* Approve / reject */}
          <div className="pt-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={approve} disabled={busy} variant="success" className="flex-1">
                Approve
              </Button>
              <Button
                onClick={() => setRejectOpen(true)}
                disabled={busy}
                variant="destructiveOutline"
                className="flex-1"
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Reject reason modal */}
      <Dialog open={rejectOpen} onOpenChange={(o) => !busy && setRejectOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Template</DialogTitle>
            <DialogDescription>
              This reason is shown to the business. Let them know what to fix.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Business-Facing Rejection Reason</Label>
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
    <div className="flex gap-2">
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-slate-800 break-words min-w-0">{value}</span>
    </div>
  );
}
