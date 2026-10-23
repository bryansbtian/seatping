import { restaurantSeo } from "../lib/restaurantSeo.js";
import { ENTITY_ID_RE } from "../lib/entityId.js";
import { Router } from "express";
import { injectSeo } from "../lib/pageMeta.js";
import { metaForPath, PUBLIC_PAGE_COPY, isPrivatePath } from "../../shared/pageMeta.js";
import { escapeBlogHtml as escape } from "../../shared/publicBlog.js";

export function createSeoPagesRouter(template: () => string): Router {
  const router = Router();
  router.get("/{*path}", async (req, res, next) => {
    if (
      /^\/(api|auth|tickets)(\/|$)/.test(req.path) ||
      (req.path.includes(".") && req.path !== "/index.html")
    ) {
      return next();
    }
    const pathname = req.path.replace(/\/+$/, "") || "/";
    let meta = metaForPath(pathname);
    let status = 200;
    let body = "";
    if (PUBLIC_PAGE_COPY[pathname]) {
      body = `<nav aria-label="Main Navigation"><a href="/">SeatPing</a> <a href="/business">For Business</a> <a href="/blog">Blog</a></nav><h1>${escape(meta.title.split(" | ")[0])}</h1><p>${escape(meta.description)}</p>`;
    } else if (!isPrivatePath(pathname)) {
      const match = pathname.match(/^\/(?:restaurants\/)?([^/]+)\/([^/]+)$/);
      let restaurant = null;
      if (match && ENTITY_ID_RE.test(match[2])) {
        try {
          restaurant = await restaurantSeo(decodeURIComponent(match[1]), match[2]);
        } catch {
          status = 503;
          meta.title = "Page Unavailable | SeatPing";
          meta.robots = "noindex, follow";
          body = '<h1>Unable To Load This Page</h1><a href="/">Go Home</a>';
        }
      }
      if (restaurant) {
        meta = restaurant.meta;
        body = restaurant.body;
      } else if (status !== 503) {
        status = 404;
        meta.title = "Page Not Found | SeatPing";
        meta.description =
          "This page could not be found. Explore SeatPing restaurant discovery and business tools.";
        meta.robots = "noindex, follow";
        body = '<h1>Page Not Found</h1><a href="/">Go Home</a>';
      }
    }
    res.set("Cache-Control", "no-store");
    if (meta.robots?.includes("noindex")) {
      res.set("X-Robots-Tag", "noindex, follow");
    }
    const html = injectSeo(template(), pathname, meta).replace(
      '<div id="root"></div>',
      () => `<div id="root"><main class="container mx-auto px-4 py-12">${body}</main></div>`,
    );
    return res.status(status).type("html").send(html);
  });
  return router;
}
