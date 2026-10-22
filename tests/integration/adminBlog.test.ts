import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { adminCookie, businessCookie, customerCookie } from "../helpers/auth.js";
import { newBlogFields } from "../../shared/blog.js";

const db = getTestPrisma();
beforeEach(async () => {
  await clearTestDatabase();
});
afterAll(async () => {
  await disconnectTestPrisma();
});
async function create() {
  return (await api()).post("/api/admin/blog").set("Cookie", adminCookie()).send({});
}
const fields = () => ({
  ...newBlogFields(),
  title: "A Better Guest Experience",
  slug: "better-guests",
  category: "Operations",
  categoryColor: "success" as const,
  tags: ["queues"],
  content: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, textAlign: "center" },
        content: [{ type: "text", text: "Welcome", marks: [{ type: "bold" }] }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Reserve a table",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.com",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                  title: "Guest Guide",
                },
              },
            ],
          },
        ],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Call the guest" }] }],
          },
        ],
      },
      {
        type: "image",
        attrs: {
          src: "https://example.com/cover.jpg",
          alt: "Restaurant",
          caption: "Evening service",
          alignment: "right",
          width: 500,
        },
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 1, rowspan: 1, colwidth: [200], align: null },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Guests" }] }],
              },
            ],
          },
        ],
      },
    ],
  },
});

