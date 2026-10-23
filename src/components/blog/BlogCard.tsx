import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon } from "@hugeicons/core-free-icons";
import { blogCoverThumbnail } from "@shared/blogMedia";
import { blogPath, type PublicBlogSummary } from "@shared/publicBlog";

export default function BlogCard({ post }: { post: PublicBlogSummary }) {
  return (
    <article className="group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
      <Link
        to={blogPath(post.slug)}
        className="flex h-full min-w-0 flex-col rounded-2xl outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
      >
        <div className="aspect-[8/5] overflow-hidden rounded-t-2xl bg-slate-100">
          {post.coverUrl && (
            <img
              src={blogCoverThumbnail(post.coverUrl)}
              alt={post.coverAlt}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
            />
          )}
          {!post.coverUrl && (
            <div className="flex size-full items-center justify-center text-slate-300">
              <HugeiconsIcon icon={BookOpen01Icon} className="size-12" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="flex min-h-64 flex-1 flex-col items-start gap-4 p-6 sm:p-7">
          <h2 className="break-words text-xl font-medium leading-snug tracking-tight sm:text-2xl">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="line-clamp-3 text-body leading-relaxed text-ink-subtle">{post.excerpt}</p>
          )}
          <div className="mt-auto flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-6 text-caption text-ink-subtle">
            <span className="max-w-full truncate font-medium text-ink">{post.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{post.readingMinutes} Min Read</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
