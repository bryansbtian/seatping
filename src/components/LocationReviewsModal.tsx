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
import { useLang } from "@/lib/i18n";
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
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);

  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const [editingReplies, setEditingReplies] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());

  const [visibleCount, setVisibleCount] = useState(REVIEWS_PAGE_SIZE);

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
        if (!cancelled) setError(e?.message || t("rev.failedLoad"));
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
    t("rev.thisLocation");

  const total = reviews?.length ?? 0;
  const average =
    total > 0
      ? reviews!.reduce((sum, r) => sum + (r.rating || 0), 0) / total
      : 0;

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

  useEffect(() => {
    setVisibleCount(REVIEWS_PAGE_SIZE);
  }, [ratingFilter, replyFilter, sort]);

  const pagedReviews = visibleReviews.slice(0, visibleCount);
  const hasMore = visibleCount < visibleReviews.length;

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
        title: review.businessReply
          ? t("rev.toast.replyUpdated")
          : t("rev.toast.replyPosted"),
      });
    } catch (e: any) {
      toast({
        title: t("rev.toast.replySaveFailed"),
        description: e?.message || t("common.pleaseTryAgain"),
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
      toast({ title: t("rev.toast.replyRemoved") });
    } catch (e: any) {
      toast({
        title: t("rev.toast.replyDeleteFailed"),
        description: e?.message || t("common.pleaseTryAgain"),
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
      {}
      <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:max-w-3xl">
        <DialogHeader className="text-left">
          <DialogTitle>{t("rev.title")}</DialogTitle>
          <DialogDescription className="break-words">
            {t("rev.subtitle", { name: locationName })}
          </DialogDescription>
        </DialogHeader>

        {}
        {!loading && !error && total > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-semibold text-gray-900">
                {average.toFixed(1)}
              </span>
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            </div>
            <span className="text-sm text-muted-foreground">
              {t(total === 1 ? "rev.countOne" : "rev.countMany", { n: total })}
            </span>
          </div>
        )}

        {}
        {!loading && !error && total > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              value={ratingFilter}
              onValueChange={(v) => setRatingFilter(v as RatingFilter)}
            >
              <SelectTrigger aria-label={t("rev.filter.ratingAria")}>
                <SelectValue placeholder={t("rev.filter.allRatings")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("rev.filter.allRatings")}</SelectItem>
                <SelectItem value="5">{t("rev.filter.stars", { n: 5 })}</SelectItem>
                <SelectItem value="4">{t("rev.filter.stars", { n: 4 })}</SelectItem>
                <SelectItem value="3">{t("rev.filter.stars", { n: 3 })}</SelectItem>
                <SelectItem value="2">{t("rev.filter.stars", { n: 2 })}</SelectItem>
                <SelectItem value="1">{t("rev.filter.star1")}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={replyFilter}
              onValueChange={(v) => setReplyFilter(v as ReplyFilter)}
            >
              <SelectTrigger aria-label={t("rev.filter.replyAria")}>
                <SelectValue placeholder={t("rev.filter.allReplies")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("rev.filter.allReplies")}</SelectItem>
                <SelectItem value="replied">{t("rev.filter.replied")}</SelectItem>
                <SelectItem value="unreplied">
                  {t("rev.filter.unreplied")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortOption)}
            >
              <SelectTrigger aria-label={t("rev.sort.aria")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("rev.sort.newest")}</SelectItem>
                <SelectItem value="oldest">{t("rev.sort.oldest")}</SelectItem>
                <SelectItem value="highest">{t("rev.sort.highest")}</SelectItem>
                <SelectItem value="lowest">{t("rev.sort.lowest")}</SelectItem>
                <SelectItem value="unreplied-first">
                  {t("rev.sort.unrepliedFirst")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("rev.loading")}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <MessageSquare className="mb-1 h-8 w-8 text-slate-300" />
            <p className="font-medium text-gray-700">{t("rev.empty.title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("rev.empty.body")}
            </p>
          </div>
        ) : visibleReviews.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
            {t("rev.noMatch")}
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
                  {}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 break-words">
                        {r.customerName ||
                          r.customerUsername ||
                          t("rev.anonymous")}
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
                      <span>· {t("rev.partyOf", { n: r.partySize })}</span>
                    )}
                    {r.serviceType && (
                      <span>
                        ·{" "}
                        {r.serviceType === "queue"
                          ? t("rev.walkIn")
                          : r.serviceType === "reservation"
                            ? t("rev.reservation")
                            : r.serviceType}
                      </span>
                    )}
                  </div>

                  {}
                  {r.businessReply && !isEditing && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("rev.yourReply")}
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-slate-800 break-words">
                            {r.businessReply}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("rev.repliedOn", {
                              date: formatDate(r.businessReplyCreatedAt),
                            })}
                            {wasEdited && (
                              <>
                                {" "}
                                ·{" "}
                                {t("rev.edited", {
                                  date: formatDate(r.businessReplyUpdatedAt),
                                })}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => startReply(r.id, r.businessReply)}
                            disabled={isSubmitting}
                            className="w-9 p-0 justify-center sm:w-auto sm:px-3"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">
                              {t("rev.editReply")}
                            </span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructiveOutline"
                                disabled={isSubmitting}
                                className="w-9 p-0 justify-center sm:w-auto sm:px-3"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">
                                  {t("rev.delete")}
                                </span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-sm">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("rev.deleteTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("rev.deleteDesc")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("common.cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteReply(r)}
                                  variant="destructive"
                                >
                                  {t("rev.deleteReply")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  )}

                  {}
                  {isEditing && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {r.businessReply
                          ? t("rev.editYourReply")
                          : t("rev.replyToThis")}
                      </p>
                      <Textarea
                        value={draft}
                        onChange={(e) =>
                          setReplyDrafts((d) => ({
                            ...d,
                            [r.id]: e.target.value,
                          }))
                        }
                        placeholder={t("rev.replyPlaceholder")}
                        rows={3}
                        className="mt-3"
                      />
                      {}
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
                            variant="outline"
                            onClick={() => cancelReply(r.id)}
                            disabled={isSubmitting}
                            className="flex-1 sm:flex-none"
                          >
                            {t("common.cancel")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => submitReply(r)}
                            disabled={
                              isSubmitting || !draftTrimmed || overLimit
                            }
                            className="flex-1 sm:flex-none"
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                                {t("rev.saving")}
                              </>
                            ) : r.businessReply ? (
                              t("rev.saveReply")
                            ) : (
                              t("rev.postReply")
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {}
                  {!r.businessReply && !isEditing && (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startReply(r.id)}
                      >
                        <Reply className="h-4 w-4" /> {t("rev.reply")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {}
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
                {t("rev.loadMore")}
              </Button>
            )}
            {(hasMore || filtersActive) && (
              <p className="text-xs text-muted-foreground">
                {t("rev.showing", {
                  shown: pagedReviews.length,
                  total: visibleReviews.length,
                })}
                {filtersActive && visibleReviews.length !== total
                  ? t("rev.filteredFrom", { total })
                  : ""}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
