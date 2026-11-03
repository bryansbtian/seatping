ALTER TABLE "blog_posts" ADD COLUMN     "collaborationState" BYTEA;

CREATE TABLE "blog_editor_presence" (
    "postId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_editor_presence_pkey" PRIMARY KEY ("postId","clientId")
);

CREATE INDEX "blog_editor_presence_postId_lastSeenAt_idx" ON "blog_editor_presence"("postId", "lastSeenAt");

ALTER TABLE "blog_editor_presence" ADD CONSTRAINT "blog_editor_presence_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
