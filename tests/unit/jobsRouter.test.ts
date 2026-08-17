import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const processNotification = vi.fn();
const verify = vi.fn();

vi.mock("../../server/lib/notifications.js", () => {
  return { processNotification };
});

vi.mock("@upstash/qstash", () => {
  class FakeReceiver {
    public verify = verify;
  }
  class FakeClient {
    public async publishJSON() {
      return { messageId: "unused" };
    }
  }
  return { Receiver: FakeReceiver, Client: FakeClient };
});

const ORIGINAL_ENV = { ...process.env };

async function jobsApp() {
  vi.resetModules();
  const router = (await import("../../server/routes/jobs.js")).default;
  const app = express();
  app.use("/api/jobs", router);
  return supertest(app);
}

function job() {
  return {
    type: "queue_join",
    channel: "email",
    email: "guest@test.invalid",
    firstName: "Ada",
    businessName: "Bistro",
    position: 1,
  };
}

beforeEach(() => {
  processNotification.mockReset().mockResolvedValue(undefined);
  verify.mockReset().mockResolvedValue(true);
  process.env.QSTASH_CURRENT_SIGNING_KEY = "sig-current";
  process.env.QSTASH_NEXT_SIGNING_KEY = "sig-next";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("qstash notification worker", () => {
  it("fails closed when the signing keys are missing", async () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(job()));

    expect(res.status).toBe(503);
    expect(processNotification).not.toHaveBeenCalled();
  });

  it("verifies the raw body against the Upstash signature", async () => {
    const payload = JSON.stringify(job());

    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .set("Upstash-Signature", "test-signature")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith({
      signature: "test-signature",
      body: payload,
    });
    expect(processNotification).toHaveBeenCalledWith(job());
  });

  it("rejects an unsigned request", async () => {
    verify.mockResolvedValue(false);

    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(job()));

    expect(res.status).toBe(401);
    expect(processNotification).not.toHaveBeenCalled();
  });

  it("rejects a request whose signature check throws", async () => {
    verify.mockRejectedValue(new Error("bad signature"));

    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .set("Upstash-Signature", "nonsense")
      .send(JSON.stringify(job()));

    expect(res.status).toBe(401);
    expect(processNotification).not.toHaveBeenCalled();
  });

  it("rejects a signed body that is not valid json", async () => {
    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .set("Upstash-Signature", "test-signature")
      .send("not json at all");

    expect(res.status).toBe(400);
    expect(processNotification).not.toHaveBeenCalled();
  });

  it("reports a send failure without leaking the provider error", async () => {
    processNotification.mockRejectedValue(new Error("smtp refused"));

    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .set("Upstash-Signature", "test-signature")
      .send(JSON.stringify(job()));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Send failed" });
  });

  it("accepts a body sent with any content type", async () => {
    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "text/plain")
      .set("Upstash-Signature", "test-signature")
      .send(JSON.stringify(job()));

    expect(res.status).toBe(200);
    expect(processNotification).toHaveBeenCalledWith(job());
  });

  it("survives a send failure that carries no message", async () => {
    processNotification.mockRejectedValue("worker exploded");

    const res = await (await jobsApp())
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .set("Upstash-Signature", "test-signature")
      .send(JSON.stringify(job()));

    expect(res.status).toBe(500);
    expect((console.error as any).mock.calls[0][1]).toBe("worker exploded");
  });
});

describe("qstash worker behind another body parser", () => {
  async function appWithParser(parser: express.RequestHandler) {
    vi.resetModules();
    const router = (await import("../../server/routes/jobs.js")).default;
    const app = express();
    app.use(parser);
    app.use("/api/jobs", router);
    return supertest(app);
  }

  it("verifies a body a json parser already consumed", async () => {
    const app = await appWithParser(express.json());

    const res = await app
      .post("/api/jobs/notify")
      .set("Upstash-Signature", "test-signature")
      .send(job());

    expect(res.status).toBe(200);
    expect(verify).toHaveBeenCalledWith({
      signature: "test-signature",
      body: JSON.stringify(job()),
    });
    expect(processNotification).toHaveBeenCalledWith(job());
  });

  it("verifies a body a text parser already consumed", async () => {
    const app = await appWithParser(express.text({ type: "*/*" }));
    const payload = JSON.stringify(job());

    const res = await app
      .post("/api/jobs/notify")
      .set("Content-Type", "application/json")
      .set("Upstash-Signature", "test-signature")
      .send(payload);

    expect(res.status).toBe(200);
    expect(verify).toHaveBeenCalledWith({
      signature: "test-signature",
      body: payload,
    });
  });
});
