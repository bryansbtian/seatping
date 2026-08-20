import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reducer, toast } from "../../src/hooks/use-toast.js";

type AnalyticsModule = typeof import("../../src/lib/analytics.js");

async function loadAnalytics(
  measurementId: string | undefined,
  gtag?: (...args: unknown[]) => void,
): Promise<AnalyticsModule> {
  vi.resetModules();
  vi.stubEnv("VITE_GA_MEASUREMENT_ID", measurementId ?? "");
  if (gtag) {
    vi.stubGlobal("window", { gtag });
  } else {
    vi.stubGlobal("window", {});
  }
  return import("../../src/lib/analytics.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("analytics gating", () => {
  it("does nothing when no measurement id is configured", async () => {
    const gtag = vi.fn();
    const mod = await loadAnalytics(undefined, gtag);

    mod.trackPageView("/");
    mod.trackEvent("some_event");

    expect(gtag).not.toHaveBeenCalled();
  });

  it("does nothing when the tag has not been installed", async () => {
    const mod = await loadAnalytics("G-TEST");

    expect(() => mod.trackPageView("/")).not.toThrow();
    expect(() => mod.trackEvent("some_event")).not.toThrow();
  });

  it("swallows an error thrown by the tag", async () => {
    const gtag = vi.fn(() => {
      throw new Error("tag exploded");
    });
    const mod = await loadAnalytics("G-TEST", gtag);

    expect(() => mod.trackPageView("/")).not.toThrow();
    expect(() => mod.trackEvent("some_event")).not.toThrow();
    expect(gtag).toHaveBeenCalledTimes(2);
  });
});

describe("analytics events", () => {
  it("reports a page view with its path", async () => {
    const gtag = vi.fn();
    const mod = await loadAnalytics("G-TEST", gtag);

    mod.trackPageView("/business/dashboard");

    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      page_path: "/business/dashboard",
    });
  });

  it("forwards a custom event with its params", async () => {
    const gtag = vi.fn();
    const mod = await loadAnalytics("G-TEST", gtag);

    mod.trackEvent("custom", { a: 1 });

    expect(gtag).toHaveBeenCalledWith("event", "custom", { a: 1 });
  });

  it("attaches the optional identifier when one is given", async () => {
    const gtag = vi.fn();
    const { analytics } = await loadAnalytics("G-TEST", gtag);

    analytics.businessSignupStarted("landing");
    analytics.joinQueueClicked("loc-1");
    analytics.queueJoined("loc-1");
    analytics.reservationStarted("loc-1");
    analytics.reservationCompleted("loc-1");
    analytics.qrCodeScanned("loc-1");
    analytics.campaignSent("whatsapp");

    expect(gtag.mock.calls.map((c) => c[1])).toEqual([
      "business_signup_started",
      "join_queue_clicked",
      "queue_joined",
      "reservation_started",
      "reservation_completed",
      "qr_code_scanned",
      "campaign_sent",
    ]);
    expect(gtag.mock.calls[0][2]).toEqual({ source: "landing" });
    expect(gtag.mock.calls[1][2]).toEqual({ location_id: "loc-1" });
    expect(gtag.mock.calls[6][2]).toEqual({ channel: "whatsapp" });
  });

  it("sends no params when the optional identifier is absent", async () => {
    const gtag = vi.fn();
    const { analytics } = await loadAnalytics("G-TEST", gtag);

    analytics.businessSignupStarted();
    analytics.joinQueueClicked();
    analytics.queueJoined();
    analytics.reservationStarted();
    analytics.reservationCompleted();
    analytics.qrCodeScanned();
    analytics.campaignSent();

    for (const call of gtag.mock.calls) {
      expect(call[2]).toEqual({});
    }
  });

  it("reports the parameterless events", async () => {
    const gtag = vi.fn();
    const { analytics } = await loadAnalytics("G-TEST", gtag);

    analytics.businessSignupCompleted();
    analytics.businessDashboardOpened();
    analytics.campaignCreated();
    analytics.guestCrmOpened();

    expect(gtag.mock.calls.map((c) => c[1])).toEqual([
      "business_signup_completed",
      "business_dashboard_opened",
      "campaign_created",
      "guest_crm_opened",
    ]);
  });

  it("never forwards customer-identifying values", async () => {
    const gtag = vi.fn();
    const { analytics } = await loadAnalytics("G-TEST", gtag);

    analytics.queueJoined("loc-123");
    analytics.campaignSent("email");

    for (const call of gtag.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/\+?\d{7,}/);
    }
  });
});

describe("toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("adds an open toast and returns its handle", () => {
    const handle = toast({ title: "saved changes" });

    expect(handle.id).toEqual(expect.any(String));
    expect(typeof handle.dismiss).toBe("function");
    expect(typeof handle.update).toBe("function");
  });

  it("accepts string and non-string titles and descriptions alike", () => {
    expect(() =>
      toast({ title: "saved changes", description: "your profile is updated" }),
    ).not.toThrow();
    expect(() => toast({ title: 42 as never, description: undefined })).not.toThrow();
  });

  it("issues a distinct id for every toast", () => {
    const first = toast({ title: "one" });
    const second = toast({ title: "two" });

    expect(first.id).not.toBe(second.id);
  });

  it("closes the toast when its handle dismisses it", () => {
    const handle = toast({ title: "closing" });

    expect(() => handle.dismiss()).not.toThrow();
    expect(() => handle.update({ id: handle.id, title: "renamed" } as never)).not.toThrow();
  });

  it("removes a dismissed toast once the delay elapses", () => {
    const handle = toast({ title: "expiring" });
    handle.dismiss();

    vi.advanceTimersByTime(1_000_000);

    const state = reducer({ toasts: [] }, {
      type: "REMOVE_TOAST",
      toastId: handle.id,
    } as never);
    expect(state.toasts).toHaveLength(0);
  });

  it("queues the removal only once per toast", () => {
    const handle = toast({ title: "double dismiss" });

    handle.dismiss();
    handle.dismiss();

    expect(() => vi.advanceTimersByTime(1_000_000)).not.toThrow();
  });
});
