-- AlterTable
ALTER TABLE "RecipeSuggestionRule" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE INDEX "RecipeSuggestionRule_category_idx" ON "RecipeSuggestionRule"("category");
