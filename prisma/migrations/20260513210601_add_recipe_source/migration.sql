-- AlterTable
ALTER TABLE "RecipeSuggestionRule" ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "RecipeSuggestionRule_source_idx" ON "RecipeSuggestionRule"("source");
