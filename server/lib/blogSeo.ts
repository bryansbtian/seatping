import { PUBLIC_PAGE_COPY } from "../../shared/pageMeta.js";
import { blogText, type BlogFields } from "../../shared/blog.js";
import { blogPath, type PublicBlogPost } from "../../shared/publicBlog.js";
import { blogCoverThumbnail } from "../../shared/blogMedia.js";
const BLOG_DESCRIPTION = PUBLIC_PAGE_COPY["/blog"].description;

export function blogDescription(post: Pick<BlogFields, "excerpt" | "content">): string {
  const text = (post.excerpt.trim() || blogText(post.content).trim()).replace(/\s+/g, " ");
  if (text.length <= 160) {
    return text;
  }
  const shortened = text.slice(0, 157);
  const boundary = shortened.lastIndexOf(" ");
  if (boundary > 100) {
    return `${shortened.slice(0, boundary)}...`;
  }
  return `${shortened}...`;
}

export function blogStructuredData(post: PublicBlogPost, siteUrl: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: blogDescription(post),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: blogAuthor(post.author, siteUrl),
    publisher: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "SeatPing",
      url: `${siteUrl}/`,
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo_nobg.png` },
    },
    url: `${siteUrl}${blogPath(post.slug)}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}${blogPath(post.slug)}`,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: `${siteUrl}${blogPath(post.slug)}`,
          },
        ],
      },
    },
    keywords: post.tags.join(", "),
    articleSection: post.category,
  };
  if (post.coverUrl) {
    data.image = blogCoverThumbnail(post.coverUrl);
  }
  return data;
}

function blogAuthor(name: string, siteUrl: string): Record<string, unknown> {
  if (/^seatping(?: team)?$/i.test(name.trim())) {
    return { "@type": "Organization", name, url: `${siteUrl}/` };
  }
  return { "@type": "Person", name };
}

export function blogListMeta(category: string, page: number) {
  let title = PUBLIC_PAGE_COPY["/blog"].title;
  let description = BLOG_DESCRIPTION;
  if (category) {
    title = `${category} Articles | SeatPing Blog`;
    description = `Explore ${category} articles from the SeatPing blog. ${BLOG_DESCRIPTION}`;
  }
  if (page > 1) {
    title = `Page ${page}: ${title}`;
    description = `Page ${page}. ${description}`;
  }
  return { title, description };
}
