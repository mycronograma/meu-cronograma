-- CreateTable
CREATE TABLE "UserProgressSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgressSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProgressSnapshot_userId_key" ON "UserProgressSnapshot"("userId");

-- CreateIndex
CREATE INDEX "UserProgressSnapshot_updatedAt_idx" ON "UserProgressSnapshot"("updatedAt");

-- AddForeignKey
ALTER TABLE "UserProgressSnapshot" ADD CONSTRAINT "UserProgressSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
