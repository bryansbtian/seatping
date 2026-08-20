import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CountryCodeSelect } from "@/components/CountryCodeSelect";
import { useToast } from "@/hooks/use-toast";
import { splitPhone } from "@/lib/countryCodes";
import { api } from "@/lib/api";
import { EditReviewDialog } from "@/components/EditReviewDialog";
import { X, Star, Pencil, Trash2 } from "lucide-react";

type Reservation = {
  id: string;
  manageToken?: string;
  locationId?: string | null;
  businessUsername: string;
  businessName?: string;
  restaurantName?: string;
  locationName?: string;
  imageUrl?: string | null;
  date?: string;
  time?: string;
  people?: number;
  status?: string;
  createdAt?: string;
};

type QueueActivity = {
  id: string;
  businessUsername: string;
  businessName?: string;
  restaurantName?: string;
  locationName?: string;
  locationId?: string | null;
  imageUrl?: string | null;
  queueToken?: string | null;
  joinedAt?: string;
  partySize?: number;
  status?: string;
  active?: boolean;
  admittedAt?: string | null;
  confirmedAt?: string | null;
  noShowMarkedAt?: string | null;
  removedAt?: string | null;
  leftAt?: string | null;
};

type SavedRestaurant = {
  id: string;
  locationId?: string;
  businessUsername: string;
  businessName?: string;
  name?: string;
  locationName?: string;
  cuisine?: string;
  rating?: number | null;
  imageUrl?: string | null;
  area?: string;
  city?: string;
  savedAt?: string;
};

type CustomerReview = {
  id: string;
  locationId: string;
  businessUsername?: string | null;
  rating: number;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  businessReply?: string | null;
  businessReplyCreatedAt?: string | null;
  businessReplyUpdatedAt?: string | null;
  restaurantName?: string;
  locationName?: string | null;
};

