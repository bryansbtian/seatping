import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
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
import type { TKey } from "@/lib/i18n";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading02Icon, Message01Icon, ReplyIcon, StarIcon } from "@hugeicons/core-free-icons";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  MAX_REPLY_LENGTH,
  REVIEWS_PAGE_SIZE,
  chipCounts,
  filterByRange,
  formatReviewDate,
  restaurantNameOf,
  reviewInitials,
  summarizeReviews,
  visibleReviews as computeVisibleReviews,
  type Review,
  type ReviewChip,
  type ReviewLocation,
  type ReviewRange,
  type SortOption,
} from "@/lib/reviews";

const CHIP_KEYS: [ReviewChip, TKey][] = [
  ["all", "rev.chip.all"],
  ["needs-reply", "rev.chip.needsReply"],
  ["replied", "rev.chip.replied"],
  ["low", "rev.chip.low"],
];

const SORT_KEYS: [SortOption, TKey][] = [
  ["newest", "rev.sort.newest"],
  ["oldest", "rev.sort.oldest"],
  ["highest", "rev.sort.highest"],
  ["lowest", "rev.sort.lowest"],
];

export function Stars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        let starToneClass: string;
        if (i <= filled) {
          starToneClass = "fill-amber-400 text-amber-400";
        } else {
          starToneClass = "fill-slate-200 text-slate-200";
        }
        return (
          <HugeiconsIcon
            icon={StarIcon}
            key={i}
            className={cn("h-3.5 w-3.5 md:h-4 md:w-4", starToneClass)}
          />
        );
      })}
    </span>
  );
}

type LocationReviewsProps = {
  location: ReviewLocation | null;
  range: ReviewRange;
  from: string;
  to: string;
};

