-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'ADMITTED', 'ARRIVED', 'NO_SHOW', 'REMOVED', 'LEFT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "CampaignTemplateType" AS ENUM ('SEATPING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CampaignTemplateApprovalStatus" AS ENUM ('DRAFT', 'PENDING_SEATPING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'RECURRING', 'PAUSED');

-- CreateEnum
CREATE TYPE "CampaignSendMode" AS ENUM ('NOW', 'SCHEDULED', 'RECURRING');

-- CreateEnum
CREATE TYPE "CampaignFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CampaignRunType" AS ENUM ('MANUAL', 'SCHEDULED', 'RECURRING');

-- CreateEnum
CREATE TYPE "CampaignRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'SQUARE', 'RECTANGLE');

-- CreateEnum
CREATE TYPE "TableAssignmentSource" AS ENUM ('SMART', 'MANUAL');

-- CreateEnum
CREATE TYPE "TableAssignmentStatus" AS ENUM ('RESERVED', 'SEATED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "upcomingReservations" JSONB NOT NULL DEFAULT '[]',
    "pastReservations" JSONB NOT NULL DEFAULT '[]',
    "queueingActivity" JSONB NOT NULL DEFAULT '[]',
    "savedRestaurants" JSONB NOT NULL DEFAULT '[]',
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "trial" BOOLEAN NOT NULL DEFAULT true,
    "trialDurationDays" INTEGER NOT NULL DEFAULT 7,
    "maxLocations" INTEGER NOT NULL DEFAULT 1,
    "baseCredits" INTEGER NOT NULL DEFAULT 300,
    "language" TEXT DEFAULT 'en',
    "creditsStartedAt" TIMESTAMP(3),
    "lastCreditRefillAt" TIMESTAMP(3),
    "nextCreditRefillAt" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessUsername" TEXT,
    "name" TEXT,
    "displayName" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googlePlaceId" TEXT,
    "googleMapsUrl" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "baseCredits" INTEGER NOT NULL DEFAULT 0,
    "queueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reservationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reservationSettings" JSONB NOT NULL DEFAULT '{}',
    "restaurantProfile" JSONB NOT NULL DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "bannerImageUrl" TEXT,
    "bannerImagePublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerUsername" TEXT,
    "rating" INTEGER NOT NULL,
    "description" TEXT,
    "partySize" INTEGER,
    "serviceType" TEXT,
    "businessReply" TEXT,
    "businessReplyCreatedAt" TIMESTAMP(3),
    "businessReplyUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_restaurants" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT,
    "subject" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderPhone" TEXT,
    "businessName" TEXT,
    "data" JSONB NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" TEXT NOT NULL,
    "queueToken" TEXT NOT NULL,
    "legacyKey" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "notificationMethod" TEXT NOT NULL,
    "phone" TEXT,
    "countryCode" TEXT,
    "email" TEXT,
    "smsConsent" BOOLEAN NOT NULL DEFAULT false,
    "smsMarketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "finalStatus" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "admittedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations_v2" (
    "id" TEXT NOT NULL,
    "manageToken" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessUsername" TEXT,
    "customerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "name" TEXT,
    "guestCount" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "countryCode" TEXT,
    "contactMethod" TEXT,
    "reservationDateTime" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "source" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "needsReviewReason" TEXT,
    "needsReviewNotifiedAt" TIMESTAMP(3),
    "reminderEmailSentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_profiles" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessUsername" TEXT,
    "locationId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "normalizedPhone" TEXT,
    "normalizedEmail" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "summary" TEXT,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "firstVisitAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "upcomingReservationCount" INTEGER NOT NULL DEFAULT 0,
    "pastReservationCount" INTEGER NOT NULL DEFAULT 0,
    "waitlistVisitCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "sourceReservationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceQueueEntryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailMarketingOptIn" BOOLEAN NOT NULL DEFAULT true,
    "whatsappMarketingOptIn" BOOLEAN NOT NULL DEFAULT true,
    "smsMarketingOptIn" BOOLEAN NOT NULL DEFAULT true,
    "emailMarketingOptOutAt" TIMESTAMP(3),
    "whatsappMarketingOptOutAt" TIMESTAMP(3),
    "smsMarketingOptOutAt" TIMESTAMP(3),
    "marketingOptOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_templates" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "businessUsername" TEXT,
    "locationId" TEXT,
    "templateType" "CampaignTemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "purpose" TEXT,
    "body" TEXT NOT NULL,
    "offerDetails" TEXT,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exampleValues" JSONB NOT NULL DEFAULT '{}',
    "approvalStatus" "CampaignTemplateApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "internalReviewNotes" TEXT,
    "whatsappMetaStatus" TEXT,
    "whatsappProviderTemplateName" TEXT,
    "whatsappProviderTemplateId" TEXT,
    "whatsappMetaCategory" TEXT,
    "whatsappLanguage" TEXT DEFAULT 'en',
    "whatsappSubmittedAt" TIMESTAMP(3),
    "whatsappApprovedAt" TIMESTAMP(3),
    "whatsappRejectedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessUsername" TEXT,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateValues" JSONB NOT NULL DEFAULT '{}',
    "audienceType" TEXT NOT NULL,
    "audienceConfig" JSONB NOT NULL DEFAULT '{}',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "sendMode" "CampaignSendMode" NOT NULL DEFAULT 'NOW',
    "timezone" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "recurrenceFrequency" "CampaignFrequency",
    "recurrenceStartAt" TIMESTAMP(3),
    "recurrenceEndAt" TIMESTAMP(3),
    "maxSendsPerGuestWindowDays" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_runs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "runType" "CampaignRunType" NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "CampaignRunStatus" NOT NULL DEFAULT 'PENDING',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "guestProfileId" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_delivery_logs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT,
    "eventType" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_counters" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "reservedGuests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "slot_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_audiences" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessUsername" TEXT,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plans" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Dining Room',
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 800,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "minimumPartySize" INTEGER NOT NULL DEFAULT 1,
    "shape" "TableShape" NOT NULL DEFAULT 'RECTANGLE',
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 120,
    "height" INTEGER NOT NULL DEFAULT 80,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "cleaningSince" TIMESTAMP(3),
    "assignmentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_assignments" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "tableIds" TEXT[],
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "reservationId" TEXT,
    "guestProfileId" TEXT,
    "partySize" INTEGER NOT NULL,
    "source" "TableAssignmentSource" NOT NULL,
    "status" "TableAssignmentStatus" NOT NULL DEFAULT 'RESERVED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedStartAt" TIMESTAMP(3) NOT NULL,
    "expectedEndAt" TIMESTAMP(3) NOT NULL,
    "seatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_zones" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 300,
    "height" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_username_key" ON "businesses"("username");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_email_key" ON "businesses"("email");

-- CreateIndex
CREATE INDEX "locations_businessId_idx" ON "locations"("businessId");

-- CreateIndex
CREATE INDEX "locations_businessUsername_idx" ON "locations"("businessUsername");

-- CreateIndex
CREATE INDEX "locations_isPublished_idx" ON "locations"("isPublished");

-- CreateIndex
CREATE INDEX "photos_locationId_idx" ON "photos"("locationId");

-- CreateIndex
CREATE INDEX "reviews_locationId_idx" ON "reviews"("locationId");

-- CreateIndex
CREATE INDEX "reviews_customerId_idx" ON "reviews"("customerId");

-- CreateIndex
CREATE INDEX "featured_restaurants_businessId_idx" ON "featured_restaurants"("businessId");

-- CreateIndex
CREATE INDEX "featured_restaurants_isActive_idx" ON "featured_restaurants"("isActive");

-- CreateIndex
CREATE INDEX "featured_restaurants_sortOrder_idx" ON "featured_restaurants"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "featured_restaurants_locationId_key" ON "featured_restaurants"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_type_idx" ON "tickets"("type");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_queueToken_key" ON "queue_entries"("queueToken");

-- CreateIndex
CREATE INDEX "queue_entries_locationId_status_idx" ON "queue_entries"("locationId", "status");

-- CreateIndex
CREATE INDEX "queue_entries_businessId_idx" ON "queue_entries"("businessId");

-- CreateIndex
CREATE INDEX "queue_entries_legacyKey_idx" ON "queue_entries"("legacyKey");

-- CreateIndex
CREATE INDEX "queue_entries_customerId_idx" ON "queue_entries"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_v2_manageToken_key" ON "reservations_v2"("manageToken");

-- CreateIndex
CREATE INDEX "reservations_v2_locationId_status_idx" ON "reservations_v2"("locationId", "status");

-- CreateIndex
CREATE INDEX "reservations_v2_locationId_needsReview_idx" ON "reservations_v2"("locationId", "needsReview");

-- CreateIndex
CREATE INDEX "reservations_v2_businessId_idx" ON "reservations_v2"("businessId");

-- CreateIndex
CREATE INDEX "reservations_v2_reservationDateTime_idx" ON "reservations_v2"("reservationDateTime");

-- CreateIndex
CREATE INDEX "reservations_v2_customerId_idx" ON "reservations_v2"("customerId");

-- CreateIndex
CREATE INDEX "guest_profiles_businessId_idx" ON "guest_profiles"("businessId");

-- CreateIndex
CREATE INDEX "guest_profiles_locationId_idx" ON "guest_profiles"("locationId");

-- CreateIndex
CREATE INDEX "guest_profiles_businessId_locationId_idx" ON "guest_profiles"("businessId", "locationId");

-- CreateIndex
CREATE INDEX "guest_profiles_normalizedPhone_idx" ON "guest_profiles"("normalizedPhone");

-- CreateIndex
CREATE INDEX "guest_profiles_normalizedEmail_idx" ON "guest_profiles"("normalizedEmail");

-- CreateIndex
CREATE INDEX "guest_profiles_tags_idx" ON "guest_profiles" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "guest_profiles_lastVisitAt_idx" ON "guest_profiles"("lastVisitAt");

-- CreateIndex
CREATE INDEX "guest_profiles_fullName_idx" ON "guest_profiles"("fullName");

-- CreateIndex
CREATE INDEX "campaign_templates_businessId_idx" ON "campaign_templates"("businessId");

-- CreateIndex
CREATE INDEX "campaign_templates_templateType_idx" ON "campaign_templates"("templateType");

-- CreateIndex
CREATE INDEX "campaign_templates_approvalStatus_idx" ON "campaign_templates"("approvalStatus");

-- CreateIndex
CREATE INDEX "campaign_templates_slug_idx" ON "campaign_templates"("slug");

-- CreateIndex
CREATE INDEX "campaigns_businessId_idx" ON "campaigns"("businessId");

-- CreateIndex
CREATE INDEX "campaigns_businessId_locationId_idx" ON "campaigns"("businessId", "locationId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_nextRunAt_idx" ON "campaigns"("nextRunAt");

-- CreateIndex
CREATE INDEX "campaign_runs_campaignId_idx" ON "campaign_runs"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_runs_businessId_idx" ON "campaign_runs"("businessId");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaignId_idx" ON "campaign_recipients"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_recipients_runId_idx" ON "campaign_recipients"("runId");

-- CreateIndex
CREATE INDEX "campaign_recipients_businessId_idx" ON "campaign_recipients"("businessId");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaignId_guestProfileId_idx" ON "campaign_recipients"("campaignId", "guestProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_runId_guestProfileId_key" ON "campaign_recipients"("runId", "guestProfileId");

-- CreateIndex
CREATE INDEX "campaign_delivery_logs_campaignId_idx" ON "campaign_delivery_logs"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_delivery_logs_recipientId_idx" ON "campaign_delivery_logs"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "slot_counters_locationId_dateKey_hour_key" ON "slot_counters"("locationId", "dateKey", "hour");

-- CreateIndex
CREATE INDEX "saved_audiences_businessId_idx" ON "saved_audiences"("businessId");

-- CreateIndex
CREATE INDEX "saved_audiences_businessId_locationId_idx" ON "saved_audiences"("businessId", "locationId");

-- CreateIndex
CREATE INDEX "floor_plans_businessId_idx" ON "floor_plans"("businessId");

-- CreateIndex
CREATE INDEX "floor_plans_locationId_sortOrder_idx" ON "floor_plans"("locationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "floor_plans_locationId_name_key" ON "floor_plans"("locationId", "name");

-- CreateIndex
CREATE INDEX "dining_tables_floorPlanId_idx" ON "dining_tables"("floorPlanId");

-- CreateIndex
CREATE INDEX "dining_tables_businessId_idx" ON "dining_tables"("businessId");

-- CreateIndex
CREATE INDEX "dining_tables_locationId_isBlocked_idx" ON "dining_tables"("locationId", "isBlocked");

-- CreateIndex
CREATE INDEX "dining_tables_locationId_cleaningSince_idx" ON "dining_tables"("locationId", "cleaningSince");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_locationId_name_key" ON "dining_tables"("locationId", "name");

-- CreateIndex
CREATE INDEX "table_assignments_tableId_status_idx" ON "table_assignments"("tableId", "status");

-- CreateIndex
CREATE INDEX "table_assignments_tableIds_idx" ON "table_assignments" USING GIN ("tableIds");

-- CreateIndex
CREATE INDEX "table_assignments_locationId_status_idx" ON "table_assignments"("locationId", "status");

-- CreateIndex
CREATE INDEX "table_assignments_businessId_idx" ON "table_assignments"("businessId");

-- CreateIndex
CREATE INDEX "table_assignments_reservationId_idx" ON "table_assignments"("reservationId");

-- CreateIndex
CREATE INDEX "table_assignments_queueEntryId_idx" ON "table_assignments"("queueEntryId");

-- CreateIndex
CREATE INDEX "table_assignments_locationId_expectedStartAt_idx" ON "table_assignments"("locationId", "expectedStartAt");

-- CreateIndex
CREATE INDEX "table_assignments_expectedEndAt_idx" ON "table_assignments"("expectedEndAt");

-- CreateIndex
CREATE INDEX "floor_zones_locationId_idx" ON "floor_zones"("locationId");

-- CreateIndex
CREATE INDEX "floor_zones_businessId_idx" ON "floor_zones"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "floor_zones_floorPlanId_name_key" ON "floor_zones"("floorPlanId", "name");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_restaurants" ADD CONSTRAINT "featured_restaurants_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_restaurants" ADD CONSTRAINT "featured_restaurants_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "dining_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_zones" ADD CONSTRAINT "floor_zones_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

