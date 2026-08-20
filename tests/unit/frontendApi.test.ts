import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiUpload } from "../../src/lib/api.js";
import { analytics, trackEvent, trackPageView } from "../../src/lib/analytics.js";
import { reducer } from "../../src/hooks/use-toast.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      return body;
    },
  } as unknown as Response;
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return jsonResponse({ ok: true, value: 42 });
      }),
    );

    await expect(api("/api/thing")).resolves.toEqual({ ok: true, value: 42 });
  });

  it("sends JSON headers and credentials", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/thing", { method: "POST", body: "{}" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.method).toBe("POST");
  });

  it("lets a caller override a header", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/thing", { headers: { "X-Custom": "yes" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Custom"]).toBe("yes");
  });

  it("throws the server error message on a failure response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return jsonResponse({ error: "Location not found" }, 404);
      }),
    );

    await expect(api("/api/thing")).rejects.toThrow("Location not found");
  });

  it("prefers the first field error from a validation response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return jsonResponse(
          {
            error: "Invalid input",
            issues: { fieldErrors: { email: ["Email is invalid"] } },
          },
          400,
        );
      }),
    );

    await expect(api("/api/thing")).rejects.toThrow("Email is invalid");
  });

  it("falls back to a status message when the body has no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return jsonResponse({}, 500);
      }),
    );

    await expect(api("/api/thing")).rejects.toThrow(/500/);
  });

  it("tolerates a response with no JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new Error("not json");
          },
        } as unknown as Response;
      }),
    );

    await expect(api("/api/thing")).rejects.toThrow(/502/);
  });

  it("uploads form data without forcing a JSON content type", async () => {
    const fetchMock = vi.fn(async () => {
      return jsonResponse({ url: "https://test.invalid/x.jpg" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("file", "x");
    await expect(apiUpload("/api/upload", form)).resolves.toEqual({
      url: "https://test.invalid/x.jpg",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeUndefined();
    expect(init.method).toBe("POST");
  });

  it("propagates upload failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return jsonResponse({ error: "File too large" }, 413);
      }),
    );

    await expect(apiUpload("/api/upload", new FormData())).rejects.toThrow("File too large");
  });
});

describe("analytics", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when the analytics tag is not installed", () => {
    expect(() => trackPageView("/")).not.toThrow();
    expect(() => trackEvent("some_event")).not.toThrow();
    expect(() => analytics.businessSignupCompleted()).not.toThrow();
    expect(() => analytics.joinQueueClicked("loc-1")).not.toThrow();
    expect(() => analytics.guestCrmOpened()).not.toThrow();
  });

  it("never forwards customer-identifying values", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });

    analytics.joinQueueClicked("loc-123");

    for (const call of gtag.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/\+\d{7,}/);
    }
  });
});

describe("toast reducer", () => {
  const baseToast = { id: "1", title: "Saved", open: true };

  it("adds a toast", () => {
    const state = reducer({ toasts: [] }, {
      type: "ADD_TOAST",
      toast: baseToast,
    } as never);

    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].title).toBe("Saved");
  });

  it("updates an existing toast by id", () => {
    const state = reducer(
      { toasts: [baseToast] } as never,
      {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      } as never,
    );

    expect(state.toasts[0].title).toBe("Updated");
  });

  it("marks a toast closed when dismissed", () => {
    const state = reducer(
      { toasts: [baseToast] } as never,
      {
        type: "DISMISS_TOAST",
        toastId: "1",
      } as never,
    );

    expect(state.toasts[0].open).toBe(false);
  });

  it("dismisses every toast when no id is given", () => {
    const state = reducer(
      { toasts: [baseToast, { id: "2", title: "Other", open: true }] } as never,
      { type: "DISMISS_TOAST" } as never,
    );

    for (const t of state.toasts) {
      expect(t.open).toBe(false);
    }
  });

  it("removes a toast by id", () => {
    const state = reducer(
      { toasts: [baseToast] } as never,
      {
        type: "REMOVE_TOAST",
        toastId: "1",
      } as never,
    );

    expect(state.toasts).toHaveLength(0);
  });

  it("removes every toast when no id is given", () => {
    const state = reducer(
      { toasts: [baseToast, { id: "2", open: true }] } as never,
      { type: "REMOVE_TOAST" } as never,
    );

    expect(state.toasts).toHaveLength(0);
  });
});
