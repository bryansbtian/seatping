import { useEffect } from "react";

export const SITE_URL = "https://www.seatping.biz";

export const CUSTOMER_DESCRIPTION =
  "Discover restaurants, check availability, book tables, and join queues with SeatPing.";

export const BUSINESS_DESCRIPTION =
  "Manage queues, reservations, Guest CRM, and campaigns from one simple dashboard built for restaurants and service businesses.";

export const CUSTOMER_IMAGE = `${SITE_URL}/display2.jpeg`;
export const BUSINESS_IMAGE = `${SITE_URL}/display.jpeg`;

type SEOProps = {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  image?: string;
  canonical?: string;
  type?: string;
};

function absoluteUrl(value: string): string {
  if (value.startsWith("http")) {
    return value;
  }
  let separator: string;
  if (value.startsWith("/")) {
    separator = "";
  } else {
    separator = "/";
  }
  return `${SITE_URL}${separator}${value}`;
}

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
