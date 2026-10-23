import { blogDescription, blogListMeta, blogStructuredData } from "../lib/blogSeo.js";
import { INDEXABLE_STATIC_PATHS } from "../../shared/pageMeta.js";
import { Router } from "express";
import { blogCoverThumbnail, isBlogCoverVideo } from "../../shared/blogMedia.js";
import { prisma } from "../lib/prisma.js";
import { injectSeo, SITE_URL, type PageMeta } from "../lib/pageMeta.js";
import {
  findPublicBlog,
  listPublicBlog,
  publicBlogQuery,
  publishedBlogWhere,
} from "../lib/publicBlog.js";
import {
  BLOG_DESCRIPTION,
  BLOG_TITLE,
  blogPath,
  escapeBlogHtml as escape,
  renderBlogContent,
} from "../../shared/publicBlog.js";

function page(template: string, meta: PageMeta, body: string): string {
  return injectSeo(template, "/blog", meta).replace(
    '<div id="root"></div>',
    () => `<div id="root"><main class="container mx-auto px-4 py-12">${body}</main></div>`,
  );
}

const base: PageMeta = {
  title: blogListMeta("", 1).title,
  description: BLOG_DESCRIPTION,
  image: `${SITE_URL}/display2.jpeg`,
  url: `${SITE_URL}/blog`,
  type: "website",
};

export function createBlogPagesRouter(template: () => string): Router {
  const router = Router();
  router.use(["/blog", "/blog/{*path}"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/blog", async (req, res) => {
    const parsed = publicBlogQuery.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .type("html")
        .send(
          page(
            template(),
            { ...base, robots: "noindex, follow" },
            '<h1>Invalid Blog Query</h1><a href="/blog">Back To Blogs</a>',
          ),
        );
    }
    try {
      const data = await listPublicBlog(parsed.data);
      const search = new URLSearchParams();
      if (parsed.data.category) {
        search.set("category", parsed.data.category);
      }
      if (data.page > 1) {
        search.set("page", String(data.page));
      }
      let canonical = base.url;
      if (search.size) {
        canonical += `?${search}`;
      }
      let body = `<a href="/">SeatPing</a><h1>${BLOG_TITLE}</h1><p>${BLOG_DESCRIPTION}</p><nav aria-label="Blog Categories"><a href="/blog">All</a>`;
      for (const category of data.categories) {
        body += ` <a href="/blog?category=${escape(encodeURIComponent(category))}">${escape(category)}</a>`;
      }
      body += "</nav>";
      for (const post of data.posts) {
        body += `<article><a href="${blogPath(post.slug)}">`;
        if (post.coverUrl) {
          body += `<img src="${escape(blogCoverThumbnail(post.coverUrl))}" alt="${escape(post.coverAlt || post.title)}" width="640" height="400">`;
        }
        body += `<h2>${escape(post.title)}</h2></a><p>${escape(post.excerpt)}</p><time datetime="${post.publishedAt}">${post.publishedAt.slice(0, 10)}</time></article>`;
      }
      if (!data.posts.length) {
        body += "<p>No Articles Yet</p>";
      }
      for (const next of [data.page - 1, data.page + 1]) {
        if (next >= 1 && next <= data.totalPages) {
          search.set("page", String(next));
          body += `<a href="/blog?${escape(search.toString())}">Page ${next}</a>`;
        }
      }
      const meta = { ...base, ...blogListMeta(parsed.data.category, data.page), url: canonical };
      if (data.page > Math.max(1, data.totalPages)) {
        meta.robots = "noindex, follow";
        return res
          .status(404)
          .type("html")
          .send(page(template(), meta, body));
      }
      return res.type("html").send(page(template(), meta, body));
    } catch {
      return res
        .status(503)
        .type("html")
        .send(
          page(
            template(),
            { ...base, robots: "noindex, follow" },
            '<h1>Unable To Load Articles</h1><a href="/blog">Try Again</a>',
          ),
        );
    }
  });
  router.get("/blog/:slug", async (req, res) => {
    try {
      const post = await findPublicBlog(req.params.slug);
      if (!post) {
        return res
          .status(404)
          .type("html")
          .send(
            page(
              template(),
              { ...base, title: "Article Not Found | SeatPing", robots: "noindex, follow" },
              '<h1>Article Not Found</h1><a href="/blog">Back To Blogs</a>',
            ),
          );
      }
      const meta: PageMeta = {
        title: `${post.title} | SeatPing`,
        description: blogDescription(post),
        image: blogCoverThumbnail(post.coverUrl) || base.image,
        url: `${SITE_URL}${blogPath(post.slug)}`,
        type: "article",
        author: post.author,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        structuredData: blogStructuredData(post, SITE_URL),
      };
      let body = `<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a> / <span aria-current="page">${escape(post.title)}</span></nav><article><header><a href="/blog">Back To Blogs</a><p>${escape(post.category)}</p><h1>${escape(post.title)}</h1><p>${escape(post.excerpt)}</p><p>${escape(post.author)}</p><time datetime="${post.publishedAt}">${post.publishedAt.slice(0, 10)}</time></header>`;
      if (post.coverUrl) {
        if (isBlogCoverVideo(post.coverUrl)) {
          body += `<video src="${escape(post.coverUrl)}" poster="${escape(blogCoverThumbnail(post.coverUrl))}" aria-label="${escape(post.coverAlt || "Cover Video")}" controls preload="metadata"></video>`;
        } else {
          body += `<img src="${escape(post.coverUrl)}" alt="${escape(post.coverAlt || post.title)}" width="896" height="504">`;
        }
      }
      body += `<div class="blog-content">${renderBlogContent(post.content)}</div></article>`;
      return res.type("html").send(page(template(), meta, body));
    } catch {
      return res
        .status(503)
        .type("html")
        .send(
          page(
            template(),
            { ...base, robots: "noindex, follow" },
            '<h1>Unable To Load This Article</h1><a href="/blog">Back To Blogs</a>',
          ),
        );
    }
  });
  router.get("/blog/{*path}", (_req, res) => {
    return res
      .status(404)
      .type("html")
      .send(
        page(
          template(),
          { ...base, robots: "noindex, follow" },
          '<h1>Article Not Found</h1><a href="/blog">Back To Blogs</a>',
        ),
      );
  });
  return router;
}

