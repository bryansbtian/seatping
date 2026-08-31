import type { IconSvgElement } from "@hugeicons/react";
import {
  BanIcon,
  CalendarClockIcon,
  CheckmarkCircle02Icon,
  SparklesIcon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";
import type { LiveStatus } from "@/lib/floorLive";

const STATUS_ICONS: Record<LiveStatus, IconSvgElement> = {
  AVAILABLE: CheckmarkCircle02Icon,
  RESERVED: CalendarClockIcon,
  OCCUPIED: UsersRoundIcon,
  CLEANING: SparklesIcon,
  BLOCKED: BanIcon,
};

export function statusIcon(status: LiveStatus): IconSvgElement {
  return STATUS_ICONS[status] ?? CheckmarkCircle02Icon;
}