const LocationReviews = ({ location, range, from, to }: LocationReviewsProps) => {
  const { toast } = useToast();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);

  const [chip, setChip] = useState<ReviewChip>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const [editingReplies, setEditingReplies] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());

  const [visibleCount, setVisibleCount] = useState(REVIEWS_PAGE_SIZE);

  const tRef = useRef(t);
  tRef.current = t;

  const locationId = location?.id;
  const restaurantName = restaurantNameOf(location);

  useEffect(() => {
    if (!locationId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReviews(null);
    setChip("all");
    setSort("newest");
    setEditingReplies(new Set());
    setReplyDrafts({});
    setVisibleCount(REVIEWS_PAGE_SIZE);
    api(`/api/locations/${locationId}/reviews`)
      .then((res) => {
        if (!cancelled) {
          let nextReviews: Review[];
          if (Array.isArray(res.reviews)) {
            nextReviews = res.reviews;
          } else {
            nextReviews = [];
          }
          setReviews(nextReviews);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message || tRef.current("rev.failedLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const inRange = useMemo(() => {
    if (!reviews) {
      return [];
    }
    return filterByRange(reviews, range, from, to, new Date());
  }, [reviews, range, from, to]);

  const summary = useMemo(() => summarizeReviews(inRange), [inRange]);
  const counts = useMemo(() => chipCounts(inRange), [inRange]);

  let average = 0;
  if (summary.average !== null) {
    average = summary.average;
  }

  const shown = useMemo(() => computeVisibleReviews(inRange, chip, sort), [inRange, chip, sort]);

  useEffect(() => {
    setVisibleCount(REVIEWS_PAGE_SIZE);
  }, [chip, sort, range, from, to]);

  const pagedReviews = shown.slice(0, visibleCount);
  const hasMore = visibleCount < shown.length;

  const replaceReview = (updated: Review) =>
    setReviews((prev) => {
      if (!prev) {
        return prev;
      }
      return prev.map((r) => {
        if (r.id === updated.id) {
          return updated;
        }
        return r;
      });
    });

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
    if (!location) {
      return;
    }
    const draft = (replyDrafts[review.id] ?? "").trim();
    if (!draft) {
      return;
    }
    if (draft.length > MAX_REPLY_LENGTH) {
      return;
    }
    setSubmitting((s) => new Set(s).add(review.id));
    try {
      const res = await api(`/api/locations/${location.id}/reviews/${review.id}/reply`, {
        method: "PATCH",
        body: JSON.stringify({ reply: draft }),
      });
      replaceReview(res.review);
      cancelReply(review.id);
      let replySavedTitle: string;
      if (review.businessReply) {
        replySavedTitle = t("rev.toast.replyUpdated");
      } else {
        replySavedTitle = t("rev.toast.replyPosted");
      }
      toast({ title: replySavedTitle });
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
    if (!location) {
      return;
    }
    setSubmitting((s) => new Set(s).add(review.id));
    try {
      const res = await api(`/api/locations/${location.id}/reviews/${review.id}/reply`, {
        method: "DELETE",
      });
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

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-muted-foreground"
        data-testid="reviews-loading"
      >
        <HugeiconsIcon icon={Loading02Icon} className="h-5 w-5 animate-spin" /> {t("rev.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        data-testid="reviews-error"
      >
        {error}
      </div>
    );
  }

  const totalEver = reviews?.length ?? 0;

  if (totalEver === 0) {
    return (
      <Card className="flex flex-1 flex-col border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-1 flex-col p-0">
          <BusinessEmptyState
            icon={Message01Icon}
            title={t("rev.empty.title")}
            body={t("rev.empty.body")}
            testId="reviews-empty"
          />
        </CardContent>
      </Card>
    );
  }

  if (summary.total === 0) {
    return (
      <Card className="flex flex-1 flex-col border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-1 flex-col p-0">
          <BusinessEmptyState
            icon={Message01Icon}
            title={t("rev.empty.title")}
            body={t("rev.range.empty")}
            testId="reviews-range-empty"
          />
        </CardContent>
      </Card>
    );
  }

  let countLabel = t("rev.countMany", { n: summary.total });
  if (summary.total === 1) {
    countLabel = t("rev.countOne", { n: summary.total });
  }

  let replyStatusTitle = t("rev.summary.waitingManyTitle", { n: summary.awaitingReply });
  let replyStatusBody = t("rev.summary.waitingBody");
  let replyStatusToneClass = "text-amber-700";
  if (summary.awaitingReply === 0) {
    replyStatusTitle = t("rev.summary.inboxZeroTitle");
    replyStatusBody = t("rev.summary.inboxZeroBody");
    replyStatusToneClass = "text-emerald-700";
  } else if (summary.awaitingReply === 1) {
    replyStatusTitle = t("rev.summary.waitingOneTitle");
  }

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-1 gap-6 rounded-2xl border border-slate-200 bg-white p-5 md:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] lg:gap-0"
        data-testid="reviews-summary"
      >
        <div className="flex items-center gap-4 lg:pr-6">
          <span
            className="text-4xl font-semibold leading-none tracking-tight text-slate-900 md:text-5xl"
            data-testid="reviews-average"
          >
            {average.toFixed(1)}
          </span>
          <span className="min-w-0">
            <Stars rating={average} />
            <span className="mt-1 block truncate text-xs text-slate-500 md:text-sm">
              {countLabel}
            </span>
          </span>
        </div>

        <ul
          className="space-y-1.5 border-slate-200 lg:border-x lg:px-6"
          data-testid="reviews-distribution"
        >
          {summary.distribution.map((bucket) => (
            <li
              key={bucket.stars}
              className="flex items-center gap-3 text-xs text-slate-500"
              data-testid={`reviews-distribution-${bucket.stars}`}
            >
              <span className="w-2 shrink-0 text-right tabular-nums">{bucket.stars}</span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.round(bucket.share * 100)}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right tabular-nums text-slate-600">
                {bucket.count}
              </span>
            </li>
          ))}
        </ul>

        <div className="lg:pl-6">
          <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
            {t("rev.summary.replyStatus")}
          </p>
          <p
            className={cn("mt-2 text-base font-semibold leading-snug", replyStatusToneClass)}
            data-testid="reviews-reply-status"
          >
            {replyStatusTitle}
          </p>
          <p
            className="mt-1 max-w-xs text-sm leading-relaxed text-slate-600"
            data-testid="reviews-reply-status-body"
          >
            {replyStatusBody}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" data-testid="reviews-chips">
          {CHIP_KEYS.map(([key, labelKey]) => {
            const selected = chip === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                data-testid={`reviews-chip-${key}`}
                onClick={() => setChip(key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                  selected && "border-slate-900 bg-slate-900 text-white",
                  !selected && "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {t(labelKey)}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    selected && "text-white/70",
                    !selected && "text-slate-400",
                  )}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-500 md:text-sm">{t("rev.sortLabel")}</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger
              aria-label={t("rev.sort.aria")}
              data-testid="reviews-sort"
              className="w-auto min-w-[10rem] rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map(([key, labelKey]) => (
                <SelectItem key={key} value={key}>
                  {t(labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {shown.length === 0 && (
        <div
          className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600"
          data-testid="reviews-no-match"
        >
          {t("rev.noMatch")}
        </div>
      )}

      {shown.length > 0 && (
        <div className="space-y-3" data-testid="reviews-list">
          {pagedReviews.map((r) => {
            const isEditing = editingReplies.has(r.id);
            const draft = replyDrafts[r.id] ?? "";
            const draftTrimmed = draft.trim();
            const overLimit = draft.length > MAX_REPLY_LENGTH;
            const isSubmitting = submitting.has(r.id);

            let serviceTypeLabel: string | null = null;
            if (r.serviceType === "queue") {
              serviceTypeLabel = t("rev.walkIn");
            } else if (r.serviceType === "reservation") {
              serviceTypeLabel = t("rev.reservation");
            }

            let charCountToneClass = "text-muted-foreground";
            if (overLimit) {
              charCountToneClass = "text-red-600";
            }

            let replyEditorHeading = t("rev.replyToThis");
            if (r.businessReply) {
              replyEditorHeading = t("rev.editYourReply");
            }

            let submitReplyLabel: JSX.Element | string = t("rev.postReply");
            if (r.businessReply) {
              submitReplyLabel = t("rev.saveReply");
            }
            if (isSubmitting) {
              submitReplyLabel = (
                <>
                  <HugeiconsIcon icon={Loading02Icon} className="h-3.5 w-3.5 animate-spin" />{" "}
                  {t("rev.saving")}
                </>
              );
            }

            return (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5"
                data-testid={`review-${r.id}`}
              >
                <div className="flex items-start gap-3 md:gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 md:h-10 md:w-10"
                  >
                    {reviewInitials(r)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className="truncate text-sm font-semibold text-slate-900"
                          data-testid={`review-author-${r.id}`}
                        >
                          {r.customerName || r.customerUsername || t("rev.anonymous")}
                        </span>
                        {r.customerName && r.customerUsername && (
                          <span className="truncate text-xs text-slate-400">
                            @{r.customerUsername}
                          </span>
                        )}
                        <span className="text-slate-300">&middot;</span>
                        <span className="text-xs text-slate-500">
                          {formatReviewDate(r.createdAt)}
                        </span>
                        {serviceTypeLabel && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-slate-600">
                            {serviceTypeLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Stars rating={r.rating} />
                        <span className="text-xs font-medium text-slate-700">
                          {r.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {r.description && (
                      <p className="mt-2 break-words text-sm text-slate-700">{r.description}</p>
                    )}

                    {r.businessReply && !isEditing && (
                      <div className="mt-3 border-l-2 border-slate-200 pl-3 md:pl-4">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className="truncate text-sm font-semibold text-slate-900"
                              data-testid={`review-owner-${r.id}`}
                            >
                              {restaurantName}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-slate-600">
                              {t("rev.ownerBadge")}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatReviewDate(r.businessReplyCreatedAt)}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              data-testid={`review-edit-${r.id}`}
                              onClick={() => startReply(r.id, r.businessReply)}
                              className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-800 disabled:opacity-60"
                            >
                              {t("rev.editReply")}
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  data-testid={`review-delete-${r.id}`}
                                  className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-800 disabled:opacity-60"
                                >
                                  {t("rev.delete")}
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-sm">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("rev.deleteTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("rev.deleteDesc")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
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
                        <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">
                          {r.businessReply}
                        </p>
                      </div>
                    )}

                    {isEditing && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {replyEditorHeading}
                        </p>
                        <Textarea
                          value={draft}
                          onChange={(e) =>
                            setReplyDrafts((d) => ({ ...d, [r.id]: e.target.value }))
                          }
                          placeholder={t("rev.replyPlaceholder")}
                          rows={3}
                          className="mt-3 bg-white"
                        />
                        <div className="mt-4 space-y-3 sm:flex sm:items-center sm:justify-between sm:space-y-0">
                          <p className={cn("text-xs", charCountToneClass)}>
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
                              disabled={isSubmitting || !draftTrimmed || overLimit}
                              className="flex-1 sm:flex-none"
                              data-testid={`review-submit-${r.id}`}
                            >
                              {submitReplyLabel}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!r.businessReply && !isEditing && (
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`review-reply-${r.id}`}
                          onClick={() => startReply(r.id)}
                        >
                          <HugeiconsIcon icon={ReplyIcon} className="h-4 w-4" /> {t("rev.reply")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            data-testid="reviews-load-more"
            onClick={() => setVisibleCount((n) => Math.min(n + REVIEWS_PAGE_SIZE, shown.length))}
          >
            {t("rev.loadMore")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("rev.showing", { shown: pagedReviews.length, total: shown.length })}
          </p>
        </div>
      )}

      {!hasMore && shown.length > 0 && (
        <div
          className="rounded-2xl border border-dashed border-slate-200 p-6 text-center"
          data-testid="reviews-end"
        >
          <p className="text-sm font-semibold text-slate-800 md:text-base">{t("rev.end.title")}</p>
          <p className="mt-1 text-xs text-slate-500 md:text-sm">{t("rev.end.body")}</p>
        </div>
      )}
    </div>
  );
};

export default LocationReviews;
