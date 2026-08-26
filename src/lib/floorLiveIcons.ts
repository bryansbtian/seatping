import { Ban, CalendarClock, CircleCheck, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LiveStatus } from "@/lib/floorLive";

const STATUS_ICONS: Record<LiveStatus, LucideIcon> = {
  AVAILABLE: CircleCheck,
  RESERVED: CalendarClock,
  OCCUPIED: Users,
  CLEANING: Sparkles,
  BLOCKED: Ban,
};

export function statusIcon(status: LiveStatus): LucideIcon {
  return STATUS_ICONS[status] ?? CircleCheck;
}
