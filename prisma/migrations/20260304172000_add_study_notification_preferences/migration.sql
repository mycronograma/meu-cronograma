-- AlterTable
ALTER TABLE "UserPreferences"
ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notificationMinutesBefore" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "notificationSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "backlogReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pushSubscription" JSONB;
