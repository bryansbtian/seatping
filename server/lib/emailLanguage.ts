import type { Request } from "express";
import { parsePublicLanguage, type PublicLanguage } from "../../shared/publicLanguage.js";
import { manualPublicLanguage } from "./publicLanguage.js";

export function requestEmailLanguage(req: Request, savedPreference?: unknown): PublicLanguage {
  return (
    parsePublicLanguage(req.get("x-seatping-language")) ??
    parsePublicLanguage(savedPreference) ??
    manualPublicLanguage(req) ??
    "en"
  );
}

export function storedEmailLanguage(data: unknown): PublicLanguage {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return parsePublicLanguage(Reflect.get(data, "language")) ?? "en";
  }
  return "en";
}

export function emailDateLabels(
  details: { dateLabel: string; timeLabel: string; reservationDateTime?: string },
  language: PublicLanguage = "en",
): { dateLabel: string; timeLabel: string } {
  const labels = { dateLabel: details.dateLabel, timeLabel: details.timeLabel };
  if (language !== "id" || !details.reservationDateTime) {
    return labels;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)/.exec(details.reservationDateTime);
  if (!match) {
    return labels;
  }
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) {
    return labels;
  }
  return {
    dateLabel: date.toLocaleDateString("id-ID", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    timeLabel: `${match[2]}.${match[3]}`,
  };
}
