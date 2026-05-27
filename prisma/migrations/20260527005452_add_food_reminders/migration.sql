-- CreateEnum
CREATE TYPE "FoodReminderAction" AS ENUM ('ignore', 'snooze');

-- CreateTable
CREATE TABLE "FoodReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "action" "FoodReminderAction" NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodReminder_userId_idx" ON "FoodReminder"("userId");

-- CreateIndex
CREATE INDEX "FoodReminder_foodId_idx" ON "FoodReminder"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodReminder_userId_foodId_key" ON "FoodReminder"("userId", "foodId");

-- AddForeignKey
ALTER TABLE "FoodReminder" ADD CONSTRAINT "FoodReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodReminder" ADD CONSTRAINT "FoodReminder_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "FoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
