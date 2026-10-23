import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon } from "@hugeicons/core-free-icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BlogCard from "@/components/blog/BlogCard";
import PublicBlogLoading from "@/components/blog/PublicBlogLoading";
import { publicBlogRequest } from "@/lib/publicBlogApi";
import { BLOG_DESCRIPTION, BLOG_TITLE, type PublicBlogList } from "@shared/publicBlog";

export default function Blog() {
  const [params] = useSearchParams();
  const category = params.get("category") || "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page"))) || 1));
  const query = useQuery({
    queryKey: ["public-blog", category, page],
    queryFn: ({ signal }) =>
      publicBlogRequest<PublicBlogList>(
        `?${new URLSearchParams({ category, page: String(page) })}`,
        signal,
      ),
    retry: false,
  });
  const pagePath = (nextPage: number, nextCategory = category) => {
    const search = new URLSearchParams();
    if (nextCategory) {
      search.set("category", nextCategory);
    }
    if (nextPage > 1) {
      search.set("page", String(nextPage));
    }
    if (search.size) {
      return `/blog?${search}`;
    }
    return "/blog";
  };
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <SEO title="Blog | SeatPing" description={BLOG_DESCRIPTION} canonical={pagePath(page)} />
      <Header />
      <main className="container mx-auto flex min-h-svh flex-1 flex-col px-4 pt-24 sm:pt-28">
        <header className="mb-10 sm:mb-14">
          <p className="mb-4 text-label font-medium text-ink-subtle">BLOG</p>
          <h1 className="max-w-4xl text-3xl font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-5xl">
            {BLOG_TITLE}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-subtle sm:text-lg">
            {BLOG_DESCRIPTION}
          </p>
        </header>
        {query.isPending && <PublicBlogLoading />}
        {query.isError && (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center"
          >
            <h2 className="text-title">Unable To Load Articles</h2>
            <p className="text-body text-ink-subtle">Please try again in a moment.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try Again
            </Button>
          </div>
        )}
        {query.isSuccess && (
          <>
            <nav
              aria-label="Blog Categories"
              className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200"
            >
              {["", ...query.data.categories].map((item) => {
                let current: "page" | undefined;
                if (item === category) {
                  current = "page";
                }
                return (
                  <Button
                    key={item}
                    asChild
                    static
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "shrink-0 rounded-none border-0 border-b-2 border-transparent px-4 text-ink-subtle hover:bg-transparent hover:text-ink",
                      item === category && "border-b-slate-900 text-ink",
                    )}
                  >
                    <Link to={pagePath(1, item)} aria-current={current}>
                      {item || "All"}
                    </Link>
                  </Button>
                );
              })}
            </nav>
            {query.data.posts.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
                <HugeiconsIcon
                  icon={BookOpen01Icon}
                  className="size-8 text-slate-400"
                  aria-hidden="true"
                />
                <h2 className="text-title">No Articles Yet</h2>
                <p className="max-w-sm text-body text-ink-subtle">
                  New stories and practical guides will appear here once they’re published.
                </p>
                {(category || page > 1) && (
                  <Button asChild variant="outline">
                    <Link to="/blog">View All Articles</Link>
                  </Button>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {query.data.posts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
            {query.data.totalPages > 1 && (
              <nav
                aria-label="Blog Pagination"
                className="mt-10 flex items-center justify-center gap-4"
              >
                {page > 1 && (
                  <Button asChild variant="outline">
                    <Link to={pagePath(page - 1)}>Previous</Link>
                  </Button>
                )}
                <span className="text-caption text-ink-subtle">
                  Page {page} of {query.data.totalPages}
                </span>
                {page < query.data.totalPages && (
                  <Button asChild variant="outline">
                    <Link to={pagePath(page + 1)}>Next</Link>
                  </Button>
                )}
              </nav>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
