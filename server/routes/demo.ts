import express from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { rateLimit, limitGuard, HOURS, MINUTES } from "../lib/rateLimit.js";
import {
  calendarAccessToken,
  calendarBusy,
  calendarConfig,
  createDemoEvent,
  CalendarConflictError,
} from "../lib/googleCalendar.js";
import {
  calculateDemoSlots,
  isDemoSlot,
  isTimezone,
  monthRange,
  DEMO_SLOT_MS,
  DEMO_HORIZON_DAYS,
} from "../../shared/demoBooking.js";

const router = express.Router();
const timezone = z.string().max(100).refine(isTimezone);
const bookingSchema = z
  .object({
    start: z.string().datetime(),
    timezone,
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\p{Cc}]+$/u),
    email: z.string().trim().email().max(254),
    company: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.get(
  "/availability",
  rateLimit({ name: "demo-availability", windowMs: MINUTES(1), max: 30 }),
  async (req, res) => {
    const input = z
      .object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), timezone })
      .safeParse(req.query);
    if (!input.success) {
      return res.status(400).json({ error: "Choose a valid month and timezone." });
    }
    const { month, timezone: zone } = input.data;
    const range = monthRange(month);
    const now = new Date();
    if (
      range.end.getTime() < now.getTime() ||
      range.start.getTime() > now.getTime() + DEMO_HORIZON_DAYS * 86_400_000
    ) {
      return res.status(400).json({ error: "Choose a month within the next 90 days." });
    }
    try {
      const { calendarId } = calendarConfig();
      const token = await calendarAccessToken();
      const busy = await calendarBusy(token, range.start, range.end);
      const claims = await prisma.demoBooking.findMany({
        where: { calendarId, start: { gte: range.start, lt: range.end } },
        select: { start: true },
      });
      const held = claims.map((claim) => ({
        start: claim.start.toISOString(),
        end: new Date(claim.start.getTime() + DEMO_SLOT_MS).toISOString(),
      }));
      return res.json({ slots: calculateDemoSlots(month, zone, [...busy, ...held], now) });
    } catch {
      return res
        .status(503)
        .json({ error: "Calendar availability could not be verified. Please try again later." });
    }
  },
);

router.post(
  "/book",
  rateLimit({ name: "demo-book-ip", windowMs: HOURS(1), max: 10 }),
  async (req, res) => {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success || !isDemoSlot(new Date(parsed.data.start))) {
      return res.status(400).json({
        error:
          "Enter a valid name, email, timezone, and future weekday slot within business hours.",
      });
    }
    const customer = parsed.data;
    if (
      await limitGuard(req, res, [
        { name: "demo-book-email", key: customer.email.toLowerCase(), windowMs: HOURS(1), max: 3 },
      ])
    ) {
      return;
    }
    const start = new Date(customer.start);
    const end = new Date(start.getTime() + DEMO_SLOT_MS);
    const eventId = randomUUID().replaceAll("-", "");
    let claimed = false;
    let insertionStarted = false;
    try {
      const { calendarId } = calendarConfig();
      const token = await calendarAccessToken();
      await prisma.demoBooking.create({ data: { calendarId, start, eventId } });
      claimed = true;
      const busy = await calendarBusy(token, start, end);
      if (
        !isDemoSlot(start) ||
        busy.some(
          (item) =>
            start.getTime() < Date.parse(item.end) && end.getTime() > Date.parse(item.start),
        )
      ) {
        throw new CalendarConflictError();
      }
      insertionStarted = true;
      const event = await createDemoEvent(token, eventId, start, end, {
        name: customer.name,
        email: customer.email,
        company: customer.company,
        notes: customer.notes,
        timezone: customer.timezone,
      });
      await prisma.demoBooking.update({ where: { eventId }, data: { status: "confirmed" } });
      return res
        .status(201)
        .json({ start: start.toISOString(), end: end.toISOString(), meetLink: event.meetLink });
    } catch (error) {
      if (claimed && !insertionStarted) {
        try {
          await prisma.demoBooking.delete({ where: { eventId } });
        } catch {
          return res
            .status(503)
            .json({ error: "This slot could not be released. Please choose another time." });
        }
      }
      if (
        error instanceof CalendarConflictError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        return res
          .status(409)
          .json({ error: "This time is no longer available. Please choose another slot." });
      }
      if (insertionStarted) {
        return res.status(503).json({
          error:
            "We could not confirm the booking result. Please check your calendar invitation before trying another time.",
          uncertain: true,
        });
      }
      return res
        .status(503)
        .json({ error: "Calendar availability could not be verified. Please try again later." });
    }
  },
);

export default router;
