import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { BlogCollaboration, type BlogSyncTransport } from "../../src/lib/blogCollaboration.js";
import {
  createBlogDocument,
  changeBlogDocument,
  readBlogDocument,
  type BlogSyncResponse,
} from "../../shared/blogCollaboration.js";
import { newBlogFields, type BlogPost } from "../../shared/blog.js";

const initial: BlogPost = {
  ...newBlogFields(),
  id: "blog-collaboration-unit",
  title: "Draft",
  slug: "draft",
  status: "DRAFT",
  revision: 1,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  publishedAt: null,
};
let server: Y.Doc;
let offline = false;
let version = 1;
const providers: BlogCollaboration[] = [];
let storage: Map<string, string>;

beforeEach(() => {
  server = createBlogDocument(initial);
  offline = false;
  version = 1;
  storage = new Map();
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };
  vi.stubGlobal("sessionStorage", store);
  vi.stubGlobal("localStorage", store);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
});
afterEach(async () => {
  for (const provider of providers.splice(0)) {
    provider.stop();
  }
  await Promise.resolve();
  server.destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const transport: BlogSyncTransport = async (method, payload) => {
  if (method === "POST" && offline) {
    throw new Error("Offline");
  }
  if (payload?.update) {
    Y.applyUpdate(server, fromBase64(payload.update));
    version += 1;
  }
  let vector: Uint8Array | undefined;
  if (payload) {
    vector = fromBase64(payload.vector);
  }
  return {
    update: toBase64(Y.encodeStateAsUpdate(server, vector)),
    post: { ...initial, revision: version },
    peers: [],
  } satisfies BlogSyncResponse;
};
async function connect(send: BlogSyncTransport = transport) {
  const provider = new BlogCollaboration(initial, send);
  providers.push(provider);
  provider.start();
  await vi.waitFor(() => expect(provider.snapshot.ready).toBe(true));
  return provider;
}

describe("Blog Collaboration Client", () => {
  it("uses anonymous coffee identities instead of previously stored custom names", async () => {
    storage.set("seatping.blog.editor-name", "Jamie");
    const provider = await connect();
    expect(provider.snapshot.user.name).toBe(`Anonymous ${provider.snapshot.user.coffee}`);
  });
  it("keeps trailing spaces while typing and flushes edits before publishing", async () => {
    const provider = await connect();
    const before = provider.snapshot.fields;
    provider.change({ ...before, title: "Draft " }, before);
    expect(provider.snapshot.fields.title).toBe("Draft ");
    expect(provider.snapshot.dirty).toBe(true);
    const saved = await provider.save();
    expect(readBlogDocument(server).title).toBe("Draft ");
    expect(provider.snapshot.dirty).toBe(false);
    expect(saved.revision).toBeGreaterThan(1);
  });
  it("retains failed edits and merges them with another editor after reconnecting", async () => {
    const first = await connect();
    offline = true;
    first.change({ ...first.snapshot.fields, title: "Draft Local" }, first.snapshot.fields);
    await expect(first.save()).rejects.toThrow("Offline");
    expect(first.snapshot.dirty).toBe(true);
    expect(storage.get("seatping.blog.shared-recovery.blog-collaboration-unit")).toBeTruthy();
    first.stop();
    await Promise.resolve();
    server.getText("title").insert(0, "Remote ");
    offline = false;
    const reconnected = await connect();
    expect(reconnected.snapshot.recovery).toBeTruthy();
    reconnected.restore();
    await reconnected.save();
    expect(readBlogDocument(server).title).toBe("Remote Draft Local");
    expect(storage.has("seatping.blog.shared-recovery.blog-collaboration-unit")).toBe(false);
  });
  it("does not overwrite a remote field when a UI event changes a different field", async () => {
    const provider = await connect();
    const visible = provider.snapshot.fields;
    server.getText("excerpt").insert(0, "Remote introduction");
    await provider.sync();
    provider.change({ ...visible, title: "A New Title" }, visible);
    await provider.save();
    expect(readBlogDocument(server).excerpt).toBe("Remote introduction");
  });
  it("keeps explicit saves available while autosave is paused", async () => {
    const provider = await connect();
    provider.paused = true;
    provider.change({ ...provider.snapshot.fields, author: "Alex" }, provider.snapshot.fields);
    await provider.sync();
    expect(provider.snapshot.dirty).toBe(true);
    await provider.save();
    expect(provider.snapshot.dirty).toBe(false);
    expect(readBlogDocument(server).author).toBe("Alex");
  });

  it("refuses synchronization before starting or after stopping", async () => {
    const provider = new BlogCollaboration(initial, transport);
    providers.push(provider);
    expect(() => provider.awareness).toThrow("still connecting");
    await expect(provider.sync()).rejects.toThrow("still connecting");
    provider.start();
    await vi.waitFor(() => expect(provider.snapshot.ready).toBe(true));
    provider.stop();
    await expect(provider.sync()).rejects.toThrow("still connecting");
  });

  it("retries a failed initial connection and debounces local edits", async () => {
    vi.useFakeTimers();
    const send = vi.fn<BlogSyncTransport>().mockRejectedValue("Offline");
    const provider = new BlogCollaboration(initial, send);
    providers.push(provider);
    provider.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.snapshot.ready).toBe(false);
    expect(provider.snapshot.error).toContain("Connection lost");
    send.mockImplementation(transport);
    await vi.advanceTimersByTimeAsync(750);
    expect(provider.snapshot.ready).toBe(true);
    const before = provider.snapshot.fields;
    provider.change({ ...before, title: "Latest Draft" }, before);
    await vi.advanceTimersByTimeAsync(149);
    expect(readBlogDocument(server).title).toBe("Draft");
    await vi.advanceTimersByTimeAsync(1);
    expect(readBlogDocument(server).title).toBe("Latest Draft");
    expect(provider.snapshot.dirty).toBe(false);
  });

  it("ignores an initialization response after the provider stops", async () => {
    const response = await transport("GET");
    const pending = Promise.withResolvers<BlogSyncResponse>();
    const provider = new BlogCollaboration(initial, () => pending.promise);
    providers.push(provider);
    provider.start();
    provider.stop();
    pending.resolve(response);
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.snapshot.ready).toBe(false);
    expect(provider.snapshot.connected).toBe(false);
  });

  it("drains edits added while an explicit save is in flight", async () => {
    const pending = Promise.withResolvers<void>();
    let hold = false;
    const send: BlogSyncTransport = async (method, payload) => {
      if (method === "POST" && hold) {
        hold = false;
        await pending.promise;
      }
      return transport(method, payload);
    };
    const provider = await connect(send);
    provider.change({ ...provider.snapshot.fields, title: "First" }, provider.snapshot.fields);
    hold = true;
    const saving = provider.save();
    await Promise.resolve();
    expect(provider.snapshot.saving).toBe(true);
    const firstSync = provider.sync();
    expect(provider.sync()).toBe(firstSync);
    provider.change({ ...provider.snapshot.fields, title: "Latest" }, provider.snapshot.fields);
    pending.resolve();
    await saving;
    expect(readBlogDocument(server).title).toBe("Latest");
    expect(provider.snapshot.dirty).toBe(false);
  });

  it("keeps the latest accepted revision when older sync responses arrive", async () => {
    const provider = await connect();
    provider.acceptPost({ ...initial, revision: 5, status: "PUBLISHED" });
    provider.acceptPost({ ...initial, revision: 2 });
    await provider.sync();
    expect(provider.snapshot.post.revision).toBe(5);
    expect(provider.snapshot.post.status).toBe("PUBLISHED");
  });

  it("blocks saves until recovered edits are explicitly discarded", async () => {
    storage.set(
      "seatping.blog.recovery.blog-collaboration-unit",
      JSON.stringify({ ...newBlogFields(), title: "Recovered" }),
    );
    const provider = await connect();
    expect(provider.snapshot.recovery).toMatchObject({ title: "Recovered" });
    await expect(provider.save()).rejects.toThrow("Restore or discard");
    provider.discardRecovery();
    expect(provider.snapshot.recovery).toBeNull();
    expect(storage.has("seatping.blog.recovery.blog-collaboration-unit")).toBe(false);
    await provider.save();
    expect(readBlogDocument(server).title).toBe("Draft");
  });

  it.each(["invalid json", JSON.stringify({ title: 42 })])(
    "ignores invalid legacy recovery: %s",
    async (stored) => {
      storage.set("seatping.blog.recovery.blog-collaboration-unit", stored);
      const provider = await connect();
      expect(provider.snapshot.recovery).toBeNull();
      expect(provider.snapshot.fields.title).toBe("Draft");
    },
  );

  it("restores legacy content, tags, and metadata into the shared document", async () => {
    const fields = {
      ...newBlogFields(),
      title: "Recovered Article",
      category: "Guides",
      tags: ["Operations"],
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Recovered Content" }] }],
      },
    };
    storage.set("seatping.blog.recovery.blog-collaboration-unit", JSON.stringify(fields));
    const provider = await connect();
    provider.restore();
    await provider.save();
    expect(readBlogDocument(server)).toMatchObject({
      title: fields.title,
      category: fields.category,
      tags: fields.tags,
      content: fields.content,
    });
    provider.restore();
    expect(provider.snapshot.recovery).toBeNull();
  });

  it("delivers subscriptions once per microtask and supports unsubscribing", async () => {
    const provider = await connect();
    const listener = vi.fn();
    const unsubscribe = provider.subscribe(listener);
    provider.acceptPost({ ...initial, revision: 2 });
    provider.acceptPost({ ...initial, revision: 3 });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    provider.acceptPost({ ...initial, revision: 4 });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("resolves anonymous identity collisions and removes departed peers", async () => {
    const peerDocument = new Y.Doc();
    peerDocument.clientID = 1;
    const awareness = new Awareness(peerDocument);
    let peers: BlogSyncResponse["peers"] = [];
    try {
      const provider = await connect(async (method, payload) => ({
        ...(await transport(method, payload)),
        peers,
      }));
      const original = provider.snapshot.user;
      awareness.setLocalState({ user: original });
      peers = [{ clientId: 1, awareness: toBase64(encodeAwarenessUpdate(awareness, [1])) }];
      await provider.sync();
      expect(provider.snapshot.peers).toEqual([{ clientId: 1, ...original }]);
      expect(provider.snapshot.user.name).not.toBe(original.name);
      expect(provider.snapshot.user.color).not.toBe(original.color);
      awareness.setLocalState({ user: { name: "Invalid", color: "invalid" } });
      peers = [{ clientId: 1, awareness: toBase64(encodeAwarenessUpdate(awareness, [1])) }];
      await provider.sync();
      expect(provider.snapshot.peers).toEqual([]);
      peers = [];
      await provider.sync();
      expect(provider.awareness.getStates().has(1)).toBe(false);
    } finally {
      awareness.destroy();
      peerDocument.destroy();
    }
  });

  it("reports an invalid local document without losing the last valid fields", async () => {
    const provider = await connect();
    provider.document.getMap("metadata").set("categoryColor", "invalid");
    expect(provider.snapshot.error).toContain("Check the article fields");
    expect(provider.snapshot.fields.categoryColor).toBe(initial.categoryColor);
  });

  it("provides a fallback message for unexpected synchronization failures", async () => {
    const provider = await connect(async (method, payload) => {
      if (method === "POST" && offline) {
        throw "Offline";
      }
      return transport(method, payload);
    });
    offline = true;
    await expect(provider.sync()).rejects.toBe("Offline");
    expect(provider.snapshot.error).toContain("Connection lost");
    expect(provider.snapshot.connected).toBe(false);
  });
});

describe("Shared Blog Document Changes", () => {
  it("replaces only changed text, metadata, tags, and content", () => {
    const before = { ...initial, title: "A middle ending", tags: ["Keep", "Remove"] };
    const document = createBlogDocument(before);
    const next = { ...before, title: "A new ending", coverAlt: "New Cover", tags: ["Keep", "Add"] };
    try {
      changeBlogDocument(document, next, before);
      expect(readBlogDocument(document)).toMatchObject({
        title: next.title,
        coverAlt: next.coverAlt,
        tags: ["Keep", "Add"],
      });
      document.getMap("metadata").delete("category");
      expect(() => readBlogDocument(document)).toThrow();
    } finally {
      document.destroy();
    }
  });
});
