import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon, Add01Icon, Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FilterButton } from "@/components/ui/collection-controls";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { SelectFilter } from "@/components/restaurant-discovery/RestaurantFilters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ListSkeleton from "@/components/ListSkeleton";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { blogRequest } from "@/lib/blogApi";
import { errorMessage } from "@/hooks/useBlogAutosave";
import type { BlogPost } from "@shared/blog";

type PostSummary = Omit<BlogPost, "content">;
type PostList = {
  filters: { categories: string[]; authors: string[]; tags: string[] };
  posts: PostSummary[];
  stats: { total: number; drafts: number; published: number };
};
const SORTS = [
  { value: "updated", label: "Last Updated" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title", label: "Title A To Z" },
];
export default function BlogManagement() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("updated");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", author: "", tag: "" });
  const activeFilters = Object.values(filters).filter(Boolean).length + Number(status !== "ALL");
  const [confirmation, setConfirmation] = useState<{
    post: PostSummary;
    action: "delete" | "DRAFT" | "PUBLISHED";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["admin-blog", search, status, sort, filters],
    retry: 1,
    queryFn: () =>
      blogRequest<PostList>(`?${new URLSearchParams({ search, status, sort, ...filters })}`),
  });
  const stats = query.data?.stats;
  async function duplicate(post: PostSummary) {
    setBusy(true);
    setError("");
    try {
      const result = await blogRequest<{ post: BlogPost }>(`/${post.id}/duplicate`, "POST", {});
      await client.invalidateQueries({ queryKey: ["admin-blog"] });
      navigate(`/admin/blog/${result.post.id}/edit`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!confirmation) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { post, action } = confirmation;
      if (action === "delete") {
        await blogRequest(`/${post.id}`, "DELETE", { revision: post.revision });
      } else {
        await blogRequest(`/${post.id}/status`, "POST", {
          status: action,
          revision: post.revision,
        });
      }
      setConfirmation(null);
      await client.invalidateQueries({ queryKey: ["admin-blog"] });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  let confirmLabel = "Publish";
  let confirmDescription = "Publish this article on the SeatPing blog.";
  let confirmVariant: "default" | "destructive" = "default";
  if (confirmation?.action === "delete") {
    confirmLabel = "Delete";
    confirmVariant = "destructive";
    confirmDescription = "This permanently deletes the article. This action cannot be undone.";
  } else if (confirmation?.action === "DRAFT") {
    confirmLabel = "Unpublish";
    confirmDescription = "Move this article back to Draft. You can publish it again later.";
  }
  let emptyTitle = "No Blogs Yet";
  let emptyBody = "Your blog posts will appear here once you create them.";
  if (search || status !== "ALL" || activeFilters) {
    emptyTitle = "No Matching Posts";
    emptyBody = "Try another search or change the status to see more articles.";
  }
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Card
        className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr]"
        role="region"
        aria-label="Blog Overview"
      >
        {[
          { label: "Total Posts", value: stats?.total },
          { label: "Drafts", value: stats?.drafts },
          { label: "Published", value: stats?.published },
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 border-t p-4 last:border-l first:col-span-2 first:border-t-0 sm:border-l sm:border-t-0 sm:p-5 sm:first:col-span-1 sm:first:border-l-0"
          >
            <p className="text-label text-ink-subtle">{item.label}</p>
            {(item.value !== undefined || query.isError) && (
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink">
                {item.value ?? 0}
              </p>
            )}
            {item.value === undefined && !query.isError && (
              <Skeleton className="mt-2 h-7 w-10 sm:h-8" />
            )}
          </div>
        ))}
      </Card>
      <Card
        data-testid="admin-content-card"
        className="flex min-w-0 grow shrink-0 flex-col overflow-hidden"
        role="region"
        aria-label="Blog Posts"
      >
        <CardContent className="flex min-w-0 grow shrink-0 flex-col p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 md:p-4">
            <div className="flex shrink-0 items-center gap-1">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <FilterButton aria-label="Filter">
                    Filter
                    {activeFilters > 0 && (
                      <Badge
                        variant="neutral"
                        className="min-w-5 justify-center px-1"
                        aria-label={`${activeFilters} Active Filters`}
                      >
                        {activeFilters}
                      </Badge>
                    )}
                  </FilterButton>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  hideClose
                  className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
                    <SheetTitle>Filter</SheetTitle>
                    <SheetClose asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="control-lg"
                        aria-label="Close Filter"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                      </Button>
                    </SheetClose>
                  </div>
                  <SheetDescription className="sr-only">
                    Filter articles by status, category, author, and tag.
                  </SheetDescription>
                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
                    <fieldset className="min-w-0">
                      <legend className="mb-3 text-label text-ink">Status</legend>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "ALL", label: "All" },
                          { value: "DRAFT", label: "Draft" },
                          { value: "PUBLISHED", label: "Published" },
                        ].map((item) => {
                          let variant: "default" | "outline" = "outline";
                          if (status === item.value) {
                            variant = "default";
                          }
                          return (
                            <Button
                              key={item.value}
                              variant={variant}
                              aria-pressed={status === item.value}
                              onClick={() => setStatus(item.value)}
                            >
                              {item.label}
                            </Button>
                          );
                        })}
                      </div>
                    </fieldset>

                    {[
                      {
                        key: "category" as const,
                        label: "Category",
                        options: query.data?.filters?.categories || [],
                      },
                      {
                        key: "author" as const,
                        label: "Author",
                        options: query.data?.filters?.authors || [],
                      },
                      {
                        key: "tag" as const,
                        label: "Tag",
                        options: query.data?.filters?.tags || [],
                      },
                    ].map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`filter-${field.key}`}>{field.label}</Label>
                        <Select
                          value={filterValue(filters[field.key])}
                          onValueChange={(value) => {
                            let next = value.slice(6);
                            if (value === "all") {
                              next = "";
                            }
                            setFilters((previous) => ({ ...previous, [field.key]: next }));
                          }}
                        >
                          <SelectTrigger id={`filter-${field.key}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {field.options.map((value) => (
                              <SelectItem key={value} value={`entry:${value}`}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 border-t border-border bg-background p-4">
                    <Button
                      variant="outline"
                      size="lg"
                      className="px-4"
                      disabled={!activeFilters}
                      onClick={() => {
                        setStatus("ALL");
                        setFilters({ category: "", author: "", tag: "" });
                      }}
                    >
                      Clear Filters
                    </Button>
                    <SheetClose asChild>
                      <Button size="lg" className="min-w-0 flex-1 px-4">
                        Show Posts
                      </Button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
              <SelectFilter
                label="Sort By"
                kind="sort"
                size="sm"
                current={sort}
                clearable={false}
                options={SORTS}
                onChange={(value) => {
                  if (value) {
                    setSort(value);
                  }
                }}
              />
            </div>
            <div className="relative order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              />
              <Input
                aria-label="Search Blog Posts"
                placeholder="Search by title, author, category, or slug"
                value={search}
                maxLength={240}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button size="sm" asChild>
                <Link to="/admin/blog/new" aria-label="New Post">
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  <span className="hidden sm:inline">New Post</span>
                </Link>
              </Button>
            </div>
          </div>
          {error && !confirmation && (
            <p role="alert" className="px-4 py-3 text-body text-destructive">
              {error}
            </p>
          )}
          {query.isPending && <ListSkeleton fill label="Loading Blog Posts" />}
          {query.isError && (
            <div role="alert" className="flex flex-1 flex-col">
              <BusinessEmptyState
                icon={BookOpen01Icon}
                title="Unable To Load Blogs"
                body={errorMessage(query.error)}
              >
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Retry
                </Button>
              </BusinessEmptyState>
            </div>
          )}
          {query.data && query.data.posts.length === 0 && (
            <BusinessEmptyState icon={BookOpen01Icon} title={emptyTitle} body={emptyBody}>
              {!search && status === "ALL" && !activeFilters && (
                <Button asChild>
                  <Link to="/admin/blog/new">Create Your First Post</Link>
                </Button>
              )}
              {(search || status !== "ALL" || activeFilters > 0) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setStatus("ALL");
                    setFilters({ category: "", author: "", tag: "" });
                  }}
                >
                  Clear Search And Filters
                </Button>
              )}
            </BusinessEmptyState>
          )}
          {query.data && query.data.posts.length > 0 && (
            <div
              role="region"
              aria-label="Blog Posts Table"
              tabIndex={0}
              className="min-w-0 grow shrink-0 overflow-x-auto [contain:layout_paint] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <table className="w-full min-w-[52rem] border-collapse text-body">
                <caption className="sr-only">
                  Blog articles, authors, publication status, and dates
                </caption>
                <thead className="border-b border-border text-left text-label text-ink-subtle">
                  <tr className="h-row">
                    <th scope="col" className="px-4 font-medium">
                      Article Title
                    </th>
                    <th scope="col" className="px-4 font-medium">
                      Author
                    </th>
                    <th scope="col" className="px-4 text-center font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 text-center font-medium">
                      Created
                    </th>
                    <th scope="col" className="px-4 text-center font-medium">
                      Updated
                    </th>
                    <th
                      scope="col"
                      className="bg-white px-4 text-right font-medium md:sticky md:right-0"
                    >
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data.posts.map((post) => {
                    let tone: "success" | "neutral" = "neutral";
                    let label = "Draft";
                    let next: "DRAFT" | "PUBLISHED" = "PUBLISHED";
                    let action = "Publish";
                    if (post.status === "PUBLISHED") {
                      tone = "success";
                      label = "Published";
                      next = "DRAFT";
                      action = "Unpublish";
                    }
                    return (
                      <tr
                        key={post.id}
                        className="group h-row-lg transition-colors duration-150 hover:bg-slate-50"
                      >
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          <Link
                            to={`/admin/blog/${post.id}/edit`}
                            className="flex min-w-48 items-center gap-3 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {post.coverUrl && (
                              <img
                                src={post.coverUrl}
                                alt={post.coverAlt}
                                className="size-8 shrink-0 rounded-lg object-cover"
                              />
                            )}
                            <span className="min-w-0">
                              <span
                                className="block max-w-80 truncate text-body font-medium text-ink"
                                title={post.title || "Untitled Article"}
                              >
                                {post.title || "Untitled Article"}
                              </span>
                              <span className="mt-0.5 block text-caption text-ink-subtle">
                                {post.category || "Uncategorized"}
                              </span>
                            </span>
                          </Link>
                        </th>
                        <td className="whitespace-nowrap px-4 py-2 text-ink">{post.author}</td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant={tone}>{label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-center tabular-nums text-ink-subtle">
                          {date(post.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-center tabular-nums text-ink-subtle">
                          {date(post.updatedAt)}
                        </td>
                        <td className="bg-white px-4 py-2 text-right group-hover:bg-slate-50 md:sticky md:right-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Actions For ${post.title || "Untitled Article"}`}
                                disabled={busy}
                              >
                                Manage
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => navigate(`/admin/blog/${post.id}/edit`)}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void duplicate(post)}>
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setError("");
                                  setConfirmation({ post, action: next });
                                }}
                              >
                                {action}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setError("");
                                  setConfirmation({ post, action: "delete" });
                                }}
                                className="text-destructive"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirmation(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmLabel} Article?</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <p className="text-body font-medium">{confirmation?.post.title || "Untitled Article"}</p>
          {error && (
            <p role="alert" className="text-body text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button variant={confirmVariant} disabled={busy} onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function filterValue(value: string) {
  if (value) {
    return `entry:${value}`;
  }
  return "all";
}
