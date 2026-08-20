import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { isReturning, recomputeGuestStats, SUGGESTED_GUEST_TAGS } from "../lib/guests.js";
import { reservationStatusToLegacy } from "../lib/liveData.js";
import { getLocationTimezone } from "../lib/operatingHours.js";
import type { GuestProfile, QueueEntry, Reservation } from "@prisma/client";

const router = Router();

const guestsLimiter = rateLimit({
  name: "guests-api",
  windowMs: 60 * 1000,
  max: 120,
});
router.use(requireBusiness, guestsLimiter);

function bizId(req: any): string {
  return String(req.auth?.sub || "");
}

async function ownedLocation(businessId: string, locationId: string) {
  if (!locationId) {
    return null;
  }
  return prisma.location.findFirst({
    where: { id: locationId, businessId },
    select: {
      id: true,
      name: true,
      displayName: true,
      address: true,
      restaurantProfile: true,
    },
  });
}

function locationLabel(loc: {
  name: string | null;
  displayName: string | null;
  address: string;
}): string {
  return loc.displayName || loc.name || loc.address || "Location";
}

function serializeGuestRow(g: GuestProfile) {
  return {
    id: g.id,
    firstName: g.firstName,
    lastName: g.lastName,
    fullName: g.fullName || [g.firstName, g.lastName].filter(Boolean).join(" ") || null,
    phone: g.phone,
    normalizedPhone: g.normalizedPhone,
    email: g.email,
    tags: g.tags,
    totalVisits: g.totalVisits,
    waitlistVisitCount: g.waitlistVisitCount,
    upcomingReservationCount: g.upcomingReservationCount,
    pastReservationCount: g.pastReservationCount,
    noShowCount: g.noShowCount,
    cancelledCount: g.cancelledCount,
    firstVisitAt: g.firstVisitAt,
    lastVisitAt: g.lastVisitAt,
    hasNotes: Boolean(g.notes && g.notes.trim()),
    returning: isReturning(g.totalVisits),
    locationId: g.locationId,
  };
}

