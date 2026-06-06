# SeatPing

Virtual Queue and Reservations Software for Restaurants and Service Businesses.

SeatPing helps businesses manage customer flow through QR code based queues, customer notifications, reservation management, and a business dashboard built for daily front-of-house operations.

---

## Overview

SeatPing is a full-stack web application designed for restaurants, cafes, salons, barbershops, clinics, and other service businesses that need a simple way to manage waiting customers and bookings.

Customers can:

- Join a queue through a QR code or public restaurant page
- Choose a notification method such as SMS, WhatsApp, or email
- Receive updates when they are admitted or ready to return
- Confirm arrival after being admitted
- Book reservations when enabled by the business

Businesses can:

- Manage live queues
- Admit, remove, and mark customers as arrived or no-show
- Manage reservations
- Track recently left customers
- Manage multiple locations
- Configure opening hours and reservation settings
- Track customer credits and usage by location
- Edit public restaurant profiles, photos, menu, reviews, and location details

The goal is to make customer flow management simple, affordable, and accessible for small and medium-sized businesses.

---

## Problem

Many service businesses still rely on manual and fragmented systems:

- Paper waitlists
- Verbal queue systems
- Crowded waiting areas
- Manual customer notifications
- Disconnected reservation and queue workflows
- Limited visibility into wait times, no-shows, and customer flow

This creates:

- Poor customer experience
- Staff inefficiency
- Confusion at the host stand
- Missed revenue from walkaways
- Limited operational data for business owners

SeatPing modernizes the waiting and booking experience with a lightweight digital workflow.

---

## Core Features

### Virtual Queue System

- QR code queue entry
- Customer-facing queue page
- Live queue updates
- Position tracking
- Estimated wait time display
- Arrival confirmation flow
- Recently left, removed, and no-show customer tracking

### Customer Notifications

- SMS notifications
- WhatsApp notifications
- Email notifications
- Queue joined messages
- Admission and arrival messages
- Ready-to-return updates

### Reservations

- Optional reservation system per business location
- Reservation availability by opening hours
- Maximum party size configuration
- Maximum reserved guests per hour
- Reservation management dashboard
- Today, upcoming, past, cancelled, and no-show tabs

### Business Dashboard

- Live queue management
- Reservation management
- Daily performance summary
- Customers served tracking
- Average wait time tracking
- No-show tracking
- Multi-location support
- Location-specific customer credits

### Public Restaurant Pages

- Restaurant profile page
- Banner and photo gallery
- Menu highlights
- Full menu link
- Reviews and business replies
- Location details
- Queue and reservation actions

### Business Settings

- Multiple business locations
- Location display name
- Address and map links
- Opening hours
- Timezone selection
- Reservation settings
- Public profile editing
- QR code per location

### Admin Features

- Business management
- Customer management
- Featured restaurant management
- Manual business activation and access control

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router

### Backend

- Node.js
- Express.js
- Prisma ORM
- MongoDB

### Authentication and Security

- JWT authentication
- bcrypt password hashing
- Protected customer, business, and admin routes

### Services

- SMS notification provider
- WhatsApp notification provider
- Email utilities
- Google Maps and Places integration
- Image upload service

## Data model and concurrency

Live queue and reservation state live in dedicated, indexed Prisma models, not
in JSON arrays on the Location document:

- `QueueEntry` — one row per waitlist ticket; status transitions
  (WAITING/ADMITTED/ARRIVED/NO_SHOW/REMOVED/LEFT) are atomic, status-guarded
  updates, so concurrent admits/leaves can't lose or double-process entries.
- `Reservation` — one row per booking, looked up by indexed `manageToken`.
- `SlotCounter` — atomic per-hour capacity counter; a guarded `$inc` enforces
  `maxReservedGuestsPerHour`, so simultaneous bookings can never overbook.

Contended single-document writes (location credits, slot counters) are wrapped
in `withWriteRetry` (server/lib/dbRetry.ts) to absorb MongoDB write conflicts
(P2034) under load. The legacy `queue` / `admittedCustomers` / `removedCustomers`
/ `reservations` JSON fields on Location were removed from the schema once the
migration was verified in production (Phase 7). Their raw values still exist in
older Mongo documents (unmapped) and can be recovered by re-adding the fields to
the schema if ever needed.

The one-off `scripts/migrate-to-models.ts` (run dry, then `--commit`) handled the
original JSON-to-model migration; it is idempotent and never deleted JSON data,
and is retained as a historical record.

## Background jobs

- Notifications (SMS/WhatsApp/email) are sent out-of-band so user requests
  return immediately. When QStash is configured they are published to a queue
  and delivered via `POST /api/jobs/notify` (signature-verified) with retries;
  otherwise they fall back to fire-and-forget inline sends.
- Scheduled work hits `CRON_SECRET`-protected endpoints:
  `/api/cron/credit-refill` (daily) and `/api/cron/reservation-reminders`
  (hourly). `credit-refill` runs as a native Vercel Cron (`vercel.json` →
  `crons`, daily — the Hobby plan only allows once-per-day crons).
  `reservation-reminders` needs hourly cadence, so it is driven by a QStash
  Schedule that POSTs the endpoint with a forwarded
  `Authorization: Bearer <CRON_SECRET>` header (no Hobby cron limit). The legacy
  `setInterval` sweeps still run for long-lived/local servers (skipped on Vercel).

## Environment variables

Core: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_ORIGIN`,
`FRONTEND_URL`, `EMAIL_PASSWORD`, `TELNYX_API_KEY`, `TELNYX_PHONE_NUMBER`,
`KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `CLOUDINARY_*`,
`VITE_GOOGLE_MAPS_API_KEY`.

Scalability features (optional; graceful fallback when unset):

- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` —
  enable async notification delivery via QStash. Without them, notifications send
  inline (fine for local dev).
- `CRON_SECRET` — required for the Vercel Cron endpoints to run. Set it in the
  Vercel project so Cron requests are authorized.
- `PUBLIC_BASE_URL` — public origin QStash calls back for the worker (defaults to
  `FRONTEND_URL`).

Note: sub-daily Vercel Cron schedules require a paid Vercel plan; on the free
plan the crons fall back to daily.
