// LocationReviewsModal.tsx
//
// Owner-only modal for managing customer reviews on a single location. Owners
// can:
//   - browse with rating + reply-status filters and a sort selector
//   - reply, edit reply, or delete reply (their own reply only)
// They cannot edit or delete the customer's review text or rating — those
// controls are deliberately absent and unsupported by the API.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  MessageSquare,
  Pencil,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Review = {
  id: string;
  customerName?: string | null;
  customerUsername?: string | null;
  rating: number;
  description?: string | null;
  partySize?: number | null;
  serviceType?: string | null;
  createdAt: string;
  businessReply?: string | null;
  businessReplyCreatedAt?: string | null;
  businessReplyUpdatedAt?: string | null;
};

type ReviewLocation = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  address?: string;
};

type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
type ReplyFilter = "all" | "replied" | "unreplied";
type SortOption =
  | "newest"
  | "oldest"
  | "highest"
  | "lowest"
  | "unreplied-first";

const MAX_REPLY_LENGTH = 500;
const REVIEWS_PAGE_SIZE = 10;

/** Five filled/empty stars for a numeric rating. */
function Stars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= filled
              ? "fill-amber-400 text-amber-400"
              : "fill-slate-200 text-slate-200",
          )}
        />
      ))}
    </span>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function LocationReviewsModal({
  location,
  open,
  onOpenChange,
}: {
  location: ReviewLocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);

  // Filters + sort. Reset to defaults on every open so a new modal session
  // starts predictable.
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  // Per-review reply editor state — `replyDrafts[id]` is the draft text, and
  // `editingReplies` tracks which review's reply form is currently open.
  const [editingReplies, setEditingReplies] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());

  // Client-side pagination: show first N reviews, reveal more on demand. Reset
  // to the initial page whenever the modal reopens or filters/sort change.
  const [visibleCount, setVisibleCount] = useState(REVIEWS_PAGE_SIZE);

  // Fetch fresh each time the modal opens for a location.
  useEffect(() => {
    if (!open || !location) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReviews(null);
    setRatingFilter("all");
    setReplyFilter("all");
    setSort("newest");
    setEditingReplies(new Set());
    setReplyDrafts({});
    setVisibleCount(REVIEWS_PAGE_SIZE);
    api(`/api/locations/${location.id}/reviews`)
      .then((res) => {
        if (!cancelled)
          setReviews(Array.isArray(res.reviews) ? res.reviews : []);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Failed to load reviews.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, location?.id]);

  const locationName =
    location?.displayName ||
    location?.name ||
    location?.address ||
    "this location";

  // Summary always uses ALL reviews — filters are for the list, not the totals.
  const total = reviews?.length ?? 0;
  const average =
    total > 0
      ? reviews!.reduce((sum, r) => sum + (r.rating || 0), 0) / total
      : 0;

  // Filter + sort the visible list. Client-side for now; the URL shape is
  // ready for /reviews?rating=&replyStatus=&sort= once we move it server-side.
  const visibleReviews = useMemo(() => {
    if (!reviews) return [];
    const filtered = reviews.filter((r) => {
      if (
        ratingFilter !== "all" &&
        Math.round(r.rating) !== Number(ratingFilter)
      )
        return false;
      if (replyFilter === "replied" && !r.businessReply) return false;
      if (replyFilter === "unreplied" && r.businessReply) return false;
      return true;
    });
    const sorted = [...filtered];
    switch (sort) {
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        break;
      case "highest":
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case "lowest":
        sorted.sort((a, b) => a.rating - b.rating);
        break;
      case "unreplied-first":
        sorted.sort((a, b) => {
          const ar = a.businessReply ? 1 : 0;
          const br = b.businessReply ? 1 : 0;
          if (ar !== br) return ar - br;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        break;
      case "newest":
      default:
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
    return sorted;
  }, [reviews, ratingFilter, replyFilter, sort]);

  // Reset pagination whenever the filtered list changes so the first page is
  // always shown after a filter/sort change.
  useEffect(() => {
    setVisibleCount(REVIEWS_PAGE_SIZE);
  }, [ratingFilter, replyFilter, sort]);

  const pagedReviews = visibleReviews.slice(0, visibleCount);
  const hasMore = visibleCount < visibleReviews.length;

  // Mutation helpers — keep `reviews` in sync after PATCH/DELETE.
  const replaceReview = (updated: Review) =>
    setReviews((prev) =>
      prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev,
    );

  const startReply = (reviewId: string, current?: string | null) => {
    setReplyDrafts((d) => ({ ...d, [reviewId]: current ?? "" }));
    setEditingReplies((s) => new Set(s).add(reviewId));
  };
  const cancelReply = (reviewId: string) => {
    setEditingReplies((s) => {
      const next = new Set(s);
      next.delete(reviewId);
      return next;
    });
    setReplyDrafts((d) => {
      const { [reviewId]: _, ...rest } = d;
      return rest;
    });
  };

  const submitReply = async (review: Review) => {
    if (!location) return;
    const draft = (replyDrafts[review.id] ?? "").trim();
    if (!draft) return;
    if (draft.length > MAX_REPLY_LENGTH) return;
    setSubmitting((s) => new Set(s).add(review.id));
    try {
      const res = await api(
        `/api/locations/${location.id}/reviews/${review.id}/reply`,
        {
          method: "PATCH",
          body: JSON.stringify({ reply: draft }),
        },
      );
      replaceReview(res.review);
      cancelReply(review.id);
      toast({
        title: review.businessReply ? "Reply updated" : "Reply posted",
      });
    } catch (e: any) {
      toast({
        title: "Failed to save reply",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting((s) => {
        const next = new Set(s);
        next.delete(review.id);
        return next;
      });
    }
  };

  const deleteReply = async (review: Review) => {
    if (!location) return;
    setSubmitting((s) => new Set(s).add(review.id));
    try {
      const res = await api(
        `/api/locations/${location.id}/reviews/${review.id}/reply`,
        { method: "DELETE" },
      );
      replaceReview(res.review);
      toast({ title: "Reply removed" });
    } catch (e: any) {
      toast({
        title: "Failed to delete reply",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting((s) => {
        const next = new Set(s);
        next.delete(review.id);
        return next;
      });
    }
  };

  const filtersActive =
    ratingFilter !== "all" || replyFilter !== "all" || sort !== "newest";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed left-1/2 top-1/2 z-50 mx-auto w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl p-4 sm:max-w-3xl sm:p-6 max-sm:text-xs [&_.text-2xl]:max-sm:text-lg [&_.text-xl]:max-sm:text-base [&_.text-lg]:max-sm:text-sm [&_.text-base]:max-sm:text-sm [&_.text-sm]:max-sm:text-xs [&_input]:max-sm:h-8 [&_input]:max-sm:text-xs [&_textarea]:max-sm:text-xs [&_select]:max-sm:text-xs">
        <DialogHeader className="text-left">
          <DialogTitle>Customer Reviews</DialogTitle>
          <DialogDescription className="break-words">
            Reviews for {locationName}
          </DialogDescription>
        </DialogHeader>

        {/* Summary (totals across ALL reviews, not the filtered list). */}
        {!loading && !error && total > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-semibold text-gray-900">
                {average.toFixed(1)}
              </span>
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            </div>
            <span className="text-sm text-muted-foreground">
              {total} Review{total === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {/* Filters + sort. Stack on mobile, inline on sm+. */}
        {!loading && !error && total > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              value={ratingFilter}
              onValueChange={(v) => setRatingFilter(v as RatingFilter)}
            >
              <SelectTrigger aria-label="Filter by rating">
                <SelectValue placeholder="All Ratings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4">4 Stars</SelectItem>
                <SelectItem value="3">3 Stars</SelectItem>
                <SelectItem value="2">2 Stars</SelectItem>
                <SelectItem value="1">1 Star</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={replyFilter}
              onValueChange={(v) => setReplyFilter(v as ReplyFilter)}
            >
              <SelectTrigger aria-label="Filter by reply status">
                <SelectValue placeholder="All Replies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Replies</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="unreplied">Unreplied</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortOption)}
            >
              <SelectTrigger aria-label="Sort reviews">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="highest">Highest Rating</SelectItem>
                <SelectItem value="lowest">Lowest Rating</SelectItem>
                <SelectItem value="unreplied-first">Unreplied First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading reviews...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <MessageSquare className="mb-1 h-8 w-8 text-slate-300" />
            <p className="font-medium text-gray-700">No Reviews Yet.</p>
            <p className="text-sm text-muted-foreground">
              Customer reviews will appear here once customers submit feedback.
            </p>
          </div>
        ) : visibleReviews.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
            No reviews match these filters.
          </div>
        ) : (
          <div className="space-y-3">
            {pagedReviews.map((r) => {
              const isEditing = editingReplies.has(r.id);
              const draft = replyDrafts[r.id] ?? "";
              const draftTrimmed = draft.trim();
              const overLimit = draft.length > MAX_REPLY_LENGTH;
              const isSubmitting = submitting.has(r.id);
              const wasEdited =
                r.businessReplyCreatedAt &&
                r.businessReplyUpdatedAt &&
                r.businessReplyUpdatedAt !== r.businessReplyCreatedAt;

              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  {/* Customer review header */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 break-words">
                        {r.customerName || r.customerUsername || "Anonymous"}
                      </p>
                      {r.customerName && r.customerUsername && (
                        <p className="text-xs text-muted-foreground break-words">
                          @{r.customerUsername}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Stars rating={r.rating} />
                      <span className="text-sm font-medium text-gray-700">
                        {r.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {r.description && (
                    <p className="mt-2 text-sm text-gray-700 break-words">
                      {r.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDate(r.createdAt)}</span>
                    {typeof r.partySize === "number" && (
                      <span>· Party of {r.partySize}</span>
                    )}
                    {r.serviceType && (
                      <span>
                        ·{" "}
                        {r.serviceType === "queue"
                          ? "Walk-in"
                          : r.serviceType === "reservation"
                            ? "Reservation"
                            : r.serviceType}
                      </span>
                    )}
                  </div>

                  {/* Existing reply (when not editing) */}
                  {r.businessReply && !isEditing && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Your reply
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => startReply(r.id, r.businessReply)}
                            disabled={isSubmitting}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit Reply
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                disabled={isSubmitting}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-sm">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete this reply?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  The customer's review will stay — only your
                                  response is removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteReply(r)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete reply
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-800 break-words">
                        {r.businessReply}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Replied {formatDate(r.businessReplyCreatedAt)}
                        {wasEdited && (
                          <> · Edited {formatDate(r.businessReplyUpdatedAt)}</>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Reply editor (creating OR editing) */}
                  {isEditing && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {r.businessReply
                          ? "Edit your reply"
                          : "Reply to this review"}
                      </p>
                      <Textarea
                        value={draft}
                        onChange={(e) =>
                          setReplyDrafts((d) => ({
                            ...d,
                            [r.id]: e.target.value,
                          }))
                        }
                        placeholder="Thank you for visiting us..."
                        rows={3}
                        className="mt-3"
                      />
                      {/* Bottom row: stacked on mobile (counter then equal-width
                          buttons), inline with right-aligned buttons on sm+. */}
                      <div className="mt-5 space-y-3 sm:flex sm:items-center sm:justify-between sm:space-y-0">
                        <p
                          className={cn(
                            "text-xs",
                            overLimit
                              ? "text-red-600"
                              : "text-muted-foreground",
                          )}
                        >
                          {draft.length}/{MAX_REPLY_LENGTH}
                        </p>
                        <div className="flex w-full gap-3 sm:w-auto sm:items-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelReply(r.id)}
                            disabled={isSubmitting}
                            className="flex-1 sm:flex-none"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => submitReply(r)}
                            disabled={
                              isSubmitting || !draftTrimmed || overLimit
                            }
                            className="flex-1 bg-slate-900 text-white hover:bg-slate-800 sm:flex-none"
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                                Saving...
                              </>
                            ) : r.businessReply ? (
                              "Save reply"
                            ) : (
                              "Post reply"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reply CTA when no reply yet AND not currently editing. */}
                  {!r.businessReply && !isEditing && (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startReply(r.id)}
                      >
                        <Reply className="h-4 w-4" /> Reply
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Load more + count hint. Shows when there are more reviews to reveal,
            or whenever filters are active so the owner can see X of Y at a glance. */}
        {!loading && !error && total > 0 && visibleReviews.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            {hasMore && (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() =>
                  setVisibleCount((n) =>
                    Math.min(n + REVIEWS_PAGE_SIZE, visibleReviews.length),
                  )
                }
              >
                Load More Reviews
              </Button>
            )}
            {(hasMore || filtersActive) && (
              <p className="text-xs text-muted-foreground">
                Showing {pagedReviews.length} of {visibleReviews.length}
                {filtersActive && visibleReviews.length !== total
                  ? ` (filtered from ${total})`
                  : ""}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
