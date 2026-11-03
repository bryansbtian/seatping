import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import { useBlogCollaboration } from "../../src/hooks/useBlogCollaboration.js";
import {
  createBlogDocument,
  readBlogDocument,
  type BlogSyncRequest,
} from "../../shared/blogCollaboration.js";
import { newBlogFields, type BlogPost } from "../../shared/blog.js";

const initial: BlogPost = {
  ...newBlogFields(),
  id: "hook-collaboration",
  title: "Article",
  slug: "article",
  status: "DRAFT",
  revision: 1,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  publishedAt: null,
};
let server: Y.Doc;

beforeEach(() => {
  sessionStorage.clear();
  server = createBlogDocument(initial);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "DELETE") {
        return Response.json({ ok: true });
      }
      let vector: Uint8Array | undefined;
      if (options.body) {
        const data = JSON.parse(String(options.body)) as BlogSyncRequest;
        vector = fromBase64(data.vector);
        if (data.update) {
          Y.applyUpdate(server, fromBase64(data.update));
        }
      }
      return Response.json({
        update: toBase64(Y.encodeStateAsUpdate(server, vector)),
        post: initial,
        peers: [],
      });
    }),
  );
});

afterEach(() => {
  server.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Blog Collaboration Hook", () => {
  it("subscribes to edits, saves, and accepts newer post revisions", async () => {
    const { result, unmount } = renderHook(() => useBlogCollaboration(initial, true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.change({ ...result.current.fields, title: "Changed" }));
    await waitFor(() => expect(result.current.dirty).toBe(true));
    await act(async () => {
      await result.current.save();
    });
    expect(readBlogDocument(server).title).toBe("Changed");
    expect(result.current.dirty).toBe(false);
    act(() => result.current.acceptPost({ ...initial, revision: 5, status: "PUBLISHED" }));
    await waitFor(() => expect(result.current.post.revision).toBe(5));
    expect(result.current.post.status).toBe("PUBLISHED");
    unmount();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/blog-collaboration\/hook-collaboration\/\d+$/),
      expect.objectContaining({ method: "DELETE", keepalive: true, credentials: "include" }),
    );
  });

  it("warns before leaving only for pending edits or a paused upload and cleans up listeners", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ paused }) => useBlogCollaboration(initial, paused),
      {
        initialProps: { paused: false },
      },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    rerender({ paused: true });
    expect(result.current.provider.paused).toBe(true);
    const upload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(upload);
    expect(upload.defaultPrevented).toBe(true);
    rerender({ paused: false });
    act(() => result.current.change({ ...result.current.fields, title: "Unsaved" }));
    await waitFor(() => expect(result.current.dirty).toBe(true));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    unmount();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("reconnects on online events and releases presence when the page hides", async () => {
    const { result, unmount } = renderHook(() => useBlogCollaboration(initial, true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const sync = vi.spyOn(result.current.provider, "sync").mockRejectedValue(new Error("Offline"));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(sync).toHaveBeenCalledOnce();
    const leave = vi.spyOn(result.current.provider, "leave");
    window.dispatchEvent(new Event("pagehide"));
    expect(leave).toHaveBeenCalledOnce();
    unmount();
    sync.mockClear();
    leave.mockClear();
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("pagehide"));
    expect(sync).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it.each(["restore", "discardRecovery"] as const)(
    "supports %s for legacy unsaved edits",
    async (action) => {
      sessionStorage.setItem(
        "seatping.blog.recovery.hook-collaboration",
        JSON.stringify({ ...newBlogFields(), title: "Recovered" }),
      );
      const { result } = renderHook(() => useBlogCollaboration(initial, true));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.recovery).toMatchObject({ title: "Recovered" });
      act(() => result.current[action]());
      await waitFor(() => expect(result.current.recovery).toBeNull());
      if (action === "restore") {
        expect(result.current.fields.title).toBe("Recovered");
        expect(result.current.dirty).toBe(true);
      } else {
        expect(result.current.fields.title).toBe("Article");
        expect(result.current.dirty).toBe(false);
      }
      expect(sessionStorage.getItem("seatping.blog.recovery.hook-collaboration")).toBeNull();
    },
  );
});
