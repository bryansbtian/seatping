
export const SITE_URL = "https://www.seatping.biz";

export type PageMeta = {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
};

const CUSTOMER: Omit<PageMeta, "url"> = {
  title: "SeatPing | Find Restaurants, Book Tables, and Join Queues",
  description:
    "Discover restaurants, check availability, book tables, and join queues with SeatPing.",
  image: `${SITE_URL}/display2.jpeg`,
  type: "website",
};

const BUSINESS: Omit<PageMeta, "url"> = {
  title: "SeatPing for Business | Queues, Reservations, and Guest CRM",
  description:
    "Manage queues, reservations, Guest CRM, and campaigns from one simple dashboard built for restaurants and service businesses.",
  image: `${SITE_URL}/display.jpeg`,
  type: "website",
};

export function isBusinessPath(pathname: string): boolean {
  return pathname === "/business" || pathname.startsWith("/business/");
}

export function metaForPath(pathname: string): PageMeta {
  const base = isBusinessPath(pathname) ? BUSINESS : CUSTOMER;
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return { ...base, url: `${SITE_URL}${clean === "/" ? "/" : clean}` };
}

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

export function injectSeo(template: string, pathname: string): string {
  if (!SEO_BLOCK_RE.test(template)) return template;
  const block = `<!-- SEO:START -->\n    ${renderSeoTags(
    metaForPath(pathname),
  )}\n    <!-- SEO:END -->`;
  return template.replace(SEO_BLOCK_RE, block);
}
