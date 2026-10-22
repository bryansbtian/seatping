import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessage, useBlogAutosave } from "../../src/hooks/useBlogAutosave.js";
import { newBlogFields, type BlogPost } from "../../shared/blog.js";
const post = (): BlogPost => ({
  ...newBlogFields(),
  id: "post-autosave",
  status: "DRAFT",
  revision: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  publishedAt: null,
});
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Blog Autosave", () => {
  it("warns before leaving with unsaved edits or an active upload", () => {
    const { result, rerender } = renderHook(({ paused }) => useBlogAutosave(post(), paused), {
      initialProps: { paused: false },
    });
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    rerender({ paused: true });
    const uploading = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(uploading);
    expect(uploading.defaultPrevented).toBe(true);
    rerender({ paused: false });
    act(() => result.current.change({ ...newBlogFields(), title: "Unsaved" }));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it.each(["invalid json", JSON.stringify({ title: 123 })])(
    "ignores invalid stored recovery data: %s",
    async (stored) => {
      sessionStorage.setItem("seatping.blog.recovery.post-autosave", stored);
      const { result } = renderHook(() => useBlogAutosave(post(), true));
      await act(async () => {});
      expect(result.current.recovery).toBeNull();
      expect(result.current.fields.title).toBe("");
      act(() => result.current.restore());
      expect(result.current.dirty).toBe(false);
    },
  );

  it("discards recovery without replacing the server content", async () => {
    sessionStorage.setItem(
      "seatping.blog.recovery.post-autosave",
      JSON.stringify({ ...newBlogFields(), title: "Discarded" }),
    );
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    await waitFor(() => expect(result.current.recovery?.title).toBe("Discarded"));
    act(() => result.current.discardRecovery());
    expect(result.current.recovery).toBeNull();
    expect(result.current.fields.title).toBe("");
    expect(result.current.dirty).toBe(false);
    expect(sessionStorage.getItem("seatping.blog.recovery.post-autosave")).toBeNull();
  });

  it("uses the accepted server revision for the next save", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ post: { ...post(), revision: 6 } })));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    act(() => result.current.acceptPost({ ...post(), revision: 5 }));
    expect(result.current.post.revision).toBe(5);
    await act(async () => {
      await result.current.save();
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).revision).toBe(5);
    expect(result.current.post.revision).toBe(6);
  });

  it("keeps editing and saving available when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ post: { ...post(), title: "Saved", revision: 2 } })),
        ),
    );
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    act(() => result.current.change({ ...newBlogFields(), title: "Saved" }));
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.post.title).toBe("Saved");
    act(() => result.current.discardRecovery());
    expect(result.current.recovery).toBeNull();
  });

  it("provides a useful fallback for non-Error failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("Offline"));
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    await act(async () => {
      await expect(result.current.save()).rejects.toBe("Offline");
    });
    expect(result.current.error).toBe("Something went wrong. Please try again.");
    expect(errorMessage(new Error("Disconnected"))).toBe("Disconnected");
  });

  it("debounces rapid edits and saves the latest content", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Response(
          JSON.stringify({ post: { ...post(), ...JSON.parse(String(init.body)), revision: 2 } }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { result, unmount } = renderHook(() => useBlogAutosave(post(), false));
    act(() => {
      result.current.change({ ...newBlogFields(), title: "First" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    act(() => {
      result.current.change({ ...newBlogFields(), title: "Latest" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1199);
    });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string).title).toBe("Latest");
    expect(result.current.dirty).toBe(false);
    expect(result.current.post.revision).toBe(2);
    expect(sessionStorage.getItem("seatping.blog.recovery.post-autosave")).toBeNull();
    unmount();
  });
  it("retains dirty state and recovery data when an upload pauses autosave or saving fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    act(() => {
      result.current.change({ ...newBlogFields(), title: "Unsaved" });
    });
    await act(async () => {
      await expect(result.current.save()).rejects.toThrow("Offline");
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.error).toBe("Offline");
    expect(sessionStorage.getItem("seatping.blog.recovery.post-autosave")).toContain("Unsaved");
  });
  it("does not mark edits made during an in-flight save as saved", async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    act(() => {
      result.current.change({ ...newBlogFields(), title: "First" });
    });
    let saving: Promise<BlogPost>;
    await act(async () => {
      saving = result.current.save();
      await Promise.resolve();
    });
    act(() => {
      result.current.change({ ...newBlogFields(), title: "Second" });
    });
    await act(async () => {
      finish(new Response(JSON.stringify({ post: { ...post(), title: "First", revision: 2 } })));
      await saving;
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.fields.title).toBe("Second");
    expect(sessionStorage.getItem("seatping.blog.recovery.post-autosave")).toContain("Second");
  });
  it("offers to restore unsaved edits after reload", async () => {
    sessionStorage.setItem(
      "seatping.blog.recovery.post-autosave",
      JSON.stringify({
        ...newBlogFields(),
        title: "Recovered",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Kept", marks: [{ type: "bold" }] }],
            },
          ],
        },
      }),
    );
    const { result } = renderHook(() => useBlogAutosave(post(), true));
    await waitFor(() => expect(result.current.recovery?.title).toBe("Recovered"));
    act(() => {
      result.current.restore();
    });
    expect(result.current.fields.title).toBe("Recovered");
    expect(result.current.fields.content.content?.[0].content?.[0].marks).toEqual([
      { type: "bold" },
    ]);
    expect(result.current.recovery).toBeNull();
    expect(result.current.dirty).toBe(true);
  });
});
