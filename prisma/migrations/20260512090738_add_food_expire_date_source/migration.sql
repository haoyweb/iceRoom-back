-- CreateEnum
CREATE TYPE "ExpireDateSource" AS ENUM ('manual', 'auto');

-- AlterTable
ALTER TABLE "FoodItem" ADD COLUMN     "expireDateSource" "ExpireDateSource" NOT NULL DEFAULT 'manual';
