-- AlterTable
ALTER TABLE "UserPreferences"
ADD COLUMN "dailyReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "streakReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "achievementAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "weeklyReport" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "url" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotification_userId_dedupeKey_key" ON "UserNotification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
