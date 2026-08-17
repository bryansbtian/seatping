import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchSuggestions } from "../../src/hooks/useSearchSuggestions.js";

const DEBOUNCE_MS = 275;

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    locationId: "loc-1",
    businessId: "biz-1",
    businessUsername: "bistro",
    businessName: "Bistro",
    name: "Downtown",
    shortAddress: "1 Test Street",
    cuisine: "Indonesian",
    area: "Kebayoran",
    city: "Jakarta",
    imageUrl: null,
    url: "/bistro/loc-1",
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => {
      return body;
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubFetch(async () => {
    return jsonResponse({ suggestions: [suggestion()] });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  });
}

describe("useSearchSuggestions when it is switched off", () => {
  it("stays idle while disabled", async () => {
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", false);
    });

    await flushDebounce();

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays idle for an empty query", async () => {
    const { result } = renderHook(() => {
      return useSearchSuggestions("", true);
    });

    await flushDebounce();

    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only query as empty", async () => {
    const { result } = renderHook(() => {
      return useSearchSuggestions("   ", true);
    });

    await flushDebounce();

    expect(result.current.suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useSearchSuggestions while fetching", () => {
  it("reports loading before the debounce elapses", () => {
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    expect(result.current.loading).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests the trimmed and encoded query once the debounce elapses", async () => {
    renderHook(() => {
      return useSearchSuggestions("  bistro & co  ", true);
    });

    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/locations/search-suggestions?query=bistro%20%26%20co&limit=3",
    );
    expect(init.credentials).toBe("include");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("debounces a query that keeps changing into a single request", async () => {
    const { rerender } = renderHook(
      ({ query }) => {
        return useSearchSuggestions(query, true);
      },
      { initialProps: { query: "b" } },
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    rerender({ query: "bi" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    rerender({ query: "bis" });
    await flushDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("query=bis");
  });
});

describe("useSearchSuggestions results", () => {
  it("exposes the returned suggestions", async () => {
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    await flushDebounce();

    expect(result.current.loading).toBe(false);
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].name).toBe("Downtown");
    expect(result.current.error).toBe(false);
  });

  it("keeps at most three suggestions", async () => {
    stubFetch(async () => {
      return jsonResponse({
        suggestions: [
          suggestion({ locationId: "a" }),
          suggestion({ locationId: "b" }),
          suggestion({ locationId: "c" }),
          suggestion({ locationId: "d" }),
        ],
      });
    });
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    await flushDebounce();

    expect(result.current.suggestions).toHaveLength(3);
    expect(result.current.suggestions.map((s) => s.locationId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("falls back to an empty list when the payload has no suggestions", async () => {
    stubFetch(async () => {
      return jsonResponse({ results: [] });
    });
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    await flushDebounce();

    expect(result.current.loading).toBe(false);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it("clears earlier results when the query is emptied", async () => {
    const { result, rerender } = renderHook(
      ({ query }) => {
        return useSearchSuggestions(query, true);
      },
      { initialProps: { query: "bistro" } },
    );
    await flushDebounce();
    expect(result.current.suggestions).toHaveLength(1);

    rerender({ query: "" });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe("useSearchSuggestions failures", () => {
  it("reports an error for a rejected response", async () => {
    stubFetch(async () => {
      return jsonResponse({ error: "boom" }, false);
    });
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    await flushDebounce();

    expect(result.current.error).toBe(true);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("reports an error when the network call fails", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    await flushDebounce();

    expect(result.current.error).toBe(true);
  });

  it("ignores an aborted request instead of showing an error", async () => {
    stubFetch(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const { result } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    await flushDebounce();

    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it("aborts the in-flight request when the hook unmounts", async () => {
    let captured: AbortSignal | undefined;
    stubFetch(async (_url, init) => {
      captured = init.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    const { unmount } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });
    await flushDebounce();

    expect(captured?.aborted).toBe(false);
    unmount();

    expect(captured?.aborted).toBe(true);
  });

  it("never fires the request when the hook unmounts during the debounce", async () => {
    const { unmount } = renderHook(() => {
      return useSearchSuggestions("bistro", true);
    });

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