router.get("/meta", async (req, res) => {
  try {
    const businessId = bizId(req);
    const locations = await prisma.location.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, displayName: true, address: true },
    });
    return res.json({
      locations: locations.map((l) => ({ id: l.id, label: locationLabel(l) })),
      suggestedTags: SUGGESTED_GUEST_TAGS,
    });
  } catch (err: any) {
    console.error("[guests] meta error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const businessId = bizId(req);
    const locationId = String(req.query.locationId || "").trim();
    const location = await ownedLocation(businessId, locationId);
    if (!location) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }

    const search = String(req.query.search || "").trim();
    const type = String(req.query.type || "")
      .trim()
      .toLowerCase();
    const tagsParam = String(req.query.tags || "").trim();
    let tags: string[];
    if (tagsParam) {
      tags = tagsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else {
      tags = [];
    }
    const hasUpcoming = String(req.query.hasUpcoming || "") === "true";
    const hasNotes = String(req.query.hasNotes || "") === "true";
    const hasNoShow = String(req.query.hasNoShow || "") === "true";

    const where: any = { businessId, locationId };

    const idsParam = String(req.query.ids || "").trim();
    if (idsParam) {
      where.id = {
        in: idsParam
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean),
      };
    }

    if (search) {
      const digits = search.replace(/\D+/g, "");
      const or: any[] = [
        { fullName: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
      if (digits.length >= 3) {
        or.push({ normalizedPhone: { contains: digits } });
      }

      const tagsRaw = (await prisma.guestProfile.findRaw({
        filter: {
          businessId: { $oid: businessId },
          locationId: { $oid: locationId },
          tags: { $regex: search, $options: "i" },
        },
      })) as unknown as any[];
      if (tagsRaw.length) {
        or.push({ id: { in: tagsRaw.map((t: any) => t._id.$oid) } });
      }

      where.AND = [...(where.AND || []), { OR: or }];
    }

    if (tags.length) {
      where.tags = { hasSome: tags };
    }
    if (type === "returning") {
      where.totalVisits = { gte: 2 };
    } else if (type === "new") {
      where.totalVisits = { lt: 2 };
    }
    if (hasUpcoming) {
      where.upcomingReservationCount = { gt: 0 };
    }
    if (hasNoShow) {
      where.noShowCount = { gt: 0 };
    }
    if (hasNotes) {
      where.AND = [...(where.AND || []), { notes: { not: null } }, { notes: { not: "" } }];
    }

    const guests = await prisma.guestProfile.findMany({
      where,
      orderBy: [{ lastVisitAt: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });

    return res.json({
      location: {
        id: location.id,
        label: locationLabel(location),
        timezone: getLocationTimezone(location),
      },
      guests: guests.map(serializeGuestRow),
    });
  } catch (err: any) {
    console.error("[guests] list error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/:guestId", async (req, res) => {
  try {
    const businessId = bizId(req);
    const guestId = String(req.params.guestId || "").trim();
    const guest = await prisma.guestProfile.findFirst({
      where: { id: guestId, businessId },
    });
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    const location = await prisma.location.findFirst({
      where: { id: guest.locationId, businessId },
      select: {
        id: true,
        name: true,
        displayName: true,
        address: true,
        restaurantProfile: true,
      },
    });
    let locLabel = "Location";
    if (location) {
      locLabel = locationLabel(location);
    }
    const locTz = getLocationTimezone(location);

    let queueRowsPromise: Promise<QueueEntry[]> = Promise.resolve([] as QueueEntry[]);
    if (guest.sourceQueueEntryIds.length) {
      queueRowsPromise = prisma.queueEntry.findMany({
        where: { id: { in: guest.sourceQueueEntryIds }, businessId },
      });
    }
    let reservationRowsPromise: Promise<Reservation[]> = Promise.resolve([] as Reservation[]);
    if (guest.sourceReservationIds.length) {
      reservationRowsPromise = prisma.reservation.findMany({
        where: { id: { in: guest.sourceReservationIds }, businessId },
      });
    }

    const [queueRows, reservationRows] = await Promise.all([
      queueRowsPromise,
      reservationRowsPromise,
    ]);

    const now = Date.now();

    const waitlistHistory = queueRows
      .map((q) => {
        let at: string | null = null;
        let atLabel: string | null = null;
        if (q.joinedAt) {
          at = new Date(q.joinedAt).toISOString();
          atLabel = formatInstantInTz(q.joinedAt, locTz);
        }
        return {
          id: q.id,
          source: "waitlist" as const,
          status: legacyQueueStatus(q),
          partySize: q.guestCount,
          at,
          atLabel,
          location: locLabel,
          notes: null as string | null,
        };
      })
      .sort((a, b) => timeDesc(a.at, b.at));

    const reservationEvents = reservationRows.map((r) => {
      let when: Date | null = null;
      if (r.reservationDateTime) {
        when = new Date(r.reservationDateTime);
      }
      const legacyStatus = reservationStatusToLegacy(r.status);
      const upcoming =
        !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(r.status) &&
        !!when &&
        when.getTime() >= now;
      let at: string | null = null;
      if (when && !Number.isNaN(when.getTime())) {
        at = when.toISOString();
      }
      return {
        id: r.id,
        source: "reservation" as const,
        status: legacyStatus,
        partySize: r.guestCount,
        at,
        atLabel: formatWallClockLabel(r.reservationDateTime),
        location: locLabel,
        notes: r.notes || null,
        upcoming,
      };
    });

    const upcomingReservations = reservationEvents
      .filter((r) => r.upcoming)
      .sort((a, b) => timeAsc(a.at, b.at));
    const pastReservations = reservationEvents
      .filter((r) => !r.upcoming)
      .sort((a, b) => timeDesc(a.at, b.at));

    const timeline = [
      ...waitlistHistory,
      ...reservationEvents.map(({ upcoming, ...rest }) => rest),
    ].sort((a, b) => timeDesc(a.at, b.at));

    return res.json({
      guest: {
        ...serializeGuestRow(guest),
        normalizedPhone: guest.normalizedPhone,
        normalizedEmail: guest.normalizedEmail,
        notes: guest.notes || "",
        summary: guest.summary || "",
        createdAt: guest.createdAt,
        updatedAt: guest.updatedAt,
        businessUsername: guest.businessUsername,
        location: { id: guest.locationId, label: locLabel, timezone: locTz },
      },
      timeline,
      upcomingReservations,
      pastReservations,
      waitlistHistory,
    });
  } catch (err: any) {
    console.error("[guests] detail error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:guestId", async (req, res) => {
  try {
    const businessId = bizId(req);
    const guestId = String(req.params.guestId || "").trim();
    const guest = await prisma.guestProfile.findFirst({
      where: { id: guestId, businessId },
      select: { id: true },
    });
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    const data: { notes?: string; tags?: string[] } = {};

    if (req.body?.notes !== undefined) {
      if (typeof req.body.notes !== "string") {
        return res.status(400).json({ error: "notes must be a string" });
      }
      data.notes = req.body.notes.slice(0, 5000);
    }

    if (req.body?.tags !== undefined) {
      const tags = sanitizeTags(req.body.tags);
      if (tags === null) {
        return res.status(400).json({ error: "tags must be an array of strings" });
      }
      data.tags = tags;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.guestProfile.update({
      where: { id: guest.id },
      data,
    });
    return res.json({ guest: serializeGuestRow(updated) });
  } catch (err: any) {
    console.error("[guests] patch error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:guestId/tags", async (req, res) => {
  try {
    const businessId = bizId(req);
    const guestId = String(req.params.guestId || "").trim();
    const tag = String(req.body?.tag || "")
      .trim()
      .slice(0, 40);
    if (!tag) {
      return res.status(400).json({ error: "tag is required" });
    }

    const guest = await prisma.guestProfile.findFirst({
      where: { id: guestId, businessId },
      select: { id: true, tags: true },
    });
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    const exists = guest.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    let tags = guest.tags;
    if (!exists) {
      tags = [...guest.tags, tag];
    }
    if (tags.length > 30) {
      return res.status(400).json({ error: "Too many tags" });
    }

    const updated = await prisma.guestProfile.update({
      where: { id: guest.id },
      data: { tags },
    });
    return res.json({ guest: serializeGuestRow(updated) });
  } catch (err: any) {
    console.error("[guests] add tag error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:guestId/tags/:tag", async (req, res) => {
  try {
    const businessId = bizId(req);
    const guestId = String(req.params.guestId || "").trim();
    const tag = decodeURIComponent(String(req.params.tag || "")).trim();
    if (!tag) {
      return res.status(400).json({ error: "tag is required" });
    }

    const guest = await prisma.guestProfile.findFirst({
      where: { id: guestId, businessId },
      select: { id: true, tags: true },
    });
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    const tags = guest.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
    const updated = await prisma.guestProfile.update({
      where: { id: guest.id },
      data: { tags },
    });
    return res.json({ guest: serializeGuestRow(updated) });
  } catch (err: any) {
    console.error("[guests] remove tag error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:guestId/recompute", async (req, res) => {
  try {
    const businessId = bizId(req);
    const guestId = String(req.params.guestId || "").trim();
    const guest = await prisma.guestProfile.findFirst({
      where: { id: guestId, businessId },
      select: { id: true },
    });
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }
    await recomputeGuestStats(guest.id);
    const updated = await prisma.guestProfile.findUnique({ where: { id: guest.id } });
    let serializedGuest = null;
    if (updated) {
      serializedGuest = serializeGuestRow(updated);
    }
    return res.json({ guest: serializedGuest });
  } catch (err: any) {
    console.error("[guests] recompute error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

function sanitizeTags(input: unknown): string[] | null {
  if (!Array.isArray(input)) {
    return null;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      return null;
    }
    const tag = raw.trim().slice(0, 40);
    if (!tag) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 30);
}

function legacyQueueStatus(q: QueueEntry): string {
  switch (q.status) {
    case "ADMITTED":
    case "ARRIVED":
      if (q.status === "ARRIVED") {
        return "arrived";
      }
      return "admitted";
    case "NO_SHOW":
      return "no_show";
    case "REMOVED":
      return "removed";
    case "LEFT":
      return "left";
    default:
      return "waiting";
  }
}

function timeDesc(a: string | null, b: string | null): number {
  let aTime = 0;
  if (a) {
    aTime = Date.parse(a);
  }
  let bTime = 0;
  if (b) {
    bTime = Date.parse(b);
  }
  return bTime - aTime;
}
function timeAsc(a: string | null, b: string | null): number {
  let aTime = 0;
  if (a) {
    aTime = Date.parse(a);
  }
  let bTime = 0;
  if (b) {
    bTime = Date.parse(b);
  }
  return aTime - bTime;
}

const VISIT_LABEL_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function formatInstantInTz(date: Date | string, timeZone: string): string | null {
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else {
    d = new Date(date);
  }
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  try {
    return d.toLocaleString("en-US", { ...VISIT_LABEL_OPTS, timeZone });
  } catch {
    return d.toLocaleString("en-US", VISIT_LABEL_OPTS);
  }
}

function formatWallClockLabel(wallClock: string | null | undefined): string | null {
  if (!wallClock) {
    return null;
  }
  let iso = wallClock;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wallClock)) {
    iso = `${wallClock}:00Z`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleString("en-US", { ...VISIT_LABEL_OPTS, timeZone: "UTC" });
}

export default router;
