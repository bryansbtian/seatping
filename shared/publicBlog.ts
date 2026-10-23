import { blogContentSchema, blogText, type BlogFields } from "./blog.js";
import { blogCoverThumbnail } from "./blogMedia.js";

export const BLOG_TITLE = "Stories For Better Guest Experiences";
export const BLOG_DESCRIPTION =
  "Ideas, guides, and updates on restaurant discovery, queues, reservations, and building lasting guest relationships.";

export type PublicBlogPost = BlogFields & { publishedAt: string; updatedAt: string };
export type PublicBlogSummary = Omit<PublicBlogPost, "content"> & { readingMinutes: number };
export type PublicBlogList = {
  posts: PublicBlogSummary[];
  categories: string[];
  page: number;
  totalPages: number;
};

export function blogPath(slug: string): string {
  return `/blog/${encodeURIComponent(slug)}`;
}

export function blogDescription(post: Pick<BlogFields, "excerpt" | "content">): string {
  return (post.excerpt.trim() || blogText(post.content).trim()).slice(0, 160);
}

export function escapeBlogHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBlogContent(value: unknown): string {
  const root = blogContentSchema.parse(value);
  function render(node: typeof root): string {
    const attrs = node.attrs ?? {};
    const content = (node.content ?? []).map(render).join("");
    const attr = (key: string) => escapeBlogHtml(String(attrs[key] ?? ""));
    let alignment = "";
    if (attrs.textAlign) {
      alignment = ` style="text-align:${attr("textAlign")}"`;
    }
    if (node.type === "text") {
      let text = escapeBlogHtml(node.text || "");
      const tags: Record<string, string> = {
        bold: "strong",
        italic: "em",
        underline: "u",
        strike: "s",
        code: "code",
      };
      for (const mark of node.marks ?? []) {
        if (mark.type === "link") {
          const href = escapeBlogHtml(String(mark.attrs?.href));
          text = `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
        } else {
          const tag = tags[mark.type];
          text = `<${tag}>${text}</${tag}>`;
        }
      }
      return text;
    }
    switch (node.type) {
      case "doc":
        return content;
      case "paragraph":
        return `<p${alignment}>${content}</p>`;
      case "heading":
        return `<h${attr("level")}${alignment}>${content}</h${attr("level")}>`;
      case "hardBreak":
        return "<br>";
      case "horizontalRule":
        return "<hr>";
      case "bulletList":
        return `<ul>${content}</ul>`;
      case "orderedList":
        return `<ol start="${Number(attrs.start) || 1}">${content}</ol>`;
      case "listItem":
        return `<li>${content}</li>`;
      case "taskList":
        return `<ul data-type="taskList">${content}</ul>`;
      case "taskItem": {
        let checked = "";
        if (attrs.checked) {
          checked = " checked";
        }
        return `<li><label><input type="checkbox" aria-label="Task Completed" disabled${checked}></label><div>${content}</div></li>`;
      }
      case "blockquote":
        return `<blockquote>${content}</blockquote>`;
      case "callout":
        return `<aside data-callout>${content}</aside>`;
      case "codeBlock":
        return `<pre><code>${content}</code></pre>`;
      case "image": {
        let dimensions = "";
        for (const dimension of ["width", "height"]) {
          if (attrs[dimension]) {
            dimensions += ` ${dimension}="${attr(dimension)}"`;
          }
        }
        let caption = "";
        if (attrs.caption) {
          caption = `<figcaption>${attr("caption")}</figcaption>`;
        }
        return `<figure data-alignment="${attr("alignment")}"><img src="${attr("src")}" alt="${attr("alt")}" loading="lazy"${dimensions}>${caption}</figure>`;
      }
      case "video":
        if (attrs.embed) {
          return `<div data-blog-video><iframe src="${attr("src")}" title="Embedded Video" loading="lazy" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture"></iframe></div>`;
        }
        return `<video src="${attr("src")}" controls preload="metadata"></video>`;
      case "table":
        return `<div class="tableWrapper"><table><tbody>${content}</tbody></table></div>`;
      case "tableRow":
        return `<tr>${content}</tr>`;
      case "tableHeader":
      case "tableCell": {
        let tag = "td";
        if (node.type === "tableHeader") {
          tag = "th";
        }
        let cellAlignment = "";
        if (["left", "center", "right", "justify"].includes(String(attrs.align))) {
          cellAlignment = ` style="text-align:${attr("align")}"`;
        }
        return `<${tag} colspan="${Number(attrs.colspan) || 1}" rowspan="${Number(attrs.rowspan) || 1}"${cellAlignment}>${content}</${tag}>`;
      }
      default:
        return "";
    }
  }
  return render(root);
}

export function blogStructuredData(post: PublicBlogPost, siteUrl: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: blogDescription(post),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.author },
    publisher: { "@type": "Organization", name: "SeatPing", url: siteUrl },
    mainEntityOfPage: `${siteUrl}${blogPath(post.slug)}`,
    keywords: post.tags.join(", "),
    articleSection: post.category,
  };
  if (post.coverUrl) {
    data.image = blogCoverThumbnail(post.coverUrl);
  }
  return data;
}
