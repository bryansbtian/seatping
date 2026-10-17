import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DEMO_TIMEZONE } from "../../shared/demoBooking.js";

export class CalendarUnavailableError extends Error {}
export class CalendarConflictError extends Error {}

const eventSchema = z.object({
  id: z.string(),
  status: z.string(),
  hangoutLink: z.string().url().optional(),
  conferenceData: z
    .object({
      createRequest: z.object({ status: z.object({ statusCode: z.string() }) }).optional(),
    })
    .optional(),
});

export function calendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!clientId || !clientSecret || !refreshToken || !calendarId) {
    throw new CalendarUnavailableError();
  }
  return { clientId, clientSecret, refreshToken, calendarId };
}

export async function calendarAccessToken(): Promise<string> {
  const config = calendarConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new CalendarUnavailableError();
  }
  const result = z.object({ access_token: z.string().min(1) }).safeParse(await response.json());
  if (!result.success) {
    throw new CalendarUnavailableError();
  }
  return result.data.access_token;
}

export async function calendarBusy(
  token: string,
  start: Date,
  end: Date,
): Promise<{ start: string; end: string }[]> {
  const { calendarId } = calendarConfig();
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: DEMO_TIMEZONE,
      items: [{ id: calendarId }],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new CalendarUnavailableError();
  }
  const result = z
    .object({
      calendars: z.record(
        z.object({
          errors: z.array(z.unknown()).optional(),
          busy: z.array(
            z
              .object({
                start: z.string().datetime({ offset: true }),
                end: z.string().datetime({ offset: true }),
              })
              .refine((item) => Date.parse(item.end) > Date.parse(item.start)),
          ),
        }),
      ),
    })
    .safeParse(await response.json());
  if (!result.success) {
    throw new CalendarUnavailableError();
  }
  const calendar = result.data.calendars[calendarId];
  if (!calendar || calendar.errors?.length) {
    throw new CalendarUnavailableError();
  }
  return calendar.busy.map((item) => ({ start: item.start, end: item.end }));
}

export type CalendarBooking = {
  name: string;
  email: string;
  company?: string;
  notes?: string;
  timezone: string;
};

export async function createDemoEvent(
  token: string,
  eventId: string,
  start: Date,
  end: Date,
  customer: CalendarBooking,
) {
  const { calendarId } = calendarConfig();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const escape = (text: string) =>
    text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const response = await fetch(`${url}?conferenceDataVersion=1&sendUpdates=all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: eventId,
      summary: `SeatPing Demo | ${customer.name}`,
      description: escape(
        `Name: ${customer.name}\nRestaurant Or Company: ${customer.company || "Not Provided"}\nNotes: ${customer.notes || "None"}\nGuest Timezone: ${customer.timezone}`,
      ),
      start: { dateTime: start.toISOString(), timeZone: DEMO_TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: DEMO_TIMEZONE },
      attendees: [{ email: customer.email, displayName: customer.name }],
      transparency: "opaque",
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      conferenceData: {
        createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 409) {
    throw new CalendarConflictError();
  }
  if (!response.ok) {
    throw new CalendarUnavailableError();
  }
  let event = eventSchema.parse(await response.json());
  if (event.id !== eventId || event.status === "cancelled") {
    throw new CalendarUnavailableError();
  }
  for (let attempt = 0; attempt < 3 && !event.hangoutLink; attempt += 1) {
    try {
      const lookup = await fetch(`${url}/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!lookup.ok) {
        break;
      }
      event = eventSchema.parse(await lookup.json());
    } catch {
      break;
    }
  }
  let meetLink: string | null = null;
  if (event.hangoutLink && new URL(event.hangoutLink).origin === "https://meet.google.com") {
    meetLink = event.hangoutLink;
  }
  return { meetLink };
}
