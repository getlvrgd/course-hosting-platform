-- CreateTable
CREATE TABLE "DownloadCode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DownloadCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "lessonId" TEXT,
    "lessonTitle" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "codeId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DownloadCode_codeHash_key" ON "DownloadCode"("codeHash");

-- CreateIndex
CREATE INDEX "DownloadCode_revokedAt_idx" ON "DownloadCode"("revokedAt");

-- CreateIndex
CREATE INDEX "DownloadAttempt_at_idx" ON "DownloadAttempt"("at");

-- CreateIndex
CREATE INDEX "DownloadAttempt_userId_at_idx" ON "DownloadAttempt"("userId", "at");

-- CreateIndex
CREATE INDEX "DownloadAttempt_outcome_idx" ON "DownloadAttempt"("outcome");

-- AddForeignKey
ALTER TABLE "DownloadAttempt" ADD CONSTRAINT "DownloadAttempt_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "DownloadCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
