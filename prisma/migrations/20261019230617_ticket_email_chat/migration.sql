ALTER TABLE "tickets" ADD COLUMN     "emailThreadId" TEXT;

CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderEmail" TEXT,
    "message" TEXT NOT NULL,
    "quotedText" TEXT,
    "isTeamResponse" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "emailMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestId" TEXT,
    "sendStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_inbox_sync" (
    "id" TEXT NOT NULL,
    "uidValidity" TEXT NOT NULL DEFAULT '',
    "lastUid" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "hasError" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ticket_inbox_sync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_messages_emailMessageId_key" ON "ticket_messages"("emailMessageId");

CREATE UNIQUE INDEX "ticket_messages_requestId_key" ON "ticket_messages"("requestId");

CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

CREATE INDEX "ticket_messages_status_createdAt_idx" ON "ticket_messages"("status", "createdAt");

CREATE UNIQUE INDEX "tickets_emailThreadId_key" ON "tickets"("emailThreadId");

ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ticket_messages" ("id", "ticketId", "sender", "message", "isTeamResponse", "status", "createdAt", "updatedAt")
SELECT t.id || '-legacy-' || item.ordinality::text, t.id,
       item.value->>'sender', item.value->>'message',
       COALESCE(item.value->>'isTeamResponse' = 'true', false),
       CASE WHEN item.value->>'isTeamResponse' = 'true' THEN 'SENT' ELSE 'RECEIVED' END,
       t."createdAt" + (item.ordinality * interval '1 millisecond'), t."updatedAt"
FROM tickets t
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.messages) = 'array' THEN t.messages ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ordinality)
WHERE jsonb_typeof(item.value->'sender') = 'string' AND jsonb_typeof(item.value->'message') = 'string';
