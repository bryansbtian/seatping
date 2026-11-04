import express from "express";
import cookieParser from "cookie-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serveApp } from "../helpers/app.js";
import {
  requestEmailLanguage,
  storedEmailLanguage,
  emailDateLabels,
} from "../../server/lib/emailLanguage.js";
import { emailCopy } from "../../server/lib/emailCopy.js";
import { api } from "../../src/lib/api.js";

const app = express();
app.use(cookieParser());
app.get("/language", (req, res) => {
  res.json({ language: requestEmailLanguage(req, req.query.saved) });
});
const client = await serveApp(app);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email language preference resolution", () => {
  it("defaults to English and ignores geographic and browser inference", async () => {
    const response = await client
      .get("/language")
      .set("X-Vercel-IP-Country", "ID")
      .set("Accept-Language", "id-ID");
    expect(response.body.language).toBe("en");
  });

  it("uses saved preferences and the existing explicit consumer cookie", async () => {
    expect(
      (await client.get("/language").set("Cookie", "seatping.consumer.lang=id")).body.language,
    ).toBe("id");
    expect((await client.get("/language?saved=id")).body.language).toBe("id");
    expect(
      (await client.get("/language?saved=en").set("Cookie", "seatping.consumer.lang=id")).body
        .language,
    ).toBe("en");
  });

  it.each(["en", "id"] as const)(
    "gives explicit route preference %s priority",
    async (language) => {
      const response = await client
        .get("/language?saved=en")
        .set("Cookie", "seatping.consumer.lang=en")
        .set("x-seatping-language", language);
      expect(response.body.language).toBe(language);
    },
  );

  it("rejects unsupported preferences and safely reads saved ticket metadata", async () => {
    expect(
      (await client.get("/language?saved=invalid").set("x-seatping-language", "invalid")).body
        .language,
    ).toBe("en");
    expect(storedEmailLanguage({ language: "id" })).toBe("id");
    for (const value of [undefined, null, [], "id", { language: "invalid" }, {}]) {
      expect(storedEmailLanguage(value)).toBe("en");
    }
  });

  it.each([
    { pathname: "/id/forgot", language: "id" },
    { pathname: "/en/signup", language: "en" },
    { pathname: "/id/queue/bistro/location", language: "id" },
    { pathname: "/id/bistro/location", language: "id" },
    { pathname: "/id/business/signup", language: "id" },
  ])(
    "transmits the language from $pathname even without cookies",
    async ({ pathname, language }) => {
      vi.stubGlobal("window", { location: { pathname } });
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ success: true })));
      vi.stubGlobal("fetch", fetch);
      await api("/auth/forgot-password", { method: "POST", body: "{}" });
      expect(fetch).toHaveBeenCalledWith(
        "/auth/forgot-password",
        expect.objectContaining({
          headers: { "Content-Type": "application/json", "x-seatping-language": language },
          credentials: "include",
        }),
      );
    },
  );

  it("does not derive a language from neutral or unsupported paths", async () => {
    for (const pathname of ["/", "/admin", "/business/settings", "/id/admin"]) {
      vi.stubGlobal("window", { location: { pathname } });
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetch);
      await api("/auth/session");
      expect(fetch.mock.calls[0][1]).toMatchObject({
        headers: { "Content-Type": "application/json" },
      });
      expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("x-seatping-language");
    }
  });
});

describe("email date labels", () => {
  const details = {
    dateLabel: "Wed, Nov 4, 2026",
    timeLabel: "7:30 PM",
    reservationDateTime: "2026-11-04T19:30",
  };
  it("formats Indonesian wall-clock labels without shifting the booking", () => {
    expect(emailDateLabels(details, "id")).toEqual({
      dateLabel: "Rab, 4 Nov 2026",
      timeLabel: "19.30",
    });
    expect(
      emailDateLabels({ ...details, reservationDateTime: "2026-11-04T00:15" }, "id").timeLabel,
    ).toBe("00.15");
    expect(emailDateLabels(details)).toEqual({
      dateLabel: details.dateLabel,
      timeLabel: details.timeLabel,
    });
  });
  it.each([undefined, "invalid", "2026-02-31T19:30", "2026-11-04T25:30"])(
    "preserves supplied labels for %s",
    (reservationDateTime) => {
      expect(emailDateLabels({ ...details, reservationDateTime }, "id")).toEqual({
        dateLabel: details.dateLabel,
        timeLabel: details.timeLabel,
      });
    },
  );
  it("interpolates literal values without replacement expansion or recursive translation", () => {
    expect(emailCopy("id")("Hi {name}, ", { name: "$& {name} New Feedback" })).toBe(
      "Halo $& {name} New Feedback, ",
    );
  });
});
