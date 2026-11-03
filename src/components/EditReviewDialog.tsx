import { usePublicLanguage } from "@/lib/publicLanguage";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { invalidateRestaurantData } from "@/lib/queryClient";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";

export type EditableReview = {
  id: string;
  rating: number;
  description?: string | null;
  restaurantName?: string;
};

function StarRatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t: tp } = usePublicLanguage();

  const [hover, setHover] = useState(0);
  const shown = hover || value;
  let ratingText: string;
  if (shown) {
    ratingText = `${shown}/5`;
  } else {
    ratingText = tp("Tap to Rate");
  }
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        let starPlural: string;
        if (n === 1) {
          starPlural = "";
        } else {
          starPlural = "s";
        }
        let starClass: string;
        if (n <= shown) {
          starClass = "h-7 w-7 fill-yellow-400 text-yellow-400";
        } else {
          starClass = "h-7 w-7 fill-slate-200 text-slate-200";
        }
        return (
          <button
            key={n}
            type="button"
            aria-label={tp(`${n} star${starPlural}`)}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
          >
            <HugeiconsIcon icon={StarIcon} className={starClass} />
          </button>
        );
      })}
      <span className="ml-2 text-sm text-slate-500">{ratingText}</span>
    </div>
  );
}

export function EditReviewDialog({
  review,
  onOpenChange,
  onSaved,
}: {
  review: EditableReview | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: any) => void;
}) {
  const { t: tp } = usePublicLanguage();

  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (review) {
      setRating(review.rating || 0);
      setDescription(review.description || "");
    }
  }, [review]);

  const save = async () => {
    if (!review) {
      return;
    }
    if (rating < 1) {
      toast({ title: tp("Pick a rating"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api(`/auth/me/reviews/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rating, description }),
      });
      onSaved(res.review);
      await invalidateRestaurantData(res.review?.businessUsername, res.review?.locationId);
      toast({ title: tp("Review updated") });
    } catch (err: any) {
      toast({
        title: tp("Could not update review"),
        description: tp(err?.message || tp("Please try again.")),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  let saveButtonLabel: string;
  if (saving) {
    saveButtonLabel = tp("Saving…");
  } else {
    saveButtonLabel = tp("Save Changes");
  }

  return (
    <Dialog open={!!review} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tp("Edit Review")}</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {review?.restaurantName || tp("Restaurant")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{tp("Rating")}</Label>
            <StarRatingInput value={rating} onChange={setRating} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-text">{tp("Review")}</Label>
            <Textarea
              id="review-text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tp("Share what you liked, the vibe, the dishes you tried...")}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tp("Cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saveButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
