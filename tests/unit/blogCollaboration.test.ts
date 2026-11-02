import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import { BlogCollaboration, type BlogSyncTransport } from "../../src/lib/blogCollaboration.js";
import {
  createBlogDocument,
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
async function connect() {
  const provider = new BlogCollaboration(initial, transport);
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
});