type CustomerProfile = {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone?: string;
  createdAt?: string;
  upcomingReservations?: Reservation[];
  pastReservations?: Reservation[];
  queueingActivity?: QueueActivity[];
  savedRestaurants?: SavedRestaurant[];
};

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [editingReview, setEditingReview] = useState<CustomerReview | null>(null);
  const [deletingReview, setDeletingReview] = useState<CustomerReview | null>(null);

  const applyReviewUpdate = (updated: CustomerReview) => {
    setReviews((list) =>
      list.map((r) => {
        if (r.id === updated.id) {
          return { ...r, ...updated };
        }
        return r;
      }),
    );
  };

  const removeReview = (id: string) => {
    setReviews((list) => list.filter((r) => r.id !== id));
  };

  const removeSavedRestaurant = async (s: SavedRestaurant) => {
    try {
      let res: any;
      if (s.locationId) {
        res = await api(`/auth/me/saved-locations/${s.locationId}`, {
          method: "DELETE",
        });
      } else {
        res = await api(`/auth/me/saved-restaurants/${encodeURIComponent(s.businessUsername)}`, {
          method: "DELETE",
        });
      }
      setProfile(res.user);
      toast({ title: "Restaurant removed from saved" });
    } catch (err: any) {
      toast({
        title: "Could not remove",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then((data) => {
        if (active) {
          setProfile(data.user);
        }
      })
      .catch(() => {
        if (active) {
          navigate("/login", { replace: true });
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    let active = true;
    api("/auth/me/reviews")
      .then((data) => {
        if (active) {
          setReviews(data.reviews || []);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const queue = profile?.queueingActivity || [];
  const activeQueue = queue.filter((q) => q.active || q.status === "waiting");
  const pastQueue = queue.filter((q) => !(q.active || q.status === "waiting"));

  const upcomingReservations = [...(profile?.upcomingReservations || [])].sort(
    (a, b) => upcomingReservationTs(a) - upcomingReservationTs(b),
  );

  const diningHistory: HistoryItem[] = [
    ...(profile?.pastReservations || []).map((r) => ({
      kind: "reservation" as const,
      key: `r-${r.id}`,
      ts: reservationTs(r),
      r,
    })),
    ...pastQueue.map((q) => ({
      kind: "queue" as const,
      key: `q-${q.id}`,
      ts: queueTs(q),
      q,
    })),
  ].sort((a, b) => b.ts - a.ts);

  let profileContent: React.ReactNode;
  if (loading) {
    profileContent = <p className="text-center text-muted-foreground">Loading your profile…</p>;
  } else if (!profile) {
    profileContent = null;
  } else {
    profileContent = (
      <>
        <ProfileHeaderCard profile={profile} onUpdated={setProfile} />

        <ActivitySection
          title="Saved Spots"
          emptyState="Restaurants you save will appear here."
          items={profile.savedRestaurants || []}
          limits={{ mobile: 2, tablet: 2, desktop: 3 }}
          keyOf={(s, i) => s.id || s.locationId || s.businessUsername || String(i)}
          renderItem={(s) => (
            <SavedRestaurantCard
              s={s}
              onView={() => {
                let target: string;
                if (s.locationId && s.businessUsername) {
                  target = `/${s.businessUsername}/${s.locationId}`;
                } else {
                  target = `/queue/${s.businessUsername}`;
                }
                navigate(target);
              }}
              onRemove={() => removeSavedRestaurant(s)}
            />
          )}
        />

        <ActivitySection
          title="Happening Now"
          emptyState="No active queue activity right now."
          items={activeQueue}
          limits={{ mobile: 1, tablet: 2, desktop: 2 }}
          keyOf={(q) => q.id}
          renderItem={(q) => <QueueCard q={q} />}
        />

        <ActivitySection
          title="Tables Coming Up"
          emptyState="Your upcoming reservations will appear here."
          items={upcomingReservations}
          limits={{ mobile: 2, tablet: 2, desktop: 3 }}
          keyOf={(r) => r.id}
          renderItem={(r) => <ReservationCard r={r} />}
        />

        <ActivitySection
          title="Your Reviews"
          emptyState={
            <>
              <p>Your restaurant reviews will appear here.</p>
              <p className="mt-1 text-xs">
                After you leave a review, you can edit or delete it from this section.
              </p>
            </>
          }
          items={reviews}
          limits={{ mobile: 2, tablet: 2, desktop: 3 }}
          keyOf={(rv) => rv.id}
          renderItem={(rv) => (
            <ProfileReviewCard
              review={rv}
              onEdit={() => setEditingReview(rv)}
              onDelete={() => setDeletingReview(rv)}
            />
          )}
        />

        <ActivitySection
          title="Your Dining Rewind"
          emptyState="Your past reservations and queue visits will appear here."
          items={diningHistory}
          limits={{ mobile: 2, tablet: 4, desktop: 4 }}
          keyOf={(item) => item.key}
          renderItem={(item) => {
            if (item.kind === "reservation") {
              return <ReservationCard r={item.r} typeLabel="Reservation" />;
            }
            return <QueueCard q={item.q} typeLabel="Queue" />;
          }}
        />

        <EditReviewDialog
          review={editingReview}
          onOpenChange={(open) => !open && setEditingReview(null)}
          onSaved={(updated) => {
            applyReviewUpdate(updated);
            setEditingReview(null);
          }}
        />
        <DeleteReviewDialog
          review={deletingReview}
          onOpenChange={(open) => !open && setDeletingReview(null)}
          onDeleted={(id) => {
            removeReview(id);
            setDeletingReview(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <SEO title="My Profile | SeatPing" description={CUSTOMER_DESCRIPTION} canonical="/profile" />
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 pb-12 pt-24 sm:pb-16">
        <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6">{profileContent}</div>
      </main>
      <Footer />
    </>
  );
};

type HistoryItem =
  | { kind: "reservation"; key: string; ts: number; r: Reservation }
  | { kind: "queue"; key: string; ts: number; q: QueueActivity };

function upcomingReservationTs(r: Reservation): number {
  if (!r.date || !r.time) {
    return Number.POSITIVE_INFINITY;
  }
  const ts = Date.parse(`${r.date}T${r.time}`);
  if (Number.isNaN(ts)) {
    return Number.POSITIVE_INFINITY;
  }
  return ts;
}

function reservationTs(r: Reservation): number {
  const dt = Date.parse(`${r.date ?? ""} ${r.time ?? ""}`.trim());
  if (!Number.isNaN(dt)) {
    return dt;
  }
  let c = NaN;
  if (r.createdAt) {
    c = Date.parse(r.createdAt);
  }
  if (Number.isNaN(c)) {
    return 0;
  }
  return c;
}

function queueTs(q: QueueActivity): number {
  const s =
    q.confirmedAt || q.admittedAt || q.noShowMarkedAt || q.removedAt || q.leftAt || q.joinedAt;
  let t = NaN;
  if (s) {
    t = Date.parse(s);
  }
  if (Number.isNaN(t)) {
    return 0;
  }
  return t;
}

function initialsOf(name?: string) {
  if (!name?.trim()) {
    return "?";
  }
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function ProfileHeaderCard({
  profile,
  onUpdated,
}: {
  profile: CustomerProfile;
  onUpdated: (p: CustomerProfile) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <Card className="border-0 bg-card/80 shadow-xl backdrop-blur-sm">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-900 text-base font-semibold text-white sm:h-16 sm:w-16 sm:text-xl">
            {initialsOf(profile.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-xl">
              {profile.name}
            </h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{profile.email}</p>
            {profile.phone && (
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{profile.phone}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="h-9 w-full sm:h-10 sm:w-auto"
          >
            Edit Profile
          </Button>
          <Button
            variant="outline"
            onClick={() => setPwOpen(true)}
            className="h-9 w-full sm:h-10 sm:w-auto"
          >
            Change Password
          </Button>
        </div>
      </CardContent>

      <EditDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        onUpdated={onUpdated}
      />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </Card>
  );
}

function EditDetailsDialog({
  open,
  onOpenChange,
  profile,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: CustomerProfile;
  onUpdated: (p: CustomerProfile) => void;
}) {
  const { toast } = useToast();
  const initialPhone = splitPhone(profile.phone);
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [email, setEmail] = useState(profile.email);
  const [countryCode, setCountryCode] = useState(initialPhone.dial);
  const [phone, setPhone] = useState(initialPhone.number);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const p = splitPhone(profile.phone);
    setName(profile.name);
    setUsername(profile.username ?? "");
    setEmail(profile.email);
    setCountryCode(p.dial);
    setPhone(p.number);
  }, [open, profile]);

  const save = async () => {
    if (!name.trim() || username.trim().length < 3 || !email.trim()) {
      toast({
        title: "Check your details",
        description: "Name, a username (3+ chars), and email are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      setSaving(true);
      const digits = phone.replace(/\D/g, "");
      let phoneValue = "";
      if (digits) {
        phoneValue = `${countryCode}${digits}`;
      }
      const res = await api("/auth/me", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          phone: phoneValue,
        }),
      });
      onUpdated(res.user);
      toast({ title: "Profile Updated" });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  let saveLabel = "Save Changes";
  if (saving) {
    saveLabel = "Saving...";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Details</DialogTitle>
          <DialogDescription>Update your account information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Full Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-username">Username</Label>
            <Input
              id="edit-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">
              Phone Number <span className="font-normal text-muted-foreground">(Optional)</span>
            </Label>
            <div className="flex gap-2">
              <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
              <Input
                id="edit-phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  const save = async () => {
    if (!currentPassword) {
      toast({ title: "Enter your current password", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "New password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords don't match", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      await api("/auth/me/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast({ title: "Password Updated" });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Could not change password",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  let updateLabel = "Update Password";
  if (saving) {
    updateLabel = "Updating...";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Enter your current password, then your new one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cur-pw">Current Password</Label>
            <Input
              id="cur-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New Password</Label>
            <Input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw2">New Password Again</Label>
            <Input
              id="new-pw2"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {updateLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BusinessThumb({ name }: { name?: string }) {
  return (
    <span
      aria-hidden
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/30 to-success/30 text-xs font-semibold text-slate-700 sm:h-12 sm:w-12 sm:text-sm"
    >
      {initialsOf(name)}
    </span>
  );
}

function ActivityThumb({ imageUrl, name }: { imageUrl?: string | null; name?: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || "Restaurant"}
        className="h-11 w-11 shrink-0 rounded-lg object-cover sm:h-12 sm:w-12"
      />
    );
  }
  return <BusinessThumb name={name} />;
}

function ReservationCard({ r, typeLabel }: { r: Reservation; typeLabel?: string }) {
  const displayName = r.restaurantName || r.businessName || r.businessUsername;
  let manageHoverClass = "";
  if (r.manageToken) {
    manageHoverClass = " transition-colors hover:border-slate-300";
  }
  let reservationStatus = r.status || "";
  if (reservationStatus === "arrived") {
    reservationStatus = "served";
  }
  let guestWord = "guests";
  if (r.people === 1) {
    guestWord = "guest";
  }
  let manageLinkLabel = "View Reservation";
  if (r.status === "confirmed" || !r.status) {
    manageLinkLabel = "View or Manage";
  }
  const inner = (
    <Card className={"border border-border bg-background" + manageHoverClass}>
      <CardContent className="flex gap-2.5 p-3 sm:gap-3 sm:p-4">
        <ActivityThumb imageUrl={r.imageUrl} name={displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {displayName}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {typeLabel && <StatusBadge status={typeLabel.toLowerCase()} />}
              {r.status && <StatusBadge status={reservationStatus} />}
            </div>
          </div>
          {r.locationName && (
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{r.locationName}</p>
          )}
          <p className="mt-1 text-xs text-slate-700 sm:text-sm">
            {[r.date, r.time].filter(Boolean).join(" · ")}
            {typeof r.people === "number" && (
              <span className="text-muted-foreground">
                {" "}
                · {r.people} {guestWord}
              </span>
            )}
          </p>
          {r.manageToken && (
            <p className="mt-1 text-xs font-medium text-indigo-600">{manageLinkLabel} →</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (r.manageToken) {
    return (
      <Link to={`/reservations/manage/${r.manageToken}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QueueCard({ q, typeLabel }: { q: QueueActivity; typeLabel?: string }) {
  const displayName = q.restaurantName || q.businessName || q.businessUsername;
  const isActive = q.active || q.status === "waiting";
  let liveHref: string | null = null;
  if (isActive && q.businessUsername && q.locationId) {
    let tokenQuery = "";
    if (q.queueToken) {
      tokenQuery = `?token=${encodeURIComponent(q.queueToken)}`;
    }
    liveHref = `/queue/${q.businessUsername}/${q.locationId}` + tokenQuery;
  }

  const finalTime = q.confirmedAt || q.admittedAt || q.noShowMarkedAt || q.removedAt || q.leftAt;
  let finalTimeLabel: string | null = null;
  if (!isActive && finalTime) {
    const finalTimeText = new Date(finalTime).toLocaleString();
    if (q.status === "arrived" || q.status === "admitted") {
      finalTimeLabel = `Served ${finalTimeText}`;
    } else if (q.status === "no_show") {
      finalTimeLabel = `Marked No-Show ${finalTimeText}`;
    } else if (q.status === "left") {
      finalTimeLabel = `Left ${finalTimeText}`;
    } else {
      finalTimeLabel = `Removed ${finalTimeText}`;
    }
  }

  let queueStatus = q.status || "";
  if (queueStatus === "arrived") {
    queueStatus = "served";
  }
  let partySizeWord = "guests";
  if (q.partySize === 1) {
    partySizeWord = "guest";
  }

  return (
    <Card className="border border-border bg-background">
      <CardContent className="flex gap-2.5 p-3 sm:gap-3 sm:p-4">
        <ActivityThumb imageUrl={q.imageUrl} name={displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {displayName}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {typeLabel && <StatusBadge status={typeLabel.toLowerCase()} />}
              {q.status && <StatusBadge status={queueStatus} />}
            </div>
          </div>
          {q.locationName && (
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{q.locationName}</p>
          )}
          <p className="mt-1 text-xs text-slate-700 sm:text-sm">
            {q.joinedAt && <>Joined {new Date(q.joinedAt).toLocaleString()}</>}
            {typeof q.partySize === "number" && q.partySize > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {q.partySize} {partySizeWord}
              </span>
            )}
          </p>
          {finalTimeLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">{finalTimeLabel}</p>
          )}
          {liveHref && (
            <Link
              to={liveHref}
              className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:underline"
            >
              View Live Queue →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SavedRestaurantCard({
  s,
  onView,
  onRemove,
}: {
  s: SavedRestaurant;
  onView: () => void;
  onRemove: () => void;
}) {
  const name = s.name || s.businessName || s.businessUsername;
  const locationLabel = s.locationName || [s.area, s.city].filter(Boolean).join(", ");
  let ratingLabel: string | null = null;
  if (typeof s.rating === "number") {
    ratingLabel = `★ ${s.rating.toFixed(1)}`;
  }
  const meta = [locationLabel || null, ratingLabel, s.cuisine].filter(Boolean).join(" · ");
  let thumb: React.ReactNode;
  if (s.imageUrl) {
    thumb = (
      <img
        src={s.imageUrl}
        alt={name}
        className="h-11 w-11 shrink-0 rounded-lg object-cover sm:h-12 sm:w-12"
      />
    );
  } else {
    thumb = <BusinessThumb name={name} />;
  }
  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView();
        }
      }}
      aria-label={`View ${name}`}
      className="cursor-pointer border border-border bg-background transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <CardContent className="flex gap-2.5 p-3 sm:gap-3 sm:p-4">
        {thumb}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">{name}</p>
          {meta && <p className="truncate text-xs text-muted-foreground sm:text-sm">{meta}</p>}
        </div>
        <Button
          variant="destructiveOutline"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${name} from saved`}
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

type Tier = "mobile" | "tablet" | "desktop";

function currentTier(): Tier {
  if (typeof window === "undefined") {
    return "desktop";
  }
  const w = window.innerWidth;
  if (w < 640) {
    return "mobile";
  }
  if (w < 1024) {
    return "tablet";
  }
  return "desktop";
}

function useTier(): Tier {
  const [tier, setTier] = useState<Tier>(() => currentTier());
  useEffect(() => {
    const onResize = () => setTier(currentTier());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}

function ActivitySection<T>({
  title,
  emptyState,
  items,
  limits,
  keyOf,
  renderItem,
}: {
  title: string;
  emptyState: React.ReactNode;
  items: T[];
  limits: Record<Tier, number>;
  keyOf: (item: T, index: number) => string;
  renderItem: (item: T) => React.ReactNode;
}) {
  const tier = useTier();
  const [expanded, setExpanded] = useState(false);
  const limit = limits[tier];
  const hasMore = items.length > limit;
  let visible: T[];
  if (expanded) {
    visible = items;
  } else {
    visible = items.slice(0, limit);
  }

  let toggleLabel = `View All (${items.length})`;
  if (expanded) {
    toggleLabel = "View Less";
  }

  let itemsContent: React.ReactNode;
  if (items.length === 0) {
    itemsContent = (
      <Card className="border border-dashed border-border bg-background/60">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {emptyState}
        </CardContent>
      </Card>
    );
  } else {
    itemsContent = (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
        {visible.map((item, i) => (
          <Fragment key={keyOf(item, i)}>{renderItem(item)}</Fragment>
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 sm:text-sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {toggleLabel}
          </Button>
        )}
      </div>
      {itemsContent}
    </section>
  );
}

function StarsDisplay({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        let starClass = "h-4 w-4 fill-slate-200 text-slate-200";
        if (n <= filled) {
          starClass = "h-4 w-4 fill-yellow-400 text-yellow-400";
        }
        return <Star key={n} className={starClass} />;
      })}
    </div>
  );
}

function reviewDate(value?: string | null): string {
  if (!value) {
    return "";
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    return "";
  }
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ProfileReviewCard({
  review,
  onEdit,
  onDelete,
}: {
  review: CustomerReview;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const posted = reviewDate(review.createdAt);
  let updated = "";
  if (
    review.updatedAt &&
    review.createdAt &&
    Date.parse(review.updatedAt) - Date.parse(review.createdAt) > 60_000
  ) {
    updated = reviewDate(review.updatedAt);
  }

  return (
    <Card className="border border-border bg-background">
      <CardContent className="flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-semibold text-slate-900 sm:text-base">
              {review.restaurantName || "Restaurant"}
            </p>
            {review.locationName && (
              <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">
                {review.locationName}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label="Edit review"
              className="h-8 w-8 text-muted-foreground hover:text-slate-900"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructiveOutline"
              size="icon"
              onClick={onDelete}
              aria-label="Delete review"
              className="h-8 w-8"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <StarsDisplay rating={review.rating} />

        {review.description && (
          <p className="text-xs text-slate-700 sm:text-sm">{review.description}</p>
        )}

        {(posted || updated) && (
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {posted && <>Posted {posted}</>}
            {updated && <> · Updated {updated}</>}
          </p>
        )}

        {review.businessReply && (
          <div className="mt-1 rounded-lg bg-slate-50 p-2.5 sm:p-3">
            <p className="text-[11px] font-semibold text-slate-700 sm:text-xs">
              Response From The Restaurant
            </p>
            <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">{review.businessReply}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteReviewDialog({
  review,
  onOpenChange,
  onDeleted,
}: {
  review: CustomerReview | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    if (!review) {
      return;
    }
    setDeleting(true);
    try {
      await api(`/auth/me/reviews/${review.id}`, { method: "DELETE" });
      onDeleted(review.id);
      toast({ title: "Review deleted" });
    } catch (err: any) {
      toast({
        title: "Could not delete review",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  let deleteButtonLabel: string;
  if (deleting) {
    deleteButtonLabel = "Deleting…";
  } else {
    deleteButtonLabel = "Delete Review";
  }

  return (
    <Dialog open={!!review} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>Delete This Review?</DialogTitle>
          <DialogDescription>
            This will remove your review from the restaurant page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {deleteButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Profile;
