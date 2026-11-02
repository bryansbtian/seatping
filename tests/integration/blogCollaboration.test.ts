import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { fromBase64, toBase64 } from "lib0/buffer";
import { apiFromIp } from "../helpers/app.js";
import { adminCookie, businessCookie, customerCookie } from "../helpers/auth.js";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { blogText, newBlogFields } from "../../shared/blog.js";
import {
  BLOG_COLORS,
  BLOG_PRESENCE_TTL,
  changeBlogDocument,
  readBlogDocument,
  type BlogSyncResponse,
} from "../../shared/blogCollaboration.js";

const db = getTestPrisma();
const clients: Array<{ doc: Y.Doc; awareness: Awareness }> = [];
let postId = "";

beforeEach(async () => {
  await clearTestDatabase();
  const post = await db.blogPost.create({
    data: {
      ...newBlogFields(),
      slug: "shared-article",
      title: "Shared Article",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
      },
    },
  });
  postId = post.id;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const client of clients.splice(0)) {
    client.awareness.destroy();
    client.doc.destroy();
  }
  await clearTestDatabase();
});

async function replica(name: string) {
  const api = await apiFromIp();
  const response = await api
    .get(`/api/admin/blog-collaboration/${postId}`)
    .set("Cookie", adminCookie());
  expect(response.status).toBe(200);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromBase64((response.body as BlogSyncResponse).update));
  const awareness = new Awareness(doc);
  awareness.setLocalState({
    user: { name, color: BLOG_COLORS[clients.length % BLOG_COLORS.length] },
  });
  const client = { doc, awareness, vector: Y.encodeStateVector(doc) };
  clients.push(client);
  return client;
}

function payload(client: Awaited<ReturnType<typeof replica>>, changes = true) {
  const result = {
    clientId: client.doc.clientID,
    vector: toBase64(Y.encodeStateVector(client.doc)),
    awareness: toBase64(encodeAwarenessUpdate(client.awareness, [client.doc.clientID])),
    update: undefined as string | undefined,
  };
  if (changes) {
    result.update = toBase64(Y.encodeStateAsUpdate(client.doc, client.vector));
  }
  return result;
}

async function sync(client: Awaited<ReturnType<typeof replica>>, changes = true) {
  const response = await (
    await apiFromIp()
  )
    .post(`/api/admin/blog-collaboration/${postId}`)
    .set("Cookie", adminCookie())
    .send(payload(client, changes));
  expect(response.status).toBe(200);
  Y.applyUpdate(client.doc, fromBase64((response.body as BlogSyncResponse).update));
  client.vector = Y.encodeStateVector(client.doc);
  return response;
}

function text(document: Y.Doc) {
  const paragraph = document.getXmlFragment("default").get(0);
  if (!(paragraph instanceof Y.XmlElement)) {
    throw new Error("Missing paragraph");
  }
  const node = paragraph.get(0);
  if (!(node instanceof Y.XmlText)) {
    throw new Error("Missing text");
  }
  return node;
}

