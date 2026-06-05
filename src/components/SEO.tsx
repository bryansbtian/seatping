/**
 * Route-aware SEO helper.
 *
 * SeatPing serves two audiences from one app: customers (public `/` homepage,
 * search, restaurant pages, customer auth) and businesses (`/business` marketing
 * + auth + dashboard). `index.html` ships the customer-facing defaults so the
 * public homepage has correct SEO before React boots; this component then keeps
 * the document head in sync as the SPA navigates between routes.
 *
 * It updates existing tags in place (and only creates one if missing), so it
 * never produces duplicate `<meta>`/`<link>` tags alongside the ones in
 * `index.html`.
 */
import { useEffect } from "react";

const SITE_URL = "https://www.seatping.biz";

/** Shared, audience-specific descriptions reused across pages. */
export const CUSTOMER_DESCRIPTION =
  "Discover restaurants, check availability, book tables, and join queues with SeatPing. A simple way to plan dining and reduce waiting time.";

export const BUSINESS_DESCRIPTION =
  "SeatPing helps restaurants manage reservations, waitlists, queues, customer notifications, and daily front-of-house operations from one simple platform.";

type SEOProps = {
  title: string;
  description: string;
  /** Defaults to `title` when omitted. */
  ogTitle?: string;
  /** Defaults to `description` when omitted. */
  ogDescription?: string;
  /** Absolute or root-relative URL. Root-relative is resolved against SITE_URL. */
  canonical?: string;
};

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
  canonical,
}: SEOProps) {
  useEffect(() => {
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", ogTitle ?? title);
    setMeta("property", "og:description", ogDescription ?? description);
    setMeta("name", "twitter:title", ogTitle ?? title);
    setMeta("name", "twitter:description", ogDescription ?? description);

    if (canonical) {
      const href = canonical.startsWith("http")
        ? canonical
        : `${SITE_URL}${canonical.startsWith("/") ? "" : "/"}${canonical}`;
      setCanonical(href);
    }
  }, [title, description, ogTitle, ogDescription, canonical]);

  return null;
}
