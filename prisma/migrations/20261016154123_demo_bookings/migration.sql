CREATE TABLE "demo_bookings" (
    "calendarId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_bookings_pkey" PRIMARY KEY ("calendarId","start")
);

CREATE UNIQUE INDEX "demo_bookings_eventId_key" ON "demo_bookings"("eventId");
