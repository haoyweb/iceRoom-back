-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('vegetable', 'fruit', 'meat', 'egg_milk', 'staple', 'seasoning', 'other');

-- CreateEnum
CREATE TYPE "StorageArea" AS ENUM ('fridge', 'freezer', 'door', 'drawer');

-- CreateEnum
CREATE TYPE "FoodStatus" AS ENUM ('normal', 'consumed', 'discarded');

-- CreateEnum
CREATE TYPE "RecipeDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fridge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fridge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageShelf" (
    "id" TEXT NOT NULL,
    "fridgeId" TEXT NOT NULL,
    "area" "StorageArea" NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageShelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL,
    "fridgeId" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL,
    "quantity" DECIMAL(10,2),
    "unit" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "expireDate" TIMESTAMP(3) NOT NULL,
    "status" "FoodStatus" NOT NULL DEFAULT 'normal',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeSuggestionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredIngredients" TEXT[],
    "optionalIngredients" TEXT[],
    "missingIngredients" TEXT[],
    "difficulty" "RecipeDifficulty" NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "reasonTemplate" TEXT NOT NULL,
    "popularityScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeSuggestionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fridge_userId_idx" ON "Fridge"("userId");

-- CreateIndex
CREATE INDEX "StorageShelf_fridgeId_idx" ON "StorageShelf"("fridgeId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageShelf_fridgeId_area_name_key" ON "StorageShelf"("fridgeId", "area", "name");

-- CreateIndex
CREATE INDEX "FoodItem_fridgeId_expireDate_idx" ON "FoodItem"("fridgeId", "expireDate");

-- CreateIndex
CREATE INDEX "FoodItem_shelfId_idx" ON "FoodItem"("shelfId");

-- CreateIndex
CREATE INDEX "FoodItem_status_idx" ON "FoodItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeSuggestionRule_name_key" ON "RecipeSuggestionRule"("name");

-- AddForeignKey
ALTER TABLE "Fridge" ADD CONSTRAINT "Fridge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageShelf" ADD CONSTRAINT "StorageShelf_fridgeId_fkey" FOREIGN KEY ("fridgeId") REFERENCES "Fridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_fridgeId_fkey" FOREIGN KEY ("fridgeId") REFERENCES "Fridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "StorageShelf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
