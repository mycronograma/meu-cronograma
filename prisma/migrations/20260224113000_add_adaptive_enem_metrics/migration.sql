-- Adaptive ENEM study metrics (non-breaking additions)

-- Enums
CREATE TYPE "StudySessionType" AS ENUM ('AULA', 'EXERCICIOS', 'REVISAO', 'SIMULADO', 'ANALISE', 'LIVRE');
CREATE TYPE "DifficultyScore" AS ENUM ('MUITO_BAIXA', 'BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA');

-- StudySession: optional performance columns
ALTER TABLE "StudySession"
ADD COLUMN "accuracyRate" DOUBLE PRECISION,
ADD COLUMN "errorRate" DOUBLE PRECISION,
ADD COLUMN "sessionType" "StudySessionType",
ADD COLUMN "difficultyLabel" "DifficultyScore",
ADD COLUMN "difficultyScore" INTEGER,
ADD COLUMN "correctAnswers" INTEGER,
ADD COLUMN "totalQuestions" INTEGER,
ADD COLUMN "topicName" TEXT;

-- New table: PerformanceMetrics
CREATE TABLE "PerformanceMetrics" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "blockId" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionType" "StudySessionType" NOT NULL DEFAULT 'LIVRE',
  "accuracyRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "focusScore" INTEGER NOT NULL DEFAULT 0,
  "productivityScore" INTEGER NOT NULL DEFAULT 0,
  "difficultyScore" INTEGER,
  "correctAnswers" INTEGER,
  "totalQuestions" INTEGER,
  "minutesStudied" INTEGER NOT NULL DEFAULT 0,
  "topicName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PerformanceMetrics_pkey" PRIMARY KEY ("id")
);

-- New table: TopicProgress
CREATE TABLE "TopicProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "topicName" TEXT NOT NULL,
  "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "accuracyRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "sessionsCount" INTEGER NOT NULL DEFAULT 0,
  "lastStudiedAt" TIMESTAMP(3),
  "nextReviewDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TopicProgress_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "PerformanceMetrics_userId_date_idx" ON "PerformanceMetrics"("userId", "date");
CREATE INDEX "PerformanceMetrics_subjectId_date_idx" ON "PerformanceMetrics"("subjectId", "date");
CREATE INDEX "PerformanceMetrics_userId_subjectId_idx" ON "PerformanceMetrics"("userId", "subjectId");

CREATE UNIQUE INDEX "TopicProgress_userId_subjectId_topicName_key"
ON "TopicProgress"("userId", "subjectId", "topicName");
CREATE INDEX "TopicProgress_userId_nextReviewDate_idx" ON "TopicProgress"("userId", "nextReviewDate");
CREATE INDEX "TopicProgress_subjectId_idx" ON "TopicProgress"("subjectId");

-- Foreign keys
ALTER TABLE "PerformanceMetrics"
ADD CONSTRAINT "PerformanceMetrics_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PerformanceMetrics"
ADD CONSTRAINT "PerformanceMetrics_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TopicProgress"
ADD CONSTRAINT "TopicProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TopicProgress"
ADD CONSTRAINT "TopicProgress_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

