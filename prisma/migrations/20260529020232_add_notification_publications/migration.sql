-- CreateEnum
CREATE TYPE "NotificationPublicationStatus" AS ENUM ('pending', 'publishing', 'completed', 'partial_failed', 'failed');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "publicationId" TEXT;

-- CreateTable
CREATE TABLE "NotificationPublication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "NotificationPublicationStatus" NOT NULL DEFAULT 'pending',
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operatorName" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPublication_dedupeKey_key" ON "NotificationPublication"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationPublication_status_createdAt_idx" ON "NotificationPublication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPublication_operatorId_createdAt_idx" ON "NotificationPublication"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_publicationId_status_idx" ON "Notification"("publicationId", "status");
