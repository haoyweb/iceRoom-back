-- AlterTable
ALTER TABLE "VisionRecognitionJob" ADD COLUMN     "imageExpiresAt" TIMESTAMP(3),
ADD COLUMN     "imageUrl" TEXT;
