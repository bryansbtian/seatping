import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationJob } from "../../server/lib/notifications.js";

const sdkFactory = vi.fn();
const sdkConstructed = vi.fn();
const send = vi.fn();

vi.mock("../../server/lib/prisma.js", () => ({ prisma: {} }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TELNYX_API_KEY", "synthetic-api-key");
  vi.stubEnv("TELNYX_PHONE_NUMBER", "+15550000000");
  send.mockReset().mockResolvedValue({ data: { id: "synthetic-message" } });
  sdkConstructed.mockReset();
  sdkFactory.mockReset().mockImplementation(() => {
    class SyntheticTelnyx {
      public messages = { send };

      constructor(options: unknown) {
        sdkConstructed(options);
      }
    }
    return { default: SyntheticTelnyx };
  });
  vi.doMock("telnyx", sdkFactory);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected Network Request")));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock("telnyx");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function notification(): NotificationJob {
  return {
    type: "queue_join",
    channel: "sms",
    firstName: "Synthetic",
    lastName: "Fixture",
    countryCode: "+1",
    phoneNumber: "5551112222",
    restaurantName: "Synthetic Restaurant",
    address: "Synthetic Street",
    position: 2,
  };
}

describe("notification SDK loading", () => {
  it("does not load the SMS SDK while importing unrelated server functionality", async () => {
    await import("../../server/lib/notifications.js");

    expect(sdkFactory).not.toHaveBeenCalled();
    expect(sdkConstructed).not.toHaveBeenCalled();
  });

  it.each(["TELNYX_API_KEY", "TELNYX_PHONE_NUMBER"])(
    "does not load the SDK when %s is unavailable",
    async (key) => {
      vi.stubEnv(key, "");
      const { processNotification } = await import("../../server/lib/notifications.js");

      await processNotification(notification());

      expect(sdkFactory).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("does not load the SDK without a recipient phone", async () => {
    const { processNotification } = await import("../../server/lib/notifications.js");
    const job = notification();
    if (job.type === "queue_join") {
      job.phoneNumber = undefined;
    }

    await processNotification(job);

    expect(sdkFactory).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("loads the SDK on demand and preserves SMS delivery", async () => {
    const { processNotification } = await import("../../server/lib/notifications.js");

    await processNotification(notification());

    expect(sdkFactory).toHaveBeenCalledTimes(1);
    expect(sdkConstructed).toHaveBeenCalledWith({ apiKey: "synthetic-api-key" });
    expect(send).toHaveBeenCalledWith({
      from: "+15550000000",
      to: "+15551112222",
      text: expect.stringContaining("#2"),
    });
  });

  it("reuses module evaluation for repeated and concurrent deliveries", async () => {
    const { processNotification } = await import("../../server/lib/notifications.js");

    await Promise.all([processNotification(notification()), processNotification(notification())]);
    await processNotification(notification());

    expect(sdkFactory).toHaveBeenCalledTimes(1);
    expect(sdkConstructed).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("preserves provider failure propagation", async () => {
    send.mockRejectedValue(new Error("Synthetic Provider Failure"));
    const { processNotification } = await import("../../server/lib/notifications.js");

    await expect(processNotification(notification())).rejects.toThrow("Synthetic Provider Failure");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