describe("Shared Blog Editing", () => {
  it("merges concurrent edits and preserves both writers through retries and reconnects", async () => {
    const alex = await replica("Alex");
    const sam = await replica("Sam");
    text(alex.doc).insert(0, "Alex: ");
    text(sam.doc).insert(text(sam.doc).length, " and Sam");
    const sent = payload(alex);
    const saved = await sync(alex);
    const duplicate = await (
      await apiFromIp()
    )
      .post(`/api/admin/blog-collaboration/${postId}`)
      .set("Cookie", adminCookie())
      .send(sent);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.post.revision).toBe(saved.body.post.revision);
    await sync(sam);
    await sync(alex, false);
    expect(blogText(readBlogDocument(alex.doc).content)).toBe("Alex: Hello world and Sam");
    expect(readBlogDocument(alex.doc)).toEqual(readBlogDocument(sam.doc));
    const reconnected = await replica("Reconnected");
    expect(readBlogDocument(reconnected.doc)).toEqual(readBlogDocument(alex.doc));
    expect((await db.blogPost.findUniqueOrThrow({ where: { id: postId } })).content).toEqual(
      readBlogDocument(alex.doc).content,
    );
  });

  it("merges independent metadata edits and tag additions without replacing another editor's changes", async () => {
    const alex = await replica("Alex");
    const sam = await replica("Sam");
    const a = readBlogDocument(alex.doc);
    const b = readBlogDocument(sam.doc);
    changeBlogDocument(alex.doc, { ...a, title: "A Shared Article", tags: ["Operations"] }, a);
    changeBlogDocument(
      sam.doc,
      { ...b, excerpt: "An introduction from Sam", tags: ["Hospitality"] },
      b,
    );
    await sync(alex);
    await sync(sam);
    await sync(alex, false);
    const fields = readBlogDocument(alex.doc);
    expect(fields.title).toBe("A Shared Article");
    expect(fields.excerpt).toBe("An introduction from Sam");
    expect(new Set(fields.tags)).toEqual(new Set(["Operations", "Hospitality"]));
    expect((await db.blogPost.findUniqueOrThrow({ where: { id: postId } })).slug).toBe(
      "a-shared-article",
    );
  });

  it("shares relative selections, expires stale presence, and removes a leaving editor", async () => {
    const alex = await replica("Alex");
    const sam = await replica("Sam");
    const sharedText = text(alex.doc);
    alex.awareness.setLocalStateField("cursor", {
      anchor: Y.createRelativePositionFromTypeIndex(sharedText, 0),
      head: Y.createRelativePositionFromTypeIndex(sharedText, 5),
    });
    await sync(alex);
    const response = await sync(sam);
    expect(response.body.peers).toHaveLength(2);
    await db.blogEditorPresence.update({
      where: { postId_clientId: { postId, clientId: String(alex.doc.clientID) } },
      data: { lastSeenAt: new Date(Date.now() - BLOG_PRESENCE_TTL - 1_000) },
    });
    const refreshed = await sync(sam, false);
    expect(refreshed.body.peers).toHaveLength(1);
    const left = await (
      await apiFromIp()
    )
      .delete(`/api/admin/blog-collaboration/${postId}/${sam.doc.clientID}`)
      .set("Cookie", adminCookie());
    expect(left.status).toBe(200);
    expect(await db.blogEditorPresence.count()).toBe(0);
  });

  it("keeps heartbeats out of article revisions and rejects old whole-article saves", async () => {
    const alex = await replica("Alex");
    const before = await db.blogPost.findUniqueOrThrow({ where: { id: postId } });
    await sync(alex, false);
    const after = await db.blogPost.findUniqueOrThrow({ where: { id: postId } });
    expect(after.revision).toBe(before.revision);
    expect(after.updatedAt).toEqual(before.updatedAt);
    const response = await (
      await apiFromIp()
    )
      .put(`/api/admin/blog/${postId}`)
      .set("Cookie", adminCookie())
      .send({ ...readBlogDocument(alex.doc), revision: before.revision });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("COLLABORATION_REQUIRED");
  });

  it("rejects malformed updates and unsafe content without changing the stored article", async () => {
    const alex = await replica("Alex");
    const before = await db.blogPost.findUniqueOrThrow({ where: { id: postId } });
    const invalid = await (
      await apiFromIp()
    )
      .post(`/api/admin/blog-collaboration/${postId}`)
      .set("Cookie", adminCookie())
      .send({ ...payload(alex), update: toBase64(new Uint8Array([255, 255, 255])) });
    expect(invalid.status).toBe(400);
    const image = new Y.XmlElement("image");
    image.setAttribute("src", "javascript:alert(1)");
    alex.doc.getXmlFragment("default").insert(1, [image]);
    const unsafe = await (
      await apiFromIp()
    )
      .post(`/api/admin/blog-collaboration/${postId}`)
      .set("Cookie", adminCookie())
      .send(payload(alex));
    expect(unsafe.status).toBe(400);
    expect(
      (await db.blogPost.findUniqueOrThrow({ where: { id: postId } })).collaborationState,
    ).toEqual(before.collaborationState);
  });

  it("requires admin authentication, fails closed, and does not expose shared history publicly", async () => {
    const client = await apiFromIp();
    for (const cookie of ["", businessCookie("business-demo"), customerCookie("customer-demo")]) {
      const response = await client
        .get(`/api/admin/blog-collaboration/${postId}`)
        .set("Cookie", cookie);
      expect([401, 403]).toContain(response.status);
    }
    const alex = await replica("Alex");
    await sync(alex);
    const post = await db.blogPost.update({
      where: { id: postId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const publicResponse = await client.get(`/api/blog/${post.slug}`);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.post).not.toHaveProperty("collaborationState");
    const adminResponse = await client
      .get(`/api/admin/blog/${postId}`)
      .set("Cookie", adminCookie());
    expect(adminResponse.body.post).not.toHaveProperty("collaborationState");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "");
    const disabled = await client
      .get(`/api/admin/blog-collaboration/${postId}`)
      .set("Cookie", adminCookie());
    expect(disabled.status).toBe(503);
  });
});
