/**
 * Route-aware SEO helper (client side).
 *
 * SeatPing serves two audiences from one app: customers (public `/` homepage,
 * search, restaurant pages, customer auth) and businesses (`/business` marketing
 * + auth + dashboard).
 *
 * The authoritative metadata for crawlers (WhatsApp, iMessage, Facebook,
 * LinkedIn, X) is injected into the raw HTML by the server, keyed off the
 * request path, because those crawlers do not run JavaScript. See
 * `server/lib/pageMeta.ts`. This component keeps the document head in sync as
 * the SPA navigates between routes so the browser tab, and any crawler that
 * does execute JS, always reflect the current page, and so customer metadata
 * never lingers on a business route after a client-side navigation.
 *
 * It updates existing tags in place (and only creates one if missing), so it
 * never produces duplicate `<meta>`/`<link>` tags alongside the ones in
 * `index.html`.
 */
import { useEffect } from "react";

export const SITE_URL = "https://www.seatping.biz";

/** Shared, audience-specific descriptions reused across pages. */
export const CUSTOMER_DESCRIPTION =
  "Discover restaurants, check availability, book tables, and join queues with SeatPing.";

export const BUSINESS_DESCRIPTION =
  "Manage queues, reservations, Guest CRM, and campaigns from one simple dashboard built for restaurants and service businesses.";

/** Audience-specific social preview images (absolute URLs). */
export const CUSTOMER_IMAGE = `${SITE_URL}/display2.jpeg`;
export const BUSINESS_IMAGE = `${SITE_URL}/display.jpeg`;

type SEOProps = {
  title: string;
  description: string;
  /** Defaults to `title` when omitted. */
  ogTitle?: string;
  /** Defaults to `description` when omitted. */
  ogDescription?: string;
  /** Absolute social preview image URL. Defaults to the customer image. */
  image?: string;
  /** Absolute or root-relative URL. Root-relative is resolved against SITE_URL. */
  canonical?: string;
  /** og:type, defaults to "website". */
  type?: string;
};

/** Resolve an absolute URL from an absolute or root-relative value. */
function absoluteUrl(value: string): string {
  return value.startsWith("http")
    ? value
    : `${SITE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** Upsert a `<meta>` tag identified by its name/property attribute. */
function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Upsert the canonical `<link rel="canonical">`. */
function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function SEO({
  title,
  description,
  ogTitle,
  ogDescription,
  image = CUSTOMER_IMAGE,
  canonical,
  type = "website",
}: SEOProps) {
  useEffect(() => {
    document.title = title;
    setMeta("name", "description", description);

    setMeta("property", "og:title", ogTitle ?? title);
    setMeta("property", "og:description", ogDescription ?? description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:image", image);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", ogTitle ?? title);
    setMeta("name", "twitter:description", ogDescription ?? description);
    setMeta("name", "twitter:image", image);

    if (canonical) {
      const href = absoluteUrl(canonical);
      setCanonical(href);
      setMeta("property", "og:url", href);
    }
  }, [title, description, ogTitle, ogDescription, image, canonical, type]);

  return null;
}
