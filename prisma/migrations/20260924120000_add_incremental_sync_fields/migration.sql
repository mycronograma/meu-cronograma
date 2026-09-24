-- Sincronização incremental entre dispositivos
-- Adiciona metadados pedagógicos, soft delete (tombstones) e índices por updatedAt.

-- Subject: metadados do catálogo ENEM/vestibulares
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "area" TEXT;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "nivel" TEXT;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "pesoNoExame" INTEGER;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "enemWeight" DOUBLE PRECISION;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "tipo" TEXT;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "topicos" JSONB;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "prerequisitos" JSONB;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "studyPrefs" JSONB;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" TIMESTAMP(3);

-- StudyBlock: metadados do roadmap
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "sessionType" TEXT;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "phase" TEXT;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "area" TEXT;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "topicName" TEXT;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "pedagogicalStepIndex" INTEGER;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "pedagogicalStepTotal" INTEGER;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "adaptiveScore" DOUBLE PRECISION;
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "StudyBlock" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" TIMESTAMP(3);

-- StudySession: marcador de atualização + soft delete
ALTER TABLE "StudySession" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StudySession" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "StudySession" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" TIMESTAMP(3);

-- Índices para busca incremental por usuário
CREATE INDEX IF NOT EXISTS "Subject_userId_updatedAt_idx" ON "Subject"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "StudyBlock_userId_updatedAt_idx" ON "StudyBlock"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "StudySession_userId_updatedAt_idx" ON "StudySession"("userId", "updatedAt");
