import { metaForPath, type PageMeta } from "../../shared/pageMeta.js";
export { SITE_URL, metaForPath, isBusinessPath, type PageMeta } from "../../shared/pageMeta.js";

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
  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="author" content="${attr(meta.author || "SeatPing")}" />`,
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
  ];
  if (meta.publishedAt) {
    tags.push(`<meta property="article:published_time" content="${attr(meta.publishedAt)}" />`);
  }
  if (meta.updatedAt) {
    tags.push(`<meta property="article:modified_time" content="${attr(meta.updatedAt)}" />`);
  }
  if (meta.robots) {
    tags.push(`<meta name="robots" content="${attr(meta.robots)}" />`);
  }
  if (meta.structuredData) {
    const json = JSON.stringify(meta.structuredData).replace(/</g, "\\u003c");
    tags.push(`<script id="page-structured-data" type="application/ld+json">${json}</script>`);
  }
  return tags.join("\n    ");
}

const SEO_BLOCK_RE = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;

export function injectSeo(
  template: string,
  pathname: string,
  meta = metaForPath(pathname),
): string {
  if (!SEO_BLOCK_RE.test(template)) {
    return template;
  }
  const block = `<!-- SEO:START -->\n    ${renderSeoTags(meta)}\n    <!-- SEO:END -->`;
  const withoutStaticSchemas = template.replace(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  return withoutStaticSchemas.replace(SEO_BLOCK_RE, () => block);
}
