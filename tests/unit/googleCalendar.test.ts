import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calendarAccessToken,
  calendarBusy,
  calendarConfig,
  createDemoEvent,
  CalendarConflictError,
  CalendarUnavailableError,
} from "../../server/lib/googleCalendar.js";

describe("Google Calendar adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const start = new Date("2026-10-20T13:00:00Z");
  const end = new Date("2026-10-20T13:15:00Z");
  const customer = {
    name: "Test Guest",
    email: "guest@test.invalid",
    company: "Test Bistro",
    notes: "<Test>",
    timezone: "UTC",
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "test-secret-placeholder");
    vi.stubEnv("GOOGLE_CALENDAR_REFRESH_TOKEN", "test-refresh-placeholder");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "host@test.invalid");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fails closed when unconfigured", () => {
    vi.stubEnv("GOOGLE_CALENDAR_REFRESH_TOKEN", "");
    expect(calendarConfig).toThrow(CalendarUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes OAuth access server-side", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "test-access-placeholder" })),
    );
    await expect(calendarAccessToken()).resolves.toBe("test-access-placeholder");
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
  });

  it.each([new Response("{}", { status: 401 }), new Response("{}")])(
    "fails closed on rejected or malformed OAuth responses",
    async (response) => {
      fetchMock.mockResolvedValue(response.clone());
      await expect(calendarAccessToken()).rejects.toThrow(CalendarUnavailableError);
    },
  );

  it("queries FreeBusy for the configured calendar", async () => {
    const busy = [{ start: start.toISOString(), end: end.toISOString() }];
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ calendars: { "host@test.invalid": { busy } } })),
    );
    await expect(calendarBusy("placeholder", start, end)).resolves.toEqual(busy);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      items: [{ id: "host@test.invalid" }],
      timeMin: start.toISOString(),
    });
  });

  it.each([
    { calendars: {} },
    { calendars: { "host@test.invalid": { errors: [{ reason: "forbidden" }], busy: [] } } },
    { calendars: { "host@test.invalid": {} } },
    { calendars: { "host@test.invalid": { busy: [{ start: "invalid", end: "invalid" }] } } },
  ])("fails closed on calendar-level errors and malformed FreeBusy responses", async (response) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
    await expect(calendarBusy("placeholder", start, end)).rejects.toThrow(CalendarUnavailableError);
  });

  it("fails closed on FreeBusy transport errors", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(calendarBusy("placeholder", start, end)).rejects.toThrow(CalendarUnavailableError);
  });

  it("creates a titled event, attendee invitation, and unique Meet conference", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "abc123",
          status: "confirmed",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
        }),
      ),
    );
    await expect(createDemoEvent("placeholder", "abc123", start, end, customer)).resolves.toEqual({
      meetLink: "https://meet.google.com/abc-defg-hij",
    });
    expect(fetchMock.mock.calls[0][0]).toContain("conferenceDataVersion=1&sendUpdates=all");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      summary: "SeatPing Demo | Test Guest",
      start: { dateTime: start.toISOString(), timeZone: "America/New_York" },
      attendees: [{ email: customer.email, displayName: customer.name }],
      conferenceData: { createRequest: { conferenceSolutionKey: { type: "hangoutsMeet" } } },
    });
    expect(body.description).toContain("Test Bistro");
    expect(body.description).toContain("&lt;Test&gt;");
  });

  it("polls for asynchronously generated Meet links", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "abc123", status: "confirmed" })),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "abc123",
          status: "confirmed",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
        }),
      ),
    );
    expect(
      (await createDemoEvent("placeholder", "abc123", start, end, customer)).meetLink,
    ).toContain("meet.google.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a successfully created booking when Meet generation is delayed or fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "abc123", status: "confirmed" })),
    );
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(createDemoEvent("placeholder", "abc123", start, end, customer)).resolves.toEqual({
      meetLink: null,
    });
  });

  it.each([409, 403, 503])("never reports event creation succeeded on HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));
    let errorType: typeof Error = CalendarUnavailableError;
    if (status === 409) {
      errorType = CalendarConflictError;
    }
    await expect(createDemoEvent("placeholder", "abc123", start, end, customer)).rejects.toThrow(
      errorType,
    );
  });
});
