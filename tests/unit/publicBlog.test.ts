import { blogDescription, blogStructuredData } from "../../server/lib/blogSeo.js";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serveApp } from "../helpers/app.js";
import { prisma } from "../../server/lib/prisma.js";
import publicBlogRouter from "../../server/routes/publicBlog.js";
import { createBlogPagesRouter, sitemapRouter } from "../../server/routes/blogPages.js";
import { newBlogFields, type BlogNode } from "../../shared/blog.js";
import { blogPath, renderBlogContent } from "../../shared/publicBlog.js";
import { SITE_URL } from "../../server/lib/pageMeta.js";
import { blogCoverThumbnail, isBlogCoverVideo } from "../../shared/blogMedia.js";

vi.mock("../../server/lib/prisma.js", () => ({
  prisma: {
    blogPost: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  },
}));
const stored = () => ({
  ...newBlogFields(),
  title: "Guest Guides <&>",
  slug: "guest-guides",
  excerpt: "A practical guide for guests.",
  category: "Guides",
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "A better guest experience." }] },
    ],
  },
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
});
const template =
  '<html><head><!-- SEO:START --><!-- SEO:END --></head><body><div id="root"></div></body></html>';
const app = express();
app.use("/api/blog", publicBlogRouter);
app.use(sitemapRouter);
app.use(createBlogPagesRouter(() => template));
const client = await serveApp(app);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.blogPost.findFirst).mockResolvedValue(stored());
  vi.mocked(prisma.blogPost.findMany).mockResolvedValue([stored()]);
  vi.mocked(prisma.blogPost.count).mockResolvedValue(1);
});

describe("Public Blog API And Crawlable Pages", () => {
  it("prioritizes the same category and fills related posts from other published categories", async () => {
    vi.mocked(prisma.blogPost.findMany)
      .mockResolvedValueOnce([{ ...stored(), slug: "another-guide" }])
      .mockResolvedValueOnce([{ ...stored(), slug: "another-story", category: "Product" }]);
    const response = await client.get("/api/blog/guest-guides/related");
    expect(response.status).toBe(200);
    expect(response.body.posts.map((post: { slug: string }) => post.slug)).toEqual([
      "another-guide",
      "another-story",
    ]);
    expect(prisma.blogPost.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          slug: { not: "guest-guides" },
          category: "Guides",
        }),
        take: 2,
      }),
    );
    expect(prisma.blogPost.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ category: { not: "Guides" } }),
        take: 1,
      }),
    );
    vi.mocked(prisma.blogPost.findFirst).mockResolvedValue(null);
    expect((await client.get("/api/blog/private/related")).status).toBe(404);
    vi.mocked(prisma.blogPost.findFirst).mockRejectedValue(new Error("Unavailable"));
    expect((await client.get("/api/blog/unavailable/related")).status).toBe(503);
  });
  it("returns only publication fields and enforces publication guards for anonymous reads", async () => {
    const response = await client.get("/api/blog/guest-guides");
    expect(response.status).toBe(200);
    expect(response.body.post.title).toBe(stored().title);
    expect(response.body.post.revision).toBeUndefined();
    expect(response.body.post.status).toBeUndefined();
    expect(prisma.blogPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PUBLISHED",
          publishedAt: { lte: expect.any(Date) },
          slug: "guest-guides",
        },
      }),
    );
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("paginates, filters by category and omits the article body from cards", async () => {
    const response = await client.get("/api/blog?category=Guides&page=2");
    expect(response.status).toBe(200);
    expect(response.body.posts[0].content).toBeUndefined();
    expect(response.body.posts[0].readingMinutes).toBe(1);
    expect(response.body.categories).toEqual(["Guides"]);
    expect(prisma.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED", category: "Guides" }),
        skip: 12,
        take: 12,
      }),
    );
  });
  it.each(["page=0", "page=1.5", "page=100001", "category=" + "a".repeat(81)])(
    "rejects invalid queries: %s",
    async (query) => {
      expect((await client.get(`/api/blog?${query}`)).status).toBe(400);
      expect(prisma.blogPost.findMany).not.toHaveBeenCalled();
    },
  );
  it("returns 404 for private, removed or nonexistent slugs", async () => {
    vi.mocked(prisma.blogPost.findFirst).mockResolvedValue(null);
    expect((await client.get("/api/blog/private")).status).toBe(404);
    const html = await client.get("/blog/private");
    expect(html.status).toBe(404);
    expect(html.text).toContain('name="robots" content="noindex, follow"');
    expect(html.text).not.toContain("A better guest experience.");
    expect((await client.get("/blog/private/nested")).status).toBe(404);
  });
  it("serves article metadata, escaped structured data and readable body without JavaScript", async () => {
    const response = await client.get("/blog/guest-guides?tracking=ignored");
    expect(response.status).toBe(200);
    expect(response.text).toContain("<title>Guest Guides &lt;&amp;&gt; | SeatPing</title>");
    expect(response.text).toContain('<meta property="og:type" content="article"');
    expect(response.text).toContain(`rel="canonical" href="${SITE_URL}/blog/guest-guides"`);
    expect(response.text).toContain("<p>A better guest experience.</p>");
    expect(response.text).toContain('type="application/ld+json"');
    expect(response.text).toContain('"headline":"Guest Guides \\u003c&>"');
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("serves crawlable listing links, category links and pagination with canonical query values", async () => {
    vi.mocked(prisma.blogPost.count).mockResolvedValue(25);
    const response = await client.get("/blog?category=Guides&page=2&tracking=ignored");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/blog/guest-guides"');
    expect(response.text).toContain("Page 1");
    expect(response.text).toContain("Page 3");
    expect(response.text).toContain(
      'rel="canonical" href="https://www.seatping.biz/blog?category=Guides&amp;page=2"',
    );
    expect(response.text).not.toContain("tracking");
    expect((await client.get("/blog?page=100")).status).toBe(404);
    expect((await client.get("/blog?page=bad")).status).toBe(400);
  });
  it("returns a sitemap containing only public posts and fresh modification dates", async () => {
    const response = await client.get("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.type).toBe("application/xml");
    expect(response.text).toContain(`${SITE_URL}/blog/guest-guides`);
    expect(response.text).toContain("<lastmod>2026-01-02T00:00:00.000Z</lastmod>");
    expect(prisma.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PUBLISHED", publishedAt: { lte: expect.any(Date) } },
      }),
    );
  });
  it("reports failures separately from successful empty results across API, HTML and sitemap", async () => {
    vi.mocked(prisma.blogPost.findMany).mockResolvedValue([]);
    vi.mocked(prisma.blogPost.count).mockResolvedValue(0);
    expect((await client.get("/api/blog")).body.posts).toEqual([]);
    expect((await client.get("/blog")).text).toContain("No Articles Yet");
    vi.mocked(prisma.blogPost.findMany).mockRejectedValue(new Error("Unavailable"));
    vi.mocked(prisma.blogPost.findFirst).mockRejectedValue(new Error("Unavailable"));
    for (const path of [
      "/api/blog",
      "/api/blog/guest-guides",
      "/blog",
      "/blog/guest-guides",
      "/sitemap.xml",
    ]) {
      expect((await client.get(path)).status).toBe(503);
    }
  });
});

