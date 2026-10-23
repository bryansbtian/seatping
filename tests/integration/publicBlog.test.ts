import { afterEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { adminCookie } from "../helpers/auth.js";
import { newBlogFields } from "../../shared/blog.js";
import { replaceDevelopmentBlogs } from "../../scripts/seed-development-blog.js";

afterEach(clearTestDatabase);
describe("Public Blog Publication Lifecycle", () => {
  it("replaces only local blog posts with realistic content and exposes published posts only", async () => {
    await clearTestDatabase();
    const counts = await replaceDevelopmentBlogs(process.env.TEST_DATABASE_URL);
    expect(counts).toEqual({ published: 4, drafts: 2 });
    const db = getTestPrisma();
    const all = await db.blogPost.findMany();
    expect(all).toHaveLength(6);
    expect(all.every((post) => post.coverUrl.startsWith("https://images.unsplash.com/"))).toBe(
      true,
    );
    const list = await (await api()).get("/api/blog");
    expect(list.status).toBe(200);
    expect(list.body.posts).toHaveLength(4);
    expect(list.body.posts.every((post: { content?: unknown }) => post.content === undefined)).toBe(
      true,
    );
    const draft = all.find((post) => post.status === "DRAFT")!;
    expect((await (await api()).get(`/api/blog/${draft.slug}`)).status).toBe(404);
    expect(list.body.categories).not.toContain("Campaigns");
    const related = await (await api()).get(`/api/blog/${list.body.posts[0].slug}/related`);
    expect(related.status).toBe(200);
    expect(related.body.posts).toHaveLength(2);
    expect(
      related.body.posts.every((post: { slug: string }) => post.slug !== list.body.posts[0].slug),
    ).toBe(true);
    expect((await (await api()).get("/sitemap.xml")).text).not.toContain(`/blog/${draft.slug}`);
    await expect(
      replaceDevelopmentBlogs("postgresql://user:password@remote.example/seatping_dev"),
    ).rejects.toThrow("Development cannot connect");
  });
  it("reflects publishing, unpublishing, deleting and category filtering on every public surface", async () => {
    await clearTestDatabase();
    const client = await api();
    const created = await client.post("/api/admin/blog").set("Cookie", adminCookie()).send({});
    const id = created.body.post.id;
    const saved = await client
      .put(`/api/admin/blog/${id}`)
      .set("Cookie", adminCookie())
      .send({
        ...newBlogFields(),
        title: "A Calmer Arrival",
        author: "SeatPing Team",
        category: "Guides",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Keep arrivals clear and welcoming." }],
            },
          ],
        },
        revision: 1,
      });
    const slug = saved.body.post.slug;
    expect((await client.get(`/api/blog/${slug}`)).status).toBe(404);
    await client
      .post(`/api/admin/blog/${id}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "PUBLISHED", revision: 2 })
      .expect(200);
    const published = await client.get(`/api/blog/${slug}`);
    expect(published.status).toBe(200);
    expect(published.body.post.content).toEqual(saved.body.post.content);
    expect((await client.get("/api/blog?category=Guides")).body.posts).toHaveLength(1);
    expect((await client.get("/api/blog?category=Other")).body.posts).toHaveLength(0);
    expect((await client.get("/sitemap.xml")).text).toContain(`/blog/${slug}`);
    await client
      .post(`/api/admin/blog/${id}/status`)
      .set("Cookie", adminCookie())
      .send({ status: "DRAFT", revision: 3 })
      .expect(200);
    expect((await client.get(`/api/blog/${slug}`)).status).toBe(404);
    expect((await client.get("/api/blog")).body.posts).toHaveLength(0);
    expect((await client.get("/sitemap.xml")).text).not.toContain(`/blog/${slug}`);
    await client
      .delete(`/api/admin/blog/${id}`)
      .set("Cookie", adminCookie())
      .send({ revision: 4 })
      .expect(200);
    expect((await client.get(`/api/blog/${slug}`)).status).toBe(404);
  });
  it("preserves a published URL on title edits and excludes future publications from HTML and sitemap", async () => {
    await clearTestDatabase();
    const client = await api();
    const db = getTestPrisma();
    const fields = {
      ...newBlogFields(),
      title: "Original Article",
      slug: "original-article",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Original public content." }] },
        ],
      },
    };
    const post = await db.blogPost.create({
      data: { ...fields, status: "PUBLISHED", publishedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const changed = await client
      .put(`/api/admin/blog/${post.id}`)
      .set("Cookie", adminCookie())
      .send({ ...fields, title: "Updated Article", slug: "updated-article", revision: 1 });
    expect(changed.status).toBe(200);
    expect(changed.body.post.slug).toBe("original-article");
    const html = await client.get("/blog/original-article");
    expect(html.status).toBe(200);
    expect(html.text).toContain("<title>Updated Article | SeatPing</title>");
    await db.blogPost.update({
      where: { id: post.id },
      data: { publishedAt: new Date(Date.now() + 86400000) },
    });
    expect((await client.get("/api/blog/original-article")).status).toBe(404);
    expect((await client.get("/blog/original-article")).status).toBe(404);
    expect((await client.get("/blog")).text).not.toContain("Updated Article");
    expect((await client.get("/sitemap.xml")).text).not.toContain("original-article");
  });
});
