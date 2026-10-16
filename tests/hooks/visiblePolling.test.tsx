import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisiblePolling } from "../../src/hooks/useVisiblePolling.js";

let visibility: DocumentVisibilityState;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function show(state: DocumentVisibilityState) {
  visibility = state;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("visible polling", () => {
  it("retains the visible refresh cadence", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(refresh, 10000));
    await advance(60000);
    expect(refresh).toHaveBeenCalledTimes(7);
  });

  it("makes no periodic requests in a hidden tab and refreshes once on return", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(refresh, 10000));
    await advance(0);
    await show("hidden");
    await advance(60000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await show("visible");
    await show("visible");
    expect(refresh).toHaveBeenCalledTimes(2);
    await advance(10000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("defers an initially hidden mount until it becomes visible", async () => {
    visibility = "hidden";
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(refresh, 10000));
    await advance(60000);
    expect(refresh).not.toHaveBeenCalled();
    await show("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits for a slow request before scheduling the next poll", async () => {
    let finish = () => {};
    const refresh = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => useVisiblePolling(refresh, 10000));
    await advance(60000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    await advance(9999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("coalesces visibility restoration during a slow request into one fresh read", async () => {
    let finish = () => {};
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(refresh, 10000));
    await show("hidden");
    await show("visible");
    await show("hidden");
    await show("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending recovery if the tab becomes hidden again", async () => {
    let finish = () => {};
    const refresh = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => useVisiblePolling(refresh, 10000));
    await show("hidden");
    await show("visible");
    await show("hidden");
    await act(async () => {
      finish();
    });
    await advance(60000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await show("visible");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("continues polling after a failure", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(refresh, 10000));
    await advance(10000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("aborts old location requests and ignores their completion after changing scope", async () => {
    let oldSignal: AbortSignal | undefined;
    let finish = () => {};
    const refresh = vi
      .fn()
      .mockImplementationOnce((signal: AbortSignal) => {
        oldSignal = signal;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      })
      .mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(
      ({ scope }) => useVisiblePolling(refresh, 10000, true, scope),
      { initialProps: { scope: "tenant-a:location-a" } },
    );
    rerender({ scope: "tenant-b:location-b" });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      finish();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    await advance(60000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