describe("Safe Shared Article Rendering", () => {
  it("uses the first frame of managed video covers as an image thumbnail", () => {
    const video = "https://res.cloudinary.com/test/video/upload/v123/dining-room.mp4";
    expect(isBlogCoverVideo(video)).toBe(true);
    expect(blogCoverThumbnail(video)).toBe(
      "https://res.cloudinary.com/test/video/upload/so_0/v123/dining-room.jpg",
    );
    for (const image of [
      "",
      "invalid",
      "https://example.com/video.mp4",
      "https://res.cloudinary.com/test/image/upload/image.jpg",
    ]) {
      expect(isBlogCoverVideo(image)).toBe(false);
      expect(blogCoverThumbnail(image)).toBe(image);
    }
  });
  it("escapes article text and formats links, headings, lists, code, callouts, images and tables", () => {
    const text: BlogNode = {
      type: "text",
      text: '<script> & "quote"',
      marks: [
        { type: "bold" },
        { type: "italic" },
        { type: "link", attrs: { href: "https://example.com/?a=1&b=2" } },
      ],
    };
    const paragraph: BlogNode = { type: "paragraph", content: [text, { type: "hardBreak" }] };
    const content: BlogNode = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Guide" }],
        },
        paragraph,
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph] }] },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [paragraph] }],
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [paragraph] },
            { type: "taskItem", attrs: { checked: false }, content: [paragraph] },
          ],
        },
        { type: "blockquote", content: [paragraph] },
        { type: "callout", content: [paragraph] },
        { type: "codeBlock", content: [{ type: "text", text: "<code>" }] },
        { type: "horizontalRule" },
        {
          type: "image",
          attrs: {
            src: "https://example.com/image.png",
            alt: 'A "cover"',
            caption: "A caption",
            alignment: "right",
            width: 500,
            height: 300,
          },
        },
        { type: "image", attrs: { src: "https://example.com/image.png" } },
        {
          type: "video",
          attrs: { src: "https://www.youtube-nocookie.com/embed/abcdefghijk", embed: true },
        },
        {
          type: "video",
          attrs: { src: "https://res.cloudinary.com/test/video/upload/video.mp4", embed: false },
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, align: "center" },
                  content: [paragraph],
                },
                { type: "tableCell", content: [paragraph] },
              ],
            },
          ],
        },
      ],
    };
    const html = renderBlogContent(content);
    expect(html).not.toContain("<script>");
    for (const fragment of [
      '<h2 style="text-align:center">Guide</h2>',
      "<strong>",
      "<em>",
      "<br>",
      '<ol start="3">',
      'data-type="taskList"',
      "disabled checked",
      "<blockquote>",
      "<aside data-callout>",
      "<pre><code>&lt;code&gt;",
      "<figcaption>A caption</figcaption>",
      'width="500" height="300"',
      "sandbox=",
      "<video",
      '<th colspan="2" rowspan="1" style="text-align:center">',
    ]) {
      expect(html).toContain(fragment);
    }
  });
  it("rejects unsafe links, media and unrecognized content before rendering", () => {
    for (const node of [
      { type: "script" },
      { type: "image", attrs: { src: "javascript:alert(1)" } },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Click",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ]) {
      expect(() => renderBlogContent({ type: "doc", content: [node] })).toThrow();
    }
  });
  it("derives descriptions, encodes URLs and emits article schema", () => {
    const source = stored();
    const post = {
      ...source,
      publishedAt: source.publishedAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    };
    expect(blogDescription({ ...post, excerpt: "" })).toBe("A better guest experience.");
    expect(blogPath("a/b")).toBe("/blog/a%2Fb");
    expect(blogStructuredData(post, SITE_URL).image).toBeUndefined();
    expect(
      blogStructuredData({ ...post, coverUrl: "https://example.com/cover.png" }, SITE_URL).image,
    ).toBe("https://example.com/cover.png");
  });
});

