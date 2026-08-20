-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "accent" TEXT NOT NULL DEFAULT 'violet',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hub_slug_key" ON "Hub"("slug");

-- CreateIndex
CREATE INDEX "Hub_status_position_idx" ON "Hub"("status", "position");

-- AlterTable: added nullable first, backfilled below, then made required.
ALTER TABLE "User" ADD COLUMN "hubId" TEXT;
ALTER TABLE "Course" ADD COLUMN "hubId" TEXT;
ALTER TABLE "DownloadCode" ADD COLUMN "hubId" TEXT;
ALTER TABLE "DownloadAttempt" ADD COLUMN "hubId" TEXT;

-- Everything that already exists belongs to one offer, which did not have a name until
-- now. It is created LIVE rather than DRAFT because its courses are already published
-- and its students already signed in — a migration must not take away access that was
-- working yesterday. It inherits whatever download setting was app-wide.
INSERT INTO "Hub" ("id", "name", "slug", "status", "position", "settings", "createdAt", "updatedAt")
SELECT
    'hub_first',
    'Main',
    'main',
    'LIVE',
    0,
    (SELECT "value" FROM "AppSetting" WHERE "key" = 'library'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Course")
   OR EXISTS (SELECT 1 FROM "User" WHERE "role" = 'STUDENT');

UPDATE "Course" SET "hubId" = 'hub_first' WHERE "hubId" IS NULL;
UPDATE "DownloadCode" SET "hubId" = 'hub_first' WHERE "hubId" IS NULL;
UPDATE "DownloadAttempt" SET "hubId" = 'hub_first' WHERE "hubId" IS NULL;
-- Students are bound to the hub; owners and admins keep a null hubId, which is what
-- lets them into the directory and into every hub in it.
UPDATE "User" SET "hubId" = 'hub_first' WHERE "role" = 'STUDENT';

-- Now that every row has one, the courses' is required.
ALTER TABLE "Course" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "DownloadCode" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "DownloadAttempt" ALTER COLUMN "hubId" SET NOT NULL;

-- A course slug is unique within its hub, not across the whole install: two offers may
-- both sensibly have a "Start Here".
DROP INDEX IF EXISTS "Course_slug_key";
DROP INDEX IF EXISTS "Course_visibility_position_idx";
CREATE UNIQUE INDEX "Course_hubId_slug_key" ON "Course"("hubId", "slug");
CREATE INDEX "Course_hubId_visibility_position_idx" ON "Course"("hubId", "visibility", "position");

-- CreateIndex
CREATE INDEX "User_hubId_idx" ON "User"("hubId");
DROP INDEX IF EXISTS "DownloadCode_revokedAt_idx";
CREATE INDEX "DownloadCode_hubId_revokedAt_idx" ON "DownloadCode"("hubId", "revokedAt");
DROP INDEX IF EXISTS "DownloadAttempt_at_idx";
CREATE INDEX "DownloadAttempt_hubId_at_idx" ON "DownloadAttempt"("hubId", "at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DownloadCode" ADD CONSTRAINT "DownloadCode_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DownloadAttempt" ADD CONSTRAINT "DownloadAttempt_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The app-wide settings row has been folded into the hub above.
DROP TABLE IF EXISTS "AppSetting";
