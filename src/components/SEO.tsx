import { useEffect } from "react";
import { usePublicLanguage } from "@/lib/publicLanguage";
import { isPrivatePath } from "@shared/pageMeta";
import {
  localizedPublicPath,
  isLocalizedPublicPath,
  unlocalizedPath,
} from "@shared/publicLanguage";

export const SITE_URL = "https://www.seatping.biz";

export const CUSTOMER_DESCRIPTION =
  "Discover restaurants, check availability, book tables, and join queues with SeatPing.";

export const BUSINESS_DESCRIPTION =
  "Restaurant floor management, table management, virtual waitlist, reservations with Smart Table Assignment, Guest CRM, and campaigns from one simple dashboard.";

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
  robots?: string;
  structuredData?: Record<string, unknown>;
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
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
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
  robots = "index, follow",
  structuredData,
}: SEOProps) {
  const { lang, t } = usePublicLanguage();
  useEffect(() => {
    let pageRobots = robots;
    if (isPrivatePath(window.location.pathname)) {
      pageRobots = "noindex, follow";
    }
    document.title = t(title);
    setMeta("name", "description", t(description));
    setMeta("name", "robots", pageRobots);
    let structured = document.getElementById("page-structured-data");
    if (structuredData) {
      if (!structured) {
        structured = document.createElement("script");
        structured.id = "page-structured-data";
        structured.setAttribute("type", "application/ld+json");
        document.head.appendChild(structured);
      }
      structured.textContent = JSON.stringify(structuredData).replace(/</g, "\\u003c");
    } else {
      structured?.remove();
    }

    setMeta("property", "og:title", t(ogTitle ?? title));
    setMeta("property", "og:description", t(ogDescription ?? description));
    setMeta("property", "og:type", type);
    setMeta("property", "og:image", image);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", t(ogTitle ?? title));
    setMeta("name", "twitter:description", t(ogDescription ?? description));
    setMeta("name", "twitter:image", image);

    if (canonical) {
      let canonicalPath = canonical;
      if (canonical.startsWith(`${SITE_URL}/`)) {
        canonicalPath = canonical.slice(SITE_URL.length);
      }
      const href = absoluteUrl(localizedPublicPath(canonicalPath, lang));
      setCanonical(href);
      setMeta("property", "og:url", href);
    }
    document.head
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((link) => link.remove());
    const pathname = window.location.pathname;
    if (pageRobots === "index, follow" && isLocalizedPublicPath(pathname)) {
      const basePath = unlocalizedPath(pathname);
      for (const language of ["en", "id", "x-default"] as const) {
        let targetLanguage: "en" | "id" = "en";
        if (language === "id") {
          targetLanguage = "id";
        }
        const link = document.createElement("link");
        link.rel = "alternate";
        link.hreflang = language;
        link.href = absoluteUrl(localizedPublicPath(basePath, targetLanguage));
        document.head.appendChild(link);
      }
    }
  }, [
    title,
    description,
    ogTitle,
    ogDescription,
    image,
    canonical,
    type,
    robots,
    structuredData,
    lang,
    t,
  ]);

  return null;
}
