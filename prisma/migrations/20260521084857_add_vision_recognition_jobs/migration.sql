-- CreateEnum
CREATE TYPE "VisionRecognitionStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateTable
CREATE TABLE "VisionRecognitionJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fridgeId" TEXT,
    "shelfId" TEXT,
    "status" "VisionRecognitionStatus" NOT NULL DEFAULT 'pending',
    "requestedSourceType" TEXT NOT NULL DEFAULT 'auto',
    "detectedSourceType" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "items" JSONB,
    "ignored" JSONB,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionRecognitionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisionRecognitionJob_userId_createdAt_idx" ON "VisionRecognitionJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VisionRecognitionJob_userId_status_createdAt_idx" ON "VisionRecognitionJob"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VisionRecognitionJob_fridgeId_idx" ON "VisionRecognitionJob"("fridgeId");

-- AddForeignKey
ALTER TABLE "VisionRecognitionJob" ADD CONSTRAINT "VisionRecognitionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionRecognitionJob" ADD CONSTRAINT "VisionRecognitionJob_fridgeId_fkey" FOREIGN KEY ("fridgeId") REFERENCES "Fridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
