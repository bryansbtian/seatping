import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const runReservationReminderSweep = vi.fn();
const runDailyCreditRefillSweep = vi.fn();
const runDueCampaignsSweep = vi.fn();

vi.mock("../../server/lib/reservationReminders.js", () => {
  return { runReservationReminderSweep };
});

vi.mock("../../server/lib/trial.js", () => {
  return { runDailyCreditRefillSweep };
});

vi.mock("../../server/lib/campaignRunner.js", () => {
  return { runDueCampaignsSweep };
});

const ORIGINAL_ENV = { ...process.env };
const SECRET = "test-cron-secret";

const ROUTES = [
  "/api/cron/reservation-reminders",
  "/api/cron/credit-refill",
  "/api/cron/campaigns",
];

async function cronApp() {
  vi.resetModules();
  const router = (await import("../../server/routes/cron.js")).default;
  const app = express();
  app.use("/api/cron", router);
  return supertest(app);
}

beforeEach(() => {
  runReservationReminderSweep.mockReset().mockResolvedValue(undefined);
  runDailyCreditRefillSweep.mockReset().mockResolvedValue(undefined);
  runDueCampaignsSweep.mockReset().mockResolvedValue({ scheduled: 0, recurring: 0 });
  process.env.CRON_SECRET = SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("cron authorization", () => {
  it("fails closed on every route when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const app = await cronApp();

    for (const route of ROUTES) {
      const res = await app.post(route).set("Authorization", `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    }

    expect(runReservationReminderSweep).not.toHaveBeenCalled();
    expect(runDailyCreditRefillSweep).not.toHaveBeenCalled();
    expect(runDueCampaignsSweep).not.toHaveBeenCalled();
  });

  it("fails closed when the secret is an empty string", async () => {
    process.env.CRON_SECRET = "";
    const app = await cronApp();

    const res = await app.post(ROUTES[0]).set("Authorization", "Bearer ");

    expect(res.status).toBe(401);
    expect(runReservationReminderSweep).not.toHaveBeenCalled();
  });

  it("rejects a request with no authorization header", async () => {
    const app = await cronApp();

    for (const route of ROUTES) {
      const res = await app.post(route);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    }
  });

  it("rejects a bare secret sent without the Bearer prefix", async () => {
    const app = await cronApp();

    const res = await app.post(ROUTES[0]).set("Authorization", SECRET);

    expect(res.status).toBe(401);
    expect(runReservationReminderSweep).not.toHaveBeenCalled();
  });

  it("rejects a secret that only shares a prefix", async () => {
    const app = await cronApp();

    const res = await app.post(ROUTES[0]).set("Authorization", `Bearer ${SECRET}-extra`);

    expect(res.status).toBe(401);
  });

  it("accepts any http method on an authorized route", async () => {
    const app = await cronApp();

    const get = await app.get(ROUTES[0]).set("Authorization", `Bearer ${SECRET}`);
    const post = await app.post(ROUTES[0]).set("Authorization", `Bearer ${SECRET}`);

    expect(get.status).toBe(200);
    expect(post.status).toBe(200);
    expect(runReservationReminderSweep).toHaveBeenCalledTimes(2);
  });
});

describe("cron sweep failures", () => {
  it("reports a failed reservation reminder sweep without leaking the cause", async () => {
    runReservationReminderSweep.mockRejectedValue(new Error("smtp refused"));
    const app = await cronApp();

    const res = await app
      .post("/api/cron/reservation-reminders")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Sweep failed" });
    expect(JSON.stringify(res.body)).not.toContain("smtp refused");
  });

  it("reports a failed credit refill sweep", async () => {
    runDailyCreditRefillSweep.mockRejectedValue(new Error("db down"));
    const app = await cronApp();

    const res = await app.post("/api/cron/credit-refill").set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Sweep failed" });
  });

  it("reports a failed campaign sweep", async () => {
    runDueCampaignsSweep.mockRejectedValue(new Error("queue unavailable"));
    const app = await cronApp();

    const res = await app.post("/api/cron/campaigns").set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Sweep failed" });
  });

  it("survives a rejection that carries no message on any route", async () => {
    runReservationReminderSweep.mockRejectedValue("reminders blew up");
    runDailyCreditRefillSweep.mockRejectedValue("refill blew up");
    runDueCampaignsSweep.mockRejectedValue("campaigns blew up");
    const app = await cronApp();

    for (const route of ROUTES) {
      const res = await app.post(route).set("Authorization", `Bearer ${SECRET}`);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Sweep failed" });
    }

    expect((console.error as any).mock.calls).toHaveLength(3);
    expect((console.error as any).mock.calls[0][1]).toBe("reminders blew up");
  });
});

describe("cron rate limiting", () => {
  it("blocks authorized traffic once the per-minute cap is exceeded", async () => {
    const app = await cronApp();
    const auth = `Bearer ${SECRET}`;

    for (let i = 0; i < 30; i++) {
      const res = await app.post(ROUTES[0]).set("Authorization", auth);
      expect(res.status).toBe(200);
    }

    const blocked = await app.post(ROUTES[0]).set("Authorization", auth);

    expect(blocked.status).toBe(429);
    expect(runReservationReminderSweep).toHaveBeenCalledTimes(30);
  });

  it("caps unauthorized attempts so the secret cannot be brute forced", async () => {
    const app = await cronApp();

    for (let i = 0; i < 30; i++) {
      const res = await app.post(ROUTES[0]).set("Authorization", "Bearer wrong");
      expect(res.status).toBe(401);
    }

    const blocked = await app.post(ROUTES[0]).set("Authorization", "Bearer wrong");

    expect(blocked.status).toBe(429);
  });

  it("shares one budget across every cron route", async () => {
    const app = await cronApp();
    const auth = `Bearer ${SECRET}`;

    for (let i = 0; i < 30; i++) {
      const route = ROUTES[i % ROUTES.length];
      const res = await app.post(route).set("Authorization", auth);
      expect(res.status).toBe(200);
    }

    const blocked = await app.post(ROUTES[2]).set("Authorization", auth);

    expect(blocked.status).toBe(429);
  });
});

describe("cron sweep results", () => {
  it("runs each sweep exactly once per authorized call", async () => {
    const app = await cronApp();
    const auth = `Bearer ${SECRET}`;

    await app.post("/api/cron/reservation-reminders").set("Authorization", auth);
    await app.post("/api/cron/credit-refill").set("Authorization", auth);
    await app.post("/api/cron/campaigns").set("Authorization", auth);

    expect(runReservationReminderSweep).toHaveBeenCalledTimes(1);
    expect(runDailyCreditRefillSweep).toHaveBeenCalledTimes(1);
    expect(runDueCampaignsSweep).toHaveBeenCalledTimes(1);
  });

  it("passes the campaign sweep counts back to the caller", async () => {
    runDueCampaignsSweep.mockResolvedValue({ scheduled: 3, recurring: 2 });
    const app = await cronApp();

    const res = await app.post("/api/cron/campaigns").set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, scheduled: 3, recurring: 2 });
  });

  it("acknowledges the sweeps that report nothing back", async () => {
    const app = await cronApp();
    const auth = `Bearer ${SECRET}`;

    const reminders = await app.post("/api/cron/reservation-reminders").set("Authorization", auth);
    const credits = await app.post("/api/cron/credit-refill").set("Authorization", auth);

    expect(reminders.body).toEqual({ ok: true });
    expect(credits.body).toEqual({ ok: true });
  });
});
