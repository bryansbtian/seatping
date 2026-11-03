import express from "express";
import cookieParser from "cookie-parser";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { fromBase64, toBase64 } from "lib0/buffer";
import { serveApp } from "../helpers/app.js";
import { signJwt } from "../../server/lib/auth.js";
import router from "../../server/routes/adminBlogCollaboration.js";
import { validateBlogAwareness } from "../../server/lib/blogCollaboration.js";
import { createBlogDocument, type BlogSyncRequest } from "../../shared/blogCollaboration.js";
import { newBlogFields } from "../../shared/blog.js";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  blogPost: { findUnique: vi.fn(), update: vi.fn() },
  blogEditorPresence: {
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
}));
vi.mock("../../server/lib/prisma.js", () => ({ prisma: db }));

function fixture() {
  return {
    ...newBlogFields(),
    id: "shared-article-id",
    title: "Shared Article",
    slug: "shared-article",
    status: "DRAFT",
    revision: 1,
    collaborationState: null as Uint8Array | null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    publishedAt: null as Date | null,
  };
}

let stored = fixture();
const documents: Y.Doc[] = [];
const presences: Awareness[] = [];
const path = "/api/admin/blog-collaboration/shared-article-id";
const app = express();
app.use(express.json({ limit: "3mb" }), cookieParser());
app.use("/api/admin/blog-collaboration", router);
const client = await serveApp(app);

function cookie(subject: string | undefined = "test-admin") {
  return `sp_auth_admin=${signJwt({ sub: subject, accountType: "admin" })}`;
}

function replica() {
  const document = createBlogDocument(newBlogFields());
  if (stored.collaborationState) {
    Y.applyUpdate(document, stored.collaborationState);
  }
  documents.push(document);
  return document;
}

function payload(document: Y.Doc): BlogSyncRequest {
  const awareness = new Awareness(document);
  awareness.setLocalState({ user: { name: "Anonymous Latte", color: "#4f46e5", coffee: "Latte" } });
  presences.push(awareness);
  return {
    clientId: document.clientID,
    vector: toBase64(Y.encodeStateVector(document)),
    awareness: toBase64(encodeAwarenessUpdate(awareness, [document.clientID])),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_USERNAME", "test-admin");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "test-hash");
  stored = fixture();
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => Promise<unknown>) => run(db));
  db.blogPost.findUnique.mockImplementation(async () => stored);
  db.blogPost.update.mockImplementation(async ({ data }: { data: Partial<typeof stored> }) => {
    stored = { ...stored, ...data };
    return stored;
  });
  db.blogEditorPresence.findUnique.mockResolvedValue(null);
  db.blogEditorPresence.findMany.mockResolvedValue([]);
  db.blogEditorPresence.deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  for (const awareness of presences.splice(0)) {
    awareness.destroy();
  }
  for (const document of documents.splice(0)) {
    document.destroy();
  }
  vi.unstubAllEnvs();
});

