import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "../../src/hooks/use-toast.js";

const REMOVE_DELAY = 1_000_000;

function mountToaster() {
  return renderHook(() => {
    return useToast();
  });
}

function drainToasts(result: { current: ReturnType<typeof useToast> }) {
  act(() => {
    result.current.dismiss();
  });
  act(() => {
    vi.advanceTimersByTime(REMOVE_DELAY);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  const { result } = mountToaster();
  drainToasts(result);
  vi.useRealTimers();
});

describe("useToast state", () => {
  it("starts with no toasts", () => {
    const { result } = mountToaster();

    expect(result.current.toasts).toEqual([]);
  });

  it("shows an added toast as open", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "Saved" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].open).toBe(true);
  });

  it("title cases a string title and description", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({
        title: "saved changes",
        description: "your profile is updated",
      });
    });

    expect(result.current.toasts[0].title).toBe("Saved Changes");
    expect(result.current.toasts[0].description).toBe("Your Profile Is Updated");
  });

  it("leaves a non-string title and description untouched", () => {
    const { result } = mountToaster();
    const node = { type: "span" } as never;

    act(() => {
      result.current.toast({ title: node, description: undefined });
    });

    expect(result.current.toasts[0].title).toBe(node);
    expect(result.current.toasts[0].description).toBeUndefined();
  });

  it("keeps only the newest toast on screen", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "First" });
      result.current.toast({ title: "Second" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Second");
  });

  it("shares state across every mounted toaster", () => {
    const first = mountToaster();
    const second = mountToaster();

    act(() => {
      first.result.current.toast({ title: "Shared" });
    });

    expect(second.result.current.toasts[0].title).toBe("Shared");
  });

  it("stops updating a toaster once it unmounts", () => {
    const { result, unmount } = mountToaster();
    const before = result.current.toasts;
    unmount();

    const other = mountToaster();
    act(() => {
      other.result.current.toast({ title: "After Unmount" });
    });

    expect(result.current.toasts).toBe(before);
    expect(other.result.current.toasts[0].title).toBe("After Unmount");
  });
});

describe("dismissing a toast", () => {
  it("closes the toast its handle points at", () => {
    const { result } = mountToaster();
    let handle: ReturnType<ReturnType<typeof useToast>["toast"]>;

    act(() => {
      handle = result.current.toast({ title: "Closing" });
    });
    act(() => {
      handle.dismiss();
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("closes every toast when dismissed with no id", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "Closing" });
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("leaves other toasts open when dismissing an unknown id", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "Staying" });
    });
    act(() => {
      result.current.dismiss("not-a-real-toast-id");
    });

    expect(result.current.toasts[0].open).toBe(true);
  });

  it("dismisses through the onOpenChange handler", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "Swiped Away" });
    });
    act(() => {
      result.current.toasts[0].onOpenChange?.(false);
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it("ignores an onOpenChange that reports the toast is still open", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "Still Here" });
    });
    act(() => {
      result.current.toasts[0].onOpenChange?.(true);
    });

    expect(result.current.toasts[0].open).toBe(true);
  });

  it("removes the toast once the removal delay elapses", () => {
    const { result } = mountToaster();

    act(() => {
      result.current.toast({ title: "Expiring" });
    });
    act(() => {
      result.current.dismiss();
    });
    act(() => {
      vi.advanceTimersByTime(REMOVE_DELAY);
    });

    expect(result.current.toasts).toEqual([]);
  });

  it("queues the removal only once for a repeated dismiss", () => {
    const { result } = mountToaster();
    let handle: ReturnType<ReturnType<typeof useToast>["toast"]>;

    act(() => {
      handle = result.current.toast({ title: "Double Dismiss" });
    });
    act(() => {
      handle.dismiss();
      handle.dismiss();
    });
    act(() => {
      vi.advanceTimersByTime(REMOVE_DELAY);
    });

    expect(result.current.toasts).toEqual([]);
  });
});

describe("updating a toast", () => {
  it("replaces the title through the handle", () => {
    const { result } = mountToaster();
    let handle: ReturnType<ReturnType<typeof useToast>["toast"]>;

    act(() => {
      handle = result.current.toast({ title: "before" });
    });
    act(() => {
      handle.update({ id: handle.id, title: "after saving" } as never);
    });

    expect(result.current.toasts[0].title).toBe("After Saving");
    expect(result.current.toasts[0].id).toBe(handle!.id);
  });

  it("keeps the toast open across an update", () => {
    const { result } = mountToaster();
    let handle: ReturnType<ReturnType<typeof useToast>["toast"]>;

    act(() => {
      handle = result.current.toast({ title: "Working" });
    });
    act(() => {
      handle.update({ id: handle.id, description: "almost done" } as never);
    });

    expect(result.current.toasts[0].open).toBe(true);
    expect(result.current.toasts[0].description).toBe("Almost Done");
  });
});
