import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PILL_BASE_CLASS } from "@/lib/statusStyles";

const CAMPAIGN_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
  READY: { label: "Ready", cls: "bg-blue-100 text-blue-700" },
  SCHEDULED: { label: "Scheduled", cls: "bg-blue-100 text-blue-700" },
  RECURRING: { label: "Recurring", cls: "bg-indigo-100 text-indigo-700" },
  SENDING: { label: "Sending", cls: "bg-amber-100 text-amber-800" },
  SENT: { label: "Sent", cls: "bg-emerald-100 text-emerald-700" },
  FAILED: { label: "Failed", cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-slate-700" },
  PAUSED: { label: "Paused", cls: "bg-amber-100 text-amber-800" },
};

const TEMPLATE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
  PENDING_SEATPING_REVIEW: {
    label: "Pending Review",
    cls: "bg-amber-100 text-amber-800",
  },
  APPROVED: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-700" },
};

export function CampaignStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = CAMPAIGN_STATUS[status] || {
    label: status,
    cls: "bg-slate-100 text-slate-600",
  };
  return (
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, s.cls, className)}>
      {s.label}
    </Badge>
  );
}

export function TemplateStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = TEMPLATE_STATUS[status] || {
    label: status,
    cls: "bg-slate-100 text-slate-600",
  };
  return (
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, s.cls, className)}>
      {s.label}
    </Badge>
  );
}

export function SeatPingPill({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(PILL_BASE_CLASS, "bg-indigo-100 text-indigo-700", className)}
    >
      SeatPing
    </Badge>
  );
}

export function ChannelBadge({ channel, className }: { channel: string; className?: string }) {
  const map: Record<string, string> = {
    EMAIL: "bg-indigo-100 text-indigo-700",
    WHATSAPP: "bg-emerald-100 text-emerald-700",
    SMS: "bg-cyan-100 text-cyan-700",
  };
  let label: string;
  if (channel === "WHATSAPP") {
    label = "WhatsApp";
  } else if (channel === "SMS") {
    label = "SMS";
  } else {
    label = "Email";
  }
  return (
    <Badge variant="outline" className={cn(PILL_BASE_CLASS, map[channel] || "", className)}>
      {label}
    </Badge>
  );
}
