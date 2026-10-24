import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../helpers/app.js";
import { getTestPrisma } from "../helpers/db.js";
import { dateInTimezone, DEMO_SLOT_MS } from "../../shared/demoBooking.js";
import {
  calendarAccessToken,
  calendarBusy,
  calendarConfig,
  createDemoEvent,
} from "../../server/lib/googleCalendar.js";

vi.mock("../../server/lib/googleCalendar.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/lib/googleCalendar.js")>();
  return {
    ...original,
    calendarConfig: vi.fn(),
    calendarAccessToken: vi.fn(),
    calendarBusy: vi.fn(),
    createDemoEvent: vi.fn(),
  };
});

const bookingDates = ["2026-10-01T12:00:00Z", "2026-10-24T01:00:00Z", "2026-12-25T22:00:00Z"];

describe.each(bookingDates)("demo booking API with PostgreSQL at %s", (now) => {
  const calendarId = "demo-integration@test.invalid";
  let start: string;
  let month: string;
  let counter = 0;
  const payload = () => {
    counter += 1;
    return {
      start,
      name: "Test Guest",
      email: `demo-${counter}@test.invalid`,
      timezone: "America/New_York",
      company: "Test Bistro",
      notes: "A walkthrough",
    };
  };
  const post = async (body: Record<string, unknown>) =>
    (await api())
      .post("/api/demo/book")
      .set("X-Forwarded-For", `198.51.100.${counter + 1}`)
      .send(body);
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    vi.mocked(calendarConfig).mockReturnValue({
      calendarId,
      clientId: "placeholder",
      clientSecret: "placeholder",
      refreshToken: "placeholder",
    });
    vi.mocked(calendarAccessToken).mockResolvedValue("placeholder");
    vi.mocked(calendarBusy).mockResolvedValue([]);
    vi.mocked(createDemoEvent).mockResolvedValue({
      meetLink: "https://meet.google.com/abc-defg-hij",
    });
    const future = new Date(Date.now() + 7 * 86_400_000);
    future.setUTCHours(14, 0, 0, 0);
    while (future.getUTCDay() === 0 || future.getUTCDay() === 6) {
      future.setUTCDate(future.getUTCDate() + 1);
    }
    start = future.toISOString();
    month = dateInTimezone(start, "America/New_York").slice(0, 7);
    await getTestPrisma().demoBooking.deleteMany({ where: { calendarId } });
  });
  afterEach(async () => {
    try {
      await getTestPrisma().demoBooking.deleteMany({ where: { calendarId } });
    } finally {
      vi.useRealTimers();
      vi.clearAllMocks();
    }
  });

  it("returns only verified availability without exposing busy events", async () => {
    vi.mocked(calendarBusy).mockResolvedValue([
      { start, end: new Date(Date.parse(start) + DEMO_SLOT_MS).toISOString() },
    ]);
    const res = await (
      await api()
    )
      .get("/api/demo/availability")
      .query({ month, timezone: "America/New_York" });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.slots).not.toContain(start);
    expect(Object.keys(res.body)).toEqual(["slots"]);
  });

  it("rechecks availability, creates an event, and confirms only after creation", async () => {
    const body = payload();
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.body.meetLink).toContain("meet.google.com");
    expect(calendarBusy).toHaveBeenCalledWith(
      "placeholder",
      new Date(start),
      new Date(Date.parse(start) + DEMO_SLOT_MS),
    );
    expect(createDemoEvent).toHaveBeenCalledWith(
      "placeholder",
      expect.any(String),
      new Date(start),
      expect.any(Date),
      expect.objectContaining({ name: body.name, email: body.email }),
    );
    const rows = await getTestPrisma().demoBooking.findMany({ where: { calendarId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
  });

  it("serializes simultaneous claims across database clients", async () => {
    const [a, b] = await Promise.all([post(payload()), post(payload())]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(createDemoEvent).toHaveBeenCalledTimes(1);
    expect(await getTestPrisma().demoBooking.count({ where: { calendarId } })).toBe(1);
  });

  it("rejects newly conflicting events and releases claims before insertion", async () => {
    vi.mocked(calendarBusy).mockResolvedValue([
      { start, end: new Date(Date.parse(start) + DEMO_SLOT_MS).toISOString() },
    ]);
    expect((await post(payload())).status).toBe(409);
    expect(createDemoEvent).not.toHaveBeenCalled();
    expect(await getTestPrisma().demoBooking.count({ where: { calendarId } })).toBe(0);
  });

  it("fails closed when FreeBusy fails and releases the unsubmitted claim", async () => {
    vi.mocked(calendarBusy).mockRejectedValue(new Error("simulated provider failure"));
    expect((await post(payload())).status).toBe(503);
    expect(createDemoEvent).not.toHaveBeenCalled();
    expect(await getTestPrisma().demoBooking.count({ where: { calendarId } })).toBe(0);
    const availability = await (
      await api()
    )
      .get("/api/demo/availability")
      .query({ month, timezone: "UTC" });
    expect(availability.status).toBe(503);
    expect(availability.body.slots).toBeUndefined();
  });

  it("preserves uncertain claims and blocks retries after event insertion errors", async () => {
    vi.mocked(createDemoEvent).mockRejectedValue(new Error("simulated timeout"));
    const res = await post(payload());
    expect(res.status).toBe(503);
    expect(res.body.uncertain).toBe(true);
    expect((await post(payload())).status).toBe(409);
    const availability = await (
      await api()
    )
      .get("/api/demo/availability")
      .query({ month, timezone: "UTC" });
    expect(availability.body.slots).not.toContain(start);
    expect(createDemoEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: "" },
    { email: "invalid" },
    { timezone: "Mars/Olympus" },
    { notes: "x".repeat(2001) },
    { start: "2000-01-01T13:00:00.000Z" },
    { name: "Guest\nHeader" },
  ])("validates booking inputs before external calls", async (invalid) => {
    const res = await post({ ...payload(), ...invalid });
    expect(res.status).toBe(400);
    expect(calendarAccessToken).not.toHaveBeenCalled();
  });

  it("validates availability range and timezone", async () => {
    for (const query of [
      { month: "2026-13", timezone: "UTC" },
      { month: "2099-01", timezone: "UTC" },
      { month, timezone: "invalid" },
    ]) {
      expect((await (await api()).get("/api/demo/availability").query(query)).status).toBe(400);
    }
  });

  it("rate limits public booking submissions", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push(
        (
          await (
            await api()
          )
            .post("/api/demo/book")
            .set("X-Forwarded-For", "203.0.113.222")
            .send({})
        ).status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("removes the retired sales inquiry endpoint", async () => {
    expect((await (await api()).post("/api/sales/inquiry").send({})).status).toBe(404);
  });
});
