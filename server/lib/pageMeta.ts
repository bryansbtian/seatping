/**
 * Route-aware page metadata for crawlers (WhatsApp, iMessage, Facebook,
 * LinkedIn, X, etc.).
 *
 * SeatPing is a Vite SPA: every route is served the same static `index.html`,
 * so social crawlers, which read raw HTML and do not run JavaScript, would
 * otherwise see the customer-facing preview on every URL, including the
 * business side. To fix that, the server injects the correct Open Graph /
 * Twitter / title / canonical tags into the HTML based on the request path
 * before the SPA boots (see `injectSeo` + its use in `server/index.ts`).
 *
 * `index.html` ships the customer defaults between the
 * `<!-- SEO:START -->` / `<!-- SEO:END -->` markers; `injectSeo` swaps that
 * block out for business metadata on `/business` and `/business/*`.
 */

export const SITE_URL = "https://www.seatping.biz";

export type PageMeta = {
  title: string;
  description: string;
  image: string;
  /** Absolute URL for og:url + canonical. */
  url: string;
  type: string;
};

/** Customer (consumer) side: the public homepage and discovery routes. */
const CUSTOMER: Omit<PageMeta, "url"> = {
  title: "SeatPing | Find Restaurants, Book Tables, and Join Queues",
  description:
    "Discover restaurants, check availability, book tables, and join queues with SeatPing.",
  image: `${SITE_URL}/display2.jpeg`,
  type: "website",
};

/** Business side: the `/business` marketing page and operator dashboard. */
const BUSINESS: Omit<PageMeta, "url"> = {
  title: "SeatPing for Business | Queues, Reservations, and Guest CRM",
  description:
    "Manage queues, reservations, Guest CRM, and campaigns from one simple dashboard built for restaurants and service businesses.",
  image: `${SITE_URL}/display.jpeg`,
  type: "website",
};

/** True for the business marketing page and every business sub-route. */
export function isBusinessPath(pathname: string): boolean {
  return pathname === "/business" || pathname.startsWith("/business/");
}

/** Resolve the metadata (with an absolute canonical URL) for a request path. */
export function metaForPath(pathname: string): PageMeta {
  const base = isBusinessPath(pathname) ? BUSINESS : CUSTOMER;
  // Normalize: strip a trailing slash (except the root) and any query/hash
  // that may have leaked in, then make it absolute.
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return { ...base, url: `${SITE_URL}${clean === "/" ? "/" : clean}` };
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render the full SEO `<head>` block (the bit between the SEO markers). */
export function renderSeoTags(meta: PageMeta): string {
  const t = attr(meta.title);
  const d = attr(meta.description);
  const img = attr(meta.image);
  const url = attr(meta.url);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="author" content="SeatPing" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:type" content="${attr(meta.type)}" />`,
    `<meta property="og:site_name" content="SeatPing" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<link rel="canonical" href="${url}" />`,
  ].join("\n    ");
}

const SEO_BLOCK_RE = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;

/**
 * Replace the marked SEO block in an `index.html` template with metadata
 * resolved from the request path. If the markers are missing (e.g. the
 * template changed), the template is returned unchanged so the page still
 * renders with its built-in defaults.
 */
export function injectSeo(template: string, pathname: string): string {
  if (!SEO_BLOCK_RE.test(template)) return template;
  const block = `<!-- SEO:START -->\n    ${renderSeoTags(
    metaForPath(pathname),
  )}\n    <!-- SEO:END -->`;
  return template.replace(SEO_BLOCK_RE, block);
}