export const sitemapRouter = Router();
sitemapRouter.get("/sitemap.xml", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const where = publishedBlogWhere();
    const total = await prisma.blogPost.count({ where });
    const pages = Math.max(1, Math.ceil(total / 10000));
    if (req.query.page === undefined && pages > 1) {
      const entries = Array.from(
        { length: pages },
        (_, index) => `<sitemap><loc>${SITE_URL}/sitemap.xml?page=${index + 1}</loc></sitemap>`,
      );
      return res
        .type("application/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</sitemapindex>`,
        );
    }
    let pageNumber = 1;
    if (req.query.page !== undefined) {
      if (typeof req.query.page !== "string" || !/^[1-9]\d*$/.test(req.query.page)) {
        return res.status(400).type("text/plain").send("Invalid sitemap page.");
      }
      pageNumber = Number(req.query.page);
    }
    if (!Number.isSafeInteger(pageNumber) || pageNumber > pages) {
      return res.status(404).type("text/plain").send("Sitemap page not found.");
    }
    const posts = await prisma.blogPost.findMany({
      where,
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
      skip: (pageNumber - 1) * 10000,
      take: 10000,
    });
    const entries: string[] = [];
    if (pageNumber === 1) {
      for (const path of INDEXABLE_STATIC_PATHS) {
        entries.push(`<url><loc>${SITE_URL}${path}</loc></url>`);
      }
    }
    for (const post of posts) {
      entries.push(
        `<url><loc>${SITE_URL}${blogPath(post.slug)}</loc><lastmod>${post.updatedAt.toISOString()}</lastmod></url>`,
      );
    }
    return res
      .type("application/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`,
      );
  } catch {
    return res.status(503).type("text/plain").send("Sitemap temporarily unavailable.");
  }
});