describe("Admin Blog Collaboration Requests", () => {
  it("requires configured admin access and an authenticated session", async () => {
    expect((await client.get(path)).status).toBe(401);
    vi.stubEnv("ADMIN_USERNAME", "");
    const unavailable = await client.get(path).set("Cookie", cookie());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers["cache-control"]).toBe("no-store");
  });

  it("rejects admin sessions without a subject", async () => {
    const response = await client
      .get(path)
      .set("Cookie", `sp_auth_admin=${signJwt({ accountType: "admin" })}`);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Sign in again to edit this article.");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers, request bodies, and presence identifiers", async () => {
    expect(
      (await client.get("/api/admin/blog-collaboration/short").set("Cookie", cookie())).status,
    ).toBe(400);
    expect((await client.post(path).set("Cookie", cookie()).send({})).status).toBe(400);
    expect((await client.delete(`${path}/invalid`).set("Cookie", cookie())).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.blogEditorPresence.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only presence owned by the authenticated admin", async () => {
    const response = await client.delete(`${path}/123`).set("Cookie", cookie());
    expect(response.status).toBe(200);
    expect(db.blogEditorPresence.deleteMany).toHaveBeenCalledWith({
      where: { postId: stored.id, clientId: "123", owner: "test-admin" },
    });
    db.blogEditorPresence.deleteMany.mockRejectedValue(new Error("Database unavailable"));
    const failed = await client.delete(`${path}/123`).set("Cookie", cookie());
    expect(failed.status).toBe(503);
    expect(failed.body.error).toContain("Your changes remain in this tab");
  });

  it("returns missing article errors and keeps unexpected failures generic", async () => {
    db.blogPost.findUnique.mockResolvedValue(null);
    expect((await client.get(path).set("Cookie", cookie())).status).toBe(404);
    db.$transaction.mockRejectedValue(new Error("Private database details"));
    const failed = await client.get(path).set("Cookie", cookie());
    expect(failed.status).toBe(503);
    expect(failed.body.error).not.toContain("Private database details");
  });

  it("rejects corrupt stored collaboration state", async () => {
    stored.collaborationState = new Uint8Array([255, 255, 255]);
    const response = await client.get(path).set("Cookie", cookie());
    expect(response.status).toBe(500);
    expect(response.body.error).toContain("could not be opened");
    expect(db.blogPost.update).not.toHaveBeenCalled();
  });

  it("rejects a published article that fails publication validation", async () => {
    stored.status = "PUBLISHED";
    stored.publishedAt = new Date();
    const response = await client.get(path).set("Cookie", cookie());
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Check the article fields");
    expect(db.blogPost.update).not.toHaveBeenCalled();
  });

  it.each(["untrusted", "__tiptap_position_migrations:root:untrusted"])(
    "rejects updates that add an unknown shared root: %s",
    async (root) => {
      await client.get(path).set("Cookie", cookie());
      const document = replica();
      document.getMap(root).set("value", "Unexpected");
      const response = await client
        .post(path)
        .set("Cookie", cookie())
        .send({
          ...payload(document),
          update: toBase64(Y.encodeStateAsUpdate(document)),
        });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("shared article update is invalid");
    },
  );

  it("accepts editor position migrations with article updates", async () => {
    await client.get(path).set("Cookie", cookie());
    const document = replica();
    document.getMap("__tiptap_position_migrations:root:default").set("migration", {
      version: 1,
      client: document.clientID,
      clock: 0,
      seen: [],
      transfers: [],
    });
    document.getText("title").insert(0, "Updated ");
    const response = await client
      .post(path)
      .set("Cookie", cookie())
      .send({
        ...payload(document),
        update: toBase64(Y.encodeStateAsUpdate(document)),
      });
    expect(response.status).toBe(200);
    expect(stored.title).toBe("Updated Shared Article");
  });

  it("rejects malformed version vectors", async () => {
    await client.get(path).set("Cookie", cookie());
    const response = await client
      .post(path)
      .set("Cookie", cookie())
      .send({
        ...payload(replica()),
        vector: toBase64(new Uint8Array([255, 255, 255])),
      });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("shared article version is invalid");
  });

  it("rejects attempts to reuse another admin's editing session", async () => {
    await client.get(path).set("Cookie", cookie());
    db.blogEditorPresence.findUnique.mockResolvedValue({ owner: "another-admin" });
    const response = await client.post(path).set("Cookie", cookie()).send(payload(replica()));
    expect(response.status).toBe(409);
    expect(db.blogEditorPresence.upsert).not.toHaveBeenCalled();
  });

  it("rejects oversized shared documents", async () => {
    await client.get(path).set("Cookie", cookie());
    const document = replica();
    document.getMap("metadata").set("extra", "x".repeat(2_000_000));
    const response = await client
      .post(path)
      .set("Cookie", cookie())
      .send({
        ...payload(document),
        update: toBase64(Y.encodeStateAsUpdate(document)),
      });
    expect(response.status).toBe(413);
    expect(response.body.error).toContain("too large to sync");
  });

  it.each(["P2002", "P2034"])("retries transient transaction failures: %s", async (code) => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Retry", { code, clientVersion: "test" }),
    );
    expect((await client.get(path).set("Cookie", cookie())).status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("stops retrying after three transaction failures", async () => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Retry", { code: "P2034", clientVersion: "test" }),
    );
    expect((await client.get(path).set("Cookie", cookie())).status).toBe(503);
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
});

describe("Blog Presence Validation", () => {
  it("accepts one valid awareness state for the sending client", () => {
    const request = payload(replica());
    expect(validateBlogAwareness(request.awareness, request.clientId)).toEqual(
      fromBase64(request.awareness),
    );
  });

  it("rejects another client's state, empty updates, trailing data, and invalid user data", () => {
    const document = replica();
    const request = payload(document);
    expect(() => validateBlogAwareness(request.awareness, request.clientId + 1)).toThrow(
      "presence is invalid",
    );
    expect(() => validateBlogAwareness(toBase64(new Uint8Array([0])), request.clientId)).toThrow(
      "presence is invalid",
    );
    const bytes = fromBase64(request.awareness);
    const trailing = new Uint8Array(bytes.length + 1);
    trailing.set(bytes);
    expect(() => validateBlogAwareness(toBase64(trailing), request.clientId)).toThrow(
      "presence is invalid",
    );
    const awareness = presences[presences.length - 1];
    awareness.setLocalState({ user: { name: "Invalid", color: "red" } });
    expect(() =>
      validateBlogAwareness(
        toBase64(encodeAwarenessUpdate(awareness, [document.clientID])),
        document.clientID,
      ),
    ).toThrow("presence is invalid");
  });
});
