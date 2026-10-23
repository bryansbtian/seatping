import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { publicBlogRequest } from "@/lib/publicBlogApi";
import type { PublicBlogSummary } from "@shared/publicBlog";
import BlogCard from "./BlogCard";

export default function RelatedBlogPosts({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ["public-blog-related", slug],
    queryFn: ({ signal }) =>
      publicBlogRequest<{ posts: PublicBlogSummary[] }>(
        `/${encodeURIComponent(slug)}/related`,
        signal,
      ),
    retry: false,
  });
  return (
    <section aria-labelledby="keep-reading-title" className="pt-10 sm:pt-12 xl:border-t">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="keep-reading-title" className="text-2xl font-medium tracking-tight sm:text-3xl">
          Keep Reading
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/blog">All Posts</Link>
        </Button>
      </div>
      {query.isPending && (
        <div
          role="status"
          aria-label="Loading Related Articles"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2"
        >
          <span className="sr-only">Loading Related Articles</span>
          {[0, 1].map((item) => (
            <div key={item} aria-hidden="true" className="rounded-2xl border">
              <Skeleton className="aspect-[8/5] rounded-t-2xl rounded-b-none" />
              <div className="space-y-5 p-6">
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-8 h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <div role="alert" className="space-y-4 rounded-2xl border p-6">
          <p className="text-body text-ink-subtle">Unable to load more articles right now.</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try Again
          </Button>
        </div>
      )}
      {query.isSuccess && query.data.posts.length === 0 && (
        <p className="py-6 text-body text-ink-subtle">More stories are on the way.</p>
      )}
      {query.isSuccess && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {query.data.posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
