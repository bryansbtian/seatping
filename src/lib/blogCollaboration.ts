import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { fromBase64, toBase64 } from "lib0/buffer";
import {
  BLOG_COLORS,
  BLOG_COFFEES,
  blogAwarenessSchema,
  blogSyncResponseSchema,
  changeBlogDocument,
  readBlogDocument,
  type BlogSyncRequest,
  type BlogSyncResponse,
  type BlogUser,
} from "@shared/blogCollaboration";
import { blogFieldsSchema, type BlogFields, type BlogPost } from "@shared/blog";
import { BlogApiError } from "./blogApi";

export type BlogCollaborationSnapshot = {
  fields: BlogFields;
  post: BlogPost;
  ready: boolean;
  connected: boolean;
  dirty: boolean;
  saving: boolean;
  error: string;
  recovery: string | BlogFields | null;
  user: BlogUser;
  peers: Array<BlogUser & { clientId: number }>;
};
export type BlogSyncTransport = (
  method: "GET" | "POST",
  data?: BlogSyncRequest,
) => Promise<BlogSyncResponse>;
const remote = Symbol("blog-remote");

export class BlogCollaboration {
  readonly document = new Y.Doc();
  private awarenessInstance: Awareness | null = null;
  private listeners = new Set<() => void>();
  private pending: Uint8Array[] = [];
  private inflight: Promise<BlogPost> | null = null;
  private initialization: Promise<void> | null = null;
  private loop: ReturnType<typeof setTimeout> | undefined;
  private scheduled: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private generation = 0;
  private failures = 0;
  private notificationScheduled = false;
  paused = false;
  snapshot: BlogCollaborationSnapshot;
  private recoveryKey: string;
  private legacyKey: string;
  private url: string;