describe("Blog SEO Regression Coverage", () => {
  it("emits accurate author, publisher, breadcrumb and social metadata for each article", async () => {
    vi.mocked(prisma.blogPost.findFirst).mockResolvedValue({
      ...stored(),
      coverUrl: "https://example.com/cover.jpg",
    });
    const response = await client.get("/blog/guest-guides");
    const match = response.text.match(
      /<script id="page-structured-data" type="application\/ld\+json">(.*?)<\/script>/,
    );
    const data = JSON.parse(match![1]);
    expect(data.author).toEqual({
      "@type": "Organization",
      name: "SeatPing Team",
      url: `${SITE_URL}/`,
    });
    expect(data.publisher.logo.url).toBe(`${SITE_URL}/logo_nobg.png`);
    expect(data.datePublished).toBe("2026-01-01T00:00:00.000Z");
    expect(data.dateModified).toBe("2026-01-02T00:00:00.000Z");
    expect(data.mainEntityOfPage.breadcrumb.itemListElement).toHaveLength(3);
    expect(data.mainEntityOfPage["@id"]).toBe(`${SITE_URL}/blog/guest-guides`);
    for (const fragment of [
      'property="og:image" content="https://example.com/cover.jpg"',
      'name="twitter:image" content="https://example.com/cover.jpg"',
      'name="author" content="SeatPing Team"',
      'property="article:published_time" content="2026-01-01T00:00:00.000Z"',
      'property="article:modified_time" content="2026-01-02T00:00:00.000Z"',
    ]) {
      expect(response.text).toContain(fragment);
    }
    vi.mocked(prisma.blogPost.findFirst).mockResolvedValue({
      ...stored(),
      title: "Another Article",
      excerpt: "Another description.",
      slug: "another-article",
      author: "Alex",
    });
    const next = await client.get("/blog/another-article");
    expect(next.text).toContain("<title>Another Article | SeatPing</title>");
    expect(next.text).toContain('name="description" content="Another description."');
    expect(next.text).toContain('"@type":"Person","name":"Alex"');
    expect(next.text).not.toContain("guest-guides");
  });
  it("preserves existing article rendering while improving server metadata", () => {
    const content = {
      type: "doc",
      content: [1, 3, 2, 1].map((level) => ({
        type: "heading",
        attrs: { level },
        content: [{ type: "text", text: "Heading" }],
      })),
    };
    const html = renderBlogContent(content);
    expect(html).toBe("<h1>Heading</h1><h3>Heading</h3><h2>Heading</h2><h1>Heading</h1>");
    const link = renderBlogContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Business",
              marks: [{ type: "link", attrs: { href: `${SITE_URL}/business` } }],
            },
          ],
        },
      ],
    });
    expect(link).toContain(`href="${SITE_URL}/business"`);
    expect(link).toContain('rel="noopener noreferrer nofollow"');
    const long = blogDescription({
      excerpt: "A useful guide for restaurant teams. ".repeat(20),
      content: stored().content,
    });
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("...")).toBe(true);
  });
  it("gives category and paginated listings distinct metadata", async () => {
    vi.mocked(prisma.blogPost.count).mockResolvedValue(30);
    const response = await client.get("/blog?category=Guides&page=2");
    expect(response.text).toContain("<title>Page 2: Guides Articles | SeatPing Blog</title>");
    expect(response.text).toContain('name="description" content="Page 2. Explore Guides articles');
  });
  it("splits large sitemaps without dropping posts or inventing modification dates", async () => {
    vi.mocked(prisma.blogPost.count).mockResolvedValue(10001);
    const index = await client.get("/sitemap.xml");
    expect(index.text).toContain("<sitemapindex");
    expect(index.text).toContain(`${SITE_URL}/sitemap.xml?page=2`);
    expect(index.text).not.toContain("lastmod");
    const second = await client.get("/sitemap.xml?page=2");
    expect(second.text).toContain("<urlset");
    expect(prisma.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10000, take: 10000 }),
    );
    expect(second.text).not.toContain(`<loc>${SITE_URL}/</loc>`);
    expect((await client.get("/sitemap.xml?page=3")).status).toBe(404);
    expect((await client.get("/sitemap.xml?page=0")).status).toBe(400);
  });
});
