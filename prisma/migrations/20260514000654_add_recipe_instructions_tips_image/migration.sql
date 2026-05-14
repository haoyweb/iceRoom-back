-- AlterTable
ALTER TABLE "RecipeSuggestionRule" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sourceRefUrl" TEXT,
ADD COLUMN     "tips" TEXT;
