import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { SITE_URL } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PublicBlogLoading from "@/components/blog/PublicBlogLoading";
import { PublicBlogError, publicBlogRequest } from "@/lib/publicBlogApi";
import { readingMinutes } from "@shared/blog";
import {
  blogDescription,
  blogPath,
  blogStructuredData,
  renderBlogContent,
  type PublicBlogPost,
} from "@shared/publicBlog";
import "@/components/blog/blog.css";
import { blogCoverThumbnail, isBlogCoverVideo } from "@shared/blogMedia";
import RelatedBlogPosts from "@/components/blog/RelatedBlogPosts";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

export default function BlogArticle() {
  const { slug = "" } = useParams();
  const query = useQuery({
    queryKey: ["public-blog-article", slug],
    queryFn: ({ signal }) =>
      publicBlogRequest<{ post: PublicBlogPost }>(`/${encodeURIComponent(slug)}`, signal),
    retry: false,
  });
  const post = query.data?.post;
  const html = useMemo(() => {
    if (post) {
      return renderBlogContent(post.content);
    }
    return "";
  }, [post]);
  const missing = query.error instanceof PublicBlogError && query.error.status === 404;
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <Header />
      <main className="container mx-auto min-h-svh flex-1 px-4 pt-[85px] sm:pt-[89px]">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 border-b pb-5 text-caption text-ink-subtle"
        >
          <Link to="/" className="shrink-0 hover:text-ink">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/blog" className="shrink-0 hover:text-ink">
            Blog
          </Link>
          {post && (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="truncate">
                {post.title}
              </span>
            </>
          )}
        </nav>
        {query.isPending && <PublicBlogLoading article />}
        {query.isError && (
          <div
            role="alert"
            className="mx-auto flex min-h-[calc(100svh-220px)] max-w-lg flex-col items-center justify-center gap-4 text-center"
          >
            <SEO
              title="Article Unavailable | SeatPing"
              description="This article is unavailable. Explore more stories on the SeatPing blog."
              canonical={blogPath(slug)}
              robots="noindex, follow"
            />
            {missing && (
              <>
                <h1 className="text-3xl font-semibold tracking-tight">Article Not Found</h1>
                <p className="text-body text-ink-subtle">
                  This article may have moved or is no longer published.
                </p>
              </>
            )}
            {!missing && (
              <>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Unable To Load This Article
                </h1>
                <p className="text-body text-ink-subtle">Please try again in a moment.</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Try Again
                </Button>
              </>
            )}
            <Button asChild variant="ghost">
              <Link to="/blog">Back To Blogs</Link>
            </Button>
          </div>
        )}
        {post && (
          <article className="mx-auto max-w-4xl py-8 sm:py-12">
            <SEO
              title={`${post.title} | SeatPing`}
              description={blogDescription(post)}
              canonical={blogPath(post.slug)}
              image={blogCoverThumbnail(post.coverUrl) || undefined}
              type="article"
              structuredData={blogStructuredData(post, SITE_URL)}
            />
            <header className="mb-8 space-y-6 sm:mb-12 sm:space-y-8">
              <div>
                <Button asChild variant="ghost" size="sm" className="-ml-3.5">
                  <Link to="/blog">
                    <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" aria-hidden="true" />
                    Back To Blogs
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={post.categoryColor} className="min-w-0">
                  <span className="truncate">{post.category || "Article"}</span>
                </Badge>
                <span className="shrink-0 text-caption text-ink-subtle">
                  {readingMinutes(post.content)} Min Read
                </span>
              </div>
              <h1 className="break-words text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="break-words text-base leading-relaxed text-ink-subtle sm:text-lg lg:text-xl">
                  {post.excerpt}
                </p>
              )}
              <div className="flex items-center gap-3 text-body sm:gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-medium"
                >
                  {post.author.charAt(0)}
                </span>
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <p className="break-words font-medium">{post.author}</p>
                  <span aria-hidden="true" className="hidden text-ink-subtle sm:inline">
                    ·
                  </span>
                  <time
                    dateTime={post.publishedAt}
                    className="shrink-0 text-caption text-ink-subtle"
                  >
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </time>
                </div>
              </div>
            </header>
            {post.coverUrl && !isBlogCoverVideo(post.coverUrl) && (
              <img
                src={post.coverUrl}
                alt={post.coverAlt}
                className="mb-8 aspect-[16/9] w-full rounded-2xl border object-cover sm:mb-12"
              />
            )}
            {isBlogCoverVideo(post.coverUrl) && (
              <video
                src={post.coverUrl}
                poster={blogCoverThumbnail(post.coverUrl)}
                aria-label={post.coverAlt || "Cover Video"}
                controls
                preload="metadata"
                className="mb-8 aspect-[16/9] w-full rounded-2xl bg-slate-900 sm:mb-12"
              />
            )}
            <div className="blog-content min-w-0" dangerouslySetInnerHTML={{ __html: html }} />
            <footer className="mt-8 flex flex-wrap items-center gap-2 border-t pt-6">
              {post.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="neutral"
                  className="h-auto max-w-full whitespace-normal break-words py-1"
                >
                  {tag}
                </Badge>
              ))}
            </footer>
          </article>
        )}
        {post && <RelatedBlogPosts slug={post.slug} />}
      </main>
      <Footer />
    </div>
  );
}