  constructor(
    initial: BlogPost,
    private transport?: BlogSyncTransport,
  ) {
    this.url = `/api/admin/blog-collaboration/${encodeURIComponent(initial.id)}`;
    this.recoveryKey = `seatping.blog.shared-recovery.${initial.id}`;
    this.legacyKey = `seatping.blog.recovery.${initial.id}`;
    this.snapshot = {
      fields: initial,
      post: initial,
      ready: false,
      connected: false,
      dirty: false,
      saving: false,
      error: "",
      recovery: null,
      peers: [],
      user: {
        name: `Anonymous ${BLOG_COFFEES[this.document.clientID % BLOG_COFFEES.length]}`,
        coffee: BLOG_COFFEES[this.document.clientID % BLOG_COFFEES.length],
        color: BLOG_COLORS[(this.document.clientID >>> 8) % BLOG_COLORS.length],
      },
    };
    this.document.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== remote) {
        this.pending.push(update);
        this.storeRecovery();
        this.schedule();
      }
      this.emit();
    });
  }

  get awareness(): Awareness {
    if (!this.awarenessInstance) {
      throw new Error("Shared editing is still connecting.");
    }
    return this.awarenessInstance;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    let fields = this.snapshot.fields;
    if (this.snapshot.ready) {
      try {
        fields = readBlogDocument(this.document);
      } catch {
        this.snapshot = {
          ...this.snapshot,
          error: "Check the article fields and content before syncing your changes.",
        };
      }
    }
    const peers: BlogCollaborationSnapshot["peers"] = [];
    if (this.awarenessInstance) {
      for (const [clientId, raw] of this.awarenessInstance.getStates()) {
        if (clientId === this.document.clientID) {
          continue;
        }
        const parsed = blogAwarenessSchema.safeParse(raw);
        if (parsed.success) {
          peers.push({ clientId, ...parsed.data.user });
        }
      }
    }
    this.snapshot = { ...this.snapshot, fields, dirty: this.pending.length > 0, peers };
    if (!this.notificationScheduled) {
      this.notificationScheduled = true;
      queueMicrotask(() => {
        this.notificationScheduled = false;
        for (const listener of this.listeners) {
          listener();
        }
      });
    }
  }

  start() {
    clearTimeout(this.loop);
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    this.active = true;
    const generation = ++this.generation;
    if (!this.awarenessInstance) {
      this.awarenessInstance = new Awareness(this.document);
      try {
        const stored = sessionStorage.getItem(this.recoveryKey);
        if (stored) {
          fromBase64(stored);
          this.snapshot.recovery = stored;
        } else {
          const legacy = sessionStorage.getItem(this.legacyKey);
          if (legacy) {
            const parsed = blogFieldsSchema.safeParse(JSON.parse(legacy) as unknown);
            if (parsed.success) {
              this.snapshot.recovery = parsed.data;
            }
          }
        }
      } catch {}
      this.awarenessInstance.setLocalStateField("user", this.snapshot.user);
      this.awarenessInstance.on("update", (_changes: unknown, origin: unknown) => {
        if (origin !== remote) {
          this.schedule();
        }
        this.emit();
      });
    }
    const initialize = async () => {
      try {
        const response = await this.request("GET");
        if (!this.active || generation !== this.generation) {
          return;
        }
        Y.applyUpdate(this.document, fromBase64(response.update), remote);
        this.snapshot = {
          ...this.snapshot,
          ready: true,
          connected: true,
          error: "",
          post: { ...readBlogDocument(this.document), ...response.post },
        };
        this.receivePeers(response);
        this.emit();
      } catch (error) {
        if (this.active && generation === this.generation) {
          this.snapshot = { ...this.snapshot, connected: false, error: message(error) };
          this.emit();
        }
      }
    };
    this.initialization = initialize();
    const tick = async () => {
      await this.initialization;
      if (!this.active || generation !== this.generation) {
        return;
      }
      if (!this.snapshot.ready) {
        this.initialization = initialize();
      } else {
        await this.sync().catch(() => {});
      }
      if (this.active && generation === this.generation) {
        this.loop = setTimeout(
          () => {
            void tick();
          },
          Math.min(10_000, 750 * 2 ** this.failures),
        );
      }
    };
    void tick();
  }

  stop() {
    this.active = false;
    const generation = ++this.generation;
    clearTimeout(this.loop);
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    this.leave();
    queueMicrotask(() => {
      if (!this.active && generation === this.generation) {
        this.awarenessInstance?.destroy();
        this.document.destroy();
      }
    });
  }

  leave() {
    void fetch(`${this.url}/${this.document.clientID}`, {
      method: "DELETE",
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  }

  private schedule() {
    if (!this.active || !this.snapshot.ready || this.scheduled) {
      return;
    }
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      void this.sync().catch(() => {});
    }, 150);
  }

  private async request(method: "GET" | "POST", data?: BlogSyncRequest): Promise<BlogSyncResponse> {
    if (this.transport) {
      return this.transport(method, data);
    }
    const response = await fetch(this.url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      let error = "Shared editing is unavailable. Your changes remain in this tab.";
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      ) {
        error = result.error;
      }
      throw new BlogApiError(error, response.status);
    }
    return blogSyncResponseSchema.parse(result) as BlogSyncResponse;
  }

  private receivePeers(response: BlogSyncResponse) {
    const active = new Set(response.peers.map((peer) => peer.clientId));
    for (const peer of response.peers) {
      if (peer.clientId !== this.document.clientID) {
        applyAwarenessUpdate(this.awareness, fromBase64(peer.awareness), remote);
      }
    }
    const stale = [...this.awareness.getStates().keys()].filter(
      (clientId) => clientId !== this.document.clientID && !active.has(clientId),
    );
    removeAwarenessStates(this.awareness, stale, remote);
    const peers = [...this.awareness.getStates()]
      .filter(([id]) => id !== this.document.clientID)
      .map(([id, raw]) => ({ id, user: blogAwarenessSchema.safeParse(raw) }));
    let user = this.snapshot.user;
    if (
      peers.some(
        (peer) =>
          peer.id < this.document.clientID &&
          peer.user.success &&
          peer.user.data.user.name === user.name,
      )
    ) {
      const coffee = BLOG_COFFEES.find(
        (drink) =>
          !peers.some(
            (peer) => peer.user.success && peer.user.data.user.name === `Anonymous ${drink}`,
          ),
      );
      if (coffee) {
        user = { ...user, name: `Anonymous ${coffee}`, coffee };
      }
    }
    if (
      peers.some(
        (peer) =>
          peer.id < this.document.clientID &&
          peer.user.success &&
          peer.user.data.user.color === user.color,
      )
    ) {
      const color = BLOG_COLORS.find(
        (value) => !peers.some((peer) => peer.user.success && peer.user.data.user.color === value),
      );
      if (color) {
        user = { ...user, color };
      }
    }
    if (user !== this.snapshot.user) {
      this.snapshot = { ...this.snapshot, user };
      this.awareness.setLocalStateField("user", user);
    }
  }

  sync(force = false): Promise<BlogPost> {
    if (this.inflight) {
      return this.inflight;
    }
    const generation = this.generation;
    const run = async () => {
      if (!this.active || !this.snapshot.ready) {
        throw new Error("Shared editing is still connecting. Your edits remain in this tab.");
      }
      let count = this.pending.length;
      if ((this.paused && !force) || this.snapshot.recovery) {
        count = 0;
      }
      const payload: BlogSyncRequest = {
        clientId: this.document.clientID,
        vector: toBase64(Y.encodeStateVector(this.document)),
        awareness: toBase64(encodeAwarenessUpdate(this.awareness, [this.document.clientID])),
      };
      if (count > 0) {
        payload.update = toBase64(Y.mergeUpdates(this.pending.slice(0, count)));
        this.snapshot = { ...this.snapshot, saving: true };
        this.emit();
      }
      try {
        const response = await this.request("POST", payload);
        if (!this.active || generation !== this.generation) {
          return this.snapshot.post;
        }
        Y.applyUpdate(this.document, fromBase64(response.update), remote);
        this.pending.splice(0, count);
        this.failures = 0;
        let post = this.snapshot.post;
        if (response.post.revision >= post.revision) {
          post = { ...readBlogDocument(this.document), ...response.post };
        }
        this.snapshot = { ...this.snapshot, post, connected: true, error: "" };
        this.receivePeers(response);
        this.storeRecovery();
        return post;
      } catch (error) {
        if (this.active && generation === this.generation) {
          this.failures = Math.min(4, this.failures + 1);
          this.snapshot = { ...this.snapshot, connected: false, error: message(error) };
        }
        throw error;
      } finally {
        this.snapshot = { ...this.snapshot, saving: false };
        this.emit();
      }
    };
    this.inflight = run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async save(): Promise<BlogPost> {
    await this.initialization;
    if (this.snapshot.recovery) {
      throw new Error("Restore or discard the recovered edits before saving.");
    }
    let post = await this.sync(true);
    while (this.pending.length > 0) {
      post = await this.sync(true);
    }
    return post;
  }

  change(next: BlogFields, previous: BlogFields) {
    changeBlogDocument(this.document, next, previous);
  }

  acceptPost(post: BlogPost) {
    if (post.revision >= this.snapshot.post.revision) {
      this.snapshot = { ...this.snapshot, post };
      this.emit();
    }
  }

  restore() {
    const recovered = this.snapshot.recovery;
    this.snapshot = { ...this.snapshot, recovery: null };
    if (typeof recovered === "string") {
      Y.applyUpdate(this.document, fromBase64(recovered));
    } else if (recovered) {
      changeBlogDocument(this.document, recovered, readBlogDocument(this.document), true);
    }
    this.clearLegacyRecovery();
    this.storeRecovery();
    this.emit();
  }

  discardRecovery() {
    this.snapshot = { ...this.snapshot, recovery: null };
    this.clearLegacyRecovery();
    this.storeRecovery();
    this.emit();
  }

  private clearLegacyRecovery() {
    try {
      sessionStorage.removeItem(this.legacyKey);
    } catch {}
  }

  private storeRecovery() {
    try {
      if (this.pending.length > 0) {
        sessionStorage.setItem(this.recoveryKey, toBase64(Y.mergeUpdates(this.pending)));
      } else if (!this.snapshot.recovery) {
        sessionStorage.removeItem(this.recoveryKey);
      }
    } catch {}
  }
}

function message(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Connection lost. Your changes will sync when you reconnect.";
}