describe("Admin Blog API", () => {
  it("returns zero counts and empty filters when no posts exist", async () => {
    const response = await (
      await api()
    )
      .get("/api/admin/blog?search=&status=ALL&sort=updated&category=&author=&tag=")
      .set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      posts: [],
      stats: { total: 0, drafts: 0, published: 0 },
      filters: { categories: [], authors: [], tags: [] },
    });
  });

  it("rejects anonymous, customer, and business sessions for reads and mutations", async () => {
    for (const cookie of ["", customerCookie("guest"), businessCookie("business")]) {
      for (const method of ["get", "post", "put", "delete"] as const) {
        const client = await api();
        const response = await client[method]("/api/admin/blog/post")
          .set("Cookie", cookie)
          .send({});
        expect(response.status).toBe(401);
      }
    }
  });
  it("fails closed when admin configuration is absent", async () => {
    const original = process.env.ADMIN_USERNAME;
    process.env.ADMIN_USERNAME = "";
    try {
      expect((await create()).status).toBe(503);
    } finally {
      process.env.ADMIN_USERNAME = original;
    }
  });
  it("creates, persists structured content, reloads, duplicates, publishes, unpublishes, and deletes", async () => {
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.post.status).toBe("DRAFT");
    const id = created.body.post.id;
    const saved = await (
      await api()
    )
      .put(`/api/admin/blog/${id}`)
      .set("Cookie", adminCookie())
      .send({ ...fields(), revision: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body.post.revision).toBe(2);
    const reloaded = await (await api()).get(`/api/admin/blog/${id}`).set("Cookie", adminCookie());
    expect(reloaded.body.post.content).toEqual(fields().content);
    expect(reloaded.body.post.categoryColor).toBe("success");
    expect(reloaded.body.post.slug).toBe("a-better-guest-experience");
    const published = await (
      await api()
    )
      .post(`/api/admin/blog/${id}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "PUBLISHED", revision: 2 });
    expect(published.status).toBe(200);
    expect(published.body.post.publishedAt).toBeTruthy();
    const duplicate = await (
      await api()
    )
      .post(`/api/admin/blog/${id}/duplicate`)
      .set("Cookie", adminCookie())
      .send({});
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.post.status).toBe("DRAFT");
    expect(duplicate.body.post.content).toEqual(fields().content);
    expect(duplicate.body.post.categoryColor).toBe("success");
    expect(duplicate.body.post.slug).not.toBe("better-guests");
    const draft = await (
      await api()
    )
      .post(`/api/admin/blog/${id}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "DRAFT", revision: 3 });
    expect(draft.status).toBe(200);
    expect(draft.body.post.publishedAt).toBe(published.body.post.publishedAt);
    const removed = await (
      await api()
    )
      .delete(`/api/admin/blog/${id}`)
      .set("Cookie", adminCookie())
      .send({ revision: 4 });
    expect(removed.status).toBe(200);
    expect(await db.blogPost.findUnique({ where: { id } })).toBeNull();
  });
  it("generates unique slugs and rejects stale concurrent saves without overwriting content", async () => {
    const first = (await create()).body.post;
    const second = (await create()).body.post;
    const save = (id: string, title: string, slug: string) =>
      (async () =>
        (await api())
          .put(`/api/admin/blog/${id}`)
          .set("Cookie", adminCookie())
          .send({ ...fields(), title, slug, revision: 1 }))();
    const responses = await Promise.all([
      save(first.id, "First", "same-slug"),
      save(first.id, "Second", "same-slug"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const stored = await db.blogPost.findUniqueOrThrow({ where: { id: first.id } });
    const duplicate = await save(second.id, stored.title, "same-slug");
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.post.slug).toBe(`${stored.slug}-2`);
    const staleDelete = await (
      await api()
    )
      .delete(`/api/admin/blog/${first.id}`)
      .set("Cookie", adminCookie())
      .send({ revision: 1 });
    expect(staleDelete.status).toBe(409);
    expect((await db.blogPost.findUniqueOrThrow({ where: { id: first.id } })).revision).toBe(2);
  });
  it("handles concurrent identical titles, bounds generated slugs, and validates pill colors", async () => {
    const first = (await create()).body.post;
    const second = (await create()).body.post;
    const title = "A".repeat(240);
    const save = async (id: string) =>
      (await api())
        .put(`/api/admin/blog/${id}`)
        .set("Cookie", adminCookie())
        .send({ ...fields(), title, revision: 1 });
    const saved = await Promise.all([save(first.id), save(second.id)]);
    expect(saved.map((response) => response.status)).toEqual([200, 200]);
    const slugs = saved.map((response) => response.body.post.slug);
    expect(new Set(slugs).size).toBe(2);
    for (const slug of slugs) {
      expect(slug.length).toBeLessThanOrEqual(160);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    const invalid = await (
      await api()
    )
      .put(`/api/admin/blog/${first.id}`)
      .set("Cookie", adminCookie())
      .send({ ...fields(), categoryColor: "url(evil)", revision: 2 });
    expect(invalid.status).toBe(400);
    const unchanged = await db.blogPost.findUniqueOrThrow({ where: { id: first.id } });
    expect(unchanged.revision).toBe(2);
    const renamed = await (
      await api()
    )
      .put(`/api/admin/blog/${first.id}`)
      .set("Cookie", adminCookie())
      .send({ ...fields(), title: "", revision: 2 });
    expect(renamed.status).toBe(200);
    expect(renamed.body.post.slug).toBe(unchanged.slug);
  });
  it("filters, searches, sorts and returns unfiltered totals without article bodies", async () => {
    const first = (await create()).body.post;
    const second = (await create()).body.post;
    await (
      await api()
    )
      .put(`/api/admin/blog/${first.id}`)
      .set("Cookie", adminCookie())
      .send({ ...fields(), revision: 1 });
    await (
      await api()
    )
      .post(`/api/admin/blog/${first.id}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "PUBLISHED", revision: 2 });
    const published = await (
      await api()
    )
      .get("/api/admin/blog?status=PUBLISHED&search=EXPERIENCE&sort=title")
      .set("Cookie", adminCookie());
    expect(published.status).toBe(200);
    expect(published.body.posts.map((post: { id: string }) => post.id)).toEqual([first.id]);
    expect(published.body.posts[0].content).toBeUndefined();
    expect(published.body.stats).toEqual({ total: 2, drafts: 1, published: 1 });
    expect(published.body.filters).toEqual({
      categories: ["Operations"],
      authors: ["SeatPing Team"],
      tags: ["queues"],
    });
    const filtered = await (
      await api()
    )
      .get("/api/admin/blog?category=Operations&author=SeatPing%20Team&tag=queues")
      .set("Cookie", adminCookie());
    expect(filtered.body.posts.map((post: { id: string }) => post.id)).toEqual([first.id]);
    const noMatch = await (
      await api()
    )
      .get("/api/admin/blog?category=Other")
      .set("Cookie", adminCookie());
    expect(noMatch.body.posts).toEqual([]);
    const drafts = await (
      await api()
    )
      .get("/api/admin/blog?status=DRAFT")
      .set("Cookie", adminCookie());
    expect(drafts.body.posts.map((post: { id: string }) => post.id)).toEqual([second.id]);
  });
  it("requires article content before publishing and rejects unsafe nodes and links", async () => {
    const { id } = (await create()).body.post;
    const publish = await (
      await api()
    )
      .post(`/api/admin/blog/${id}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "PUBLISHED", revision: 1 });
    expect(publish.status).toBe(400);
    for (const content of [
      { type: "doc", content: [{ type: "script" }] },
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "click",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      },
      { type: "doc", content: [{ type: "image", attrs: { src: "data:image/svg+xml,evil" } }] },
    ]) {
      const response = await (
        await api()
      )
        .put(`/api/admin/blog/${id}`)
        .set("Cookie", adminCookie())
        .send({ ...fields(), content, revision: 1 });
      expect(response.status).toBe(400);
    }
    expect((await db.blogPost.findUniqueOrThrow({ where: { id } })).revision).toBe(1);
  });
  it("handles missing posts and validates queries and revisions", async () => {
    expect(
      (await (await api()).get("/api/admin/blog/missing").set("Cookie", adminCookie())).status,
    ).toBe(404);
    expect(
      (await (await api()).post("/api/admin/blog/missing/duplicate").set("Cookie", adminCookie()))
        .status,
    ).toBe(404);
    expect(
      (await (await api()).get("/api/admin/blog?status=HIDDEN").set("Cookie", adminCookie()))
        .status,
    ).toBe(400);
    expect(
      (await (await api()).delete("/api/admin/blog/missing").set("Cookie", adminCookie()).send({}))
        .status,
    ).toBe(400);
  });
  it("rejects media requests without admin auth and gracefully reports unavailable storage", async () => {
    const anonymous = await (
      await api()
    )
      .post("/api/admin/blog/media/sign")
      .send({ kind: "image" });
    expect(anonymous.status).toBe(401);
    expect(
      (
        await (
          await api()
        )
          .post("/api/admin/blog/media/sign")
          .set("Cookie", adminCookie())
          .send({ kind: "html" })
      ).status,
    ).toBe(400);
    expect(
      (
        await (
          await api()
        )
          .post("/api/admin/blog/media/sign")
          .set("Cookie", adminCookie())
          .send({ kind: "image" })
      ).status,
    ).toBe(503);
    expect(
      (
        await (
          await api()
        )
          .post("/api/admin/blog/media/commit")
          .set("Cookie", adminCookie())
          .send({ id: "outside/folder" })
      ).status,
    ).toBe(400);
    expect(
      (
        await (
          await api()
        )
          .post("/api/admin/blog/media/commit")
          .set("Cookie", adminCookie())
          .send({ id: "seatping/blog/00000000-0000-0000-0000-000000000000" })
      ).status,
    ).toBe(404);
  });
});
