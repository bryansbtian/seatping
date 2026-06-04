// Shared "Edit Review" modal used by both the customer profile (Your Reviews)
// and the public restaurant details page. Editing always goes through the
// customer-owned PATCH /auth/me/reviews/:id route, so ownership is enforced
// server-side and the business reply on the row is never touched.
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
import { Star } from "lucide-react";

// Minimal shape the dialog needs. The profile's richer CustomerReview type is a
// structural superset, so it can be passed directly.
export type EditableReview = {
  id: string;
  rating: number;
  description?: string | null;
  restaurantName?: string;
};

/** Interactive 1–5 star picker. */
function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
        >
          <Star
            className={
              n <= shown
                ? "h-7 w-7 fill-yellow-400 text-yellow-400"
                : "h-7 w-7 fill-slate-200 text-slate-200"
            }
          />
        </button>
      ))}
      <span className="ml-2 text-sm text-slate-500">
        {shown ? `${shown}/5` : "Tap to Rate"}
      </span>
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
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form whenever a different review is opened.
  useEffect(() => {
    if (review) {
      setRating(review.rating || 0);
      setDescription(review.description || "");
    }
  }, [review]);

  const save = async () => {
    if (!review) return;
    if (rating < 1) {
      toast({ title: "Pick a rating", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api(`/auth/me/reviews/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rating, description }),
      });
      onSaved(res.review);
      toast({ title: "Review updated" });
    } catch (err: any) {
      toast({
        title: "Could not update review",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!review} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Review</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {review?.restaurantName || "Restaurant"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Rating</Label>
            <StarRatingInput value={rating} onChange={setRating} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-text">Review</Label>
            <Textarea
              id="review-text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Share what you liked, the vibe, the dishes you tried..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
